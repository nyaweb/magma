import { config } from "./config.js";
import { dockerCommand, dockerEnv, getHost, killProcessTree } from "./docker.js";
import { AppError, dockerIdentifier } from "./utils.js";

const sessions = new Map();
let nextClientId = 1;

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  const sent = ws.send(JSON.stringify(message));
  if (sent > 0) return true;
  ws.close(1013, "WebSocket client is too slow");
  return false;
}

function snapshot(session) {
  return [...session.clients.values()].map(client => ({ id: client.id, name: client.name, isController: client.id === session.controllerId }));
}

function broadcast(session, message) {
  for (const client of session.clients.values()) send(client.ws, message);
}

function appendHistory(session, text) {
  if (!text) return;
  session.history.push(text);
  session.historySize += text.length;
  let overflow = session.historySize - config.maxOutput;
  while (overflow > 0 && session.history.length) {
    const first = session.history[0];
    if (first.length <= overflow) {
      session.history.shift();
      session.historySize -= first.length;
      overflow -= first.length;
    } else {
      const remainder = first.slice(overflow), newline = remainder.indexOf("\n");
      const trimmed = newline < 0 ? "" : remainder.slice(newline + 1);
      session.history[0] = trimmed;
      session.historySize -= first.length - trimmed.length;
      overflow = 0;
    }
  }
}

function forgetSession(session) {
  clearTimeout(session.idleTimer);
  if (sessions.get(session.key) === session) sessions.delete(session.key);
}

function terminateSession(session) {
  forgetSession(session);
  try { session.terminal?.close?.(); } catch {}
  if (session.proc) {
    killProcessTree(session.proc);
    const timer = setTimeout(() => killProcessTree(session.proc, "SIGKILL"), 2_000);
    timer.unref?.();
  }
}

function scheduleExpiry(session) {
  clearTimeout(session.idleTimer);
  if (!session.clients.size) session.idleTimer = setTimeout(() => terminateSession(session), config.terminalIdleMs);
}

function acceptsInput(session, bytes) {
  const timestamp = Date.now();
  if (timestamp - session.inputWindowAt >= 1_000) { session.inputWindowAt = timestamp; session.inputBytes = 0; }
  const inputBytes = session.inputBytes + bytes, pendingInputBytes = session.pendingInputBytes + bytes;
  if (inputBytes > config.terminalInputRate || pendingInputBytes > config.maxTerminalPendingInput) return false;
  session.inputBytes = inputBytes;
  session.pendingInputBytes = pendingInputBytes;
  return true;
}

function writeInput(session, data, bytes) {
  if (!acceptsInput(session, bytes)) return false;
  const written = Math.max(0, Number(session.terminal.write(data)) || 0);
  session.pendingInputBytes = Math.max(0, session.pendingInputBytes - written);
  return true;
}

function sessionKey(data) {
  const hostId = String(data.hostId || "local"), containerId = dockerIdentifier(data.containerId, "container identifier");
  const sessionId = String(data.sessionId || "default");
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(sessionId)) throw new AppError("Invalid terminal session identifier");
  return { key: JSON.stringify([hostId, containerId, sessionId]), hostId, containerId, sessionId };
}

function createSession(identity, options, controllerId) {
  if (sessions.size >= config.maxTerminalSessions) throw new AppError("Terminal session limit reached", 429);
  const host = getHost(identity.hostId), shell = ["/bin/sh", "/bin/bash"].includes(options.shell) ? options.shell : "/bin/sh";
  const session = {
    ...identity, shell, proc: null, terminal: null, history: [], historySize: 0,
    controllerId, clients: new Map(), createdAt: Date.now(), idleTimer: null,
    inputWindowAt: Date.now(), inputBytes: 0, pendingInputBytes: 0, ended: false,
  };
  const decoder = new TextDecoder();
  const output = data => {
    const text = decoder.decode(data, { stream: true });
    appendHistory(session, text);
    broadcast(session, { type: "output", data: text });
  };
  const finish = exitCode => {
    if (session.ended) return;
    session.ended = true;
    const tail = decoder.decode();
    appendHistory(session, tail);
    if (tail) broadcast(session, { type: "output", data: tail });
    broadcast(session, { type: "exit", code: exitCode, signal: null });
    for (const client of session.clients.values()) client.ws.close(1000, "Terminal process exited");
    session.clients.clear();
    forgetSession(session);
  };
  const proc = Bun.spawn(dockerCommand(host, ["exec", "-it", "--", identity.containerId, shell]), {
    env: { ...dockerEnv(host), TERM: "xterm-256color" },
    detached: true,
    terminal: {
      cols: 100, rows: 30,
      data: (_, data) => output(data),
      drain: () => { session.pendingInputBytes = 0; },
      exit: () => {},
    },
  });
  session.proc = proc;
  session.terminal = proc.terminal;
  proc.exited.then(finish, () => finish(null));
  sessions.set(identity.key, session);
  return session;
}

