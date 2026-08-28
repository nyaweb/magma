#!/bin/bash
set -euo pipefail
mkdir -p "${MAGMA_DATA:-/data}" "${MAGMA_STACKS:-/data/stacks}"
exec bun run /app/server.js
