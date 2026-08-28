NN: 04
CHECK: %00
FILES: scripts/modules/paths.js, scripts/test/paths.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: resolvePublic must return null if the decoded relative path contains a NUL byte.

Implement:
1. In scripts/modules/paths.js, after decode, if the relative path includes "\0" return null. Keep existing .. and prefix checks.
2. bun tests in scripts/test/paths.test.js: encoded NUL (%00) is null; existing ok/.. cases still pass.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
