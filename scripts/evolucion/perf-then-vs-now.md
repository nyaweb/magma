# Rendimiento entonces vs ahora

Misma máquina, 8 cores. Tres procesos calientes:

- **then**: `a1c4165` con Bun en host `:3200`
- **now-host**: `HEAD` con Bun en host `:3300` (misma runtime que then)
- **now-docker**: Magma vivo `:3100` (producción)

Health 800 req; template 400; snapshot 80 (cuello `docker ps`); JSON inválido 200; health concurrente 800×32.

p50/p95 en **ms**. RPS más alto = mejor. Columna **host vs then**: `>1` = ahora más rápido.

| ruta | métrica | then | now-host | now-docker | host vs then |
|---|---|---:|---:|---:|---:|
| health | p50 | 0.044 | 0.057 | 0.283 | 0.77× |
| health | p95 | 0.069 | 0.078 | 0.683 | 0.88× |
| health | rps | 19466 | 16293 | 2758 | 0.84× |
| health ×32 | p50 | 0.793 | 0.558 | 0.922 | **1.42×** |
| health ×32 | rps | 33985 | 21429 | 16496 | 0.63× |
| template | p50 | 0.063 | 0.073 | 0.094 | 0.86× |
| template | rps | 14277 | 12247 | 10280 | 0.86× |
| snapshot | p50 | 116.5 | 115.7 | 112.8 | **1.00×** |
| snapshot | rps | 8.57 | 8.61 | 8.72 | **1.00×** |
| POST JSON basura | p50 | 28.1 | 0.073 | 0.102 | **385×** |
| POST JSON basura | rps | 35 | 12977 | 9294 | **372×** |

Arranque hasta primer `/api/health`: then **91 ms**, now-host **68 ms** (~1.3×).  
RSS Bun: then 56 MB, now-host 59 MB. Docker `magma`: 24 MB.  
`bun test ./test`: **101 pass en 90 ms** (entonces no había suite).

## Lectura

No somos más rápidos en el camino feliz. Health/template ~**15–25 % más lentos** (más módulos + `withSec`). Sigue siendo decenas de miles de RPS en host; el proxy Docker baja health a ~2.8k RPS.

Snapshot **igual**: ~116 ms, 8.6 RPS. El límite es `docker ps`, no Magma.

Donde sí somos mejores: el POST con JSON roto **ya no llama a Docker**. Entonces ~28 ms y 35 RPS (y un `stop undefined` al daemon). Ahora ~0.07 ms y ~13k RPS. **~370×** en ese camino.

Producción `:3100` añade ~0.2 ms de proxy. Irrelevante frente a snapshot.
