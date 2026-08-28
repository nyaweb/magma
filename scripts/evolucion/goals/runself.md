NN: 14
CHECK: isProtectedName(name
FILES: scripts/modules/docker.js, scripts/test/docker.test.js

---prompt---
You are competing on ONE Magma code change. Do not do other work.

Goal: runContainer({ image, name: "magma" }) must not call docker. The control-plane name is SELF (default "magma") and isProtectedName already treats it as protected.

Implement:
1. In runContainer, if name is set and isProtectedName(name, {}, SELF) throw `${name} está protegido` BEFORE need/docker.
2. bun tests in docker.test.js: runContainer({ image: "debian:bookworm-slim", name: "magma" }) rejects /protegido/. Existing removeImage test stays.
3. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
