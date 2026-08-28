import { World } from "./world.js";

const $ = (s) => document.querySelector(s);
const world = new World($("#world"));
const [radial, panel, modal, form] = ["#radial", "#panel", "#modal", "#form"].map($);
let mode = "run", current = null;
const refOf = (n) => n.item.name || n.item.id || n.item.ref;
const hide = (el) => el.classList.add("hidden");
const show = (el) => el.classList.remove("hidden");
const toast = (msg) => {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2800);
};

const call = async (method, path, body) => {
  const r = await fetch(path, { method, headers: body != null ? { "Content-Type": "application/json" } : {}, body: body != null ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  return r.ok ? data : Promise.reject(new Error(data.error || r.statusText));
};
const get = (p) => call("GET", p);
const post = (p, b) => call("POST", p, b);
const q = (p, k, v) => `${p}?${k}=${encodeURIComponent(v || "")}`;

const ACTS = {
  container: (n) => n.item.protected ? ["inspect"] : ["commit", "stamp", "dup", "evolve", n.item.running ? "stop" : "start", "inspect", "rm"],
  image: () => ["run", "spawn", "inspect", "rm"],
  stack: () => ["edit", "up", "down", "inspect", "rm"],
};

const placeRadial = (node) => {
  const acts = (ACTS[node.kind] || ACTS.stack)(node);
  const vis = [...radial.querySelectorAll("button")].filter((b) => (b.style.display = acts.includes(b.dataset.act) ? "block" : "none") === "block");
  Object.assign(radial.style, { left: `${node.x - 110}px`, top: `${node.y - 110}px` });
  vis.forEach((b, i) => {
    const a = (Math.PI * 2 * i) / vis.length - Math.PI / 2;
    b.style.transform = `translate(-50%, -50%) translate(${Math.cos(a) * 84}px, ${Math.sin(a) * 84}px)`;
  });
  show(radial);
};

world.onSelect = (node) => (current = node, node ? placeRadial(node) : hide(radial));
world.onInspect = (node) => inspect(node);

async function inspect(node) {
  show(panel); $("#panel-title").textContent = node.label; $("#panel-body").textContent = "cargando…";
  $("#panel-body").textContent = node.kind === "stack"
    ? (await get(q("/api/stacks/read", "name", node.item.name))).yaml
    : JSON.stringify(await get(q("/api/inspect", "ref", node.kind === "image" ? node.item.ref : refOf(node))), null, 2);
}

const applySnap = (s) => {
  world.setData(s);
  $("#stat-c").textContent = `${s.containers.length} c`;
  $("#stat-i").textContent = `${s.images.length} img`;
  $("#stat-s").textContent = `${s.stacks.length} yml`;
};
const refresh = () => get("/api/snapshot").then(applySnap).catch((e) => toast(e.message || "sin docker"));

const TITLES = { run: "correr contenedor", commit: "docker commit", stack: "nuevo compose", edit: "editar compose", auto: "commit en serie", stamp: "1 commit + N run", spawn: "correr imagen × N", bake: "build + N run" };
const openForm = (kind, d = {}) => {
  mode = kind; show(modal); $("#form-title").textContent = TITLES[kind] || kind;
  ["name", "image", "message"].forEach((k) => form[k].value = d[k] || "");
  form.yaml.value = d.yaml || "";
  form.yaml.parentElement.style.display = /stack|edit|stamp|bake/.test(kind) ? "grid" : "none";
  const yl = document.getElementById("yaml-label");
  yl && (yl.firstChild.textContent = kind === "stamp" ? "comando una vez " : kind === "bake" ? "Dockerfile " : "yaml ");
  form.message.parentElement.style.display = /commit|auto/.test(kind) ? "grid" : "none";
};

const FORMS = {
  run: async ({ image, name }) => (await post("/api/containers/run", { image, name: name || undefined }), `corriendo ${image}`),
  commit: async ({ name, image, message }) => {
    const repository = image || (await get("/api/next-tag")).repository;
    await post("/api/commit", { container: name, repository, message });
    current && world.split(current);
    return `commit → ${repository}`;
  },
  stack: async ({ name, image, yaml }) => (await post("/api/stacks", yaml.trim() ? { name, yaml } : { name, from: { service: name || "app", image: image || "debian:bookworm-slim" } }), `stack ${name} guardado`),
  edit: async ({ name, yaml }) => (await post("/api/stacks", { name, yaml }), `stack ${name} actualizado`),
  auto: async ({ name, message }) => {
    const n = Math.max(1, parseInt(name, 10) || 1);
    const r = await post("/api/commit-batch", { container: current && refOf(current), n, message: message || "snapshot" });
    current && world.split(current);
    return `${n} commits · último ${r.last?.repository || ""}`;
  },
  stamp: async ({ name, image, yaml }) => {
    const n = Math.max(1, parseInt(name, 10) || 1);
    const r = await post("/api/stamp", {
      container: current && refOf(current), n, repo: image || "magma/slim",
      prefix: current && current.item.name || "lab", exec: yaml || undefined,
    });
    current && world.split(current);
    return `stamp ${r.committed.repository} · ${r.spawned.n} run`;
  },
  bake: async ({ name, image, yaml }) => {
    const n = Math.max(0, parseInt(name, 10) || 0);
    const r = await post("/api/bake", { from: image || "debian:bookworm-slim", tag: "magma/slim:upgraded", n, dockerfile: yaml || undefined });
    return `bake ${r.built.tag}` + (r.spawned ? ` · ${r.spawned.n} run` : "");
  },
  spawn: async ({ name, image }) => {
    const n = Math.max(1, parseInt(name, 10) || 1);
    const r = await post("/api/run-many", { image, n, prefix: (current && current.item.repository) || "lab" });
    return `${r.n} run ← ${image}`;
  },
};

form.addEventListener("submit", async (e) => {
  e.preventDefault(); hide(modal);
  const data = { name: form.name.value.trim(), image: form.image.value.trim(), message: form.message.value.trim(), yaml: form.yaml.value };
  try { toast(await FORMS[mode](data)); await refresh(); } catch (err) { toast(err.message); }
});

$("#form-cancel").onclick = () => hide(modal);
$("#panel-close").onclick = () => hide(panel);
$("#btn-refresh").onclick = refresh;
$("#btn-run").onclick = () => openForm("run", { image: "debian:bookworm-slim" });
$("#btn-stack").onclick = async () => openForm("stack", { name: "lab", yaml: (await post("/api/stacks/template", { service: "lab", image: "debian:bookworm-slim" })).yaml });
$("#btn-auto").onclick = () => current?.kind === "container" ? openForm("auto", { name: "5", message: "snapshot magma" }) : toast("elegí un contenedor primero");
$("#btn-evolve").onclick = async () => {
  if (current?.kind !== "container") return toast("elegí un contenedor primero");
  world.split(current);
  const r = await post("/api/evolve", { container: refOf(current), message: "evolve ui" });
  toast(`evolve → ${r.committed.repository} + ${r.spawned?.name || "stack"}`);
  refresh();
};
$("#btn-bake").onclick = () => openForm("bake", {
  name: "3", image: "debian:bookworm-slim",
  yaml: "FROM debian:bookworm-slim\nRUN apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*\nCMD [\"sleep\", \"infinity\"]\n",
});
$("#btn-stamp").onclick = () => current?.kind === "container"
  ? openForm("stamp", { name: "3", image: "magma/slim", yaml: "apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*" })
  : current?.kind === "image"
    ? openForm("spawn", { name: "3", image: current.item.ref })
    : toast("elegí un contenedor o una imagen");

const OPEN = new Set(["commit", "run", "edit", "inspect", "stamp", "spawn", "bake"]);
const RADIAL = {
  commit: async (n) => openForm("commit", { name: refOf(n), image: (await get("/api/next-tag")).repository, message: "estado actual" }),
  dup: async (n) => (world.split(n), await post("/api/duplicate", { container: refOf(n) }), "duplicado"),
  evolve: async (n) => (world.split(n), await post("/api/evolve", { container: refOf(n), message: "evolve" }).then((r) => `evolve → ${r.committed.repository}`)),
  start: async (n) => (await post("/api/containers/start", { ref: refOf(n) }), "start"),
  stop: async (n) => (await post("/api/containers/stop", { ref: refOf(n) }), "stop"),
  run: (n) => openForm("run", { image: n.item.ref }),
  stamp: (n) => openForm("stamp", { name: "3", image: "magma/slim", yaml: "apt-get update && apt-get upgrade -y && apt-get clean && rm -rf /var/lib/apt/lists/*" }),
  spawn: (n) => openForm("spawn", { name: "3", image: n.item.ref }),
  edit: async (n) => openForm("edit", { name: n.item.name, yaml: (await get(q("/api/stacks/read", "name", n.item.name))).yaml }),
  up: async (n) => (await post("/api/stacks/up", { name: n.item.name }), `${n.item.name} up`),
  down: async (n) => (await post("/api/stacks/down", { name: n.item.name }), `${n.item.name} down`),
  inspect: (n) => inspect(n),
  rm: async (n) => {
    world.implode(n);
    await ({
      container: () => post("/api/containers/rm", { ref: refOf(n) }),
      image: () => post("/api/images/rm", { ref: n.item.ref, force: true }),
      stack: () => post("/api/stacks/rm", { name: n.item.name }),
    }[n.kind]());
    return "borrado";
  },
};

radial.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn || !current) return;
  hide(radial);
  try { const msg = await RADIAL[btn.dataset.act](current); msg && toast(msg); OPEN.has(btn.dataset.act) || await refresh(); }
  catch (err) { toast(err.message); }
});

document.querySelectorAll(".filters button").forEach((b) => b.onclick = () => {
  document.querySelectorAll(".filters button").forEach((x) => x.classList.toggle("on", x === b));
  world.setFilter(b.dataset.filter);
});

(function connectWs() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  const badge = $("#ws");
  ws.onopen = () => badge.classList.replace("off", "on");
  ws.onclose = () => (badge.classList.replace("on", "off"), setTimeout(connectWs, 2000));
  ws.onmessage = ({ data }) => { try { const m = JSON.parse(data); m.type === "snapshot" && applySnap(m); } catch {} };
})();

refresh();
