# Ronda 03 — recipe

CHECK: `# FROM`
FILES: `scripts/modules/recipe.js, scripts/test/recipe.test.js`

Ganador: **slot 07**.

```
STATUS: PASS
FILES: scripts/modules/recipe.js, scripts/test/recipe.test.js, RESULT.md
SUMMARY: Tightened assertFrom so blank lines and comments may precede the first instruction, but the first real instruction must be FROM; added the requested coverage for valid, invalid, commented, and empty Dockerfiles. bun test test passed with 84 tests and 0 failures.
```

### `scripts/modules/recipe.js` (ganador)

```js
export const APT = "apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*";

export const recipe = (from = "debian:bookworm-slim") => `FROM ${from}\nRUN ${APT}\nCMD ["sleep", "infinity"]\n`;

export const assertFrom = (df) => {
  const firstInstruction = String(df || "").split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("#"));
  if (!/^FROM\s+\S+/i.test(firstInstruction || "")) throw new Error("Dockerfile sin FROM");
  return df;
};

export const prepExec = (exec) => exec === true || exec === "apt" ? APT : (typeof exec === "string" && exec.trim() ? exec.trim() : "");
```

### `scripts/test/recipe.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { APT, assertFrom, prepExec, recipe } from "../modules/recipe.js";

describe("prepExec", () => {
  test("apt alias", () => expect(prepExec("apt")).toBe(APT));
  test("true alias", () => expect(prepExec(true)).toBe(APT));
  test("custom", () => expect(prepExec("echo hi")).toBe("echo hi"));
  test("empty", () => expect(prepExec("")).toBe(""));
  test("missing", () => expect(prepExec(undefined)).toBe(""));
});

describe("recipe", () => {
  test("default from slim", () => {
    const df = recipe();
    expect(df.startsWith("FROM debian:bookworm-slim")).toBe(true);
    expect(df).toContain("CMD [\"sleep\", \"infinity\"]");
  });
});

describe("assertFrom", () => {
  test("FROM first", () => expect(assertFrom("FROM debian\n")).toBe("FROM debian\n"));
  test("comment then FROM", () => expect(assertFrom("# comment\nFROM debian\n")).toBe("# comment\nFROM debian\n"));
  test("RUN then FROM rejects", () => expect(() => assertFrom("RUN echo\nFROM debian\n")).toThrow("FROM"));
  test("commented FROM rejects", () => expect(() => assertFrom("# FROM debian\n")).toThrow("FROM"));
  test("empty rejects", () => expect(() => assertFrom("")).toThrow("FROM"));
});
```

## Score

```
slot	model	status	check	tested	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	14	12	2
02	openai/gpt-5.4-mini	PASS	True	True	12	10	2
03	openai/gpt-5.4-fast	PASS	True	True	13	10	3
04	openai/gpt-5.4	PASS	True	True	16	13	3
05	openai/gpt-5.5-fast	PASS	True	True	13	10	3
06	openai/gpt-5.5	PASS	True	True	13	10	3
07	openai/gpt-5.6-luna-fast	PASS	True	True	10	7	3
08	openai/gpt-5.6-luna	PASS	True	True	10	7	3
09	openai/gpt-5.6-sol-fast	PASS	True	True	10	7	3
10	openai/gpt-5.6-sol	PASS	True	True	10	7	3
11	openai/gpt-5.6-terra-fast	PASS	True	True	10	7	3
12	openai/gpt-5.6-terra	PASS	True	True	10	7	3
13	openai/gpt-5.3-codex-spark	PASS	True	True	19	15	4
14	opencode/big-pickle	PASS	True	True	19	16	3
15	opencode/hy3-free	PASS	True	True	11	10	1
16	opencode/mimo-v2.5-free	NO_RESULT	False	False	0	0	0
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	16	15	1
18	opencode/nemotron-3-ultra-free	PASS	True	True	19	16	3
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: assertFrom must require that the first real Dockerfile instruction is FROM. Blank lines and #-comments may precede it. RUN/COPY/etc before FROM is invalid. A FROM that only appears inside a comment is invalid.

Implement:
1. In scripts/modules/recipe.js, tighten assertFrom as above. Keep returning the original df on success.
2. bun tests in scripts/test/recipe.test.js: FROM first ok; comment then FROM ok; RUN then FROM throws; a file that is only `# FROM` throws; empty throws.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
