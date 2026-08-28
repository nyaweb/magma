# Ronda 09 — docker

CHECK: `isProtectedImageRef`
FILES: `scripts/modules/protect.js, scripts/modules/docker.js, scripts/test/protect.test.js, scripts/test/docker.test.js`

Ganador: **slot 02**.

```
STATUS: PASS
FILES: scripts/modules/protect.js, scripts/modules/docker.js, scripts/test/protect.test.js, scripts/test/docker.test.js
SUMMARY: Added `isProtectedImageRef(ref)` for magma repository refs, made `removeImage` fail fast with `${ref} está protegido` before any docker rmi call, and added bun tests for the helper plus protected-image removal; `bun test ./test` passed.
```

### `scripts/modules/protect.js` (ganador)

```js
import { SELF } from "./config.js";
import { joinRef, splitRef, stripName } from "./names.js";

export const parseLabels = (raw) => {
  const out = {};
  for (const part of String(raw || "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
};

export const asLabels = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return parseLabels(raw);
};

export const isProtectedName = (name, labels = {}, self = SELF) =>
  labels["io.magma.protected"] === "true" || stripName(name) === self;

export const containerFromPs = (c, self = SELF) => {
  const name = stripName(c.Names || c.Name || "");
  return {
    id: c.ID, name, image: c.Image, status: c.Status, state: c.State,
    ports: c.Ports || "", running: String(c.State).toLowerCase() === "running",
    protected: isProtectedName(name, asLabels(c.Labels), self), kind: "container",
  };
};

export const imageFromList = (i) => {
  const repository = i.Repository || "<none>", tag = i.Tag || "<none>";
  return { id: i.ID, repository, tag, ref: joinRef(repository, tag), size: i.Size || "", dangling: repository === "<none>" || tag === "<none>", protected: repository === "magma", kind: "image" };
};

export const isProtectedImageRef = (ref) => splitRef(ref).repository === "magma";
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

### `scripts/test/protect.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { asLabels, containerFromPs, imageFromList, isProtectedImageRef, isProtectedName, parseLabels } from "../modules/protect.js";

describe("parseLabels", () => {
  test("empty", () => expect(parseLabels("")).toEqual({}));
  test("k=v list", () => expect(parseLabels("io.magma.protected=true,foo=bar")).toEqual({
    "io.magma.protected": "true", foo: "bar",
  }));
});

describe("asLabels", () => {
  test("object passthrough", () => expect(asLabels({ a: "1" })).toEqual({ a: "1" }));
  test("string", () => expect(asLabels("a=1")).toEqual({ a: "1" }));
  test("null", () => expect(asLabels(null)).toEqual({}));
});

describe("isProtectedName", () => {
  test("self", () => expect(isProtectedName("magma", {}, "magma")).toBe(true));
  test("slash self", () => expect(isProtectedName("/magma", {}, "magma")).toBe(true));
  test("label", () => expect(isProtectedName("other", { "io.magma.protected": "true" })).toBe(true));
  test("plain", () => expect(isProtectedName("lab", {})).toBe(false));
});

describe("containerFromPs", () => {
  test("maps running", () => {
    const c = containerFromPs({ ID: "abc", Names: "lab", Image: "debian", State: "running", Status: "Up", Labels: "" });
    expect(c).toMatchObject({ name: "lab", running: true, protected: false, kind: "container" });
  });
  test("flags protected", () => {
    const c = containerFromPs({ ID: "x", Names: "other", Image: "magma:1.4.0", State: "running", Labels: " io.magma.protected = true " });
    expect(c.protected).toBe(true);
  });
  test("inspect-style label object", () => {
    const c = containerFromPs({ ID: "x", Names: "x", Image: "d", State: "running", Labels: { "io.magma.protected": "true" } });
    expect(c.protected).toBe(true);
  });
});

describe("imageFromList", () => {
  test("builds ref", () => {
    expect(imageFromList({ ID: "1", Repository: "debian", Tag: "bookworm-slim" }).ref).toBe("debian:bookworm-slim");
  });
  test("dangling", () => {
    expect(imageFromList({ ID: "1", Repository: "<none>", Tag: "<none>" })).toMatchObject({ dangling: true, protected: false });
  });
  test("protects only magma repository", () => {
    expect(imageFromList({ ID: "1", Repository: "magma", Tag: "latest" }).protected).toBe(true);
    expect(imageFromList({ ID: "2", Repository: "magma/slim", Tag: "latest" }).protected).toBe(false);
  });
});

describe("isProtectedImageRef", () => {
  test("magma tag", () => expect(isProtectedImageRef("magma:1.4.0")).toBe(true));
  test("slim repo", () => expect(isProtectedImageRef("magma/slim:1.4.0")).toBe(false));
});
```

### `scripts/test/docker.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import "./env.js";
import { removeImage } from "../modules/docker.js";

describe("removeImage", () => {
  test("blocks protected magma images before docker rmi", async () => {
    await expect(removeImage("magma:1.4.0")).rejects.toThrow(/protegido/);
  });
});
```

## Score

```
slot	model	status	check	tested	beats	diff	plus	minus
01	openai/gpt-5.4-mini-fast	NO_RESULT	False	False	False	0	0	0
02	openai/gpt-5.4-mini	PASS	True	True	True	14	11	3
03	openai/gpt-5.4-fast	PASS	True	True	True	19	14	5
04	openai/gpt-5.4	PASS	True	True	True	17	13	4
05	openai/gpt-5.5-fast	PASS	True	True	True	19	15	4
06	openai/gpt-5.5	PASS	True	True	True	20	16	4
07	openai/gpt-5.6-luna-fast	PASS	True	True	True	20	15	5
08	openai/gpt-5.6-luna	PASS	True	True	True	17	13	4
09	openai/gpt-5.6-sol-fast	PASS	True	True	True	17	13	4
10	openai/gpt-5.6-sol	PASS	True	True	True	16	13	3
11	openai/gpt-5.6-terra-fast	PASS	True	True	True	16	13	3
12	openai/gpt-5.6-terra	PASS	True	True	True	16	13	3
13	openai/gpt-5.3-codex-spark	PASS	True	True	True	21	16	5
14	opencode/big-pickle	PASS	True	True	True	18	14	4
15	opencode/hy3-free	PASS	True	True	True	17	14	3
16	opencode/mimo-v2.5-free	PASS	True	True	True	16	13	3
17	opencode/muse-spark-1.2-contributor-free	STALE	True	True	False	12	8	4
18	opencode/nemotron-3-ultra-free	PASS	True	True	True	20	16	4
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: deleting the control-plane image must fail. imageFromList already sets protected when repository is exactly "magma". removeImage does not honor that.

Implement:
1. In scripts/modules/protect.js export isProtectedImageRef(ref): true iff splitRef(ref).repository === "magma" (magma/slim is false; "magma:1.4.0" is true).
2. In scripts/modules/docker.js, removeImage must throw `${ref} está protegido` when isProtectedImageRef(ref), BEFORE calling docker rmi. magma/slim must still rmi (do not throw in the helper).
3. bun tests: scripts/test/protect.test.js for the helper; scripts/test/docker.test.js calls removeImage("magma:1.4.0") and expects reject /protegido/ without needing a real rmi (throw before docker). Do not import server.js.
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
