#!/bin/bash

set -euo pipefail

DATA_DIR=${MAGMA_DATA_DIR:-/data}
mkdir -p "$DATA_DIR/db" "$DATA_DIR/projects" "$DATA_DIR/ssh" "$DATA_DIR/workspaces"
chmod 700 "$DATA_DIR/ssh"

exec bun run server.js
