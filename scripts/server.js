import { serve } from "bun";
import { extname, resolve } from "node:path";
import { config } from "./modules/config.js";
import { db } from "./modules/db.js";
import { AppError, handleErrors, json, originAllowed, readJson } from "./modules/utils.js";
import { runDocker } from "./modules/docker.js";
import { createHost, deleteHost, listHosts, publicKey, scanHost, testHost } from "./modules/hosts.js";
import {
  assertContainerInteractive, cloneContainer, containerAction, containerLogs, createContainer, dashboard, listContainers,
  listImages, pullImage, removeContainer, removeImage, searchHub,
} from "./modules/resources.js";
import { createProject, deleteProject, getProject, listProjects, projectAction, updateProject } from "./modules/projects.js";
import { createTemplate, deleteTemplate, getTemplate, instantiateTemplate, listTemplates, updateTemplate } from "./modules/templates.js";
import { cancelExperiment, createExperiment, getExperiment, listExperiments, recoverExperiments } from "./modules/experiments.js";
import { closeTerminals, terminalClose, terminalMessage, terminalOpen } from "./modules/terminal.js";
import { eventsClose, eventsOpen } from "./modules/events.js";

const publicDir = resolve(import.meta.dir, "public");
let recoveryReady = false, recoveryError = null;
const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' ws: wss:; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function secure(response) {
  for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
  return response;
}

function match(path, pattern) {
  const result = path.match(pattern);
  return result ? result.slice(1).map(decodeURIComponent) : null;
}

async function api(req, url) {
  const path = url.pathname, method = req.method;
  if (method === "GET" && path === "/api/health") return json({ ok: true, version: "0.1.0", unsafePublic: config.unsafePublic, time: new Date().toISOString() });
  if (method === "GET" && path === "/api/ready") {
    if (!recoveryReady) throw new AppError(recoveryError ? "Experiment recovery failed" : "Experiment recovery is in progress", 503);
    db.query("SELECT 1 ready").get();
    const { stdout } = await runDocker("local", ["info", "--format", "{{json .ServerVersion}}"], { timeout: 4_000, maxOutput: 10_000 });
    return json({ ok: true, dockerVersion: JSON.parse(stdout), time: new Date().toISOString() });
  }
  if (!recoveryReady) throw new AppError("Magma is recovering interrupted experiments", 503);
  if (method === "GET" && path === "/api/dashboard") return json(await dashboard(url.searchParams.get("host") || "local"));
  if (method === "GET" && path === "/api/operations") return json(db.query("SELECT * FROM operations ORDER BY created_at DESC LIMIT 100").all());

  if (path === "/api/hosts" && method === "GET") return json(listHosts());
  if (path === "/api/hosts" && method === "POST") return json(await createHost(await readJson(req)), 201);
  if (path === "/api/hosts/scan" && method === "POST") return json(await scanHost(await readJson(req)));
  let params = match(path, /^\/api\/hosts\/([^/]+)\/key$/);
  if (params && method === "GET") return json(await publicKey());
  params = match(path, /^\/api\/hosts\/([^/]+)\/test$/);
  if (params && method === "POST") return json(await testHost(params[0]));
  params = match(path, /^\/api\/hosts\/([^/]+)$/);
  if (params && method === "DELETE") { await deleteHost(params[0]); return json({ ok: true }); }

  params = match(path, /^\/api\/hosts\/([^/]+)\/containers$/);
  if (params && method === "GET") return json(await listContainers(params[0]));
  if (params && method === "POST") return json(await createContainer(params[0], await readJson(req)), 201);
  params = match(path, /^\/api\/hosts\/([^/]+)\/containers\/([^/]+)\/logs$/);
  if (params && method === "GET") return json(await containerLogs(params[0], params[1], url.searchParams.get("tail")));
  params = match(path, /^\/api\/hosts\/([^/]+)\/containers\/([^/]+)\/action$/);
  if (params && method === "POST") { const body = await readJson(req); return json(await containerAction(params[0], params[1], body.action)); }
  params = match(path, /^\/api\/hosts\/([^/]+)\/containers\/([^/]+)\/clone$/);
  if (params && method === "POST") return json(await cloneContainer(params[0], params[1], await readJson(req)), 201);
  params = match(path, /^\/api\/hosts\/([^/]+)\/containers\/([^/]+)$/);
  if (params && method === "DELETE") { await removeContainer(params[0], params[1], url.searchParams.get("force") === "true"); return json({ ok: true }); }

  params = match(path, /^\/api\/hosts\/([^/]+)\/images$/);
  if (params && method === "GET") return json(await listImages(params[0]));
  params = match(path, /^\/api\/hosts\/([^/]+)\/images\/pull$/);
  if (params && method === "POST") { const body = await readJson(req); return json(await pullImage(params[0], body.image)); }
  params = match(path, /^\/api\/hosts\/([^/]+)\/images\/remove$/);
  if (params && method === "POST") { const body = await readJson(req); await removeImage(params[0], body.image, !!body.force); return json({ ok: true }); }
  if (path === "/api/hub/search" && method === "GET") return json(await searchHub(url.searchParams.get("q")));

  if (path === "/api/projects" && method === "GET") return json(listProjects());
  if (path === "/api/projects" && method === "POST") return json(await createProject(await readJson(req)), 201);
  params = match(path, /^\/api\/projects\/([^/]+)\/action$/);
  if (params && method === "POST") { const body = await readJson(req); return json(await projectAction(params[0], body.action)); }
  params = match(path, /^\/api\/projects\/([^/]+)$/);
  if (params && method === "GET") return json(getProject(params[0]));
  if (params && method === "PUT") return json(await updateProject(params[0], await readJson(req)));
  if (params && method === "DELETE") { await deleteProject(params[0], url.searchParams.get("down") !== "false"); return json({ ok: true }); }

  if (path === "/api/templates" && method === "GET") return json(listTemplates());
  if (path === "/api/templates" && method === "POST") return json(createTemplate(await readJson(req)), 201);
  params = match(path, /^\/api\/templates\/([^/]+)\/instantiate$/);
  if (params && method === "POST") return json(await instantiateTemplate(params[0], await readJson(req)), 201);
  params = match(path, /^\/api\/templates\/([^/]+)$/);
  if (params && method === "GET") return json(getTemplate(params[0]));
  if (params && method === "PUT") return json(updateTemplate(params[0], await readJson(req)));
  if (params && method === "DELETE") { deleteTemplate(params[0]); return json({ ok: true }); }

  if (path === "/api/experiments" && method === "GET") return json(listExperiments());
  if (path === "/api/experiments" && method === "POST") return json(createExperiment(await readJson(req)), 202);
  params = match(path, /^\/api\/experiments\/([^/]+)\/cancel$/);
  if (params && method === "POST") return json(await cancelExperiment(params[0]));
  params = match(path, /^\/api\/experiments\/([^/]+)$/);
  if (params && method === "GET") return json(getExperiment(params[0]));

  throw new AppError("API route not found", 404);
}

