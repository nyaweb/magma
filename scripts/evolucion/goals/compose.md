NN: 06
CHECK: pruneLineage
FILES: scripts/modules/compose.js, scripts/test/compose.test.js

---prompt---
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
