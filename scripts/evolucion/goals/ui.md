NN: 11
CHECK: image: (n)
FILES: scripts/public/js/acts.js, scripts/public/js/app.js, scripts/test/acts.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: the orb menu still offers rm on protected images. Containers already hide mutating acts when item.protected. Images must do the same.

Implement:
1. Extract ACTS from scripts/public/js/app.js into scripts/public/js/acts.js (no DOM). app.js imports { ACTS } from "./acts.js". Keep container/stack behavior.
2. ACTS.image(node) omits "rm" when node.item.protected is true; otherwise keep run, spawn, inspect, rm.
3. bun tests in scripts/test/acts.test.js import from "../public/js/acts.js". Do not import app.js (it uses document). Cases: protected image has no rm; plain image has rm; protected container stays inspect-only.
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
