NN: 16
CHECK: persistPrune
FILES: scripts/modules/docker.js, scripts/test/docker.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: commitContainer writes lineage inside locked(). removeContainer/removeImage prune lineage outside locked(), so a concurrent commit can be overwritten.

Implement:
1. Export persistPrune(ref) = locked(() => writeJson(LINEAGE, pruneLineage(await loadLineage(), ref))).
2. removeContainer and removeImage call persistPrune(ref) after successful verb, instead of a raw writeJson.
3. bun tests with MAGMA_DATA from env.js: seed lineage.json two rows, persistPrune the first container, expect one row left. Do not require a live docker rm.
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
