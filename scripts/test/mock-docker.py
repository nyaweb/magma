#!/usr/bin/env python3
"""Minimal docker CLI mock for Magma tests."""
import json, os, sys, time, uuid
from pathlib import Path

STATE = Path(os.environ.get("MOCK_DOCKER_STATE", "/tmp/mock-docker-state.json"))

def load():
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {
        "images": [
            {"ID": "imgbase", "Repository": "debian", "Tag": "bookworm-slim", "Size": "80MB"},
        ],
        "containers": [],
        "log": [],
    }

def save(s):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(s, indent=2))

def out(s=""):
    sys.stdout.write(s if s.endswith("\n") or s == "" else s + "\n")

def err(s, code=1):
    sys.stderr.write(s + "\n")
    sys.exit(code)

def main(argv):
    if not argv:
        err("Usage: docker ...")
    s = load()
    a = argv[:]

    if a[0] == "version":
        out("24.0.0" if "--format" in a else "Docker version 24.0.0")
        return
    if a[0] == "events":
        time.sleep(3600)
        return
    if a[0] == "ps":
        for c in s["containers"]:
            out(json.dumps(c))
        return
    if a[0] == "images":
        for i in s["images"]:
            out(json.dumps(i))
        return
    if a[0] == "inspect":
        ref = a[-1]
        for c in s["containers"]:
            if c["ID"] == ref or c["Names"] == ref:
                out(json.dumps([{
                    "Id": c["ID"], "Name": "/" + c["Names"], "Image": c["Image"],
                    "State": {"Status": c["State"], "Running": c["State"] == "running"},
                    "Created": c.get("CreatedAt", ""), "Config": {"Image": c["Image"], "Cmd": ["sleep", "infinity"]},
                }]))
                return
        for i in s["images"]:
            if i["ID"] == ref or f"{i['Repository']}:{i['Tag']}" == ref:
                out(json.dumps([{"Id": i["ID"], "Config": {"Image": f"{i['Repository']}:{i['Tag']}"}, "RepoTags": [f"{i['Repository']}:{i['Tag']}"]}]))
                return
        err(f"Error: No such object: {ref}")
    if a[0] == "run":
        image = None
        name = None
        i = 1
        while i < len(a):
            if a[i] in ("-d", "-t"):
                i += 1
                continue
            if a[i] == "--name":
                name = a[i + 1]; i += 2; continue
            image = a[i]; i += 1; break
        cid = uuid.uuid4().hex[:12]
        name = name or cid
        if any(c["Names"] == name for c in s["containers"]):
            err(f'Conflict. The container name "/{name}" is already in use')
        s["containers"].append({
            "ID": cid, "Names": name, "Image": image, "Status": "Up 1 second",
            "State": "running", "Ports": "", "CreatedAt": "now", "Command": "sleep infinity",
        })
        save(s); out(cid); return
    if a[0] in ("start", "stop", "rm"):
        ref = a[-1]
        force = "-f" in a
        found = None
        for c in s["containers"]:
            if c["ID"] == ref or c["Names"] == ref:
                found = c; break
        if not found:
            err(f"Error: No such container: {ref}")
        if a[0] == "start":
            found["State"] = "running"; found["Status"] = "Up 1 second"
        elif a[0] == "stop":
            found["State"] = "exited"; found["Status"] = "Exited (0)"
        else:
            s["containers"] = [c for c in s["containers"] if c is not found]
        save(s); out(ref); return
    if a[0] == "rmi":
        ref = a[-1]
        before = len(s["images"])
        s["images"] = [i for i in s["images"] if i["ID"] != ref and f"{i['Repository']}:{i['Tag']}" != ref]
        if len(s["images"]) == before:
            err(f"Error: No such image: {ref}")
        save(s); out(ref); return
    if a[0] == "commit":
        # docker commit [-a author] [-m msg] container repo:tag
        container = None
        repo = None
        args = [x for x in a[1:] if x not in ("-a", "-m")]
        # drop author and message values that follow -a/-m — already stripped flags only
        raw = a[1:]
        skip = 0
        pos = []
        i = 0
        while i < len(raw):
            if raw[i] in ("-a", "-m") and i + 1 < len(raw):
                i += 2; continue
            pos.append(raw[i]); i += 1
        if len(pos) < 2:
            err("docker commit requires container and repository")
        container, repo = pos[0], pos[1]
        if not any(c["ID"] == container or c["Names"] == container for c in s["containers"]):
            err(f"Error: No such container: {container}")
        image_id = "sha256:" + uuid.uuid4().hex
        repository, tag = (repo.split(":", 1) + ["latest"])[:2]
        s["images"].append({"ID": image_id[7:19], "Repository": repository, "Tag": tag, "Size": "81MB"})
        save(s); out(image_id); return
    if a[0] == "exec":
        # docker exec ref sh -c cmd
        ref = a[1] if len(a) > 1 else ""
        if not any(c["ID"] == ref or c["Names"] == ref for c in s["containers"]):
            err(f"Error: No such container: {ref}")
        out("ok")
        return
    if a[0] == "build":
        tag = "magma/slim:upgraded"
        if "-t" in a:
            tag = a[a.index("-t") + 1]
        repository, tagv = (tag.split(":", 1) + ["latest"])[:2]
        s["images"].append({"ID": uuid.uuid4().hex[:12], "Repository": repository, "Tag": tagv, "Size": "90MB"})
        save(s); out("Successfully tagged " + tag); return
    if a[0] == "compose":
        # compose -f file -p name up|down ...
        verb = "up" if "up" in a else "down" if "down" in a else a[-1]
        name = "app"
        if "-p" in a:
            name = a[a.index("-p") + 1]
        if verb == "up":
            cid = uuid.uuid4().hex[:12]
            if not any(c["Names"] == name for c in s["containers"]):
                s["containers"].append({
                    "ID": cid, "Names": name, "Image": "debian:bookworm-slim",
                    "Status": "Up 1 second", "State": "running", "Ports": "", "CreatedAt": "now", "Command": "sleep infinity",
                })
                save(s)
            out(f"Started {name}")
        else:
            s["containers"] = [c for c in s["containers"] if c["Names"] != name]
            save(s)
            out(f"Stopped {name}")
        return
    err("unknown docker command: " + " ".join(a))

if __name__ == "__main__":
    main(sys.argv[1:])
