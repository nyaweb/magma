# Ronda 08 — actions

CHECK: `pickCloneName`
FILES: `scripts/modules/actions.js, scripts/test/actions.test.js`

Ganador: **slot 02**.

```
STATUS: PASS
FILES: scripts/modules/actions.js, scripts/test/actions.test.js
SUMMARY: Extracted clone-name selection into `pickCloneName` in `scripts/modules/actions.js`, switched `evolve` to use it, and added focused unit tests covering free, colliding, and empty-taken cases. `bun test test` passed with 89 tests green.
```

### `scripts/modules/actions.js` (ganador)

```js
import { nextFreeNames, slug, splitRef } from "./names.js";
import { prepExec } from "./recipe.js";
import {
  buildImage, commitContainer, execIn, listContainers, nextMagmaTag, runContainer, runMany,
} from "./docker.js";
import { writeStack } from "./compose.js";

export const stamp = async ({ container, n = 1, repo, prefix, exec, message }) => {
  if (!container) throw new Error("container required");
  const command = prepExec(exec);
  const prepared = command ? await execIn(container, command) : null;
  const repository = await nextMagmaTag(repo || "magma/slim");
  const committed = await commitContainer({ container, repository, message: message || (command ? "stamp+prep" : "stamp") });
  const spawned = await runMany({ image: repository, n, prefix: prefix || container });
  return { ok: true, prepared, committed, spawned };
};

export const pickCloneName = (wanted, taken = []) => (taken.includes(wanted) ? nextFreeNames(wanted, 1, taken)[0] : wanted);

export const evolve = async ({ container, name, repo, message, spawn = true }) => {
  if (!container) throw new Error("container required");
  const repository = await nextMagmaTag(repo);
  const committed = await commitContainer({ container, repository, message: message || `evolve ${container}` });
  const wanted = slug(name || `${container}-${splitRef(repository).tag}`, "clone");
  const taken = (await listContainers()).map((c) => c.name);
  const clone = pickCloneName(wanted, taken);
  const stack = await writeStack({ name: clone, from: { service: clone, image: repository, containerName: clone } });
  const spawned = spawn !== false ? await runContainer({ image: repository, name: clone }) : null;
  return { ok: true, committed, stack, spawned };
};

export const duplicate = (body) => evolve({ ...body, message: body.message || `duplicate ${body.container}` });

export const bake = async ({ name = "slim", from = "debian:bookworm-slim", tag = "magma/slim:upgraded", n = 0, prefix, dockerfile } = {}) => {
  const built = await buildImage({ tag, from, dockerfile });
  const stack = await writeStack({ name, from: { service: name, image: tag, bake: true, from, dockerfile, containerName: name } });
  const spawned = n > 0 ? await runMany({ image: tag, n, prefix: prefix || name }) : null;
  return { ok: true, built, stack, spawned };
};
```

### `scripts/test/actions.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { pickCloneName } from "../modules/actions.js";

describe("pickCloneName", () => {
  test("free name stays", () => expect(pickCloneName("lab", [])).toBe("lab"));
  test("collision uses nextFreeNames", () => expect(pickCloneName("lab", ["lab"])).toBe("lab-1"));
  test("empty taken keeps wanted", () => expect(pickCloneName("lab", undefined)).toBe("lab"));
});
```

## Score

```
slot	model	status	check	tested	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	4	3	1
02	openai/gpt-5.4-mini	PASS	True	True	4	3	1
03	openai/gpt-5.4-fast	PASS	True	True	4	3	1
04	openai/gpt-5.4	PASS	True	True	4	3	1
05	openai/gpt-5.5-fast	PASS	True	True	6	5	1
06	openai/gpt-5.5	PASS	True	True	6	5	1
07	openai/gpt-5.6-luna-fast	PASS	True	True	4	3	1
08	openai/gpt-5.6-luna	PASS	True	True	4	3	1
09	openai/gpt-5.6-sol-fast	PASS	True	True	4	3	1
10	openai/gpt-5.6-sol	PASS	True	True	4	3	1
11	openai/gpt-5.6-terra-fast	PASS	True	True	4	3	1
12	openai/gpt-5.6-terra	PASS	True	True	4	3	1
13	openai/gpt-5.3-codex-spark	PASS	True	True	5	4	1
14	opencode/big-pickle	PASS	True	True	4	3	1
15	opencode/hy3-free	PASS	True	True	5	4	1
16	opencode/mimo-v2.5-free	NO_RESULT	False	False	0	0	0
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	4	3	1
18	opencode/nemotron-3-ultra-free	PASS	True	True	5	4	1
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: extract the clone-name picker used by evolve so it can be tested without Docker.

Implement:
1. In scripts/modules/actions.js export pickCloneName(wanted, taken): if wanted is already in taken, return nextFreeNames(wanted, 1, taken)[0], else wanted. evolve uses it instead of inlining.
2. New scripts/test/actions.test.js: free name stays; collision uses nextFreeNames (wanted "lab" taken ["lab"] → "lab-1"); empty taken keeps wanted.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn. Do not add a bun test runner file that hits live Docker.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
