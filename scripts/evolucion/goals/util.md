NN: 05
CHECK: mkdirSync
FILES: scripts/modules/util.js, scripts/test/util.test.js

---prompt---
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
