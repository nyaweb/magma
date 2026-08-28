# Ronda 12 — magma

CHECK: `ready) get ready`
FILES: `scripts/magma.sh, scripts/test/magma-sh.test.js`

Ganador: **slot 01**.

```
STATUS: PASS
FILES: scripts/magma.sh, scripts/test/magma-sh.test.js
SUMMARY: Added the `ready` command to `scripts/magma.sh` and included it in the help string, then added `scripts/test/magma-sh.test.js` to verify the script text contains both the new help entry and the `ready) get ready ;;` case arm without calling a live server. `bun test ./test` in `scripts` passed with 94 tests passing and 0 failing.
```

### `scripts/magma.sh` (ganador)

```js
#!/bin/bash
API="${MAGMA_API:-http://localhost:3100/api}"
get() { curl -sS "$API/$1"; }
post() { curl -sS -X POST "$API/$1" -H 'Content-Type: application/json' -d "$2"; }
ref() { post "$1" "{\"ref\":\"$2\"}"; }

case "${1:-}" in
  ""|-h|--help)
    printf '%s\n' "magma.sh ping|ready|containers|images|stacks|inspect <ref>|start|stop|rm <ref>|rmi <img>|run <img> [name]|run-many <img> <n> [prefix]|commit <c> <repo:tag> [msg]|batch <c> <n> [msg]|stamp <c> <n> [apt|cmd] [prefix]|bake [from] [tag] [n]|evolve <c> [name] [msg]|lineage [ref]|compose-write <name> [file|-]|compose-up|compose-down|compose-rm <name>" ;;
  ping) get health ;;
  ready) get ready ;;
  containers|images|stacks) get "$1" ;;
  inspect) get "inspect?ref=$2" ;;
  lineage) get "lineage${2:+?ref=$2}" ;;
  start|stop) ref "containers/$1" "$2" ;;
  rm) ref containers/rm "$2" ;;
  rmi) ref images/rm "$2" ;;
  run) post containers/run "{\"image\":\"$2\",\"name\":\"${3:-}\"}" ;;
  commit) post commit "{\"container\":\"$2\",\"repository\":\"$3\",\"message\":\"${4:-commit magma}\"}" ;;
  batch) post commit-batch "{\"container\":\"$2\",\"n\":${3:-1},\"message\":\"${4:-snapshot}\"}" ;;
  evolve) post evolve "{\"container\":\"$2\",\"name\":\"${3:-}\",\"message\":\"${4:-evolve}\"}" ;;
  run-many) post run-many "{\"image\":\"$2\",\"n\":${3:-1},\"prefix\":\"${4:-lab}\"}" ;;
  stamp) post stamp "{\"container\":\"$2\",\"n\":${3:-1},\"exec\":\"${4:-}\",\"prefix\":\"${5:-$2}\"}" ;;
  bake) post bake "{\"from\":\"${2:-debian:bookworm-slim}\",\"tag\":\"${3:-magma/slim:upgraded}\",\"n\":${4:-0}}" ;;
  compose-write)
    yaml=$( [ "${3:--}" = "-" ] && cat || cat "$3" )
    post stacks "$(printf '%s' "$yaml" | bun -e 'const yaml=await Bun.stdin.text(); console.log(JSON.stringify({name:Bun.argv[2],yaml}))' -- "$2")" ;;
  compose-up|compose-down|compose-rm) post "stacks/${1#compose-}" "{\"name\":\"$2\"}" ;;
  *) echo "comando desconocido: $1"; exit 1 ;;
esac
echo
```

### `scripts/test/magma-sh.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("magma.sh", () => {
  test("help mentions ready", () => {
    const text = readFileSync(join(import.meta.dir, "..", "magma.sh"), "utf8");
    expect(text).toContain("magma.sh ping|ready|containers|images|stacks|");
  });

  test("ready case calls get ready", () => {
    const text = readFileSync(join(import.meta.dir, "..", "magma.sh"), "utf8");
    expect(text).toContain("ready) get ready ;;\n");
  });
});
```

## Score

```
slot	model	status	check	tested	beats	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	True	3	2	1
02	openai/gpt-5.4-mini	PASS	True	True	True	3	2	1
03	openai/gpt-5.4-fast	PASS	True	True	True	3	2	1
04	openai/gpt-5.4	PASS	True	True	True	3	2	1
05	openai/gpt-5.5-fast	PASS	True	True	True	3	2	1
06	openai/gpt-5.5	PASS	True	True	True	3	2	1
07	openai/gpt-5.6-luna-fast	PASS	True	True	True	5	3	2
08	openai/gpt-5.6-luna	PASS	True	True	True	5	3	2
09	openai/gpt-5.6-sol-fast	PASS	True	True	True	3	2	1
10	openai/gpt-5.6-sol	PASS	True	True	True	3	2	1
11	openai/gpt-5.6-terra-fast	PASS	True	True	True	3	2	1
12	openai/gpt-5.6-terra	PASS	True	True	True	3	2	1
13	openai/gpt-5.3-codex-spark	PASS	True	True	True	3	2	1
14	opencode/big-pickle	PASS	True	True	True	3	2	1
15	opencode/hy3-free	PASS	True	True	True	3	2	1
16	opencode/mimo-v2.5-free	PASS	True	True	True	3	2	1
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	True	3	2	1
18	opencode/nemotron-3-ultra-free	PASS	True	True	True	3	2	1
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: magma.sh has ping (health) but no ready. The API already serves GET /api/ready.

Implement:
1. In scripts/magma.sh add `ready) get ready ;;` and list `ready` in the help string.
2. bun tests in scripts/test/magma-sh.test.js: read magma.sh text, expect help mentions ready, and the case arm `ready) get ready` exists. Do not hit a live server.
3. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
