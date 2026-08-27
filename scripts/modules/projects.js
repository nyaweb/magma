import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { config } from "./config.js";
import { db } from "./db.js";
import { getHost, runDocker, trackedDocker } from "./docker.js";
import { AppError, newId, now, slug } from "./utils.js";

const rowToProject = row => row ? { ...row } : null;
const locks = new Map();

function withProjectLock(id, action) {
  const previous = locks.get(id) || Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  locks.set(id, current);
  return current.finally(() => { if (locks.get(id) === current) locks.delete(id); });
}

export function listProjects() {
  return db.query(`SELECT p.*, h.name host_name FROM projects p JOIN hosts h ON h.id=p.host_id ORDER BY p.updated_at DESC`).all().map(rowToProject);
}

export function getProject(id) {
  const project = db.query("SELECT * FROM projects WHERE id=?").get(id);
  if (!project) throw new AppError("Compose project not found", 404);
  return rowToProject(project);
}

function projectPath(project) {
  return `${config.projectsDir}/${project.id}/compose.yml`;
}

function projectDir(project) {
  return `${config.projectsDir}/${project.id}`;
}

function atomicWrite(path, value) {
  const candidate = `${path}.${newId()}.tmp`, fd = openSync(candidate, "wx", 0o600);
  try { writeFileSync(fd, value); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(candidate, path);
}

function persist(project) {
  mkdirSync(projectDir(project), { recursive: true });
  const path = projectPath(project);
  if (!existsSync(path) || readFileSync(path, "utf8") !== project.yaml) atomicWrite(path, project.yaml);
}

export function composeProjectSlug(id, name) {
  const owner = String(id).replace(/[^a-f0-9]/gi, "").toLowerCase().slice(0, 24);
  return `magma-${owner}-${slug(name, "project").slice(0, 31)}`;
}

export function assertPortableCompose(model) {
  for (const [name, service] of Object.entries(model.services || {})) {
    if (service.build) throw new AppError(`Compose service ${name} uses an unsupported build context`);
    if ((service.volumes || []).some(volume => typeof volume === "object" ? volume.type === "bind" : String(volume).startsWith(".") || String(volume).startsWith("/"))) {
      throw new AppError(`Compose service ${name} uses an unsupported host bind mount`);
    }
  }
  for (const [kind, resources] of [["config", model.configs], ["secret", model.secrets]]) {
    if (Object.values(resources || {}).some(resource => resource?.file)) throw new AppError(`Compose uses an unsupported file-backed ${kind}`);
  }
  if (Object.values(model.volumes || {}).some(volume => volume?.driver_opts || volume?.driverOpts)) {
    throw new AppError("Compose uses unsupported volume driver options");
  }
}

async function validateCandidate(project) {
  mkdirSync(projectDir(project), { recursive: true });
  const candidate = `${projectDir(project)}/compose.${newId()}.yml`;
  writeFileSync(candidate, project.yaml, { mode: 0o600 });
  try {
    const { stdout } = await runDocker(project.host_id, ["compose", "--project-name", project.slug, "--file", candidate, "config", "--format", "json"], { timeout: 60_000 });
    assertPortableCompose(JSON.parse(stdout));
    return { candidate, config: stdout };
  } catch (error) {
    rmSync(candidate, { force: true });
    throw error;
  }
}

function assertSlugAvailable(hostId, projectSlug, exceptId = null) {
  const duplicate = exceptId
    ? db.query("SELECT id FROM projects WHERE host_id=? AND slug=? AND id<>?").get(hostId, projectSlug, exceptId)
    : db.query("SELECT id FROM projects WHERE host_id=? AND slug=?").get(hostId, projectSlug);
  if (duplicate) throw new AppError("Compose project slug already exists on this host", 409);
}

async function assertNamespaceUnused(hostId, projectSlug) {
  const { stdout } = await runDocker(hostId, ["ps", "-aq", "--filter", `label=com.docker.compose.project=${projectSlug}`], { timeout: 10_000, maxOutput: 100_000 });
  if (stdout.trim()) throw new AppError("Compose namespace already has containers on this host", 409);
}

async function runProjectAction(project, action) {
  persist(project);
  const actions = {
    validate: ["config"], pull: ["pull"], up: ["up", "--detach", "--remove-orphans"],
    down: ["down", "--remove-orphans"], start: ["start"], stop: ["stop"], restart: ["restart"],
  };
  if (!actions[action]) throw new AppError("Unsupported Compose action");
  const base = ["compose", "--project-name", project.slug, "--file", projectPath(project)];
  const { stdout, stderr } = await trackedDocker(project.host_id, `compose.${action}`, project.slug, [...base, ...actions[action]], { timeout: action === "pull" || action === "up" ? 15 * 60_000 : 120_000 });
  return { ok: true, output: `${stdout}${stderr}` };
}

export async function createProject(body) {
  const yaml = String(body.yaml || "").trim();
  if (!yaml) throw new AppError("Compose YAML is required");
  const id = newId(), timestamp = now();
  const name = String(body.name || "Compose project");
  const project = { id, host_id: String(body.hostId || "local"), name, slug: composeProjectSlug(id, body.slug || name), yaml, created_at: timestamp, updated_at: timestamp };
  getHost(project.host_id);
  assertSlugAvailable(project.host_id, project.slug);
  await assertNamespaceUnused(project.host_id, project.slug);
  return withProjectLock(id, async () => {
    const { candidate } = await validateCandidate(project);
    try {
      db.transaction(() => {
        db.query("INSERT INTO projects (id,host_id,name,slug,yaml,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
          .run(project.id, project.host_id, project.name, project.slug, project.yaml, timestamp, timestamp);
        db.query("INSERT INTO project_revisions (project_id,yaml,created_at) VALUES (?,?,?)").run(id, yaml, timestamp);
        renameSync(candidate, projectPath(project));
      })();
      return getProject(id);
    } catch (error) {
      rmSync(projectDir(project), { recursive: true, force: true });
      throw error;
    }
  });
}

export async function updateProject(id, body) {
  return withProjectLock(id, async () => {
    const current = getProject(id), yaml = String(body.yaml ?? current.yaml).trim();
    if (!yaml) throw new AppError("Compose YAML is required");
    const nextSlug = slug(body.slug ?? current.slug);
    if (nextSlug !== current.slug) throw new AppError("Compose project slug cannot be changed", 409);
    const updated = { ...current, name: String(body.name ?? current.name), yaml, updated_at: now() };
    assertSlugAvailable(updated.host_id, updated.slug, id);
    const { candidate } = await validateCandidate(updated);
    const path = projectPath(updated), backup = `${path}.${newId()}.bak`, hadCurrent = existsSync(path);
    try {
      if (hadCurrent) renameSync(path, backup);
      db.transaction(() => {
        db.query("UPDATE projects SET name=?,yaml=?,updated_at=? WHERE id=?").run(updated.name, yaml, updated.updated_at, id);
        db.query("INSERT INTO project_revisions (project_id,yaml,created_at) VALUES (?,?,?)").run(id, yaml, updated.updated_at);
        renameSync(candidate, projectPath(updated));
      })();
      rmSync(backup, { force: true });
      return getProject(id);
    } catch (error) {
      rmSync(candidate, { force: true });
      rmSync(path, { force: true });
      if (hadCurrent && existsSync(backup)) renameSync(backup, path);
      throw error;
    }
  });
}

export async function projectAction(id, action) {
  return withProjectLock(id, () => runProjectAction(getProject(id), action));
}

export async function deleteProject(id, down = false) {
  return withProjectLock(id, async () => {
    const project = getProject(id);
    if (down) await runProjectAction(project, "down");
    db.query("DELETE FROM projects WHERE id=?").run(id);
    rmSync(projectDir(project), { recursive: true, force: true });
  });
}
