---
name: magma-evolve
description: >
  Run Magma component evolution contests (OpenCode copies, smallest passing
  diff wins). Use when the user says evolve Magma, magma contest, ronda de
  modelos, /magma-evolve, or scripts/evolucion.
---

# Magma evolve

Harness: `scripts/evolucion/harness/`. Goals: `scripts/evolucion/goals/<component>.md`.

```bash
./scripts/evolucion/harness/launch.sh <component>
./scripts/evolucion/harness/score.sh <component>
./scripts/evolucion/harness/apply.sh <component>
./scripts/evolucion/harness/loop.sh
```

`SLOTS` default 19, `CONCURRENCY` 5, `TIMEOUT` 420. Farm `/tmp/magma-evo/<component>/`.

Winner: CHECK present + `bun test` green, smallest plus+minus on FILES. Tie: first in `done.log`. Do not rm/stop `magma`. Cap N 32.
