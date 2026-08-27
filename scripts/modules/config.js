import { mkdirSync } from "node:fs";

const numberFromEnv = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const host = process.env.MAGMA_HOST || "127.0.0.1";
const unsafePublic = process.env.MAGMA_UNSAFE_PUBLIC === "1";
if (!["127.0.0.1", "::1", "localhost"].includes(host) && !unsafePublic) {
  throw new Error("Set MAGMA_UNSAFE_PUBLIC=1 to listen beyond loopback without authentication");
}

export const config = {
  host,
  unsafePublic,
  port: numberFromEnv("MAGMA_PORT", 4000),
  dataDir: process.env.MAGMA_DATA_DIR || "/data",
  containerName: process.env.MAGMA_CONTAINER_NAME || "magma",
  maxOutput: numberFromEnv("MAGMA_MAX_OUTPUT", 500_000),
  maxCommandOutput: numberFromEnv("MAGMA_MAX_COMMAND_OUTPUT", 5_000_000),
  maxTerminalSessions: numberFromEnv("MAGMA_MAX_TERMINAL_SESSIONS", 100),
  maxTerminalClients: numberFromEnv("MAGMA_MAX_TERMINAL_CLIENTS", 25),
  maxTerminalMessage: numberFromEnv("MAGMA_MAX_TERMINAL_MESSAGE", 16_384),
  terminalInputRate: numberFromEnv("MAGMA_TERMINAL_INPUT_RATE", 65_536),
  maxTerminalPendingInput: numberFromEnv("MAGMA_MAX_TERMINAL_PENDING_INPUT", 262_144),
  terminalIdleMs: numberFromEnv("MAGMA_TERMINAL_IDLE_MS", 3_600_000),
  maxEventStreams: numberFromEnv("MAGMA_MAX_EVENT_STREAMS", 100),
  maxWebSocketBackpressure: numberFromEnv("MAGMA_MAX_WEBSOCKET_BACKPRESSURE", 65_536),
  allowedOrigins: String(process.env.MAGMA_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean),
};

config.dbDir = `${config.dataDir}/db`;
config.projectsDir = `${config.dataDir}/projects`;
config.sshDir = `${config.dataDir}/ssh`;
config.workspacesDir = `${config.dataDir}/workspaces`;
config.dbPath = `${config.dbDir}/magma.sqlite`;
config.sshKeyPath = `${config.sshDir}/magma_ed25519`;
config.knownHostsPath = `${config.sshDir}/known_hosts`;

for (const path of [config.dataDir, config.dbDir, config.projectsDir, config.sshDir, config.workspacesDir]) {
  mkdirSync(path, { recursive: true, mode: path === config.sshDir ? 0o700 : 0o755 });
}
