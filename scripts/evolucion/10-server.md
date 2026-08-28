# Ronda 10 — server

CHECK: `export const withSec`
FILES: `scripts/modules/security.js, scripts/server.js, scripts/test/security.test.js`

Ganador: **slot 01**.

```
STATUS: PASS
FILES: scripts/modules/security.js, scripts/server.js, scripts/test/security.test.js
SUMMARY: Moved the shared security headers and `withSec` helper into `scripts/modules/security.js`, updated `scripts/server.js` to import them and wrap both 404 responses with `withSec`, and added a direct unit test covering `withSec` on a 404 `Response` for the CSP and `X-Content-Type-Options` headers. `cd scripts && bun test ./test` passed with 93 tests.
```

### `scripts/modules/security.js` (ganador)

```js
export const security = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
};

export const withSec = (res) => { for (const [k, v] of Object.entries(security)) res.headers.set(k, v); return res; };
```

### `scripts/server.js` (ganador)

```js
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
```

### `scripts/test/security.test.js` (ganador)

```js
import { describe, expect, test } from "bun:test";
import { withSec } from "../modules/security.js";

describe("withSec", () => {
  test("adds security headers to 404 responses", () => {
    const res = withSec(new Response("Not Found", { status: 404 }));
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
```

## Score

```
slot	model	status	check	tested	beats	diff	plus	minus
01	openai/gpt-5.4-mini-fast	PASS	True	True	True	12	3	9
02	openai/gpt-5.4-mini	PASS	True	True	True	12	3	9
03	openai/gpt-5.4-fast	PASS	True	True	True	12	3	9
04	openai/gpt-5.4	PASS	True	True	True	12	3	9
05	openai/gpt-5.5-fast	PASS	True	True	True	12	3	9
06	openai/gpt-5.5	PASS	True	True	True	12	3	9
07	openai/gpt-5.6-luna-fast	PASS	True	True	True	12	3	9
08	openai/gpt-5.6-luna	PASS	True	True	True	12	3	9
09	openai/gpt-5.6-sol-fast	PASS	True	True	True	12	3	9
10	openai/gpt-5.6-sol	PASS	True	True	True	12	3	9
11	openai/gpt-5.6-terra-fast	PASS	True	True	True	12	3	9
12	openai/gpt-5.6-terra	PASS	True	True	True	12	3	9
13	openai/gpt-5.3-codex-spark	PASS	True	True	True	12	3	9
14	opencode/big-pickle	PASS	True	True	True	12	3	9
15	opencode/hy3-free	PASS	True	True	True	12	3	9
16	opencode/mimo-v2.5-free	PASS	True	True	True	12	3	9
17	opencode/muse-spark-1.2-contributor-free	PASS	True	True	True	12	3	9
18	opencode/nemotron-3-ultra-free	PASS	True	True	True	12	3	9
19	opencode/nemotron-3.5-lightning-free	NO_RESULT	False	False	False	0	0	0
```

## Prompt

```
You are competing on ONE Magma code change. Do not do other work.

Goal: 404 responses currently omit the CSP/security headers. API and /public/ files use withSec; the two `new Response("Not Found", { status: 404 })` paths do not.

Implement:
1. Move `security` and `withSec` from scripts/server.js into scripts/modules/security.js (export both). server.js imports them. Do not start a listener in the new module.
2. Both 404 responses in server.js must go through withSec.
3. bun tests in scripts/test/security.test.js: withSec on a 404 Response sets Content-Security-Policy and X-Content-Type-Options. Do NOT import scripts/server.js (it binds the port).
4. Keep existing tests green. Run: cd scripts && bun test ./test

Rules: smallest correct diff. No unrelated refactors, no new dependencies, no format-only churn.

When done write RESULT.md at the copy root with exactly:
STATUS: PASS or FAIL
FILES: comma-separated paths
SUMMARY: one paragraph, what you changed and bun test result.
```
