const BASE = "http://127.0.0.1:3100";
const stats = { ok: 0, fail: 0, errors: [] };
const assert = (cond, name) => (cond ? stats.ok++ : (stats.fail++, stats.errors.push(name), console.log("FAIL", name)));
const get = (p) => fetch(BASE + p).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));
const post = (p, b) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b || {}) }).then(async (r) => ({ status: r.status, data: await r.json().catch(() => ({})) }));

const cases = [];
const add = (name, fn) => cases.push({ name, fn });

add("health", async () => {
  const { status, data } = await get("/api/health");
  assert(status === 200 && data.ok, "health");
});
add("snapshot-shape", async () => {
  const { data } = await get("/api/snapshot");
  assert(Array.isArray(data.containers) && Array.isArray(data.images) && Array.isArray(data.stacks), "snapshot-shape");
});
add("unknown-404", async () => {
  const { status, data } = await get("/api/nope");
  assert(status === 404 && data.error, "unknown-404");
});
add("inspect-missing-ref", async () => {
  const { status, data } = await get("/api/inspect");
  assert(status >= 400 && data.error, "inspect-missing-ref");
});
add("run-requires-image", async () => {
  const { status, data } = await post("/api/containers/run", {});
  assert(status >= 400 && /image/.test(data.error || ""), "run-requires-image");
});

add("run-lab", async () => {
  const { status, data } = await post("/api/containers/run", { image: "debian:bookworm-slim", name: "lab" });
  assert(status === 200 && data.ok && data.id, "run-lab");
});
add("run-lab-conflict", async () => {
  const { status, data } = await post("/api/containers/run", { image: "debian:bookworm-slim", name: "lab" });
  assert(status >= 400 && data.error, "run-lab-conflict");
});
add("containers-has-lab", async () => {
  const { data } = await get("/api/containers");
  assert(data.some((c) => c.name === "lab" && c.running), "containers-has-lab");
});
add("inspect-lab", async () => {
  const { status, data } = await get("/api/inspect?ref=lab");
  assert(status === 200 && data.Name, "inspect-lab");
});
add("stop-lab", async () => {
  const { data } = await post("/api/containers/stop", { ref: "lab" });
  assert(data.ok, "stop-lab");
});
add("lab-stopped", async () => {
  const { data } = await get("/api/containers");
  assert(data.find((c) => c.name === "lab")?.running === false, "lab-stopped");
});
add("start-lab", async () => {
  const { data } = await post("/api/containers/start", { ref: "lab" });
  assert(data.ok, "start-lab");
});
add("peek-tag", async () => {
  const a = await get("/api/next-tag");
  const b = await get("/api/next-tag");
  assert(a.data.repository === b.data.repository && a.data.repository === "magma/snapshot:1", "peek-tag-stable");
});
add("commit-lab", async () => {
  const { status, data } = await post("/api/commit", { container: "lab", repository: "magma/lab:1", message: "base" });
  assert(status === 200 && data.ok && data.repository === "magma/lab:1", "commit-lab");
});
add("images-has-commit", async () => {
  const { data } = await get("/api/images");
  assert(data.some((i) => i.ref === "magma/lab:1"), "images-has-commit");
});
add("lineage", async () => {
  const { data } = await get("/api/lineage?ref=lab");
  assert(Array.isArray(data) && data.length >= 1, "lineage");
});
add("commit-no-container", async () => {
  const { status, data } = await post("/api/commit", { repository: "x:1" });
  assert(status >= 400 && data.error, "commit-no-container");
});
add("batch-5", async () => {
  const { status, data } = await post("/api/commit-batch", { container: "lab", n: 5, message: "snap" });
  assert(status === 200 && data.commits?.length === 5 && data.last?.repository === "magma/snapshot:5", "batch-5");
});
add("seq-after-batch", async () => {
  const { data } = await get("/api/next-tag");
  assert(data.repository === "magma/snapshot:6", "seq-after-batch");
});
add("duplicate", async () => {
  const { status, data } = await post("/api/duplicate", { container: "lab", name: "lab-copy" });
  assert(status === 200 && data.ok && data.spawned?.name === "lab-copy", "duplicate");
});
add("template", async () => {
  const { data } = await post("/api/stacks/template", { service: "lab2", image: "magma/lab:1" });
  assert(/lab2/.test(data.yaml) && /magma\/lab:1/.test(data.yaml), "template");
});
add("stack-write", async () => {
  const { data } = await post("/api/stacks", { name: "lab2", from: { service: "lab2", image: "debian:bookworm-slim" } });
  assert(data.ok && data.name === "lab2", "stack-write");
});
add("stack-read", async () => {
  const { data } = await get("/api/stacks/read?name=lab2");
  assert(/services:/.test(data.yaml), "stack-read");
});
add("stack-bad-name", async () => {
  const { status, data } = await post("/api/stacks", { name: "???" });
  assert(status >= 400 && data.error, "stack-bad-name");
});
add("stack-up", async () => {
  const { data } = await post("/api/stacks/up", { name: "lab2" });
  assert(data.ok, "stack-up");
});
add("stack-down", async () => {
  const { data } = await post("/api/stacks/down", { name: "lab2" });
  assert(data.ok, "stack-down");
});
add("stack-list", async () => {
  const { data } = await get("/api/stacks");
  assert(data.some((s) => s.name === "lab2" && !s.yaml), "stack-list-no-yaml");
});
add("index-html", async () => {
  const r = await fetch(BASE + "/");
  const t = await r.text();
  assert(r.status === 200 && /MAGMA/.test(t), "index-html");
});
add("static-css", async () => {
  const r = await fetch(BASE + "/public/css/style.css");
  assert(r.status === 200 && r.headers.get("content-type"), "static-css");
});
add("static-app-js", async () => {
  const r = await fetch(BASE + "/public/js/app.js");
  assert(r.status === 200, "static-app-js");
});
add("method-post-root-404", async () => {
  const r = await fetch(BASE + "/", { method: "POST" });
  assert(r.status === 404, "method-post-root-404");
});
add("rm-missing", async () => {
  const { status, data } = await post("/api/containers/rm", { ref: "nope" });
  assert(status >= 400 && data.error, "rm-missing");
});
add("start-missing", async () => {
  const { data } = await post("/api/containers/start", { ref: "ghost" });
  assert(data.error, "start-missing");
});
add("rmi-debian-keep", async () => {
  const { data } = await get("/api/images");
  assert(data.some((i) => i.ref === "debian:bookworm-slim"), "debian-still-there");
});

