#!/bin/bash
# usage: score.sh <component>
set -euo pipefail
comp=${1:?component}
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../.." && pwd)
evo="$root/scripts/evolucion"
goal="$evo/goals/${comp}.md"
farm="${FARM_ROOT:-/var/tmp/magma-evo}/$comp"
[[ -d $farm ]] || { echo "no farm $farm"; exit 1; }

check=$(awk '/^CHECK:/{sub(/^CHECK: /,""); print; exit}' "$goal")
files=$(awk '/^FILES:/{sub(/^FILES: /,""); print; exit}' "$goal")
nn=$(awk '/^NN:/{sub(/^NN: /,""); print; exit}' "$goal")
nn=${nn:-xx}

base="$farm/01"
# baseline = a slot that still matches root for the first listed file; use root copy
base="$root"

tsv="$farm/score.tsv"
echo -e "slot\tmodel\tstatus\tcheck\ttested\tbeats\tdiff\tplus\tminus" > "$tsv"
mapfile -t models < "$farm/models.txt"
nmod=${#models[@]}

python3 - "$farm" "$root" "$check" "$files" "$tsv" "$nmod" "$here/beats.py" << 'PY'
import os, sys, subprocess, hashlib
farm, root, check, files, tsv, nmod, beats_py = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], int(sys.argv[6]), sys.argv[7]
models = open(os.path.join(farm, "models.txt")).read().splitlines()
file_list = [f.strip() for f in files.split(",") if f.strip()]
slots = sorted(d for d in os.listdir(farm) if d.isdigit())

def plusminus(slot):
    plus = minus = 0
    for rel in file_list:
        a = os.path.join(root, rel)
        b = os.path.join(farm, slot, rel)
        if not os.path.isfile(b):
            continue
        r = subprocess.run(["diff", "-u", a, b], capture_output=True, text=True)
        for line in r.stdout.splitlines():
            if line.startswith("+") and not line.startswith("+++"): plus += 1
            elif line.startswith("-") and not line.startswith("---"): minus += 1
    return plus, minus

def has_check(slot):
    for dirpath, _, names in os.walk(os.path.join(farm, slot, "scripts")):
        for n in names:
            if not n.endswith((".js", ".sh", ".html")): continue
            p = os.path.join(dirpath, n)
            try:
                t = open(p).read()
            except Exception:
                continue
            if check in t:
                return True
    return False

def bun_ok(slot):
    r = subprocess.run(["bun", "test", "./test"], cwd=os.path.join(farm, slot, "scripts"),
                       capture_output=True, text=True, timeout=120)
    return r.returncode == 0

def claim(slot):
    p = os.path.join(farm, slot, "RESULT.md")
    if not os.path.isfile(p):
        return False
    return "STATUS: PASS" in open(p).read()

rows = []
for slot in slots:
    i = int(slot)
    model = models[(i - 1) % nmod]
    chk = has_check(slot)
    tested = bun_ok(slot) if chk else False
    plus, minus = plusminus(slot)
    diff = plus + minus
    beats = False
    if chk and tested and (plus + minus) > 0:
        br = subprocess.run(
            ["python3", beats_py, root, os.path.join(farm, slot), files],
            capture_output=True, text=True, timeout=180,
        )
        beats = br.returncode == 0
        status = "PASS" if beats else "STALE"
    elif chk:
        status = "PARTIAL"
    else:
        status = "NO_RESULT"
    rows.append((slot, model, status, chk, tested, beats, diff, plus, minus))

with open(tsv, "a") as f:
    for r in rows:
        f.write("\t".join(str(x) for x in r) + "\n")

done = []
if os.path.isfile(os.path.join(farm, "done.log")):
    done = [ln.split()[0] for ln in open(os.path.join(farm, "done.log")) if ln.strip()]

winners = [r for r in rows if r[2] == "PASS"]
winners.sort(key=lambda r: (r[6], done.index(r[0]) if r[0] in done else 10**6, r[0]))
open(os.path.join(farm, "winner.txt"), "w").write(winners[0][0] + "\n" if winners else "")
print(f"pass={len(winners)} total={len(rows)} winner={winners[0][0] if winners else '-'}")
for r in rows:
    print("\t".join(str(x) for x in r))
PY

# write report into repo
python3 - "$comp" "$nn" "$farm" "$evo" "$check" "$files" "$goal" << 'PY'
import os, sys, pathlib
comp, nn, farm, evo, check, files, goal = sys.argv[1:]
tsv = open(os.path.join(farm, "score.tsv")).read()
winner = open(os.path.join(farm, "winner.txt")).read().strip()
prompt = open(os.path.join(farm, "PROMPT.txt")).read()
out = pathlib.Path(evo) / f"{nn}-{comp}.md"
lines = [f"# Ronda {nn} — {comp}", "", f"CHECK: `{check}`", f"FILES: `{files}`", ""]
if winner:
    res = pathlib.Path(farm) / winner / "RESULT.md"
    lines += [f"Ganador: **slot {winner}**.", ""]
    if res.is_file():
        lines += ["```", res.read_text().strip(), "```", ""]
    for rel in [f.strip() for f in files.split(",") if f.strip()]:
        p = pathlib.Path(farm) / winner / rel
        if p.is_file():
            lines += [f"### `{rel}` (ganador)", "", "```js", p.read_text().rstrip(), "```", ""]
else:
    lines += ["Sin ganador PASS.", ""]
lines += ["## Score", "", "```", tsv.strip(), "```", "", "## Prompt", "", "```", prompt.strip(), "```", ""]
out.write_text("\n".join(lines))
print("wrote", out)
PY
