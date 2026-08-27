import { db } from "./db.js";
import { ensureSshKey, forgetSshHost, getHost, runDocker, scanSshHost, trustSshHost } from "./docker.js";
import { AppError, newId, now, slug } from "./utils.js";

export function listHosts() {
  return db.query("SELECT id,name,type,hostname,ssh_user,ssh_port,endpoint,enabled,created_at,updated_at FROM hosts ORDER BY type,name").all();
}

function sshTarget(body) {
  const hostname = String(body.hostname || "").trim(), user = String(body.user || "root").trim(), port = Number(body.port || 22);
  if (!/^[a-zA-Z0-9.-]+$/.test(hostname)) throw new AppError("Invalid hostname");
  if (!/^[a-z_][a-z0-9_-]*$/i.test(user)) throw new AppError("Invalid SSH user");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AppError("Invalid SSH port");
  return { hostname, user, port };
}

export async function scanHost(body) {
  const { hostname, port } = sshTarget(body), { fingerprints } = await scanSshHost(hostname, port);
  return { hostname, port, fingerprints };
}

export async function createHost(body) {
  const type = body.type === "local" ? "local" : "ssh";
  if (type === "local") throw new AppError("The local host already exists");
  const { hostname, user, port } = sshTarget(body);
  const id = slug(body.id || body.name || hostname, `host-${newId().slice(0, 8)}`);
  if (db.query("SELECT id FROM hosts WHERE id=?").get(id)) throw new AppError("Host ID already exists", 409);
  const timestamp = now(), endpoint = `ssh://${user}@${hostname}:${port}`;
  return trustSshHost(hostname, port, body.fingerprints, () => {
    db.query(`INSERT INTO hosts (id,name,type,hostname,ssh_user,ssh_port,endpoint,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(id, String(body.name || hostname), type, hostname, user, port, endpoint, timestamp, timestamp);
    return getHost(id);
  });
}

export async function testHost(id) {
  const host = getHost(id);
  const { stdout } = await runDocker(host, ["info", "--format", "{{json .}}"], { timeout: 20_000 });
  const info = JSON.parse(stdout);
  return {
    ok: true,
    id: host.id,
    name: info.Name,
    serverVersion: info.ServerVersion,
    containers: info.Containers,
    images: info.Images,
    driver: info.Driver,
    operatingSystem: info.OperatingSystem,
    architecture: info.Architecture,
    cpus: info.NCPU,
    memory: info.MemTotal,
  };
}

export async function deleteHost(id) {
  if (id === "local") throw new AppError("The local host cannot be removed", 409);
  const host = db.query("SELECT * FROM hosts WHERE id=?").get(id);
  if (!host) throw new AppError("Host not found", 404);
  const dependencies = [
    db.query("SELECT COUNT(*) count FROM projects WHERE host_id=?").get(id).count,
    db.query("SELECT COUNT(*) count FROM templates WHERE host_id=?").get(id).count,
    db.query("SELECT COUNT(*) count FROM experiments WHERE host_id=?").get(id).count,
  ].reduce((sum, value) => sum + Number(value), 0);
  if (dependencies) throw new AppError("Host has projects, templates, or experiments", 409);
  return forgetSshHost(
    host.hostname,
    host.ssh_port,
    () => db.query("DELETE FROM hosts WHERE id=?").run(id),
    () => !db.query("SELECT COUNT(*) count FROM hosts WHERE id<>? AND hostname=? AND ssh_port=?").get(id, host.hostname, host.ssh_port).count,
  );
}

export async function publicKey() {
  return { publicKey: (await ensureSshKey()).trim() };
}
