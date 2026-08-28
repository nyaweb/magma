NN: 10
CHECK: export const withSec
FILES: scripts/modules/security.js, scripts/server.js, scripts/test/security.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: 404 responses currently omit the CSP/security headers. API and /public/ files use withSec; the two `new Response("Not Found", { status: 404 })` paths do not.

Implement:
1. Move `security` and `withSec` from scripts/server.js into scripts/modules/security.js (export both). server.js imports them. Do not start a listener in the new module.
2. Both 404 responses in server.js must go through withSec.
3. bun tests in scripts/test/security.test.js: withSec on a 404 Response sets Content-Security-Policy and X-Content-Type-Options. Do NOT import scripts/server.js (it binds the port).
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
