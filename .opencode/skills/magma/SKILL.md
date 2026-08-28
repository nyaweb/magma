---
name: magma
description: >
  Talk to the Magma Docker orb board over HTTP. Use when the user mentions Magma,
  orbes, docker commit, stamp, bake, evolve, MAGMA_API, or port 3100.
---

# Magma

Control plane at `http://127.0.0.1:3100` (override with `MAGMA_API`, default suffix `/api`).

```bash
curl -sS ${MAGMA_API:-http://127.0.0.1:3100/api}/health
curl -sS ${MAGMA_API:-http://127.0.0.1:3100/api}/ready
curl -sS ${MAGMA_API:-http://127.0.0.1:3100/api}/snapshot
# or
./scripts/magma.sh ping
./scripts/magma.sh containers
```

Mutating POST JSON to `/api/commit`, `/stamp`, `/bake`, `/evolve`, `/containers/run`.

Do not stop, rm, commit, stamp, or exec container `magma` (protected). Cap N at 50; prefer 1–3. Clean up `t-*` when done. No auth: treat the API as root.
