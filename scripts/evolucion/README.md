# Evolución Magma

Un contrato por componente. N copias del repo. Un modelo OpenCode por slot.

Gana el diff más chico que: pasa `bun test`, pasa el CHECK, **y supera al código actual**. Empate: primero en `done.log`.

Superar al actual: los tests del slot fallan sobre los módulos de `main` (comportamiento nuevo), o `main` ya pasa esos tests y el slot es **estrictamente más chico** en los archivos de producción. Si `main` ya cumple el contrato y no es más grande, no se reemplaza.

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

Farm: `/var/tmp/magma-evo/<componente>/` (disco; `/tmp` es tmpfs y se llena). Informes: `scripts/evolucion/<nn>-<componente>.md`.

Paralelo (screen + orbes Magma):

```bash
./scripts/evolucion/harness/parallel.sh docker server ui magma
screen -ls
```

## Componentes

| id | módulo | contrato | estado |
|----|--------|----------|--------|
| 00 | tags | `pruneLineage` + wire rm/rmi | hecho `dd9ad26` slot 02 |
| 01 | names | `nextFreeNames` trata `taken` en minúsculas | hecho `f32a900` slot 01 |
| 02 | protect | trim labels; imagen `magma` protected | hecho `f32a900` slot 09 |
| 03 | recipe | `assertFrom`: primer instruction es FROM | hecho `f32a900` slot 07 |
| 04 | paths | `resolvePublic` rechaza NUL | hecho `f32a900` slot 02 |
| 05 | util | `writeJson` crea el directorio padre | hecho `5bd10a8` slot 09 |
| 06 | compose | `removeStack` poda lineage del nombre | hecho `282c0ca` slot 06 |
| 07 | api | JSON inválido en POST → 400 | hecho `5bd10a8` slot 14 |
| 08 | actions | `pickCloneName` extraído y testeado | hecho `5bd10a8` slot 02 |
| 09 | docker | `removeImage` respeta imagen `magma` protected | hecho `d206c69` slot 02 |
| 10 | server | 404 con headers CSP (`withSec`) | hecho `96e59dc` slot 01 |
| 11 | ui | menú imagen protected sin rm | hecho `0dada29` slot 02 |
| 12 | magma.sh | comando `ready` | hecho `335c14b` slot 01 |

`config.js` (3 líneas) no entra.

## Reglas

Mismo prompt para todos los slots de un componente. Diff mínimo. Sin deps nuevas. Sin refactors ajenos. No tocar el contenedor `magma` ni crisol/dev.

`apply.sh` llama `beats.py`: sin BEATS, no copia nada al repo.
