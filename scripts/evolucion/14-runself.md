# Ronda 14 — runself

CHECK: `isProtectedName(name`
FILES: `scripts/modules/docker.js, scripts/test/docker.test.js`

Ganador: **slot 06**.

```
STATUS: PASS
FILES: scripts/modules/docker.js, scripts/test/docker.test.js, RESULT.md
SUMMARY: Added a protected-name guard to runContainer so the control-plane name is rejected before any Docker call, and added a regression test for name "magma"; bun test ./test passed with 102 tests and 0 failures.
```

### `scripts/modules/docker.js` (ganador)

```js
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
  const out = await verb(["rmi"], requireRef(ref), force);
  await writeJson(LINEAGE, pruneLineage(await loadLineage(), ref));
  return out;
};

export async function runContainer({ image, name, command, detach = true, tty = true }) {
  if (name && isProtectedName(name, {}, SELF)) throw new Error(`${name} está protegido`);
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
```

### `scripts/test/docker.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import "./env.js";
import { removeImage, runContainer } from "../modules/docker.js";

describe("removeImage", () => {
  test("blocks protected magma images before docker rmi", async () => {
    await expect(removeImage("magma:1.4.0")).rejects.toThrow(/protegido/);
  });
});

test("runContainer blocks protected magma name before docker run", async () => {
  await expect(runContainer({ image: "debian:bookworm-slim", name: "magma" })).rejects.toThrow(/protegido/);
});
```

## Score

```
slot	model	status	check	tested	beats	diff	plus	minus
01	openai/gpt-5.4-mini	PASS	True	True	True	10	8	2
02	openai/gpt-5.4-mini-fast	PASS	True	True	True	10	8	2
03	opencode/big-pickle	PASS	True	True	True	10	8	2
04	opencode/muse-spark-1.2-contributor-free	PASS	True	True	True	10	8	2
05	openai/gpt-5.6-sol-fast	PASS	True	True	True	10	8	2
06	openai/gpt-5.6-luna-fast	PASS	True	True	True	8	6	2
07	openai/gpt-5.5	PASS	True	True	True	10	8	2
08	openai/gpt-5.5-fast	PASS	True	True	True	10	8	2
09	opencode/hy3-free	PASS	True	True	True	10	8	2
10	openai/gpt-5.3-codex-spark	PASS	True	True	True	10	8	2
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: runContainer({ image, name: "magma" }) must not call docker. The control-plane name is SELF (default "magma") and isProtectedName already treats it as protected.

Implement:
1. In runContainer, if name is set and isProtectedName(name, {}, SELF) throw `${name} está protegido` BEFORE need/docker.
2. bun tests in docker.test.js: runContainer({ image: "debian:bookworm-slim", name: "magma" }) rejects /protegido/. Existing removeImage test stays.
3. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