// 50 tiny run/rm cycles + extra commits to pass 100
for (let i = 0; i < 40; i++) {
  add(`cycle-run-${i}`, async () => {
    const r = await post("/api/containers/run", { image: "debian:bookworm-slim", name: `c${i}` });
    assert(r.data.ok, `cycle-run-${i}`);
  });
  add(`cycle-stop-${i}`, async () => {
    const r = await post("/api/containers/stop", { ref: `c${i}` });
    assert(r.data.ok, `cycle-stop-${i}`);
  });
}

add("final-snapshot", async () => {
  const { data } = await get("/api/snapshot");
  assert(data.containers.length >= 40 && data.images.length >= 6, "final-snapshot");
});
add("ws-upgrade", async () => {
  try {
    const ws = new WebSocket("ws://127.0.0.1:3100/ws");
    const ok = await new Promise((res) => {
      const t = setTimeout(() => res(false), 2000);
      ws.onmessage = (ev) => { clearTimeout(t); try { res(JSON.parse(String(ev.data)).type === "hello" || JSON.parse(String(ev.data)).type === "snapshot"); } catch { res(false); } };
      ws.onerror = () => { clearTimeout(t); res(false); };
    });
    ws.close();
    assert(ok, "ws-upgrade");
  } catch (e) { assert(false, "ws-upgrade:" + e.message); }
});

console.log(`running ${cases.length} cases`);
for (const c of cases) {
  try { await c.fn(); }
  catch (e) { stats.fail++; stats.errors.push(c.name + ": " + e.message); console.log("ERR", c.name, e.message); }
}
console.log(JSON.stringify({ total: cases.length, ok: stats.ok, fail: stats.fail, errors: stats.errors }, null, 2));
