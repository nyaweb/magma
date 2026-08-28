NN: 07
CHECK: invalid json
FILES: scripts/modules/api.js, scripts/test/api.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: POST with a body that is not valid JSON must return 400 { error: "invalid json" } instead of treating the body as {}.

Implement:
1. In scripts/modules/api.js, POST json parse failure is 400 invalid json. Empty body may stay {}. GET unchanged.
2. bun tests in scripts/test/api.test.js: POST /api/containers/stop with body "not-json" and Content-Type application/json → 400 and error matches /invalid json/i. Existing tests green.
3. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
