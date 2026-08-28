#!/bin/bash
# usage: launch.sh <component>
set -euo pipefail
comp=${1:?component}
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
evo="$root/scripts/evolucion"
goal="$evo/goals/${comp}.md"
[[ -f $goal ]] || { echo "no goal $goal"; exit 1; }
farm="/tmp/magma-evo/$comp"
slots=${SLOTS:-19}
conc=${CONCURRENCY:-5}
mapfile -t models < "$here/models.txt"
nmod=${#models[@]}

rm -rf "$farm"
mkdir -p "$farm"
awk '/^---prompt---$/{p=1;next} p' "$goal" > "$farm/PROMPT.txt"
cp "$here/models.txt" "$farm/models.txt"
echo "component=$comp slots=$slots conc=$conc start=$(date -Is)" > "$farm/launch.log"

for i in $(seq 1 "$slots"); do
  slot=$(printf '%02d' "$i")
  dst="$farm/$slot"
  mkdir -p "$dst"
  rsync -a --delete \
    --exclude '.git/' \
    --exclude 'scripts/data/' \
    --exclude 'scripts/stacks/' \
    --exclude 'scripts/evolucion/' \
    --exclude 'node_modules/' \
    "$root/" "$dst/"
done

: > "$farm/done.log"
running=0
for i in $(seq 1 "$slots"); do
  idx=$(( (i - 1) % nmod ))
  model=${models[$idx]}
  "$here/run-one.sh" "$farm" "$i" "$model" &
  running=$((running + 1))
  if (( running >= conc )); then
    wait -n
    running=$((running - 1))
  fi
  sleep 2
done
wait
echo "end=$(date -Is)" >> "$farm/launch.log"
