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
./scripts/evolucion/harness/launch.sh <component>   # copies + opencode
./scripts/evolucion/harness/score.sh <component>    # bun test + smallest diff
./scripts/evolucion/harness/apply.sh <component>    # copy winner, bun test, commit
./scripts/evolucion/harness/loop.sh                 # names…actions in series
```

`SLOTS` (default 19), `CONCURRENCY` (default 5), `TIMEOUT` (default 420). Farm `/tmp/magma-evo/<component>/`.

Winner: CHECK + `bun test` + **beats current** (`harness/beats.py`), then smallest plus+minus on FILES. Tie: first in `done.log`.

Beats current: winner tests fail on `main` modules (new behavior), or `main` already passes and winner production files are strictly smaller. If current already fulfills the contract, do not replace.

Farm `/var/tmp/magma-evo/<component>/`. Do not rm/stop container `magma`. Cap N at 50. Reports land in `scripts/evolucion/<nn>-<component>.md`.
