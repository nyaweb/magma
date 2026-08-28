const API = process.env.MAGMA_API || "http://127.0.0.1:3100/api";
const ok = (cond, name, extra) => (console.log(cond ? "ok " : "FAIL ", name, extra || ""), cond);
const req = async (method, path, body) => {
  const r = await fetch(API + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path}: ${data.error || r.status}`);
  return data;
};
const get = (p) => req("GET", p);
const post = (p, b) => req("POST", p, b);

let fail = 0;
try {
  const h = await get("/health");
  ok(h.name === "magma", "health", h.version) || fail++;

  const images = await get("/images");
  const slim = images.find((i) => i.ref === "debian:bookworm-slim") || images.find((i) => i.repository === "debian");
  ok(!!slim, "debian en imágenes", slim?.ref) || fail++;

  const ran = await post("/containers/run", { image: slim?.ref || "debian:bookworm-slim", name: "debian-lab" });
  ok(ran.ok && ran.name === "debian-lab", "run debian-lab", ran.id) || fail++;

  const probe = await post("/exec", { ref: "debian-lab", command: "cat /etc/os-release | head -1 || echo debian" });
  ok(probe.ok, "exec probe", probe.out?.slice(0, 80)) || fail++;

  const stamped = await post("/stamp", {
    container: "debian-lab", n: 5, repo: "magma/debian", prefix: "deb", exec: "apt", message: "debian stamp test",
  });
  ok(stamped.committed?.repository === "magma/debian:1", "1 commit", stamped.committed?.repository) || fail++;
  ok(stamped.spawned?.n === 5, "5 clones", stamped.spawned?.n) || fail++;
  ok(stamped.prepared?.ok, "prep/apt via exec") || fail++;

  const snap = await get("/snapshot");
  const clones = snap.containers.filter((c) => /^deb-\d+$/.test(c.name));
  const img = snap.images.find((i) => i.ref === "magma/debian:1");
  ok(clones.length === 5 && clones.every((c) => c.image === "magma/debian:1"), "clones apuntan a la plantilla") || fail++;
  ok(!!img, "imagen magma/debian:1 listada") || fail++;

  const lin = await get("/lineage?ref=debian-lab");
  ok(lin.some((e) => e.repository === "magma/debian:1"), "lineage debian-lab") || fail++;

  const more = await post("/run-many", { image: "magma/debian:1", n: 3, prefix: "debx" });
  ok(more.n === 3, "run-many extra ×3") || fail++;

  console.log(JSON.stringify({
    version: h.version, plantilla: stamped.committed.repository,
    clones: stamped.spawned.n + more.n, fail,
  }));
} catch (e) {
  fail++;
  console.log("ERR", e.message);
}
process.exit(fail ? 1 : 0);
