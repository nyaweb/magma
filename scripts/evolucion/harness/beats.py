#!/usr/bin/env python3
"""Exit 0 if SLOTDIR beats ROOT. 1 if current already as good or better. 2 error.

A slot beats current when:
- its bun tests pass, AND
- current modules fail those tests (new behavior), OR
- current already passes and the slot's production files are strictly smaller.
"""
import os, sys, shutil, subprocess, tempfile

def prod_size(base, files):
    n = 0
    for rel in files:
        if "/test/" in rel.replace("\\", "/"):
            continue
        p = os.path.join(base, rel)
        if os.path.isfile(p):
            n += os.path.getsize(p)
    return n

def overlay_tests(root, slotdir, files, tmp):
    src_scripts = os.path.join(root, "scripts")
    dst_scripts = os.path.join(tmp, "scripts")
    shutil.copytree(
        src_scripts, dst_scripts,
        ignore=shutil.ignore_patterns("evolucion", "data", "stacks", "node_modules"),
    )
    for rel in files:
        norm = rel.replace("\\", "/")
        if "/test/" not in norm and not norm.endswith(".test.js"):
            continue
        src = os.path.join(slotdir, rel)
        if os.path.isfile(src):
            dst = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
    slot_test = os.path.join(slotdir, "scripts", "test")
    dst_test = os.path.join(tmp, "scripts", "test")
    if os.path.isdir(slot_test) and os.path.isdir(dst_test):
        for n in os.listdir(slot_test):
            if n == "env.js" or n.endswith(".test.js"):
                shutil.copy2(os.path.join(slot_test, n), os.path.join(dst_test, n))

def bun_ok(scripts_dir):
    r = subprocess.run(
        ["bun", "test", "./test"],
        cwd=scripts_dir, capture_output=True, text=True, timeout=120,
    )
    return r.returncode == 0

def main():
    if len(sys.argv) < 4:
        print("usage: beats.py ROOT SLOTDIR FILES_CSV", file=sys.stderr)
        return 2
    root, slotdir, files_csv = sys.argv[1], sys.argv[2], sys.argv[3]
    files = [f.strip() for f in files_csv.split(",") if f.strip()]
    if not bun_ok(os.path.join(slotdir, "scripts")):
        print("FAIL slot tests")
        return 1
    tmp = tempfile.mkdtemp(prefix="magma-beats-")
    try:
        overlay_tests(root, slotdir, files, tmp)
        current_ok = bun_ok(os.path.join(tmp, "scripts"))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    if not current_ok:
        print("BEATS new-behavior")
        return 0
    w = prod_size(slotdir, files)
    c = prod_size(root, files)
    if w < c:
        print(f"BEATS smaller {w}<{c}")
        return 0
    print(f"STALE current-already {c}<={w}")
    return 1

if __name__ == "__main__":
    sys.exit(main())
