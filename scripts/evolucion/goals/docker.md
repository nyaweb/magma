NN: 09
CHECK: isProtectedImageRef
FILES: scripts/modules/protect.js, scripts/modules/docker.js, scripts/test/protect.test.js, scripts/test/docker.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: deleting the control-plane image must fail. imageFromList already sets protected when repository is exactly "magma". removeImage does not honor that.

Implement:
1. In scripts/modules/protect.js export isProtectedImageRef(ref): true iff splitRef(ref).repository === "magma" (magma/slim is false; "magma:1.4.0" is true).
2. In scripts/modules/docker.js, removeImage must throw `${ref} está protegido` when isProtectedImageRef(ref), BEFORE calling docker rmi. magma/slim must still rmi (do not throw in the helper).
3. bun tests: scripts/test/protect.test.js for the helper; scripts/test/docker.test.js calls removeImage("magma:1.4.0") and expects reject /protegido/ without needing a real rmi (throw before docker). Do not import server.js.
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
