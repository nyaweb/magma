NN: 01
CHECK: Lab-1
FILES: scripts/modules/names.js, scripts/test/names.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: nextFreeNames must ignore case when checking taken names, because slug() already lowercases the prefix. Docker/UI taken lists may keep original case.

Implement:
1. In scripts/modules/names.js, nextFreeNames treats taken as a case-insensitive set. Generated names stay lowercase via slug.
2. Add bun tests in scripts/test/names.test.js: taken ["Lab-1"] with prefix "lab" and n=1 yields ["lab-2"]; mixed-case prefix still slugs.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
