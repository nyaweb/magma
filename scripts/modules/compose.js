import { DATA, STACKS, readJson, run, writeJson } from "./util.js";
import { recipe } from "./recipe.js";
import { safeName } from "./names.js";
import { pruneLineage } from "./tags.js";

export { safeName };

export const stackDir = (name) => `${STACKS}/${safeName(name)}`;
export const stackFile = (name) => `${stackDir(name)}/docker-compose.yml`;
const exists = (p) => Bun.file(p).exists();
const must = async (name) => (await exists(stackFile(name))) ? stackFile(name) : Promise.reject(new Error(`stack ${name} no existe`));

export async function listStacks() {
  const stacks = [];
  try {
    for await (const file of new Bun.Glob("*/docker-compose.yml").scan({ cwd: STACKS }))
      stacks.push({ name: file.split("/")[0], file: `${STACKS}/${file}`, kind: "stack" });
  } catch {}
  return stacks;
}

export async function writeStack({ name, yaml, from }) {
  const n = safeName(name), file = stackFile(n);
  const content = (yaml?.trim() ? yaml : renderTemplate(from || {})).replace(/\n?$/, "\n");
  await Bun.write(file, content);
  return { ok: true, name: n, file, yaml: content };
}

const block = (k, rows) => rows?.length ? `    ${k}:\n${rows.join("\n")}\n` : "";
export function renderTemplate({
  service = "app", image = "debian:bookworm-slim", command = "sleep infinity",
  containerName, restart = "unless-stopped", ports = [], volumes = [], environment = {},
  bake = false, from = "debian:bookworm-slim", dockerfile,
} = {}) {
  const svc = safeName(service || "app");
  const cname = safeName(containerName || svc);
  const img = bake ? (image.includes(":") && !image.startsWith("debian:") ? image : "magma/slim:upgraded") : image;
  const build = bake ? `    build:\n      dockerfile_inline: |\n${(dockerfile || recipe(from)).trim().split("\n").map((l) => "        " + l).join("\n")}\n` : "";
  return `services:
  ${svc}:
    image: ${img}
${build}    container_name: ${cname}
    hostname: ${cname}
    restart: ${restart}
    command: ${JSON.stringify(command)}
${block("ports", ports.map((p) => `      - "${p}"`))}${block("volumes", volumes.map((v) => `      - ${v}`))}${block("environment", Object.entries(environment).map(([k, v]) => `      ${k}: ${JSON.stringify(String(v))}`))}`;
}

export async function compose(name, verb, extra = []) {
  const n = safeName(name), file = await must(n);
  const { code, stdout, stderr } = await run("docker", ["compose", "-f", file, "-p", n, verb, ...extra]);
  return code === 0 ? { ok: true, name: n, verb, out: (stdout || stderr).trim() }
    : Promise.reject(new Error((stderr || stdout).trim() || `compose ${verb} failed`));
}

export const composeUp = (name) => compose(name, "up", ["-d", "--remove-orphans"]);
export const composeDown = (name) => compose(name, "down");
export const removeStack = async (name, { down = true } = {}) => {
  const n = safeName(name);
  down && await composeDown(n).catch(() => {});
  await run("rm", ["-rf", stackDir(n)]);
  const lineage = `${DATA}/lineage.json`;
  await writeJson(lineage, pruneLineage(await readJson(lineage, []), n));
  return { ok: true, name: n, removed: true };
};
export const readStack = async (name) => {
  const n = safeName(name), file = await must(n);
  return { name: n, file, yaml: await Bun.file(file).text(), kind: "stack" };
};
