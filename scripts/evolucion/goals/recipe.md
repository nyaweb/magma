NN: 03
CHECK: # FROM
FILES: scripts/modules/recipe.js, scripts/test/recipe.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: assertFrom must require that the first real Dockerfile instruction is FROM. Blank lines and #-comments may precede it. RUN/COPY/etc before FROM is invalid. A FROM that only appears inside a comment is invalid.

Implement:
1. In scripts/modules/recipe.js, tighten assertFrom as above. Keep returning the original df on success.
2. bun tests in scripts/test/recipe.test.js: FROM first ok; comment then FROM ok; RUN then FROM throws; a file that is only `# FROM` throws; empty throws.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
