const TAU = Math.PI * 2;
const trim = (s, n) => (s = String(s || ""), s.length > n ? s.slice(0, n - 1) + "…" : s);
const SKIN = {
  container: (on, locked) => locked
    ? ({ fill: "#5a534c", a: "rgba(140,130,120,.7)", b: "rgba(40,36,32,.25)" })
    : ({ fill: on ? "#ff4d12" : "#6a3a28", a: on ? "rgba(255,90,20,.95)" : "rgba(160,80,40,.7)", b: on ? "rgba(255,40,0,.35)" : "rgba(80,40,30,.2)" }),
  image: () => ({ fill: "#d9923a", a: "rgba(255,196,90,.85)", b: "rgba(180,90,20,.2)" }),
  stack: () => ({ fill: "#3d6fb8", a: "rgba(110,170,255,.85)", b: "rgba(40,80,160,.22)" }),
};

export class World {
  constructor(canvas) {
    Object.assign(this, { canvas, ctx: canvas.getContext("2d"), nodes: [], filter: "all", drag: null, hover: null, selected: null, fx: [], t: 0, _vis: null, dirty: true, onSelect: () => {}, onInspect: () => {} });
    this.resize();
    addEventListener("resize", () => this.resize());
    addEventListener("pointerup", () => this.drag = null);
    canvas.addEventListener("pointerdown", (e) => this.pointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.pointerMove(e));
    canvas.addEventListener("dblclick", (e) => { const n = this.hit(this.coords(e)); n && this.onInspect(n); });
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth; this.h = innerHeight; this.dirty = true;
    Object.assign(this.canvas, { width: this.w * dpr, height: this.h * dpr });
    this.canvas.style.width = this.w + "px"; this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setData({ containers = [], images = [], stacks = [] }) {
    const prev = new Map(this.nodes.map((n) => [n.key, n]));
    const spawn = () => ({ x: this.w * (0.2 + Math.random() * 0.6), y: this.h * (0.25 + Math.random() * 0.5), vx: (Math.random() - .5) * 1.4, vy: (Math.random() - .5) * 1.4 });
    const push = (list, item, kind, key, label, r) => list.push(Object.assign(prev.get(key) || spawn(), { key, kind, label, r, item, running: !!item.running }));
    const next = [];
    containers.forEach((c) => push(next, c, "container", `c:${c.id || c.name}`, c.name || c.id?.slice(0, 12), c.running ? 38 : 30));
    images.filter((i) => !i.dangling).forEach((i) => push(next, i, "image", `i:${i.ref}`, i.ref, 26));
    stacks.forEach((s) => push(next, s, "stack", `s:${s.name}`, s.name, 34));
    this.nodes = next; this._vis = null; this.dirty = true;
  }

  visible() { return this._vis ??= this.filter === "all" ? this.nodes : this.nodes.filter((n) => n.kind === this.filter); }
  setFilter(f) { this.filter = f; this._vis = null; this.dirty = true; }
  coords(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  hit({ x, y }) { return this.visible().findLast((n) => (n.x - x) ** 2 + (n.y - y) ** 2 <= n.r ** 2) || null; }

  pointerDown(e) {
    const p = this.coords(e), n = this.hit(p);
    this.selected = n; this.onSelect(n || null, e); this.dirty = true;
    this.drag = n ? { n, ox: p.x - n.x, oy: p.y - n.y } : null;
    n && this.canvas.setPointerCapture?.(e.pointerId);
  }
  pointerMove(e) {
    const p = this.coords(e), h = this.hit(p);
    if (h !== this.hover) { this.hover = h; this.dirty = true; }
    this.drag && (Object.assign(this.drag.n, { x: p.x - this.drag.ox, y: p.y - this.drag.oy, vx: 0, vy: 0 }), this.dirty = true);
    this.canvas.style.cursor = this.hover ? "grab" : "default";
  }

  burst(x, y, color, n = 18) {
    this.fx.push(...Array.from({ length: n }, () => {
      const a = Math.random() * TAU, s = 1 + Math.random() * 3.5;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, r: 2 + Math.random() * 3 };
    }));
    this.dirty = true;
  }
  split(n) { this.burst(n.x, n.y, "rgba(255,180,60,.9)", 28); }
  implode(n) { this.burst(n.x, n.y, "rgba(255,60,40,.9)", 22); }

  loop(ts) {
    this.t = ts / 1000;
    const live = this.fx.length || this.drag || this.visible().some((n) => n.running || Math.abs(n.vx) + Math.abs(n.vy) > 0.02);
    live && this.step();
    (this.dirty || live) && this.draw();
    this.dirty = false;
    requestAnimationFrame((t) => this.loop(t));
  }

  step() {
    const vis = this.visible(), cx = this.w / 2, cy = this.h / 2 + 20;
    for (const n of vis) {
      if (this.drag?.n === n) continue;
      n.vx = (n.vx + (cx - n.x) * 0.00035) * 0.985;
      n.vy = (n.vy + (cy - n.y) * 0.00035) * 0.985;
      n.x += n.vx; n.y += n.vy;
      const m = n.r + 8;
      if (n.x < m) { n.x = m; n.vx *= -0.6; }
      if (n.y < 80) { n.y = 80; n.vy *= -0.6; }
      if (n.x > this.w - m) { n.x = this.w - m; n.vx *= -0.6; }
      if (n.y > this.h - 40) { n.y = this.h - 40; n.vy *= -0.6; }
    }
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j], dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r + 14, d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2) || 0.001, p = (min - d) * 0.035, ux = dx / d, uy = dy / d;
        a.x -= ux * p; a.y -= uy * p; b.x += ux * p; b.y += uy * p;
        a.vx -= ux * p; a.vy -= uy * p; b.vx += ux * p; b.vy += uy * p;
      }
    }
    this.fx = this.fx.filter((p) => (p.x += p.vx, p.y += p.vy, p.vy += 0.04, (p.life -= 0.02) > 0));
  }

  draw() {
    const { ctx: g, w, h, t } = this;
    g.fillStyle = "#0b0706"; g.fillRect(0, 0, w, h);
    for (const n of this.visible()) {
      const on = n.kind === "container" && n.running, r = n.r * (on ? 1 + Math.sin(t * 3) * 0.06 : 1);
      const s = n.kind === "container" ? SKIN.container(on, n.item.protected) : (SKIN[n.kind] || SKIN.stack)(on);
      const glow = g.createRadialGradient(n.x, n.y, r * 0.1, n.x, n.y, r * 2.4);
      glow.addColorStop(0, s.a); glow.addColorStop(0.5, s.b); glow.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = glow; g.beginPath(); g.arc(n.x, n.y, r * 2.2, 0, TAU); g.fill();
      g.fillStyle = s.fill; g.beginPath(); g.arc(n.x, n.y, r, 0, TAU); g.fill();
      (this.selected === n || this.hover === n) && (g.strokeStyle = "rgba(255,240,210,.85)", g.lineWidth = 2, g.beginPath(), g.arc(n.x, n.y, r + 6, 0, TAU), g.stroke());
      g.textAlign = "center";
      g.fillStyle = "#f8efe6"; g.font = "12px system-ui, sans-serif"; g.fillText(trim(n.label, 22), n.x, n.y + r + 16);
      g.fillStyle = "rgba(255,220,190,.55)"; g.font = "10px ui-monospace, monospace"; g.fillText(n.kind, n.x, n.y + r + 28);
    }
    for (const p of this.fx) { g.globalAlpha = p.life; g.fillStyle = p.color; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); g.globalAlpha = 1; }
  }
}
