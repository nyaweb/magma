# Magma

Magma is a Docker control plane built with Bun and the terminal model from
BunTTY. It manages local and SSH-connected Docker hosts, containers, images,
Compose projects, reusable templates, parallel experiments, and persistent
collaborative terminal sessions.

## Security warning

The MVP has no web authentication and listens on `0.0.0.0:4000` by default.
Anyone who can reach the port has root-equivalent control through Docker. Use
a firewall, private network, VPN, or authenticated reverse proxy. A reverse
proxy is not a boundary while port 4000 remains publicly reachable; bind Magma
to loopback and publish only the proxy:

Magma rejects cross-origin browser requests. Behind TLS termination, set the
external origins explicitly, for example:

```bash
MAGMA_BIND_ADDRESS=127.0.0.1 \
MAGMA_ALLOWED_ORIGINS=https://magma.example.com \
docker compose up -d
```

## Requirements

- Docker Engine 29 or a compatible recent release.
- Docker Compose v2 or v5.
- A rootful socket at `/var/run/docker.sock`, or `DOCKER_SOCKET` pointing to a
  rootless socket that the container can access.
- Port 4000 available, configurable with `MAGMA_PUBLIC_PORT`.

## Start

```bash
MAGMA_REVISION=$(git rev-parse --verify HEAD 2>/dev/null || printf unknown) \
  docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:4000/api/ready
```

Open `http://HOST:4000`.

The Compose project, image, and data volume have stable names, so moving the
checkout does not create a new deployment. Override the volume only when
intentional with `MAGMA_VOLUME_NAME`.

Common settings can be placed in an untracked `.env` file:

```dotenv
MAGMA_BIND_ADDRESS=0.0.0.0
MAGMA_PUBLIC_PORT=4000
MAGMA_VOLUME_NAME=magma-data
MAGMA_ALLOWED_ORIGINS=
DOCKER_SOCKET=/var/run/docker.sock
```

## Multi-host SSH

Magma keeps a dedicated key under the `magma-data` volume. Install its public
key in the remote account's `authorized_keys`; passwords are never stored.
The remote account needs Docker permission without an interactive prompt.
Enrollment shows the scanned SHA256 host-key fingerprints and requires
explicit confirmation. Verify them through a separate trusted channel.

## Compose Projects

Compose is executed from inside Magma. Projects targeting local or SSH Docker
hosts should use existing images and named volumes. Host bind mounts, local
build contexts, `env_file`, and file-backed configs or secrets are not portable
because `/data/projects` does not exist at the same path on target hosts.

Deleting a project runs `docker compose down` before removing its metadata.
Magma prefixes every immutable project namespace with a random project ID and
checks that it is unused on the target host before saving the project.

## Terminals And Experiments

Each host/container pair uses a shared persistent terminal session. Connected
browsers can watch retained history and explicitly take input control. Idle
sessions expire after one hour by default.

Experiments support up to 500 cases and 32 concurrent workers. Ephemeral
containers are removed after each run and recovered after a Magma restart;
persistent runs remain available for inspection.

## Data Backup

The volume contains SQLite state, Compose revisions, and Magma's SSH private
key. It does not include workload volumes or data held on remote Docker hosts.
The command below uses the Compose service so custom volume names from `.env`
are resolved correctly. It writes outside the checkout by default and restarts
Magma even if archiving fails:

```bash
set -eu
backup_dir=${BACKUP_DIR:-"$HOME/magma-backups"}
mkdir -p "$backup_dir"
trap 'docker compose start magma >/dev/null 2>&1 || true' EXIT
docker compose stop magma
docker compose run --rm --no-deps -v "$backup_dir:/backup" \
  --entrypoint /bin/tar magma -C /data -czf "/backup/magma-data-$(date +%Y%m%d-%H%M%S).tgz" .
docker compose start magma
trap - EXIT
```

Protect backups as credentials because they include the SSH private key.

To restore, choose an archive explicitly. This replaces all control-plane data:

```bash
set -eu
archive=$(realpath /path/to/magma-data.tgz)
trap 'docker compose up -d >/dev/null 2>&1 || true' EXIT
docker compose stop magma
docker compose run --rm --no-deps -v "$archive:/backup/magma-data.tgz:ro" \
  --entrypoint /bin/bash magma -lc \
  'tar -tzf /backup/magma-data.tgz >/dev/null; shopt -s dotglob nullglob; rm -rf -- /data/*; tar -C /data -xzf /backup/magma-data.tgz'
docker compose up -d --wait
curl --fail http://127.0.0.1:4000/api/ready
trap - EXIT
```

## Tests

```bash
docker compose build magma
docker compose run --rm --no-deps -e MAGMA_DATA_DIR=/tmp/magma-test magma bun test
docker compose run --rm --no-deps -e MAGMA_DATA_DIR=/tmp/magma-check magma bun run check
```
