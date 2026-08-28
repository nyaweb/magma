import { serve } from "bun";
import { handleApi, snapshot } from "./modules/api.js";
import { docker } from "./modules/util.js";
import { VERSION } from "./modules/config.js";
import { resolvePublic } from "./modules/paths.js";
import { security, withSec } from "./modules/security.js";

const PORT = Number(process.env.MAGMA_PORT || 3100);
const clients = new Set();
const send = (ws, msg) => ws.readyState === 1 && ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
const broadcast = (msg) => { for (const ws of clients) try { send(ws, msg); } catch {} };

let timer;
const pushSnapshot = () => {
  clearTimeout(timer);
  timer = setTimeout(() => snapshot().then((s) => broadcast({ type: "snapshot", ...s })).catch(() => {}), 200);
};

async function pumpEvents() {
  for (;;) {
    try {
      const proc = Bun.spawn(["docker", "events", "--format", "{{json .}}"], { stdout: "pipe", stderr: "pipe" });
      const reader = proc.stdout.getReader(), dec = new TextDecoder();
      for (let buf = "";;) {
        const { value, done } = await reader.read();
        if (done) break;
        const parts = (buf + dec.decode(value, { stream: true })).split("\n");
        buf = parts.pop() || "";
        parts.some((l) => l.trim()) && pushSnapshot();
      }
      await proc.exited;
    } catch {}
    await Bun.sleep(1500);
  }
}
pumpEvents();

const html = { headers: { "Content-Type": "text/html; charset=utf-8", ...security } };
const server = serve({
  port: PORT, hostname: "0.0.0.0",
  async fetch(req, srv) {
    const url = new URL(req.url), p = url.pathname;
    return p === "/ws" ? (srv.upgrade(req) ? undefined : new Response("upgrade failed", { status: 500 }))
      : p.startsWith("/api/") ? withSec(await handleApi(req, url))
      : p.startsWith("/public/") ? (() => {
        const path = resolvePublic(p);
        return path ? withSec(new Response(Bun.file(path))) : withSec(new Response("Not Found", { status: 404 }));
      })()
      : req.method === "GET" && p === "/" ? new Response(Bun.file("./public/index.html"), html)
      : withSec(new Response("Not Found", { status: 404 }));
  },
  websocket: {
    open(ws) { clients.add(ws); send(ws, { type: "hello" }); pushSnapshot(); },
    message(ws, m) { try { JSON.parse(String(m)).type === "ping" && send(ws, { type: "pong" }); } catch {} },
    close(ws) { clients.delete(ws); },
  },
});

const ver = await docker(["version", "--format", "{{.Server.Version}}"]).then((r) => r.stdout.trim() || "?").catch(() => "?");
console.log(`\n  MAGMA v${VERSION} | http://0.0.0.0:${server.port} | docker ${ver}\n`);
