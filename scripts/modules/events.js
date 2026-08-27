import { dockerCommand, dockerEnv, getHost, killProcessTree } from "./docker.js";
import { config } from "./config.js";
import { AppError } from "./utils.js";

const streams = new Set();

function send(ws, message) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  const sent = ws.send(JSON.stringify(message));
  if (sent > 0) return true;
  ws.close(1013, "WebSocket client is too slow");
  return false;
}

export function eventsOpen(ws) {
  if (streams.size >= config.maxEventStreams) throw new AppError("Docker event stream limit reached", 429);
  const host = getHost(ws.data.hostId);
  const proc = Bun.spawn(dockerCommand(host, ["events", "--format", "{{json .}}"]), { stdout: "pipe", stderr: "ignore", env: dockerEnv(host), detached: true });
  ws.data.eventProcess = proc;
  streams.add(ws);
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > config.maxCommandOutput) return ws.close(1009, "Docker event exceeded the buffer limit");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line || ws.readyState !== WebSocket.OPEN) continue;
          try { if (!send(ws, { type: "docker_event", event: JSON.parse(line) })) return; } catch {}
        }
      }
    } catch {}
  })();
  proc.exited.then(() => { if (ws.readyState === WebSocket.OPEN) ws.close(1011, "Docker event stream ended"); });
  send(ws, { type: "connected", hostId: host.id });
}

export function eventsClose(ws) {
  streams.delete(ws);
  if (ws.data.eventProcess) {
    killProcessTree(ws.data.eventProcess);
    const timer = setTimeout(() => killProcessTree(ws.data.eventProcess, "SIGKILL"), 2_000);
    timer.unref?.();
  }
}
