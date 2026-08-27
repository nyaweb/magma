import { Database } from "bun:sqlite";
import { config } from "./config.js";
import { newId, now } from "./utils.js";

export const db = new Database(config.dbPath, { create: true, strict: true });
db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
const migrations = [`
  CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('local','ssh')),
    hostname TEXT,
    ssh_user TEXT,
    ssh_port INTEGER,
    endpoint TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    yaml TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS project_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    yaml TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    config TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS experiments (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE RESTRICT,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('ephemeral','persistent')),
    concurrency INTEGER NOT NULL,
    status TEXT NOT NULL,
    total INTEGER NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    passed INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS experiment_runs (
    id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
    case_index INTEGER NOT NULL,
    name TEXT NOT NULL,
    config TEXT NOT NULL,
    container_id TEXT,
    status TEXT NOT NULL,
    exit_code INTEGER,
    duration_ms INTEGER,
    output TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    host_id TEXT,
    kind TEXT NOT NULL,
    target TEXT,
    status TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS projects_host_slug_unique ON projects(host_id,slug);
`];

const version = Number(db.query("PRAGMA user_version").get().user_version);
if (version > migrations.length) throw new Error(`Database schema ${version} is newer than this Magma release`);
for (let index = version; index < migrations.length; index++) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(migrations[index]);
    db.exec(`PRAGMA user_version=${index + 1}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

const local = db.query("SELECT id FROM hosts WHERE id = 'local'").get();
if (!local) {
  const timestamp = now();
  db.query(`INSERT INTO hosts (id,name,type,endpoint,created_at,updated_at)
    VALUES ('local','Local Docker','local','unix:///var/run/docker.sock',?,?)`).run(timestamp, timestamp);
}

export function operation(hostId, kind, target, status, detail = "") {
  const id = newId(), timestamp = now();
  db.query(`INSERT INTO operations (id,host_id,kind,target,status,detail,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, hostId || null, kind, target || null, status, detail, timestamp, timestamp);
  return id;
}

export function updateOperation(id, status, detail = "") {
  db.query("UPDATE operations SET status=?, detail=?, updated_at=? WHERE id=?").run(status, detail, now(), id);
}
