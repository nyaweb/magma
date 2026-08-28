# Ronda 05 — util

CHECK: `mkdir`
FILES: `scripts/modules/util.js, scripts/test/util.test.js`

Ganador: **slot 16**.

### `scripts/modules/util.js` (ganador)

```js
export const STACKS = process.env.MAGMA_STACKS || "/stacks";
export const DATA = process.env.MAGMA_DATA || "/data";

export async function run(cmd, args = [], input) {
  const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe", stdin: input != null ? "pipe" : "ignore" });
  input != null && (proc.stdin.write(input), proc.stdin.end());
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { code, stdout, stderr };
}
export const docker = (args, input) => run("docker", args, input);
export const lines = (t) => t.split("\n").map((l) => l.trim()).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
export const need = async (args, err, input) => {
  const { code, stdout, stderr } = await docker(args, input);
  return code === 0 ? stdout : Promise.reject(new Error(stderr.trim() || err));
};
export const readJson = async (p, fallback) => {
  const f = Bun.file(p);
  return await f.exists() ? f.json().catch(() => fallback) : fallback;
};
export const writeJson = (p, data) => Bun.write(p, JSON.stringify(data, null, 2));
export const json = (data, status = 200) => Response.json(data, { status });

let gate = Promise.resolve();
export const locked = (fn) => {
  const run = () => Promise.resolve().then(fn);
  return (gate = gate.then(run, run));
};
```

### `scripts/test/util.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { lines, locked } from "../modules/util.js";

describe("lines", () => {
  test("parses jsonl", () => {
    expect(lines('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  test("skips junk", () => expect(lines("nope\n{\"ok\":true}\n")).toEqual([{ ok: true }]));
  test("empty", () => expect(lines("")).toEqual([]));
});

describe("locked", () => {
  test("does not pass the error to the next job", async () => {
    const args = [];
    await locked(async (...a) => { args.push(a); throw new Error("x"); }).catch(() => {});
    await locked(async (...a) => { args.push(a); });
    expect(args[0]).toEqual([]);
    expect(args[1]).toEqual([]);
  });
  test("serializes", async () => {
    const order = [];
    const a = locked(async () => { await Bun.sleep(20); order.push(1); });
    const b = locked(async () => { order.push(2); });
    await Promise.all([a, b]);
    expect(order).toEqual([1, 2]);
  });
});
```

## Score

```
slot	model	status	check	tested	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	23	21	2
02	openai/gpt-5.4-mini	PASS	True	True	18	16	2
03	openai/gpt-5.4-fast	PASS	True	True	28	26	2
04	openai/gpt-5.4	PASS	True	True	20	18	2
05	openai/gpt-5.5-fast	PASS	True	True	27	25	2
06	openai/gpt-5.5	PASS	True	True	20	18	2
07	openai/gpt-5.6-luna-fast	PASS	True	True	23	21	2
08	openai/gpt-5.6-luna	PASS	True	True	17	15	2
09	openai/gpt-5.6-sol-fast	PASS	True	True	13	11	2
10	openai/gpt-5.6-sol	PASS	True	True	16	14	2
11	openai/gpt-5.6-terra-fast	PASS	True	True	22	20	2
12	openai/gpt-5.6-terra	PASS	True	True	22	20	2
13	openai/gpt-5.3-codex-spark	PASS	True	True	23	21	2
14	opencode/big-pickle	PASS	True	True	19	17	2
15	opencode/hy3-free	PASS	True	True	19	17	2
16	opencode/mimo-v2.5-free	PASS	True	True	0	0	0
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	19	17	2
18	opencode/nemotron-3-ultra-free	PASS	True	True	26	24	2
19	opencode/nemotron-3.5-lightning-free	PASS	True	True	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: writeJson must create parent directories so lineage/seq writes do not fail on a missing folder.

Implement:
1. In scripts/modules/util.js, writeJson ensures the parent dir of p exists (recursive). Use node:fs mkdirSync or equivalent already available. Do not add dependencies.
2. bun tests in scripts/test/util.test.js: write then readJson roundtrip in a nested temp path that did not exist; existing lines/locked tests stay.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
