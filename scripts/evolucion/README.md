# Evolución Magma

Un contrato por componente. N copias del repo. Un modelo OpenCode por slot. Gana el diff más chico que pasa `bun test` y el CHECK. Empate: primero en `done.log`.

Ronda 00 (tags/prune) ya shippeada: `dd9ad26`. Informe en `00-tags-prune.md`, tests en `00-tags-prune-tests.md`.

## Correr

```bash
# un componente (19 modelos, 1 cada uno)
./scripts/evolucion/harness/launch.sh names
./scripts/evolucion/harness/score.sh names
./scripts/evolucion/harness/apply.sh names

# todos los pendientes, en serie
./scripts/evolucion/harness/loop.sh
```

Overrides: `SLOTS=50 CONCURRENCY=5 TIMEOUT=420`.

Farm: `/tmp/magma-evo/<componente>/`. Informes: `scripts/evolucion/<nn>-<componente>.md`.

## Componentes

| id | módulo | contrato | estado |
|----|--------|----------|--------|
| 00 | tags | `pruneLineage` + wire rm/rmi | hecho |
| 01 | names | `nextFreeNames` trata `taken` en minúsculas | pendiente |
| 02 | protect | trim labels; imagen `magma` protected | pendiente |
| 03 | recipe | `assertFrom`: primer instruction es FROM | pendiente |
| 04 | paths | `resolvePublic` rechaza NUL | pendiente |
| 05 | util | `writeJson` crea el directorio padre | pendiente |
| 06 | compose | `removeStack` poda lineage del nombre | pendiente |
| 07 | api | JSON inválido en POST → 400 | pendiente |
| 08 | actions | `pickCloneName` extraído y testeado | pendiente |

`config.js` (3 líneas) no entra. `docker.js` ya evolucionó con tags. `server.js` / UI / `magma.sh` después de esta tanda.

## Reglas

Mismo prompt para todos los slots de un componente. Diff mínimo. Sin deps nuevas. Sin refactors ajenos. No tocar el contenedor `magma` ni crisol/dev.
