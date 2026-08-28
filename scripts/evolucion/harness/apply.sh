#!/bin/bash
# usage: apply.sh <component>
set -euo pipefail
comp=${1:?component}
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
mkdir -p "${FARM_ROOT:-/var/tmp/magma-evo}"
exec 9>"${FARM_ROOT:-/var/tmp/magma-evo}/git.lock"
flock 9
farm="${FARM_ROOT:-/var/tmp/magma-evo}/$comp"
winner=$(cat "$farm/winner.txt" 2>/dev/null || true)
[[ -n $winner ]] || { echo "no winner"; exit 1; }
goal="$root/scripts/evolucion/goals/${comp}.md"
files=$(awk '/^FILES:/{sub(/^FILES: /,""); print; exit}' "$goal")
nn=$(awk '/^NN:/{sub(/^NN: /,""); print; exit}' "$goal")
IFS=',' read -ra arr <<< "$files"
for rel in "${arr[@]}"; do
  rel=${rel// /}
  src="$farm/$winner/$rel"
  [[ -f $src ]] || { echo "missing $src"; exit 1; }
  mkdir -p "$(dirname "$root/$rel")"
  cp "$src" "$root/$rel"
done
(cd "$root/scripts" && bun test ./test)
git -C "$root" add $files "scripts/evolucion/${nn}-${comp}.md" || true
git -C "$root" add scripts/evolucion/README.md || true
if git -C "$root" diff --cached --quiet; then
  echo "nothing to commit"
  exit 0
fi
git -C "$root" commit -m "$(cat <<EOF
feat(${comp}): contest winner slot ${winner}

Evolution round ${nn} ${comp}. Smallest passing diff.
EOF
)"
echo "applied slot $winner"
