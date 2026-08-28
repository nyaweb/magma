# Ronda 01 — names

CHECK: `Lab-1`
FILES: `scripts/modules/names.js, scripts/test/names.test.js`

Ganador: **slot 01**.

```
STATUS: PASS
FILES: scripts/modules/names.js, scripts/test/names.test.js
SUMMARY: Updated `nextFreeNames` to compare taken names case-insensitively while keeping generated names lowercase via `slug`, added regression tests for mixed-case taken names and prefixes, and `bun test test` passed in `scripts`.
```

### `scripts/modules/names.js` (ganador)

```js
import { MAX_N } from "./config.js";

export const cap = (n) => Math.min(MAX_N, Math.max(1, Number(n) || 1));

export const slug = (s, fb = "lab") => String(s || fb).toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "") || fb;

export const requireRef = (ref) => {
  const n = String(ref || "").trim();
  if (!n) throw new Error("ref required");
  return n;
};

export const safeName = (name) => {
  const n = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!n) throw new Error("nombre de stack inválido");
  return n;
};

export const nextFreeNames = (prefix, n, taken = []) => {
  const base = slug(prefix), want = cap(n), out = [];
  const used = new Set(taken.map((name) => String(name || "").toLowerCase()));
  for (let i = 1; out.length < want; i++) {
    if (i > 10_000) throw new Error("no hay nombres libres");
    const name = `${base}-${i}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  return out;
};

export const stripName = (name) => String(name || "").replace(/^\//, "");

export const splitRef = (ref) => {
  const s = String(ref || "").trim();
  if (!s) return { repository: "<none>", tag: "<none>" };
  if (/^sha256:[0-9a-f]+$/i.test(s)) return { repository: s, tag: "<none>" };
  const slash = s.lastIndexOf("/"), colon = s.lastIndexOf(":");
  if (colon <= 0 || colon < slash) return { repository: s, tag: "<none>" };
  return { repository: s.slice(0, colon), tag: s.slice(colon + 1) };
};

export const joinRef = (repository, tag) => `${repository || "<none>"}:${tag || "<none>"}`;
```

### `scripts/test/names.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { cap, joinRef, nextFreeNames, requireRef, safeName, slug, splitRef, stripName } from "../modules/names.js";
import { MAX_N } from "../modules/config.js";

describe("slug", () => {
  test("lowercases and dashes", () => expect(slug("Foo Bar")).toBe("foo-bar"));
  test("empty falls back", () => expect(slug("", "lab")).toBe("lab"));
  test("strips edges", () => expect(slug("--x--")).toBe("x"));
  test("keeps underscore", () => expect(slug("my_lab")).toBe("my_lab"));
});

describe("safeName", () => {
  test("keeps underscore", () => expect(safeName("My_Lab")).toBe("my_lab"));
  test("rejects junk", () => expect(() => safeName("???")).toThrow("inválido"));
  test("rejects empty", () => expect(() => safeName("")).toThrow("inválido"));
});

describe("cap", () => {
  test("default 1", () => expect(cap(undefined)).toBe(1));
  test("clamps to MAX_N", () => expect(cap(9999)).toBe(MAX_N));
  test("clamps floor", () => expect(cap(0)).toBe(1));
  test("keeps 3", () => expect(cap(3)).toBe(3));
});

describe("nextFreeNames", () => {
  test("fills holes", () => expect(nextFreeNames("tmp", 2, ["tmp-1"])).toEqual(["tmp-2", "tmp-3"]));
  test("starts at 1", () => expect(nextFreeNames("lab", 3, [])).toEqual(["lab-1", "lab-2", "lab-3"]));
  test("ignores taken case", () => expect(nextFreeNames("lab", 1, ["Lab-1"])).toEqual(["lab-2"]));
  test("mixed case prefix still slugs", () => expect(nextFreeNames("LaB", 1, [])).toEqual(["lab-1"]));
  test("past a dense taken set", () => {
    const taken = Array.from({ length: 20 }, (_, i) => `lab-${i + 1}`);
    expect(nextFreeNames("lab", 2, taken)).toEqual(["lab-21", "lab-22"]);
  });
});

describe("requireRef", () => {
  test("ok", () => expect(requireRef(" lab ")).toBe("lab"));
  test("empty", () => expect(() => requireRef("")).toThrow("ref required"));
});

describe("stripName", () => {
  test("drops leading slash", () => expect(stripName("/magma")).toBe("magma"));
});

describe("splitRef", () => {
  test("repo:tag", () => expect(splitRef("debian:bookworm-slim")).toEqual({ repository: "debian", tag: "bookworm-slim" }));
  test("no tag", () => expect(splitRef("debian")).toEqual({ repository: "debian", tag: "<none>" }));
  test("join", () => expect(joinRef("debian", "12")).toBe("debian:12"));
  test("registry port", () => expect(splitRef("localhost:5000/foo")).toEqual({ repository: "localhost:5000/foo", tag: "<none>" }));
  test("registry port + tag", () => expect(splitRef("localhost:5000/foo:bar")).toEqual({ repository: "localhost:5000/foo", tag: "bar" }));
  test("digest", () => expect(splitRef("sha256:deadbeef")).toEqual({ repository: "sha256:deadbeef", tag: "<none>" }));
});
```

## Score

```
slot	model	status	check	tested	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	4	3	1
02	openai/gpt-5.4-mini	PASS	True	True	4	3	1
03	openai/gpt-5.4-fast	PASS	True	True	4	3	1
04	openai/gpt-5.4	PASS	True	True	4	3	1
05	openai/gpt-5.5-fast	PASS	True	True	4	3	1
06	openai/gpt-5.5	PASS	True	True	4	3	1
07	openai/gpt-5.6-luna-fast	PASS	True	True	4	3	1
08	openai/gpt-5.6-luna	PASS	True	True	4	3	1
09	openai/gpt-5.6-sol-fast	PASS	True	True	4	3	1
10	openai/gpt-5.6-sol	PASS	True	True	4	3	1
11	openai/gpt-5.6-terra-fast	PASS	True	True	4	3	1
12	openai/gpt-5.6-terra	PASS	True	True	4	3	1
13	openai/gpt-5.3-codex-spark	PASS	True	True	4	3	1
14	opencode/big-pickle	PASS	True	True	8	5	3
15	opencode/hy3-free	PASS	True	True	4	3	1
16	opencode/mimo-v2.5-free	NO_RESULT	False	False	0	0	0
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	4	3	1
18	opencode/nemotron-3-ultra-free	PASS	True	True	4	3	1
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: nextFreeNames must ignore case when checking taken names, because slug() already lowercases the prefix. Docker/UI taken lists may keep original case.

Implement:
1. In scripts/modules/names.js, nextFreeNames treats taken as a case-insensitive set. Generated names stay lowercase via slug.
2. Add bun tests in scripts/test/names.test.js: taken ["Lab-1"] with prefix "lab" and n=1 yields ["lab-2"]; mixed-case prefix still slugs.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
