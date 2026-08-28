#!/bin/bash
# 50 jobs (5 contracts × 10 models), at most CONCURRENCY live screens.
# When a screen exits, the next queued job starts. Attach: screen -r evo-<comp>-<slot>
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
export FARM_ROOT=${FARM_ROOT:-/var/tmp/magma-evo}
export TIMEOUT=${TIMEOUT:-420}
export MAGMA_API=${MAGMA_API:-http://127.0.0.1:3100/api}
SLOTS=${SLOTS:-10}
CONC=${CONCURRENCY:-8}
COMPS=(digest runself startprot linlock uiconfirm)
models_file=${MODELS_FILE:-"$here/models-top.txt"}
mapfile -t MODELS < "$models_file"
nmod=${#MODELS[@]}
mkdir -p "$FARM_ROOT"
log="$FARM_ROOT/pool.log"
queue="$FARM_ROOT/queue.txt"
exec >>"$log" 2>&1

echo "pool start $(date -Is) slots=$SLOTS conc=$CONC models=$nmod"

skel="$FARM_ROOT/_skel"
rm -rf "$skel"
mkdir -p "$skel"
rsync -a --delete \
  --exclude '.git/' \
  --exclude 'scripts/data/' \
  --exclude 'scripts/stacks/' \
  --exclude 'scripts/evolucion/' \
  --exclude 'node_modules/' \
  "$root/" "$skel/"

: > "$queue"
for comp in "${COMPS[@]}"; do
  goal="$root/scripts/evolucion/goals/${comp}.md"
  [[ -f $goal ]] || { echo "missing goal $comp"; exit 1; }
  farm="$FARM_ROOT/$comp"
  rm -rf "$farm"
  mkdir -p "$farm"
  awk '/^---prompt---$/{p=1;next} p' "$goal" > "$farm/PROMPT.txt"
  cp "$models_file" "$farm/models.txt"
  echo "component=$comp slots=$SLOTS start=$(date -Is)" > "$farm/launch.log"
  : > "$farm/done.log"
  for i in $(seq 1 "$SLOTS"); do
    slot=$(printf '%02d' "$i")
    cp -a "$skel" "$farm/$slot"
    idx=$(( (i - 1) % nmod ))
    echo "$comp $i ${MODELS[$idx]}" >> "$queue"
  done
done

echo "queued $(wc -l < "$queue") jobs"

live_n() { screen -ls 2>/dev/null | grep -c '\.evo-' || true; }

fill() {
  while [[ -s $queue ]]; do
    n=$(live_n)
    (( n < CONC )) || return 0
    read -r comp i model < <(head -1 "$queue")
    tail -n +2 "$queue" > "$queue.tmp" && mv "$queue.tmp" "$queue"
    slot=$(printf '%02d' "$i")
    farm="$FARM_ROOT/$comp"
    name="evo-$comp-$slot"
    screen -S "$name" -X quit >/dev/null 2>&1 || true
    screen -dmS "$name" bash -lc "
      '$here/run-one.sh' '$farm' '$i' '$model'
      echo JOBDONE $comp $slot \$(date -Is) >> '$log'
    "
    echo "START $name model=$model live=$(live_n) left=$(wc -l < "$queue") $(date -Is)"
  done
}

score_ready() {
  for comp in "${COMPS[@]}"; do
    farm="$FARM_ROOT/$comp"
    [[ -f $farm/.applied ]] && continue
    [[ -f $farm/done.log ]] || continue
    done_n=$(grep -c . "$farm/done.log" || true)
    (( done_n >= SLOTS )) || continue
    echo "SCORE $comp $(date -Is)"
    if "$here/score.sh" "$comp" && "$here/apply.sh" "$comp"; then
      git -C "$root" push origin main || true
      echo "APPLIED $comp $(date -Is)"
    else
      echo "SKIP $comp $(date -Is)"
      git -C "$root" add "$root/scripts/evolucion/"*.md || true
      git -C "$root" commit -m "docs(evolucion): $comp score" || true
      git -C "$root" push origin main || true
    fi
    touch "$farm/.applied"
  done
}

fill
while [[ -s $queue ]] || (( $(live_n) > 0 )); do
  fill
  score_ready
  sleep 2
done
score_ready
echo "END $(date -Is)"