export function terminalOpen(ws) {
  const identity = sessionKey(ws.data), client = { id: nextClientId++, name: String(ws.data.name || "Web").slice(0, 64), ws };
  let session = sessions.get(identity.key);
  if (!session) session = createSession(identity, ws.data, client.id);
  if (session.clients.size >= config.maxTerminalClients) throw new AppError("Terminal client limit reached", 429);
  clearTimeout(session.idleTimer);
  session.clients.set(client.id, client);
  if (session.controllerId == null) session.controllerId = client.id;
  ws.data.terminalKey = identity.key;
  ws.data.clientId = client.id;
  send(ws, { type: "welcome", clientId: client.id, controllerId: session.controllerId, clients: snapshot(session) });
  if (session.historySize) send(ws, { type: "history", data: `\x1b[0m\x1b[2J\x1b[H${session.history.join("")}` });
  broadcast(session, { type: "state", controllerId: session.controllerId, clients: snapshot(session) });
}

export function terminalMessage(ws, raw) {
  const session = sessions.get(ws.data.terminalKey);
  if (!session) return send(ws, { type: "error", message: "Terminal session ended" });
  const client = session.clients.get(ws.data.clientId);
  if (!client || client.ws !== ws) {
    send(ws, { type: "error", message: "Terminal client is no longer part of this session" });
    return ws.close(1008, "Stale terminal client");
  }
  const text = String(raw);
  if (text.length > config.maxTerminalMessage) return send(ws, { type: "error", message: "Terminal message is too large" });
  let message;
  try { message = JSON.parse(text); } catch { return send(ws, { type: "error", message: "Invalid terminal message" }); }
  if (!message || typeof message !== "object") return send(ws, { type: "error", message: "Invalid terminal message" });
  if (message.type === "take_control") {
    session.controllerId = ws.data.clientId;
    return broadcast(session, { type: "state", controllerId: session.controllerId, clients: snapshot(session) });
  }
  const controlsTerminal = session.controllerId === ws.data.clientId && !session.terminal.closed;
  if (message.type === "input") {
    if (!controlsTerminal || typeof message.data !== "string") return send(ws, { type: "error", message: "Terminal input requires control and string data" });
    return writeInput(session, message.data, new TextEncoder().encode(message.data).length)
      ? true
      : send(ws, { type: "error", message: "Terminal input rate exceeded" });
  }
  if (message.type === "binary") {
    if (!controlsTerminal || typeof message.data !== "string") return send(ws, { type: "error", message: "Terminal binary input requires control" });
    let data;
    try { data = Uint8Array.from(atob(message.data), value => value.charCodeAt(0)); }
    catch { return send(ws, { type: "error", message: "Invalid terminal binary input" }); }
    return writeInput(session, data, data.byteLength)
      ? true
      : send(ws, { type: "error", message: "Terminal input rate exceeded" });
  }
  if (message.type === "resize") {
    if (!controlsTerminal) return send(ws, { type: "error", message: "Terminal resize requires control" });
    const cols = Math.max(1, Math.min(500, Number(message.cols) || 100));
    const rows = Math.max(1, Math.min(200, Number(message.rows) || 30));
    return session.terminal.resize(cols, rows);
  }
  send(ws, { type: "error", message: "Unsupported terminal message" });
}

export function terminalClose(ws) {
  const session = sessions.get(ws.data.terminalKey);
  if (!session) return;
  session.clients.delete(ws.data.clientId);
  if (session.controllerId === ws.data.clientId) session.controllerId = session.clients.values().next().value?.id ?? null;
  broadcast(session, { type: "state", controllerId: session.controllerId, clients: snapshot(session) });
  scheduleExpiry(session);
}

export function closeTerminals() {
  for (const session of sessions.values()) terminateSession(session);
}
