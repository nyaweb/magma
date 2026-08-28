# Entonces vs ahora

Entonces: commit `a1c4165` (primer tablero 3100), levantado en `:3200` con `MAGMA_CONTAINER_NAME=magma-then`.  
Ahora: `HEAD` en `:3100` ( Magma vivo ).

Misma batería HTTP contra los dos. No se tocó `magma` / `crisol-*` / `dev`. El proceso `:3200` ya se apagó.

## Tamaño

| | entonces | ahora |
|---|---:|---:|
| módulos JS (sin test, sin evolucion) | 7 archivos, ~657 líneas | 16 archivos, ~807 líneas |
| tests | 3 scripts live (`api.js`, `debian.js`, `mock-docker.py`) | **101 pass** en 13 `*.test.js` |
| `bun test` | no existía | `bun test ./test` |

## Batería live

| caso | entonces `:3200` | ahora `:3100` |
|---|---|---|
| GET `/api/health` | 200 ok | 200 ok |
| GET `/api/ready` | 200 ok | 200 ok |
| snapshot arrays | ok | ok |
| GET `/api/nope` | 404 Not Found | 404 Not Found |
| PUT `/api/health` | **404** | **405 Method Not Allowed** |
| GET `/api/inspect` sin ref | 400 ref required | 400 ref required |
| POST stop body `not-json` | **400 No such container: undefined** (parsea a `{}` y llama docker) | **400 invalid json** (no toca docker) |
| GET `/foo` | **200 HTML (SPA en cualquier ruta)** | **404 + CSP** |
| GET `/public/../modules/api.js` | **200, filtra el fuente** | **404 + CSP** |
| GET `/` | 200 HTML | 200 HTML |
| 404 headers | 200 sin CSP (la “404” era SPA) | 404 CSP + `nosniff` |
| POST `/api/stacks/template` | yaml ok | yaml ok |
| `rmi magma:1.4.0` | no se envió (el then **sí habría llamado** `docker rmi`) | **400 está protegido** |
| run + commit + rm + lineage | linaje **sigue ahí** (1 fila) | linaje **podado** (0 filas) |

## Qué cambió de verdad

1. **Fuga de fuente.** Entonces `Bun.file("." + path)` servía `scripts/modules/api.js` por `/public/../…`. Ahora `resolvePublic` + HTML solo en `/`.
2. **JSON basura.** Entonces un POST roto acababa en `docker stop undefined`. Ahora 400 `invalid json`.
3. **Linaje huérfano.** Entonces `rm` dejaba la fila. Ahora `pruneLineage` en `rm` / `rmi` / `removeStack`.
4. **Imagen de control.** Entonces `removeImage` no miraba `magma:…`. Ahora tira *antes* de docker.
5. **404 con CSP.** Entonces no había `withSec` en 404 (ni 404 real en GET sueltos).
6. **UI.** Imagen `protected` ya no muestra `rm`. `magma.sh ready` existe.

La API de orbes (health, snapshot, stamp/evolve/bake, compose) es la misma de fondo. Lo que se endureció es el borde: paths, JSON, linaje, protect, headers, tests.
