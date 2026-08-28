NN: 13
CHECK: images?.some
FILES: scripts/modules/protect.js, scripts/test/protect.test.js, scripts/modules/docker.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: removeImage("magma:1.4.0") is already blocked. removeImage("sha256:<id of that image>") is NOT, because isProtectedImageRef only looks at splitRef(repository) === "magma".

Implement:
1. isProtectedImageRef(ref, images) still true when splitRef(ref).repository === "magma". If images is a non-empty array, also true when some image has protected and (ref === image.ref or ref === image.id or image.id starts with ref). magma/slim stays false.
2. docker.js removeImage: if isProtectedImageRef(ref) throw before rmi. Else listImages() and if isProtectedImageRef(ref, images) throw before rmi.
3. bun tests in protect.test.js: digest prefix against [{id:"sha256:abcd9999", ref:"magma:1.4.0", protected:true}] is true; same list with debian id is false; "magma/slim:1" still false. Do not call real docker rmi of magma:1.4.0.
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
