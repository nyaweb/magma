import {
  listContainers, listImages, inspect, startContainer, stopContainer,
  removeContainer, removeImage, runContainer, runMany, execIn, commitContainer, commitBatch, buildImage, APT,
  nextMagmaTag, peekTag, loadLineage, lineageFor,
} from "./docker.js";
import { listStacks, writeStack, composeUp, composeDown, removeStack, readStack, renderTemplate } from "./compose.js";
import { docker, json } from "./util.js";
import { MAX_N } from "./docker.js";
const fail = (err) => json({ error: String(err?.message || err) }, 400);
const body = (req) => req.json().catch(() => ({}));
const tag = (repo) => nextMagmaTag(repo || "magma/snapshot");

export const snapshot = async () => {
  const [containers, images, stacks] = await Promise.all([listContainers(), listImages(), listStacks()]);
  return { containers, images, stacks };
};

const GET = {
  "/api/health": () => ({ ok: true, name: "magma", version: "1.4.0", maxN: MAX_N }),
  "/api/ready": async () => {
    const ver = await docker(["version", "--format", "{{.Server.Version}}"]).then((r) => r.stdout.trim()).catch(() => "");
    if (!ver) throw new Error("docker not ready");
    return { ok: true, name: "magma", version: "1.4.0", dockerVersion: ver, time: new Date().toISOString() };
  },
  "/api/snapshot": snapshot,
  "/api/containers": listContainers,
  "/api/images": listImages,
  "/api/stacks": listStacks,
  "/api/lineage": ({ q }) => q.get("ref") ? lineageFor(q.get("ref")) : loadLineage(),
  "/api/inspect": ({ q }) => q.get("ref") ? inspect(q.get("ref")) : Promise.reject(new Error("ref required")),
  "/api/next-tag": ({ q }) => peekTag(q.get("repo") || "magma/snapshot").then((repository) => ({ repository })),
  "/api/stacks/read": ({ q }) => readStack(q.get("name")),
};

const POST = {
  "/api/containers/start": ({ b }) => startContainer(b.ref),
  "/api/containers/stop": ({ b }) => stopContainer(b.ref),
  "/api/containers/rm": ({ b }) => removeContainer(b.ref, { force: b.force !== false }),
  "/api/containers/run": ({ b }) => runContainer(b),
  "/api/images/rm": ({ b }) => removeImage(b.ref, { force: !!b.force }),
  "/api/commit": async ({ b }) => commitContainer({ ...b, repository: b.repository || await tag(b.repo) }),
  "/api/commit-batch": ({ b }) => commitBatch(b),
  "/api/exec": ({ b }) => execIn(b.ref, b.command),
  "/api/run-many": ({ b }) => runMany(b),
  "/api/stamp": ({ b }) => stamp(b),
  "/api/bake": ({ b }) => bake(b),
  "/api/evolve": ({ b }) => evolve(b),
  "/api/duplicate": ({ b }) => evolve({ ...b, message: b.message || `duplicate ${b.container}` }),
  "/api/stacks": ({ b }) => writeStack(b),
  "/api/stacks/template": ({ b }) => ({ yaml: renderTemplate(b) }),
  "/api/stacks/up": ({ b }) => composeUp(b.name),
  "/api/stacks/down": ({ b }) => composeDown(b.name),
  "/api/stacks/rm": ({ b }) => removeStack(b.name, { down: b.down }),
};



const prep = (exec) => exec === true || exec === "apt" ? APT : (typeof exec === "string" && exec.trim() ? exec.trim() : "");

export const stamp = async ({ container, n = 1, repo, prefix, exec, message }) => {
  if (!container) throw new Error("container required");
  const command = prep(exec);
  const prepared = command ? await execIn(container, command) : null;
  const repository = await tag(repo || "magma/slim");
  const committed = await commitContainer({ container, repository, message: message || (command ? "stamp+prep" : "stamp") });
  const spawned = await runMany({ image: repository, n, prefix: prefix || container });
  return { ok: true, prepared, committed, spawned };
};

const slug = (s) => String(s || "clone").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "clone";
export const evolve = async ({ container, name, repo, message, spawn = true }) => {
  const repository = await tag(repo);
  const committed = await commitContainer({ container, repository, message: message || `evolve ${container}` });
  const clone = slug(name || `${container}-${repository.split(":").pop()}`);
  const stack = await writeStack({ name: clone, from: { service: clone, image: repository, containerName: clone } });
  const spawned = spawn !== false ? await runContainer({ image: repository, name: clone }) : null;
  return { ok: true, committed, stack, spawned };
};


export const bake = async ({ name = "slim", from = "debian:bookworm-slim", tag = "magma/slim:upgraded", n = 0, prefix, dockerfile } = {}) => {
  const built = await buildImage({ tag, from, dockerfile });
  const stack = await writeStack({ name, from: { service: name, image: tag, bake: true, from, dockerfile, containerName: name } });
  const spawned = n > 0 ? await runMany({ image: tag, n, prefix: prefix || name }) : null;
  return { ok: true, built, stack, spawned };
};

export async function handleApi(req, url) {
  const fn = (req.method === "GET" ? GET : POST)[url.pathname];
  try {
    return fn ? json(await fn({ q: url.searchParams, b: req.method === "POST" ? await body(req) : null })) : json({ error: "Not Found" }, 404);
  } catch (err) { return fail(err); }
}
