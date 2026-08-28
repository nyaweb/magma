# Ronda 04 — paths

CHECK: `%00`
FILES: `scripts/modules/paths.js, scripts/test/paths.test.js`

Ganador: **slot 02**.

```
STATUS: PASS
FILES: scripts/modules/paths.js, scripts/test/paths.test.js
SUMMARY: Added a NUL-byte guard in `resolvePublic` after URL decoding so encoded NUL paths return `null`, and added a test covering `/public/%00app.js` while keeping the existing ok and `..` cases. `bun test test` passed.
```

### `scripts/modules/paths.js` (ganador)

```js
import { resolve } from "node:path";

export const resolvePublic = (urlPath, root = "public") => {
  const base = resolve(root);
  let rel = String(urlPath || "");
  try { rel = decodeURIComponent(rel); } catch { return null; }
  if (rel.includes("\0")) return null;
  rel = rel.replace(/^\/public\/?/, "");
  if (!rel || rel.split(/[/\\]/).includes("..")) return null;
  const path = resolve(base, rel);
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  return path;
};
```

### `scripts/test/paths.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePublic } from "../modules/paths.js";

const root = mkdtempSync(join(tmpdir(), "magma-pub-"));
writeFileSync(join(root, "app.js"), "ok");

describe("resolvePublic", () => {
  test("ok", () => expect(resolvePublic("/public/app.js", root)).toBe(join(root, "app.js")));
  test("blocks ..", () => expect(resolvePublic("/public/../modules/api.js", root)).toBeNull());
  test("blocks encoded ..", () => expect(resolvePublic("/public/%2e%2e/secret", root)).toBeNull());
  test("blocks encoded nul", () => expect(resolvePublic("/public/%00app.js", root)).toBeNull());
  test("empty", () => expect(resolvePublic("/public/", root)).toBeNull());
});
```

## Score

```
slot	model	status	check	tested	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	2	2	0
02	openai/gpt-5.4-mini	PASS	True	True	2	2	0
03	openai/gpt-5.4-fast	PASS	True	True	2	2	0
04	openai/gpt-5.4	PASS	True	True	2	2	0
05	openai/gpt-5.5-fast	PASS	True	True	2	2	0
06	openai/gpt-5.5	PASS	True	True	2	2	0
07	openai/gpt-5.6-luna-fast	PASS	True	True	2	2	0
08	openai/gpt-5.6-luna	PASS	True	True	2	2	0
09	openai/gpt-5.6-sol-fast	PASS	True	True	2	2	0
10	openai/gpt-5.6-sol	PASS	True	True	2	2	0
11	openai/gpt-5.6-terra-fast	PASS	True	True	2	2	0
12	openai/gpt-5.6-terra	PASS	True	True	2	2	0
13	openai/gpt-5.3-codex-spark	PASS	True	True	2	2	0
14	opencode/big-pickle	PASS	True	True	2	2	0
15	opencode/hy3-free	PASS	True	True	2	2	0
16	opencode/mimo-v2.5-free	NO_RESULT	False	False	0	0	0
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	2	2	0
18	opencode/nemotron-3-ultra-free	PASS	True	True	2	2	0
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: resolvePublic must return null if the decoded relative path contains a NUL byte.

Implement:
1. In scripts/modules/paths.js, after decode, if the relative path includes "\0" return null. Keep existing .. and prefix checks.
2. bun tests in scripts/test/paths.test.js: encoded NUL (%00) is null; existing ok/.. cases still pass.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
