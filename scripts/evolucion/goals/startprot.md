NN: 15
CHECK: startContainer = async
FILES: scripts/modules/docker.js, scripts/test/docker.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: stopContainer uses assertMutable; startContainer does not. Starting a protected ref (SELF / magma) must throw before docker start.

Implement:
1. startContainer becomes async, requireRef, await assertMutable(ref), then verb(["start"], ref).
2. bun tests: startContainer("magma") rejects /protegido/ (isProtected short-circuits on name, no docker start). Keep other docker tests.
3. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
