# Ronda 06 — compose

CHECK: `pruneLineage`
FILES: `scripts/modules/compose.js, scripts/test/compose.test.js`

Ganador: **slot 06**.

```
STATUS: PASS
FILES: scripts/modules/compose.js, scripts/test/compose.test.js, scripts/test/env.js, scripts/test/api.test.js, scripts/test/util.test.js
SUMMARY: removeStack now prunes matching lineage rows for the stack safe name after deleting the stack directory, including when down is false; compose tests now import compose after temp MAGMA_DATA/MAGMA_STACKS setup and verify removeStack keeps only distractor lineage rows, with shared test env setup preventing parallel import cache races. `cd scripts && bun test test` passed with 87 pass, 0 fail.
```

### `scripts/modules/compose.js` (ganador)

```js
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
```

### `scripts/test/compose.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import "./env.js";
import { join } from "node:path";

const { renderTemplate, removeStack, writeStack } = await import("../modules/compose.js");

describe("renderTemplate", () => {
  test("plain service", () => {
    const y = renderTemplate({ service: "lab", image: "debian:bookworm-slim" });
    expect(y).toContain("container_name: lab");
    expect(y).toContain("image: debian:bookworm-slim");
    expect(y).not.toContain("dockerfile_inline");
  });
  test("bake inlines dockerfile", () => {
    const y = renderTemplate({ service: "slim", bake: true, image: "magma/slim:upgraded" });
    expect(y).toContain("dockerfile_inline");
    expect(y).toContain("FROM debian:bookworm-slim");
  });
  test("ports", () => {
    expect(renderTemplate({ service: "web", ports: ["8080:80"] })).toContain("8080:80");
  });
  test("sanitizes service key", () => {
    const y = renderTemplate({ service: "x:\n  evil", image: "debian:12" });
    expect(y).not.toMatch(/\n  evil/);
    expect(y).toContain("x-evil:");
  });
});

describe("removeStack", () => {
  test("prunes lineage for stack name without compose down", async () => {
    await writeStack({ name: "lab", yaml: "services:\n  app:\n    image: debian:bookworm-slim\n" });
    const lineage = join(process.env.MAGMA_DATA, "lineage.json");
    const distractor = { container: "other", repository: "repo", imageId: "sha256:distractor" };
    await Bun.write(lineage, JSON.stringify([{ container: "lab", repository: "repo", imageId: "sha256:match" }, distractor]));

    await removeStack("lab", { down: false });

    expect(await Bun.file(lineage).json()).toEqual([distractor]);
  });
});
```

## Score

```
slot	model	status	check	tested	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	39	37	2
02	openai/gpt-5.4-mini	PASS	True	True	48	43	5
03	openai/gpt-5.4-fast	PASS	True	True	44	41	3
04	openai/gpt-5.4	PASS	True	True	43	41	2
05	openai/gpt-5.5-fast	PASS	True	True	29	27	2
06	openai/gpt-5.5	PASS	True	True	23	21	2
07	openai/gpt-5.6-luna-fast	PASS	True	True	30	28	2
08	openai/gpt-5.6-luna	PASS	True	True	40	38	2
09	openai/gpt-5.6-sol-fast	PASS	True	True	29	27	2
10	openai/gpt-5.6-sol	PASS	True	True	35	33	2
11	openai/gpt-5.6-terra-fast	PASS	True	True	35	33	2
12	openai/gpt-5.6-terra	PASS	True	True	39	37	2
13	openai/gpt-5.3-codex-spark	PASS	True	True	40	38	2
14	opencode/big-pickle	PASS	True	True	36	33	3
15	opencode/hy3-free	PASS	True	True	38	35	3
16	opencode/mimo-v2.5-free	PARTIAL	True	True	0	0	0
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	30	28	2
18	opencode/nemotron-3-ultra-free	PASS	True	True	69	62	7
19	opencode/nemotron-3.5-lightning-free	PARTIAL	True	True	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: removeStack must drop matching lineage rows for the stack name (same match rules as pruneLineage / matchLineage: container, repository, or imageId prefix — here the ref is the stack's safe name).

Implement:
1. In scripts/modules/compose.js, after deleting the stack dir, load lineage from DATA (util readJson/writeJson; path `${DATA}/lineage.json` like docker.js), pruneLineage(entries, safeName), write back. Do this even when down=false. Reuse pruneLineage from tags.js. Do not add deps.
2. bun tests in scripts/test/compose.test.js: set process.env.MAGMA_DATA and MAGMA_STACKS to temp dirs BEFORE importing compose.js (DATA/STACKS are captured at import). writeStack, seed lineage.json with a row whose container equals the stack name plus a distractor row, removeStack(name, {down:false}), expect only the distractor left. Keep renderTemplate tests.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
