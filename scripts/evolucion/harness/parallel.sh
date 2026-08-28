#!/bin/bash
# 4 components at once: GNU screen + Magma orbs
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
export FARM_ROOT=${FARM_ROOT:-/var/tmp/magma-evo}
export SLOTS=${SLOTS:-19}
export CONCURRENCY=${CONCURRENCY:-3}
export TIMEOUT=${TIMEOUT:-420}
export MAGMA_API=${MAGMA_API:-http://127.0.0.1:3100/api}
mkdir -p "$FARM_ROOT"
exec >"$FARM_ROOT/parallel.log" 2>&1

echo "parallel start $(date -Is) slots=$SLOTS conc=$CONCURRENCY"

# Magma orbs with bun (image magma:1.4.0) for later docker exec bun test if needed
curl -sS -X POST "$MAGMA_API/run-many" -H 'Content-Type: application/json' \
  -d '{"image":"magma:1.4.0","n":4,"prefix":"evo"}' | tee "$FARM_ROOT/magma-orbs.json" || true

if (( $# )); then comps=("$@"); else comps=(docker server ui magma); fi
for comp in "${comps[@]}"; do
  screen -S "evo-$comp" -X quit >/dev/null 2>&1 || true
  screen -dmS "evo-$comp" bash -lc "
    set -e
    export FARM_ROOT='$FARM_ROOT' SLOTS='$SLOTS' CONCURRENCY='$CONCURRENCY' TIMEOUT='$TIMEOUT'
    echo start $comp \$(date -Is) >> '$FARM_ROOT/parallel.log'
    '$here/launch.sh' '$comp'
    '$here/score.sh' '$comp'
    '$here/apply.sh' '$comp' || echo apply $comp skipped
    git -C '$root' push origin main || true
    echo end $comp \$(date -Is) >> '$FARM_ROOT/parallel.log'
  "
  echo "screen evo-$comp"
done

echo "screens: $(screen -ls || true)"
