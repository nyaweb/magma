# MAGMA

Tablero de orbes para Docker: cada círculo es un contenedor, una imagen o un compose.
Commit, duplicar, stamp y bake sin repetir `apt` a mano.

Nace del esquema mínimo de BunTTY. El control plane TypeScript y el Magma 0.1.0
de hosts SSH no son esta app: aquí manda la UI de `:3100`.

## Seguridad

Quien alcanza el puerto tiene el socket de Docker. No lo publiques a Internet.
Usa firewall, Tailscale o bind a loopback.

Magma no se deja parar, borrar ni commitear a sí mismo (`io.magma.protected`).
`stamp` / `bake` / `run-many` cortan en `MAGMA_MAX_N` (32 por defecto).

```bash
MAGMA_BIND_ADDRESS=127.0.0.1 MAGMA_PUBLIC_PORT=3100 docker compose up -d --build
```

## Arranque

```bash
docker compose up -d --build --wait
curl --fail http://127.0.0.1:3100/api/ready
```

Abre `http://HOST:3100`.

```dotenv
MAGMA_BIND_ADDRESS=0.0.0.0
MAGMA_PUBLIC_PORT=3100
MAGMA_VOLUME_NAME=magma-data
MAGMA_MAX_N=32
DOCKER_SOCKET=/var/run/docker.sock
```

## Qué hace

- Lista contenedores, imágenes y stacks compose.
- `docker commit` a `repo:tag` o `magma/snapshot:N`.
- Duplicar = commit + run. Evolve = commit + stack + run.
- `stamp`: exec opcional + 1 commit + N run.
- `bake`: Dockerfile + N run.
- Linaje en el volumen `magma-data`.
- API HTTP + `scripts/magma.sh`.

## API

Base: `http://localhost:3100/api`

| Método | Ruta | Qué |
| --- | --- | --- |
| GET | `/health` `/ready` | ping y Docker |
| GET | `/snapshot` | containers + images + stacks |
| GET | `/containers` `/images` `/stacks` | listados |
| GET | `/inspect?ref=` | `docker inspect` |
| GET | `/next-tag` `/lineage` | tags y historial |
| POST | `/commit` `/duplicate` `/evolve` `/stamp` `/bake` | snapshots |
| POST | `/containers/run` `start` `stop` `rm` | ciclo de vida |
| POST | `/stacks` `up` `down` `rm` | compose |

WebSocket `/ws` emite `docker events`.

## UI

- Orbe rojo = contenedor. Ámbar = imagen. Azul = stack. Gris = protegido.
- Click = menú. Doble click = inspect.

## Tests

Desde `scripts/`:

```bash
bun test test
```

Los flujos contra Docker vivo están en `scripts/test/api.js` y `scripts/test/debian.js`; no corren con `bun test`.

MIT.
