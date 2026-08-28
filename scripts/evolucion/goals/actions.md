NN: 08
CHECK: pickCloneName
FILES: scripts/modules/actions.js, scripts/test/actions.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: extract the clone-name picker used by evolve so it can be tested without Docker.

Implement:
1. In scripts/modules/actions.js export pickCloneName(wanted, taken): if wanted is already in taken, return nextFreeNames(wanted, 1, taken)[0], else wanted. evolve uses it instead of inlining.
2. New scripts/test/actions.test.js: free name stays; collision uses nextFreeNames (wanted "lab" taken ["lab"] → "lab-1"); empty taken keeps wanted.
3. Keep existing tests green. Run: cd scripts && bun test test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn. Do not add a bun test runner file that hits live Docker.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
