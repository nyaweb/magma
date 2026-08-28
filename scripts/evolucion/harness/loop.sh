#!/bin/bash
# run remaining component contests in series
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
log=/tmp/magma-evo/loop.log
mkdir -p /tmp/magma-evo
{
  echo "loop start $(date -Is)"
  for comp in names protect recipe paths util compose api actions; do
    echo "=== $comp $(date -Is) ==="
    "$here/launch.sh" "$comp"
    "$here/score.sh" "$comp"
    if ! "$here/apply.sh" "$comp"; then
      echo "apply $comp skipped"
      git -C "$root" add scripts/evolucion/*.md || true
      git -C "$root" commit -m "docs(evolucion): ${comp} score (no winner)" || true
    fi
    git -C "$root" push origin main || true
  done
  echo "rebuild magma $(date -Is)"
  (cd "$root" && docker compose build magma && docker compose up -d --no-deps magma) || true
  echo "loop end $(date -Is)"
} >>"$log" 2>&1
