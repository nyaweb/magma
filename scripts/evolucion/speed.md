# Velocidad Magma

Ledger de dónde se gana tiempo. El cuello no es JS: es **Docker CLI** (`ps`/`images`/`inspect` ~100 ms). Health es 0.05–0.3 ms.

## Aplicado

| fecha | cambio | efecto |
|---|---|---|
| 2026-08-28 | JSON inválido no llama docker | POST basura ~370× (28 ms → 0.07 ms) |
| 2026-08-28 | `removeImage` solo hace `docker images` si el ref **parece id** (`sha256:` o hex 12–64) | `rmi debian:tag` no paga un `images` extra (~100 ms). `magma:1.4.0` sigue cortando en el primer `isProtectedImageRef` |
| 2026-08-28 | cache de `snapshot` 200 ms + invalidate en `docker events` | GET `/api/snapshot` repetido en <200 ms evita 3 CLI. Eventos siguen frescos |

## No tocar (no gana)

| idea | por qué |
|---|---|
| más orbes / 50 RPS workers | snapshot = `docker ps`, 8.6 RPS fijos (bench then=now) |
| quitar `withSec` | ~0.01 ms; no es el cuello |
| `runMany` en paralelo | nombres serializados a propósito (`locked` + `nextFreeNames`) |
| cache de snapshot >200 ms | UI se queda ciega a `docker events` |

## Siguiente (si un profiler lo pide)

1. `docker ps`/`images` vía API HTTP del daemon en vez de spawn CLI (un round-trip, no 3 procesos).
2. `inspect` de labels en `isProtected` solo cuando el nombre no es `SELF` (ya hay short-circuit de nombre).
3. No `assertMutable`+`inspect` en `start` si el snapshot en cache ya marca `protected` (más estado, dejar).

Medir: `curl -w '%{time_total}' /api/snapshot` dos veces seguidas. La segunda debe ser << 100 ms si cae en el TTL.
