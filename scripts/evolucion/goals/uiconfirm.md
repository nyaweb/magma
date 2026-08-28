NN: 17
CHECK: confirmRm
FILES: scripts/public/js/acts.js, scripts/public/js/app.js, scripts/test/acts.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: RADIAL.rm deletes with one click. Need a confirm gate that is testable without DOM.

Implement:
1. In scripts/public/js/acts.js export confirmRm(ask = globalThis.confirm) that returns !!ask?.("¿borrar este orbe?").
2. app.js RADIAL.rm: if (!confirmRm()) return "cancelado"; then the existing post.
3. bun tests in acts.test.js: confirmRm(() => true) is true; confirmRm(() => false) is false. Keep existing ACTS tests. Do not import app.js.
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
