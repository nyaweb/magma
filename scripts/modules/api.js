import {
  listContainers, listImages, inspect, startContainer, stopContainer,
  removeContainer, removeImage, runContainer, runMany, execIn, commitContainer, commitBatch,
  nextMagmaTag, peekTag, loadLineage, lineageFor, MAX_N,
} from "./docker.js";
import { listStacks, writeStack, composeUp, composeDown, removeStack, readStack, renderTemplate } from "./compose.js";
import { bake, duplicate, evolve, stamp } from "./actions.js";
import { docker, json } from "./util.js";
import { VERSION } from "./config.js";

const fail = (err) => json({ error: String(err?.message || err) }, 400);
const body = async (req) => {
  const text = await req.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new Error("invalid json"); }
};
const tag = (repo) => nextMagmaTag(repo || "magma/snapshot");

let snapAt = 0;
let snapData = null;
const SNAP_TTL = 200;

export const invalidateSnapshot = () => { snapAt = 0; snapData = null; };

export const snapshot = async () => {
  const now = Date.now();
  if (snapData && now - snapAt < SNAP_TTL) return snapData;
  const [containers, images, stacks] = await Promise.all([listContainers(), listImages(), listStacks()]);
  snapData = { containers, images, stacks };
  snapAt = now;
  return snapData;
};

const GET = {
  "/api/health": () => ({ ok: true, name: "magma", version: VERSION, maxN: MAX_N }),
  "/api/ready": async () => {
    const ver = await docker(["version", "--format", "{{.Server.Version}}"]).then((r) => r.stdout.trim()).catch(() => "");
    if (!ver) throw new Error("docker not ready");
    return { ok: true, name: "magma", version: VERSION, dockerVersion: ver, time: new Date().toISOString() };
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
  "/api/duplicate": ({ b }) => duplicate(b),
  "/api/stacks": ({ b }) => writeStack(b),
  "/api/stacks/template": ({ b }) => ({ yaml: renderTemplate(b) }),
  "/api/stacks/up": ({ b }) => composeUp(b.name),
  "/api/stacks/down": ({ b }) => composeDown(b.name),
  "/api/stacks/rm": ({ b }) => removeStack(b.name, { down: b.down }),
};

export async function handleApi(req, url) {
  const table = req.method === "GET" ? GET : req.method === "POST" ? POST : null;
  if (!table) return json({ error: "Method Not Allowed" }, 405);
  const fn = table[url.pathname];
  try {
    return fn ? json(await fn({ q: url.searchParams, b: req.method === "POST" ? await body(req) : null })) : json({ error: "Not Found" }, 404);
  } catch (err) { return fail(err); }
}
