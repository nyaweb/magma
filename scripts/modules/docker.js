import { chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { config } from "./config.js";
import { db, operation, updateOperation } from "./db.js";
import { AppError, parseJsonLines, truncate } from "./utils.js";

export function getHost(id = "local") {
  const host = db.query("SELECT * FROM hosts WHERE id=? AND enabled=1").get(id);
  if (!host) throw new AppError("Docker host not found", 404);
  return host;
}

export function dockerCommand(host, args) {
  const command = ["docker"];
  if (host.type === "ssh") command.push("--host", host.endpoint);
  command.push(...args.map(String));
  return command;
}

export function dockerEnv(host) {
  if (host.type !== "ssh") return { ...process.env };
  const ssh = [
    "ssh", "-i", config.sshKeyPath, "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes", "-o", `UserKnownHostsFile=${config.knownHostsPath}`,
    "-p", String(host.ssh_port || 22),
  ];
  return { ...process.env, DOCKER_SSH_COMMAND: ssh.join(" ") };
}

export function killProcessTree(proc, signal = "SIGTERM") {
  try { process.kill(-proc.pid, signal); } catch { try { proc.kill(signal); } catch {} }
}

function atomicWrite(path, value, mode = 0o600) {
  const candidate = `${path}.${crypto.randomUUID()}.tmp`, fd = openSync(candidate, "wx", mode);
  try { writeFileSync(fd, value); fsyncSync(fd); } catch (error) { rmSync(candidate, { force: true }); throw error; }
  finally { closeSync(fd); }
  renameSync(candidate, path);
}

async function readBounded(stream, limit) {
  const reader = stream.getReader(), decoder = new TextDecoder();
  let output = "", clipped = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true }), remaining = limit - output.length;
    if (remaining > 0) output += text.slice(0, remaining);
    if (text.length > remaining) clipped = true;
  }
  const tail = decoder.decode(), remaining = limit - output.length;
  if (remaining > 0) output += tail.slice(0, remaining);
  if (tail.length > remaining) clipped = true;
  return clipped ? `${output}\n...[truncated]` : output;
}

export async function runProcess(command, { env = process.env, input, timeout = 60_000, allowFailure = false, maxOutput = config.maxCommandOutput } = {}) {
  const proc = Bun.spawn(command, { stdin: input == null ? "ignore" : "pipe", stdout: "pipe", stderr: "pipe", env, detached: true });
  if (input != null) { proc.stdin.write(input); proc.stdin.end(); }
  let timedOut = false, killTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessTree(proc);
    killTimer = setTimeout(() => killProcessTree(proc, "SIGKILL"), 2_000);
  }, timeout);
  const [stdout, stderr, exitCode] = await Promise.all([
    readBounded(proc.stdout, maxOutput), readBounded(proc.stderr, maxOutput), proc.exited,
  ]);
  clearTimeout(timer);
  if (timedOut) killProcessTree(proc, "SIGKILL");
  clearTimeout(killTimer);
  const result = { stdout, stderr, exitCode };
  if (timedOut) throw new AppError(`Command timed out after ${timeout}ms`, 504, { exitCode });
  if (exitCode !== 0 && !allowFailure) {
    throw new AppError(stderr.trim() || stdout.trim() || `Command failed with code ${exitCode}`, 502, { exitCode });
  }
  return result;
}

export async function runDocker(hostOrId, args, options = {}) {
  const host = typeof hostOrId === "string" ? getHost(hostOrId) : hostOrId;
  return runProcess(dockerCommand(host, args), { ...options, env: dockerEnv(host) });
}

export async function trackedDocker(hostId, kind, target, args, options = {}) {
  const op = operation(hostId, kind, target, "running");
  try {
    const result = await runDocker(hostId, args, options);
    updateOperation(op, "completed", truncate(result.stdout || result.stderr, 20_000));
    return result;
  } catch (error) {
    updateOperation(op, "failed", truncate(error.message, 20_000));
    throw error;
  }
}

export async function dockerJsonLines(hostId, args) {
  const { stdout } = await runDocker(hostId, args);
  return parseJsonLines(stdout);
}

