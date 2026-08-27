import { config } from "./config.js";
import { dockerJsonLines, getHost, runDocker, trackedDocker } from "./docker.js";
import { AppError, clamp, dockerIdentifier, dockerImage, integerClamp, slug } from "./utils.js";

const managedLabels = ["--label", "io.magma.managed=true"];

export async function listContainers(hostId) {
  const rows = await dockerJsonLines(hostId, ["ps", "-a", "--no-trunc", "--format", "{{json .}}"]);
  return rows.map(row => ({
    id: row.ID, name: row.Names, image: row.Image, imageId: row.ImageID,
    command: row.Command, created: row.CreatedAt, state: row.State, status: row.Status,
    ports: row.Ports, networks: row.Networks, labels: parseLabels(row.Labels),
  }));
}

export async function listImages(hostId) {
  const rows = await dockerJsonLines(hostId, ["image", "ls", "-a", "--no-trunc", "--format", "{{json .}}"]);
  return rows.map(row => ({
    id: row.ID, repository: row.Repository, tag: row.Tag, digest: row.Digest,
    created: row.CreatedAt, size: row.Size, sharedSize: row.SharedSize,
    uniqueSize: row.UniqueSize, containers: Number(row.Containers || 0),
  }));
}

function parseLabels(value) {
  const labels = {};
  for (const item of String(value || "").split(",")) {
    const index = item.indexOf("=");
    if (index > 0) labels[item.slice(0, index)] = item.slice(index + 1);
  }
  return labels;
}