async function staticFile(pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const path = resolve(publicDir, relative);
  if (!path.startsWith(`${publicDir}/`) && path !== `${publicDir}/index.html`) return new Response("Not Found", { status: 404 });
  const file = Bun.file(path);
  if (!(await file.exists())) return pathname.includes(".") ? new Response("Not Found", { status: 404 }) : staticFile("/");
  return new Response(file, { headers: { "Content-Type": mime[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" } });
}

const server = serve({
  hostname: config.host,
  port: config.port,
  maxRequestBodySize: 2 * 1024 * 1024,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) server.timeout(req, 0);
    if (!originAllowed(req, config.allowedOrigins)) return secure(json({ error: "Cross-origin request denied" }, 403));
    if (url.pathname === "/ws/terminal") {
      const hostId = url.searchParams.get("host") || "local", containerId = url.searchParams.get("container");
      if (!containerId) return secure(json({ error: "container is required" }, 400));
      try { await assertContainerInteractive(hostId, containerId); }
      catch (error) { return secure(await handleErrors(() => { throw error; })); }
      const upgraded = server.upgrade(req, { data: { kind: "terminal", hostId, containerId, sessionId: url.searchParams.get("session") || "shared", name: url.searchParams.get("name") || "Web", shell: url.searchParams.get("shell") || "/bin/sh" } });
      return upgraded ? undefined : secure(json({ error: "WebSocket upgrade failed" }, 400));
    }
    if (url.pathname === "/ws/events") {
      const upgraded = server.upgrade(req, { data: { kind: "events", hostId: url.searchParams.get("host") || "local" } });
      return upgraded ? undefined : secure(json({ error: "WebSocket upgrade failed" }, 400));
    }
    if (url.pathname.startsWith("/api/")) return secure(await handleErrors(() => api(req, url)));
    if (req.method !== "GET" && req.method !== "HEAD") return secure(new Response("Method Not Allowed", { status: 405 }));
    return secure(await staticFile(url.pathname));
  },
  websocket: {
    maxPayloadLength: config.maxTerminalMessage + 1_024,
    backpressureLimit: config.maxWebSocketBackpressure,
    closeOnBackpressureLimit: true,
    open(ws) { try { ws.data.kind === "terminal" ? terminalOpen(ws) : eventsOpen(ws); } catch (error) { ws.send(JSON.stringify({ type: "error", message: error.message })); ws.close(); } },
    message(ws, message) { if (ws.data.kind === "terminal") terminalMessage(ws, message); },
    close(ws) { ws.data.kind === "terminal" ? terminalClose(ws) : eventsClose(ws); },
  },
});

recoverExperiments().then(() => { recoveryReady = true; recoveryError = null; }).catch(error => {
  recoveryError = error;
  console.error("Experiment recovery failed", error);
});

console.log(`Magma 0.1.0 listening on http://${server.hostname}:${server.port}`);
console.warn(config.unsafePublic ? "UNSAFE MODE: web authentication is disabled" : "Loopback-only mode: web authentication is disabled");

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  closeTerminals();
  server.stop(true);
  process.exit(0);
});