let sshKeyPromise = null, sshTrustQueue = Promise.resolve();

export function ensureSshKey() {
  if (!sshKeyPromise) sshKeyPromise = (async () => {
    if (!existsSync(config.sshKeyPath)) {
      await runProcess(["ssh-keygen", "-t", "ed25519", "-N", "", "-C", "magma@control-plane", "-f", config.sshKeyPath]);
    } else if (!existsSync(`${config.sshKeyPath}.pub`)) {
      const { stdout } = await runProcess(["ssh-keygen", "-y", "-f", config.sshKeyPath]);
      atomicWrite(`${config.sshKeyPath}.pub`, `${stdout.trim()} magma@control-plane\n`, 0o644);
    }
    chmodSync(config.sshKeyPath, 0o600);
    chmodSync(`${config.sshKeyPath}.pub`, 0o644);
    return Bun.file(`${config.sshKeyPath}.pub`).text();
  })().catch(error => { sshKeyPromise = null; throw error; });
  return sshKeyPromise;
}

export async function scanSshHost(hostname, port = 22) {
  const { stdout } = await runProcess(["ssh-keyscan", "-p", String(port), hostname], { timeout: 15_000 });
  const keys = `${stdout.split(/\r?\n/).filter(line => line && !line.startsWith("#")).join("\n")}\n`;
  if (!keys.trim()) throw new AppError("Could not read SSH host key", 502);
  const { stdout: fingerprintsOutput } = await runProcess(["ssh-keygen", "-lf", "-", "-E", "sha256"], { input: keys });
  const fingerprints = fingerprintsOutput.split(/\r?\n/).filter(Boolean).map(line => line.match(/SHA256:[A-Za-z0-9+/]+/)?.[0]).filter(Boolean);
  if (!fingerprints.length) throw new AppError("Could not fingerprint SSH host key", 502);
  return { keys, fingerprints: [...new Set(fingerprints)] };
}

function withSshTrustLock(action) {
  const current = sshTrustQueue.catch(() => {}).then(action);
  sshTrustQueue = current;
  return current;
}

function withoutSshHost(value, hostname, port) {
  const targets = new Set([hostname, `[${hostname}]:${port}`]);
  const lines = String(value || "").split(/\r?\n/).filter(line => {
    if (!line || line.startsWith("#")) return false;
    const names = line.trim().split(/\s+/, 1)[0].split(",");
    return !names.some(name => targets.has(name));
  });
  return `${lines.filter(Boolean).join("\n")}${lines.some(Boolean) ? "\n" : ""}`;
}

export function trustSshHost(hostname, port = 22, expected = [], action = null) {
  return withSshTrustLock(async () => {
    await ensureSshKey();
    const scanned = await scanSshHost(hostname, port), wanted = [...new Set((Array.isArray(expected) ? expected : [expected]).map(String))];
    const matches = wanted.length === scanned.fingerprints.length && wanted.every(value => scanned.fingerprints.includes(value));
    if (!matches) throw new AppError("SSH fingerprint confirmation required", 428, { fingerprints: scanned.fingerprints });
    const previous = existsSync(config.knownHostsPath) ? readFileSync(config.knownHostsPath, "utf8") : "";
    atomicWrite(config.knownHostsPath, `${withoutSshHost(previous, hostname, port)}${scanned.keys.trim()}\n`);
    try { return action ? await action(scanned) : { fingerprints: scanned.fingerprints }; }
    catch (error) { atomicWrite(config.knownHostsPath, previous); throw error; }
  });
}

export function forgetSshHost(hostname, port = 22, action = null, shouldForget = () => true) {
  return withSshTrustLock(async () => {
    const previous = existsSync(config.knownHostsPath) ? readFileSync(config.knownHostsPath, "utf8") : "";
    const removeTrust = await shouldForget();
    if (removeTrust) atomicWrite(config.knownHostsPath, withoutSshHost(previous, hostname, port));
    try { return action ? await action() : undefined; }
    catch (error) { if (removeTrust) atomicWrite(config.knownHostsPath, previous); throw error; }
  });
}