export function buildCreateArgs(body, extraLabels = {}) {
  const image = dockerImage(body.image);
  const args = ["create", ...managedLabels];
  const name = body.name ? slug(body.name) : "";
  if (name) args.push("--name", name);
  const labels = { ...(body.labels || {}), ...extraLabels };
  for (const [key, value] of Object.entries(labels)) {
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new AppError(`Invalid label: ${key}`);
    args.push("--label", `${key}=${String(value)}`);
  }
  for (const [key, value] of Object.entries(body.env || {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new AppError(`Invalid environment key: ${key}`);
    args.push("--env", `${key}=${String(value)}`);
  }
  for (const port of body.ports || []) {
    const container = Number(port.container), host = port.host == null || port.host === "" ? "" : Number(port.host);
    if (!Number.isInteger(container) || container < 1 || container > 65535) throw new AppError("Invalid container port");
    if (host !== "" && (!Number.isInteger(host) || host < 1 || host > 65535)) throw new AppError("Invalid host port");
    args.push("--publish", `${host === "" ? "" : host + ":"}${container}/${port.protocol === "udp" ? "udp" : "tcp"}`);
  }
  for (const volume of body.volumes || []) {
    const source = String(volume.source || "").trim(), target = String(volume.target || "").trim();
    if (!source || !target.startsWith("/")) throw new AppError("Invalid volume mapping");
    args.push("--volume", `${source}:${target}${volume.readOnly ? ":ro" : ""}`);
  }
  if (body.network) {
    const network = String(body.network).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/.test(network)) throw new AppError("Invalid Docker network");
    args.push("--network", network);
  }
  if (body.user) args.push("--user", String(body.user));
  if (body.workdir) {
    const workdir = String(body.workdir);
    if (!workdir.startsWith("/")) throw new AppError("Container working directory must be absolute");
    args.push("--workdir", workdir);
  }
  if (body.memory) args.push("--memory", String(body.memory));
  if (body.cpus) args.push("--cpus", String(clamp(body.cpus, 0.05, 256, 1)));
  if (body.readOnly) args.push("--read-only");
  if (body.restart && ["no", "always", "unless-stopped", "on-failure"].includes(body.restart)) args.push("--restart", body.restart);
  const entrypoint = Array.isArray(body.entrypoint) ? body.entrypoint.map(String) : body.entrypoint ? [String(body.entrypoint)] : [];
  if (entrypoint.length) args.push("--entrypoint", entrypoint[0]);
  args.push("--", image);
  const command = Array.isArray(body.command) ? body.command.map(String) : body.command ? ["/bin/sh", "-lc", String(body.command)] : [];
  command.unshift(...entrypoint.slice(1));
  args.push(...command.map(String));
  return args;
}

async function rollbackContainers(hostId, ids) {
  if (!ids.length) return;
  await runDocker(hostId, ["rm", "--force", "--volumes", "--", ...ids], { allowFailure: true, timeout: 60_000 });
  const errors = [];
  for (const id of ids) {
    const inspect = await runDocker(hostId, ["inspect", "--", id], { allowFailure: true, timeout: 10_000, maxOutput: 2_000 });
    const notFound = inspect.exitCode !== 0 && /no such (?:object|container)/i.test(`${inspect.stdout}\n${inspect.stderr}`);
    if (inspect.exitCode === 0 || !notFound) errors.push(id);
  }
  if (errors.length) throw new AppError("Created container rollback could not be verified", 502, { cleanup: true, containerIds: errors });
}

export async function createContainer(hostId, body, extraLabels = {}) {
  const args = buildCreateArgs(body, extraLabels);
  const { stdout } = await trackedDocker(hostId, "container.create", body.name || body.image, args);
  const id = stdout.trim();
  try {
    if (body.start !== false) await trackedDocker(hostId, "container.start", id, ["start", "--", id]);
  } catch (error) {
    try { await rollbackContainers(hostId, [id]); }
    catch (cleanupError) { throw new AppError("Container start failed and rollback could not be verified", 502, { cleanup: true, cause: error.message, containerId: id }); }
    throw error;
  }
  return { id };
}

export async function createContainerBatch(hostId, bodies, extraLabels = {}) {
  const results = [];
  try {
    for (const body of bodies) results.push(await createContainer(hostId, body, extraLabels));
    return results;
  } catch (error) {
    const ids = results.map(item => item.id);
    try { await rollbackContainers(hostId, ids); }
    catch (cleanupError) { throw new AppError("Container batch failed and rollback could not be verified", 502, { cleanup: true, cause: error.message, containerIds: ids }); }
    throw error;
  }
}

async function inspectContainer(hostId, id) {
  id = dockerIdentifier(id, "container identifier");
  const { stdout } = await runDocker(hostId, ["inspect", "--", id]);
  const [container] = JSON.parse(stdout);
  if (!container) throw new AppError("Container not found", 404);
  return container;
}

async function assertNotProtected(hostId, id) {
  const container = await inspectContainer(hostId, id);
  const labels = container.Config?.Labels || {};
  const name = String(container.Name || "").replace(/^\//, "");
  if (labels["io.magma.protected"] === "true" || name === config.containerName) {
    throw new AppError("Protected container cannot be modified", 409);
  }
  return container;
}

export async function assertContainerInteractive(hostId, id) {
  await assertNotProtected(hostId, dockerIdentifier(id, "container identifier"));
}

export async function containerAction(hostId, id, action) {
  const actions = new Set(["start", "stop", "restart", "pause", "unpause", "kill"]);
  if (!actions.has(action)) throw new AppError("Unsupported container action");
  id = dockerIdentifier(id, "container identifier");
  if (["stop", "restart", "pause", "kill"].includes(action)) await assertNotProtected(hostId, id);
  await trackedDocker(hostId, `container.${action}`, id, [action, "--", id]);
  return { ok: true };
}

export async function removeContainer(hostId, id, force = false) {
  id = dockerIdentifier(id, "container identifier");
  await assertNotProtected(hostId, id);
  await trackedDocker(hostId, "container.remove", id, ["rm", ...(force ? ["--force"] : []), "--", id]);
}

export async function containerLogs(hostId, id, tail = 200) {
  id = dockerIdentifier(id, "container identifier");
  const { stdout, stderr } = await runDocker(hostId, ["logs", "--timestamps", "--tail", String(clamp(tail, 1, 5000, 200)), "--", id], { allowFailure: true });
  return { logs: `${stdout}${stderr}` };
}

export async function cloneContainer(hostId, id, body) {
  id = dockerIdentifier(id, "container identifier");
  const source = await assertNotProtected(hostId, id);
  const env = {};
  for (const item of source.Config.Env || []) { const index = item.indexOf("="); if (index > 0) env[item.slice(0, index)] = item.slice(index + 1); }
  const portKeys = new Set([...Object.keys(source.Config.ExposedPorts || {}), ...Object.keys(source.HostConfig.PortBindings || {})]);
  const exposed = [...portKeys].map(value => ({ container: Number(value.split("/")[0]), protocol: value.endsWith("/udp") ? "udp" : "tcp" }));
  const labels = Object.fromEntries(Object.entries(source.Config.Labels || {}).filter(([key]) => !key.startsWith("io.magma.") && !key.startsWith("com.docker.compose.")));
  const volumes = (source.Mounts || []).filter(mount => ["bind", "volume"].includes(mount.Type)).map(mount => ({
    source: mount.Name || mount.Source, target: mount.Destination, readOnly: !mount.RW,
  }));
  const count = integerClamp(body.count, 1, 100, 1), bodies = [];
  for (let index = 0; index < count; index++) {
    const suffix = count === 1 ? "" : `-${index + 1}`;
    bodies.push({
      image: source.Config.Image,
      name: `${slug(body.name || `${String(source.Name).replace(/^\//, "")}-clone`)}${suffix}`,
      command: source.Config.Cmd || [], entrypoint: source.Config.Entrypoint || [], env, labels,
      ports: body.ports || exposed, volumes, network: source.HostConfig.NetworkMode,
      user: source.Config.User || undefined, workdir: source.Config.WorkingDir || undefined,
      readOnly: !!source.HostConfig.ReadonlyRootfs, restart: source.HostConfig.RestartPolicy?.Name || "no",
      memory: source.HostConfig.Memory || undefined,
      cpus: source.HostConfig.NanoCpus ? source.HostConfig.NanoCpus / 1e9 : undefined,
      start: body.start !== false,
    });
  }
  return createContainerBatch(hostId, bodies, { "io.magma.clone-of": source.Id.slice(0, 12), "io.magma.persistent": "true" });
}

export async function pullImage(hostId, image) {
  image = dockerImage(image);
  const { stdout } = await trackedDocker(hostId, "image.pull", image, ["pull", "--", image], { timeout: 15 * 60_000 });
  return { output: stdout };
}

export async function removeImage(hostId, image, force = false) {
  image = dockerImage(image);
  await trackedDocker(hostId, "image.remove", image, ["image", "rm", ...(force ? ["--force"] : []), "--", image]);
}

export async function dashboard(hostId) {
  const [containers, images, infoResult] = await Promise.all([
    listContainers(hostId), listImages(hostId), runDocker(hostId, ["info", "--format", "{{json .}}"]),
  ]);
  const info = JSON.parse(infoResult.stdout);
  return {
    host: getHost(hostId), containers, images,
    summary: {
      containers: containers.length,
      running: containers.filter(item => item.state === "running").length,
      images: images.length,
      cpus: info.NCPU,
      memory: info.MemTotal,
      dockerVersion: info.ServerVersion,
      operatingSystem: info.OperatingSystem,
    },
  };
}

export async function searchHub(query) {
  const value = String(query || "").trim();
  if (value.length < 2) return [];
  let response;
  try { response = await fetch(`https://hub.docker.com/v2/search/repositories/?page_size=25&query=${encodeURIComponent(value)}`, { signal: AbortSignal.timeout(15_000) }); }
  catch { throw new AppError("Docker Hub search timed out", 504); }
  if (!response.ok) throw new AppError("Docker Hub search failed", 502);
  const data = await response.json();
  return (data.results || []).map(item => ({
    name: item.repo_name, description: item.short_description || "", stars: item.star_count || 0,
    pulls: item.pull_count || 0, official: !!item.is_official, automated: !!item.is_automated,
  }));
}
