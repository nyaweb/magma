import { DATA, lines, need, readJson, writeJson, locked } from "./util.js";
import { SELF } from "./config.js";
import { cap, nextFreeNames, requireRef, stripName } from "./names.js";
import { containerFromPs, imageFromList, isProtectedImageRef, isProtectedName } from "./protect.js";
import { assertFrom, recipe } from "./recipe.js";
import { bumpSeq, makeEntry, matchLineage, peekSeq, pruneLineage } from "./tags.js";

export { MAX_N } from "./config.js";
export { APT, recipe } from "./recipe.js";

const LINEAGE = `${DATA}/lineage.json`;
const SEQ = `${DATA}/seq.json`;

export const listContainers = async () => lines(await need(["ps", "-a", "--format", "{{json .}}"], "docker ps")).map((c) => containerFromPs(c));
export const listImages = async () => lines(await need(["images", "--format", "{{json .}}"], "docker images")).map(imageFromList);

export const inspect = async (ref) => {
  const d = JSON.parse(await need(["inspect", ref], "inspect failed"));
  const x = Array.isArray(d) ? d[0] : d;
  return { Id: x.Id, Name: x.Name, Image: x.Config?.Image || x.Image, State: x.State, Created: x.Created, Cmd: x.Config?.Cmd };
};

export const isProtected = async (ref) => {
  const name = stripName(ref);
  if (isProtectedName(name, {}, SELF)) return true;
  try {
    const d = JSON.parse(await need(["inspect", "--format", "{{json .}}", ref], "inspect failed"));
    const x = Array.isArray(d) ? d[0] : d;
    return isProtectedName(x.Name, x.Config?.Labels || {}, SELF);
  } catch {
    return false;
  }
};

const assertMutable = async (ref) => {
  if (await isProtected(ref)) throw new Error(`${ref} está protegido`);
};

const verb = (cmd, ref, force) => need([...cmd, ...(force ? ["-f"] : []), requireRef(ref)], cmd.join(" ")).then((out) => ({ ok: true, ref, out: out.trim() }));
export const startContainer = (ref) => verb(["start"], ref);
export const stopContainer = async (ref) => { requireRef(ref); await assertMutable(ref); return verb(["stop"], ref); };
export const removeContainer = async (ref, { force = true } = {}) => {
  requireRef(ref); await assertMutable(ref);
  const out = await verb(["rm"], ref, force);
  await writeJson(LINEAGE, pruneLineage(await loadLineage(), ref));
  return out;
};
export const removeImage = async (ref, { force = false } = {}) => {
  if (isProtectedImageRef(ref)) throw new Error(`${ref} está protegido`);
  if (isProtectedImageRef(ref, await listImages())) throw new Error(`${ref} está protegido`);
  const out = await verb(["rmi"], requireRef(ref), force);
  await writeJson(LINEAGE, pruneLineage(await loadLineage(), ref));
  return out;
};

export async function runContainer({ image, name, command, detach = true, tty = true }) {
  if (!image) throw new Error("image required");
  const args = ["run", ...(detach ? ["-d"] : []), ...(tty ? ["-t"] : []), ...(name ? ["--name", name] : []), image,
    ...(command ? (Array.isArray(command) ? command : ["sh", "-c", String(command)]) : ["sleep", "infinity"])];
  return { ok: true, id: (await need(args, "run failed")).trim(), image, name: name || null };
}

export const execIn = async (ref, command) => {
  if (!ref || !command) throw new Error("ref y command requeridos");
  await assertMutable(ref);
  return need(["exec", ref, "sh", "-c", String(command)], "exec failed").then((out) => ({ ok: true, ref, out: out.trim() }));
};

export const runMany = ({ image, n = 1, prefix = "lab" }) => locked(async () => {
  if (!image) throw new Error("image required");
  const taken = (await listContainers()).map((c) => c.name);
  const ran = [];
  for (const name of nextFreeNames(prefix, n, taken)) ran.push(await runContainer({ image, name }));
  return { ok: true, image, n: ran.length, ran };
});

export const loadLineage = () => readJson(LINEAGE, []);
export const lineageFor = async (ref) => matchLineage(await loadLineage(), ref);
export const peekTag = async (base = "magma/snapshot") => peekSeq(await readJson(SEQ, {}), base);
export const nextMagmaTag = (base = "magma/snapshot") => locked(async () => {
  const { seq, tag } = bumpSeq(await readJson(SEQ, {}), base);
  await writeJson(SEQ, seq);
  return tag;
});

export const commitContainer = ({ container, repository, message, author = "magma" }) => locked(async () => {
  if (!container || !repository) throw new Error("container y repository requeridos");
  await assertMutable(container);
  const imageId = (await need(["commit", "-a", author, ...(message ? ["-m", message] : []), container, repository], "commit failed")).trim();
  const entry = makeEntry({ container, repository, message: message || "", imageId });
  await writeJson(LINEAGE, [...await loadLineage(), entry]);
  return { ok: true, ...entry };
});

export const commitBatch = async ({ container, n = 1, repo = "magma/snapshot", message = "snapshot" }) => {
  const commits = [];
  for (let i = 0; i < cap(n); i++) commits.push(await commitContainer({ container, repository: await nextMagmaTag(repo), message: `${message} #${i + 1}` }));
  return { ok: true, commits, last: commits.at(-1) };
};

export const buildImage = async ({ tag = "magma/slim:upgraded", from = "debian:bookworm-slim", dockerfile } = {}) => {
  const df = assertFrom(dockerfile || recipe(from)).replace(/\n?$/, "\n");
  const out = (await need(["build", "-t", tag, "-f", "-", "."], "build failed", df)).trim();
  return { ok: true, tag, dockerfile: df, out };
};
