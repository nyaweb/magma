# 50 “máquinas” contra Magma actual

Pregunta: ¿aún se puede mejorar HEAD con ~50 workers, mismos concursos (contrato + bun test + diff mínimo + **beats current**)?

Respuesta corta: **sí, quedan huecos reales**. **No** con 50 orbes Magma. **No** rehaciendo las rondas 00–12. Lo óptimo son **slots OpenCode en disco**, 1 pasada por modelo, **varios contratos nuevos en paralelo**.

## 50 Magma ≠ 50 concursos

| recurso | tope | por qué |
|---|---|---|
| orbes Magma `run-many` | **32** (`MAGMA_MAX_N`) | 50 orbes rechazados o recortados |
| imagen `magma:1.4.0` extra | bun, sin OpenCode ni OAuth | no puede correr el concurso |
| copias en `/tmp` | tmpfs 7.8 G | 50×~62 MB ≈ 3.1 G **y ya se llenó** |
| copias en `/var/tmp` | disco 170 G | aquí sí caben 50 |
| OpenCode a la vez | RAM ~0.6 G/proceso | 50 en paralelo ≈ 30 G; **conc 6–8** |
| modelos que responden | ~17/19 | `nemotron-3.5-lightning` 404 |

Los concursos 00–12 **no usaron VMs**. Usaron copias de repo + `opencode run`. Los orbes `evo-1..4` solo tenían bun para tests; no ganaron tiempo.

## Lo que 50 slots ya enseñaron (ronda 00)

50 slots = 19 modelos × 2.6 vueltas.

- Ganador: **primera vuelta**, slot 02.
- Vueltas 2–3: mismo De Morgan, diffs más gordos. No superaron a 02.
- 9 NO_RESULT (timeout, 404, “Failed to execute statement”).
- Empate 02/14/17: mismo tamaño, gana quien llega primero.

Rondas 01–12 con **19 slots** (1 por modelo) bastaron. El ganador casi siempre era mini / mini-fast / sol-fast / 5.5 / big-pickle en la **primera** copia.

Rehacer 00–12 con 50 slots hoy: `beats.py` → **STALE** en todas. `main` ya pasa esos tests.

## ¿Aún se puede mejorar HEAD?

Sí. Huecos que **fallan tests de un ganador** (pasan `beats.py`). Orden por daño real, no por estética.

### Vale un concurso (bun test, diff chico)

| id | contrato | por qué HEAD pierde |
|---|---|---|
| 13 | `isProtectedImageRef` + `removeImage` también por **digest/id** | `splitRef("sha256:…")` no es repo `magma`. `rmi` del id de `magma:1.4.0` **pasa el guard** y puede borrar el control plane |
| 14 | `runContainer` rechaza `name` protected / `SELF` | `docker run --name magma` no se corta en JS; si el nombre está libre, hijack |
| 15 | `startContainer` de protected | `start` no llama `assertMutable`; stop sí |
| 16 | `rm`/`rmi`/`commit` bajo el mismo `locked()` que el seq | `rm` escribe lineage fuera del gate; stamp concurrente puede pisar |
| 17 | UI `rm` pide confirm | `RADIAL.rm` borra ya; un click |
| 18 | 500 `upgrade failed` con `withSec` | `/ws` sin upgrade no lleva CSP |
| 19 | bake/stamp UI usan APT duplicado | string copiado en `app.js`; `recipe.APT` ya existe (DRY, beats solo si hay test de “una sola fuente”) |

### No vale 50 slots (YAGNI o no testeable en bun)

| idea | por qué no |
|---|---|
| auth / bind | producto cerrado, no un diff mínimo |
| cache de snapshot (~116 ms) | el límite es `docker ps`; JS no lo mueve (bench 1.00×) |
| 50 orbes para RPS | health ya es miles de RPS; snapshot no escala con más Magma |
| tests canvas/`world.js` | DOM; no el harness bun |
| `debian.js` live | pega al daemon; no mezclar con unitarios |
| `config.js` | 3 líneas |
| re-extraer helpers DRY | `beats.py` pide tests que `main` ya pasa → STALE o más grande |

