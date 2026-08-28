NN: 12
CHECK: ready) get ready
FILES: scripts/magma.sh, scripts/test/magma-sh.test.js

---prompt---
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
