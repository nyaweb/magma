NN: 02
CHECK: === "magma"
FILES: scripts/modules/protect.js, scripts/test/protect.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: label parsing must trim keys/values, and the control-plane image repository "magma" must be marked protected.

Implement:
1. In scripts/modules/protect.js, parseLabels trims each key and value. asLabels keeps using parseLabels for strings.
2. imageFromList sets protected: true when repository is exactly "magma" (not "magma/slim" or other magma/* snapshots).
3. bun tests in scripts/test/protect.test.js: spaced label string still protects; image repo magma protected; magma/slim not protected; dangling not protected.
4. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
