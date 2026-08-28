import { DATA, lines, need, readJson, writeJson, locked } from "./util.js";

export const APT = "apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*";
export const recipe = (from = "debian:bookworm-slim") => `FROM ${from}\nRUN ${APT}\nCMD ["sleep", "infinity"]\n`;

const LINEAGE = `${DATA}/lineage.json`;
const SEQ = `${DATA}/seq.json`;
const SELF = process.env.MAGMA_CONTAINER_NAME || "magma";
export const MAX_N = Math.min(200, Math.max(1, Number(process.env.MAGMA_MAX_N) || 32));

const parseLabels = (raw) => {
  const out = {};
  for (const part of String(raw || "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
};

const labeled = (labels, name) => labels["io.magma.protected"] === "true" || name === SELF;

export const listContainers = async () => lines(await need(["ps", "-a", "--format", "{{json .}}"], "docker ps")).map((c) => {
  const name = (c.Names || c.Name || "").replace(/^\//, "");
  return {
    id: c.ID, name, image: c.Image, status: c.Status, state: c.State,
    ports: c.Ports || "", running: String(c.State).toLowerCase() === "running",
    protected: labeled(parseLabels(c.Labels), name), kind: "container",
  };
});

export const listImages = async () => lines(await need(["images", "--format", "{{json .}}"], "docker images")).map((i) => {
  const repository = i.Repository || "<none>", tag = i.Tag || "<none>";
  return { id: i.ID, repository, tag, ref: `${repository}:${tag}`, size: i.Size || "", dangling: repository === "<none>" || tag === "<none>", kind: "image" };
});

export const inspect = async (ref) => {
  const d = JSON.parse(await need(["inspect", ref], "inspect failed"));
  const x = Array.isArray(d) ? d[0] : d;
  return { Id: x.Id, Name: x.Name, Image: x.Config?.Image || x.Image, State: x.State, Created: x.Created, Cmd: x.Config?.Cmd };
};

export const isProtected = async (ref) => {
  const name = String(ref || "").replace(/^\//, "");
  if (name === SELF) return true;
  try {
    const d = JSON.parse(await need(["inspect", "--format", "{{json .}}", ref], "inspect failed"));
    const x = Array.isArray(d) ? d[0] : d;
    const labels = x.Config?.Labels || {};
    return labels["io.magma.protected"] === "true" || String(x.Name || "").replace(/^\//, "") === SELF;
  } catch {
    return false;
  }
};

const assertMutable = async (ref) => {
  if (await isProtected(ref)) throw new Error(`${ref} está protegido`);
};

const verb = (cmd, ref, force) => need([...cmd, ...(force ? ["-f"] : []), ref], cmd.join(" ")).then((out) => ({ ok: true, ref, out: out.trim() }));
export const startContainer = (ref) => verb(["start"], ref);
export const stopContainer = async (ref) => { await assertMutable(ref); return verb(["stop"], ref); };
export const removeContainer = async (ref, { force = true } = {}) => { await assertMutable(ref); return verb(["rm"], ref, force); };
export const removeImage = (ref, { force = false } = {}) => verb(["rmi"], ref, force);

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

const cap = (n) => Math.min(MAX_N, Math.max(1, Number(n) || 1));
const slug = (s, fb = "lab") => String(s || fb).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fb;

export const runMany = async ({ image, n = 1, prefix = "lab" }) => {
  if (!image) throw new Error("image required");
  const base = slug(prefix), out = [];
  for (let i = 1; i <= cap(n); i++) out.push(await runContainer({ image, name: `${base}-${i}` }));
  return { ok: true, image, n: out.length, ran: out };
};

export const loadLineage = () => readJson(LINEAGE, []);
export const lineageFor = async (ref) => (await loadLineage()).filter((e) => [e.container, e.repository].includes(ref) || e.imageId?.startsWith(ref));
export const peekTag = async (base = "magma/snapshot") => `${base}:${((await readJson(SEQ, {}))[base] || 0) + 1}`;
export const nextMagmaTag = (base = "magma/snapshot") => locked(async () => {
  const seq = await readJson(SEQ, {});
  seq[base] = (seq[base] || 0) + 1;
  await writeJson(SEQ, seq);
  return `${base}:${seq[base]}`;
});

export const commitContainer = ({ container, repository, message, author = "magma" }) => locked(async () => {
  if (!container || !repository) throw new Error("container y repository requeridos");
  await assertMutable(container);
  const imageId = (await need(["commit", "-a", author, ...(message ? ["-m", message] : []), container, repository], "commit failed")).trim();
  const entry = { at: new Date().toISOString(), container, repository, message: message || "", imageId };
  await writeJson(LINEAGE, [...await loadLineage(), entry]);
  return { ok: true, ...entry };
});

export const commitBatch = async ({ container, n = 1, repo = "magma/snapshot", message = "snapshot" }) => {
  const commits = [];
  for (let i = 0; i < cap(n); i++) commits.push(await commitContainer({ container, repository: await nextMagmaTag(repo), message: `${message} #${i + 1}` }));
  return { ok: true, commits, last: commits.at(-1) };
};

export const buildImage = async ({ tag = "magma/slim:upgraded", from = "debian:bookworm-slim", dockerfile } = {}) => {
  const df = (dockerfile || recipe(from)).replace(/\n?$/, "\n");
  const out = (await need(["build", "-t", tag, "-f", "-", "."], "build failed", df)).trim();
  return { ok: true, tag, dockerfile: df, out };
};