Health ahora es ~15 % más lento que `a1c4165`. Más abstracciones no lo arreglan. El único win de perf medido fue **no llamar Docker en JSON basura** (~370×). Siguiente win de perf: no llamar Docker en refs basura (`stop` sin `ref` ya 400).

## Forma óptima de ~50 workers

Objetivo: **50 intentos útiles**, no 50 copias del mismo prompt.

```
50 ≈ 5 contratos nuevos × 10 modelos  (o 3 × 17)
```

No:

```
50 = 1 contrato × 19 modelos × 2.6 vueltas   ← ronda 00, desperdicio
50 orbes Magma                                 ← tope 32 y sin OpenCode
```

### Modelos (10, no 19)

Los que ya ganaron o empataron tamaño:  
`gpt-5.4-mini`, `gpt-5.4-mini-fast`, `big-pickle`, `muse-spark`, `gpt-5.6-sol-fast`, `gpt-5.6-luna-fast`, `gpt-5.5`, `gpt-5.5-fast`, `hy3-free`, `gpt-5.3-codex-spark`.

Fuera: `nemotron-3.5-lightning` (404). `mimo` a menudo 0-diff / NO_RESULT. Fast/full OpenAI de 5.4–5.6 en tanda 1 a veces “Failed to execute statement”; si se usan, **reintento** no tercera vuelta ciega.

### Paralelismo

| palanca | valor | motivo |
|---|---|---|
| contratos a la vez | **2–3** (screens) | 5×10 OpenCode a la vez = 50 procesos ≈ OOM |
| conc por contrato | **5–6** | ronda 00 usó ~6; 12 en 4 screens funcionó |
| slots por contrato | **10** (lista corta) o **17** (1 por modelo bueno) | segunda copia del mismo modelo casi nunca gana |
| timeout | 420 s | igual |
| farm | `/var/tmp/magma-evo` | nunca `/tmp` |
| orbes Magma | **0** durante el concurso | `run-many` solo para verificar el ganador en vivo, n≤3, prefix `t-` |
| apply | `beats.py` + `flock` + `bun test ./test` | STALE no pisa `main` |
| rsync | excluir `.git`, `evolucion`, `data` | copia ~62 MB → se puede bajar si se copia solo `scripts/` |

Costo tiempo: 3 contratos × 10 slots / conc 6 × ~5 min ≈ **25 min** de wall, no 50×5 min.

Costo disco: 3×10×62 MB ≈ **1.9 G** pico si se borra el farm al score.

### Harness: un cambio, no un framework

`parallel.sh` ya acepta la lista de componentes. Falta:

1. `models.txt` recortado (10).
2. `SLOTS=10` (o 17).
3. `CONCURRENCY=6`.
4. Score ya tiene `beats`. No re-inventar.
5. Tras apply: `docker compose up -d --no-deps magma` **una vez** al final, no por ronda.
6. `run-many n=50` **prohibido**.

## Veredicto

| pregunta | respuesta |
|---|---|
| ¿50 VMs Magma? | **No.** Tope 32, sin OpenCode. |
| ¿50 slots del mismo contrato 00–12? | **No.** STALE. |
| ¿Aún mejorar HEAD? | **Sí.** Sobre todo digest `rmi` y `run --name magma`. |
| ¿50 de qué? | **~5 contratos nuevos × ~10 modelos = 50 intentos.** Screens 2–3, conc 6, disco `/var/tmp`. |
| ¿Ganancia de RPS? | Casi nula en health/snapshot. No gastar 50 slots en “hacerlo más rápido”. |

Siguiente tanda concreta (si se lanza): **13 digest-protect**, **14 run-name-self**, **15 start-protected**, **16 lineage-locked**, **17 ui-confirm**. Eso son 50 slots a 10 modelos. Cada ganador tiene que **superar `main`** o no entra.
