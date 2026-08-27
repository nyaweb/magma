const $ = id => document.getElementById(id);
const state = { view: "dashboard", hostId: localStorage.getItem("magma_host") || "local", hosts: [], eventSocket: null, terminalSocket: null, refreshController: null, refreshTimer: null };
const titles = { dashboard: "Overview", hosts: "Docker Hosts", containers: "Containers", images: "Images & Hub", compose: "Compose Projects", templates: "Runtime Templates", experiments: "Experiments" };

function h(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value ?? "";
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value != null && value !== false) node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) if (child != null) node.append(child.nodeType ? child : document.createTextNode(String(child)));
  return node;
}

const button = (text, onClick, kind = "") => h("button", { type: "button", class: `button ${kind}`, text, onClick });
const status = value => h("span", { class: `status ${String(value || "").toLowerCase()}`, text: value || "unknown" });
const empty = (title, copy) => h("div", { class: "empty" }, [h("strong", { text: title }), h("span", { text: copy })]);
const code = value => h("pre", { class: "code-output", text: value || "" });

async function api(path, options = {}) {
  const { headers = {}, ...init } = options;
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...headers } });
  let data;
  try { data = await response.json(); }
  catch (error) { if (error.name === "AbortError") throw error; data = { error: response.statusText }; }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function toast(message, error = false) {
  const node = $("toast"); node.textContent = message; node.className = error ? "show error" : "show";
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.className = "", 3500);
}

function content(...nodes) { if (state.refreshController?.automatic && !canAutoRefresh()) return false; $("content").replaceChildren(...nodes); return true; }
function loading() { content(h("div", { class: "loading-block", text: "Reading Docker state..." })); }
function toolbar(copy, actions = []) { return h("div", { class: "toolbar" }, [h("p", { class: "section-copy", text: copy }), h("div", { class: "toolbar-group" }, actions)]); }

function dataTable(columns, rows) {
  if (!rows.length) return empty("No resources", "Create or import a resource to begin.");
  const head = h("thead", {}, h("tr", {}, columns.map(column => h("th", { text: column.label }))));
  const body = h("tbody", {}, rows.map(row => h("tr", {}, columns.map(column => h("td", {}, column.render ? column.render(row) : String(row[column.key] ?? ""))))));
  return h("div", { class: "table-wrap" }, h("table", {}, [head, body]));
}

function field(label, name, options = {}) {
  const attrs = { name, id: `field-${name}`, placeholder: options.placeholder || "", required: options.required || false, disabled: options.disabled || false, min: options.min, max: options.max, step: options.step };
  let input;
  if (options.type === "textarea") input = h("textarea", { ...attrs, rows: options.rows || 6 });
  else if (options.type === "select") input = h("select", attrs, options.options.map(item => h("option", { value: item.value, text: item.label })));
  else input = h("input", { ...attrs, type: options.type || "text", value: options.value ?? "" });
  if (options.value != null && options.type === "textarea") input.value = options.value;
  return h("div", { class: `field ${options.full ? "full" : ""}` }, [h("label", { for: attrs.id, text: label }), input]);
}

function modal(title, fields, onSubmit, submitText = "Apply") {
  const dialog = $("modal"), body = $("modalBody"), form = h("form", { class: "form-grid" }, fields), operation = Symbol("modal-operation");
  const closeButton = $("modalClose"), cancelButton = button("Cancel", () => dialog.close());
  let submitting = false;
  dialog.operation = operation;
  const preventDismiss = event => { if (submitting && dialog.operation === operation) event.preventDefault(); };
  dialog.addEventListener("cancel", preventDismiss);
  dialog.addEventListener("close", () => { dialog.removeEventListener("cancel", preventDismiss); closeButton.disabled = false; }, { once: true });
  form.append(h("div", { class: "form-actions" }, [cancelButton, h("button", { type: "submit", class: "button primary", text: submitText })]));
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    const submit = form.querySelector("[type=submit]"); submit.disabled = true; cancelButton.disabled = true; closeButton.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form))); }
    catch (error) { let message = form.querySelector(".form-error"); if (!message) { message = h("p", { class: "form-error", role: "alert" }); form.prepend(message); } message.textContent = error.message; toast(error.message, true); submitting = false; submit.disabled = false; cancelButton.disabled = false; closeButton.disabled = false; return; }
    if (dialog.operation === operation) dialog.close();
    await refresh();
  });
  $("modalTitle").textContent = title; body.replaceChildren(form); if (!dialog.open) dialog.showModal();
}

function pendingModal(title, message) {
  const dialog = $("modal");
  if (dialog.open) return null;
  const operation = Symbol("pending-modal");
  dialog.operation = operation;
  $("modalTitle").textContent = title;
  $("modalBody").replaceChildren(h("div", { class: "loading-block", text: message }));
  dialog.showModal();
  return operation;
}

function displayModal(title, ...nodes) {
  const dialog = $("modal");
  if (dialog.open) return false;
  dialog.operation = null;
  $("modalTitle").textContent = title;
  $("modalBody").replaceChildren(...nodes);
  if (!dialog.open) dialog.showModal();
}

function updateResultModal(title, ...nodes) {
  const dialog = $("modal");
  if (!dialog.open || dialog.operation) return false;
  $("modalTitle").textContent = title;
  $("modalBody").replaceChildren(...nodes);
  return true;
}

function confirmAction(message, action) {
  modal("Confirm destructive operation", [h("p", { class: "field full section-copy", text: message }), field("Type DELETE", "confirm", { required: true, full: true })], async data => {
    if (data.confirm !== "DELETE") throw new Error("Confirmation must equal DELETE");
    await action();
  }, "Delete");
}

function parseEnv(value) {
  const text = String(value || "").trim();
  if (text.startsWith("{")) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Environment JSON must be an object");
    return parsed;
  }
  const env = {};
  for (const line of text.split(/\r?\n/)) { const index = line.indexOf("="); if (index > 0) env[line.slice(0, index).trim()] = line.slice(index + 1); }
  return env;
}

function parseCommand(value) {
  const text = String(value || "").trim();
  if (!text.startsWith("[")) return text;
  let command;
  try { command = JSON.parse(text); } catch { return text; }
  if (!Array.isArray(command) || command.some(item => typeof item !== "string")) throw new Error("Command JSON must be an array of strings");
  return command;
}

function parsePorts(value) {
  return String(value || "").split(/\r?\n|,/).map(item => item.trim()).filter(Boolean).map(item => {
    const [host, container] = item.includes(":") ? item.split(":") : ["", item];
    return { host, container: Number(container), protocol: "tcp" };
  });
}

async function loadHosts(options = {}) {
  const { automatic = false, ...requestOptions } = options, previousHost = state.hostId;
  const hosts = await api("/api/hosts", requestOptions);
  if (automatic && !canAutoRefresh()) return false;
  state.hosts = hosts;
  if (!state.hosts.some(host => host.id === state.hostId)) state.hostId = state.hosts[0]?.id || "local";
  if (state.hostId !== previousHost) { localStorage.setItem("magma_host", state.hostId); if (state.eventSocket) connectEvents(); }
  const select = $("hostSelect"); select.replaceChildren(...state.hosts.map(host => h("option", { value: host.id, text: `${host.name} · ${host.type}` })));
  select.value = state.hostId;
}

async function renderDashboard(options = {}) {
  const data = await api(`/api/dashboard?host=${encodeURIComponent(state.hostId)}`, options), s = data.summary;
  const metrics = h("div", { class: "metric-grid" }, [
    metric("Containers", s.containers, `${s.running} running`), metric("Images", s.images, "local cache"),
    metric("CPU", s.cpus, "logical cores"), metric("Memory", formatBytes(s.memory), s.operatingSystem),
  ]);
  const containerRows = data.containers.slice(0, 8), imageRows = data.images.slice(0, 8);
  const panels = h("div", { class: "panel-grid" }, [
    panel("Recent containers", dataTable([{ label: "Name", render: row => h("span", { text: row.name }) }, { label: "Image", render: row => h("span", { class: "muted", text: row.image }) }, { label: "State", render: row => status(row.state) }], containerRows)),
    panel("Available images", dataTable([{ label: "Repository", render: row => h("span", { text: `${row.repository}:${row.tag}` }) }, { label: "Size", render: row => h("span", { class: "muted", text: row.size }) }], imageRows)),
  ]);
  content(toolbar(`Docker ${s.dockerVersion} on ${s.operatingSystem}. Events update this view automatically.`), metrics, panels);
}

function metric(label, value, detail) { return h("article", { class: "metric" }, [h("label", { text: label }), h("strong", { text: value }), h("small", { text: detail })]); }
function panel(title, body) { return h("section", { class: "panel" }, [h("header", {}, h("h2", { text: title })), h("div", { class: "panel-body" }, body)]); }
function formatBytes(bytes) { const units = ["B", "KiB", "MiB", "GiB", "TiB"]; let value = Number(bytes || 0), i = 0; while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; } return `${value.toFixed(i ? 1 : 0)} ${units[i]}`; }

async function renderHosts() {
  const cards = state.hosts.map(host => h("article", { class: "resource-card" }, [
    h("h3", { text: host.name }), h("p", { text: host.type === "local" ? "Unix socket on this Magma node" : host.endpoint }),
    h("div", { class: "resource-meta" }, [h("span", { text: `ID ${host.id}` }), h("span", { text: host.type.toUpperCase() })]),
    h("div", { class: "actions" }, [button("Test", async () => { try { const result = await api(`/api/hosts/${host.id}/test`, { method: "POST", body: "{}" }); toast(`${result.name}: Docker ${result.serverVersion}`); } catch (e) { toast(e.message, true); } }, "success"), ...(host.id === "local" ? [] : [button("Delete", () => confirmAction(`Remove host ${host.name}?`, () => api(`/api/hosts/${host.id}`, { method: "DELETE" })), "danger")])]),
  ]));
  content(toolbar("Register Docker engines over SSH. Install the Magma public key before testing a remote host.", [button("Public key", showPublicKey), button("Add SSH host", addHost, "primary")]), h("div", { class: "card-list" }, cards));
}

function addHost() {
  modal("Add SSH Docker host", [field("Display name", "name", { required: true }), field("Hostname or IP", "hostname", { required: true }), field("SSH user", "user", { value: "root" }), field("SSH port", "port", { type: "number", value: 22 })], async data => {
    const target = { hostname: data.hostname, port: Number(data.port) };
    const scan = await api("/api/hosts/scan", { method: "POST", body: JSON.stringify(target) });
    const approved = window.confirm(`Verify these SSH fingerprints out of band before continuing:\n\n${scan.fingerprints.join("\n")}\n\nTrust this host?`);
    if (!approved) throw new Error("SSH host enrollment cancelled");
    return api("/api/hosts", { method: "POST", body: JSON.stringify({ type: "ssh", ...data, port: target.port, fingerprints: scan.fingerprints }) });
  }, "Scan and add host");
}
async function showPublicKey() { const view = state.view; try { const result = await api("/api/hosts/local/key"); if (state.view === view) displayModal("Magma SSH public key", h("p", { class: "section-copy", text: "Add this line to ~/.ssh/authorized_keys on each remote Docker host." }), code(result.publicKey)); } catch (e) { toast(e.message, true); } }

async function renderContainers(options = {}) {
  const hostId = state.hostId, rows = await api(`/api/hosts/${hostId}/containers`, options);
  const columns = [
    { label: "Name", render: row => h("strong", { text: row.name }) }, { label: "Image", render: row => h("span", { class: "truncate muted", text: row.image }) },
    { label: "State", render: row => status(row.state) }, { label: "Ports", render: row => h("span", { class: "muted", text: row.ports || "-" }) },
    { label: "Actions", render: row => h("div", { class: "actions" }, containerButtons(row, hostId)) },
  ];
  content(toolbar(`${rows.length} containers on ${hostId}.`, [button("Create container", () => createContainerForm(hostId), "primary")]), dataTable(columns, rows));
}

function containerButtons(row, hostId) {
  const run = async action => { try { await api(`/api/hosts/${hostId}/containers/${encodeURIComponent(row.id)}/action`, { method: "POST", body: JSON.stringify({ action }) }); toast(`${row.name}: ${action}`); await refresh(); } catch (e) { toast(e.message, true); } };
  const primary = row.state === "running" ? button("Stop", () => run("stop")) : row.state === "paused" ? button("Unpause", () => run("unpause"), "success") : button("Start", () => run("start"), "success");
  return [primary, button("Restart", () => run("restart")), button("Logs", () => showLogs(row, hostId)), ...(row.state === "running" ? [button("Terminal", () => openTerminal(row, hostId), "primary")] : []), button("Clone", () => cloneForm(row, hostId)), button("Delete", () => confirmAction(`Delete container ${row.name}?`, () => api(`/api/hosts/${hostId}/containers/${encodeURIComponent(row.id)}?force=true`, { method: "DELETE" })), "danger")];
}

function createContainerForm(hostId = state.hostId) {
  modal("Create container", [field("Name", "name", { required: true }), field("Image", "image", { required: true, placeholder: "oven/bun:1" }), field("Command", "command", { full: true, placeholder: "bun test" }), field("Environment JSON or KEY=value", "env", { type: "textarea", rows: 4 }), field("Ports host:container", "ports", { type: "textarea", rows: 4 }), field("Memory", "memory", { placeholder: "512m" }), field("CPUs", "cpus", { type: "number", value: 1, min: 0.05, step: 0.05 })], data => api(`/api/hosts/${hostId}/containers`, { method: "POST", body: JSON.stringify({ ...data, command: parseCommand(data.command), env: parseEnv(data.env), ports: parsePorts(data.ports), cpus: Number(data.cpus), start: true }) }), "Create");
}
function cloneForm(row, hostId) { modal(`Clone ${row.name}`, [field("Base name", "name", { value: `${row.name}-clone`, required: true }), field("Copies", "count", { type: "number", value: 1, min: 1, max: 100 })], data => api(`/api/hosts/${hostId}/containers/${encodeURIComponent(row.id)}/clone`, { method: "POST", body: JSON.stringify({ name: data.name, count: Number(data.count), start: true }) }), "Clone"); }
async function showLogs(row, hostId) { const view = state.view; try { const result = await api(`/api/hosts/${hostId}/containers/${encodeURIComponent(row.id)}/logs?tail=500`); if (state.view === view && state.hostId === hostId) displayModal(`Logs · ${row.name}`, code(result.logs)); } catch (e) { toast(e.message, true); } }

async function renderImages(options = {}) {
  const hostId = state.hostId, rows = await api(`/api/hosts/${hostId}/images`, options);
  const columns = [{ label: "Repository", render: row => h("strong", { text: `${row.repository}:${row.tag}` }) }, { label: "ID", render: row => h("span", { class: "mono muted", text: row.id.slice(7, 19) }) }, { label: "Size", render: row => h("span", { text: row.size }) }, { label: "Created", render: row => h("span", { class: "muted", text: row.created }) }, { label: "Actions", render: row => button("Remove", () => confirmAction(`Remove image ${row.repository}:${row.tag}?`, () => api(`/api/hosts/${hostId}/images/remove`, { method: "POST", body: JSON.stringify({ image: row.id, force: false }) })), "danger") }];
  const hub = h("div", { class: "panel", style: "margin-top:16px" }, [h("header", {}, h("h2", { text: "Docker Hub search" })), h("div", { class: "panel-body" }, [h("div", { class: "toolbar-group" }, [h("input", { id: "hubQuery", placeholder: "Search public images" }), button("Search", () => searchHub(hostId))]), h("div", { id: "hubResults", class: "card-list", style: "margin-top:14px" })])]);
  content(toolbar("Pull public images from Docker Hub or remove unused local layers.", [button("Pull image", () => pullImageForm("", hostId), "primary")]), dataTable(columns, rows), hub);
}
function pullImageForm(image = "", hostId = state.hostId) { modal("Pull Docker image", [field("Image and tag", "image", { required: true, value: image, placeholder: "oven/bun:1" })], data => api(`/api/hosts/${hostId}/images/pull`, { method: "POST", body: JSON.stringify(data) }), "Pull"); }
async function searchHub(hostId) { const target = $("hubResults"), request = Symbol("hub-search"), query = $("hubQuery").value; target.request = request; target.replaceChildren(h("span", { class: "muted", text: "Searching..." })); try { const rows = await api(`/api/hub/search?q=${encodeURIComponent(query)}`); if (!target.isConnected || target.request !== request) return; target.replaceChildren(...rows.map(item => h("article", { class: "resource-card" }, [h("h3", { text: item.name }), h("p", { text: item.description || "No description" }), h("div", { class: "actions" }, button("Pull", () => pullImageForm(`${item.name}:latest`, hostId), "primary"))]))); } catch (e) { if (target.isConnected && target.request === request) { target.replaceChildren(); toast(e.message, true); } } }

async function renderCompose(options = {}) {
  const hostId = state.hostId, projects = await api("/api/projects", options), rows = projects.filter(project => project.host_id === hostId);
  const cards = rows.map(project => h("article", { class: "resource-card" }, [h("h3", { text: project.name }), h("p", { text: `Project ${project.slug} · updated ${project.updated_at}` }), h("div", { class: "actions" }, [button("Edit", () => editProject(project)), button("Validate", () => composeAction(project, "validate")), button("Pull", () => composeAction(project, "pull")), button("Up", () => composeAction(project, "up"), "success"), button("Down", () => confirmAction(`Stop every service in Compose project ${project.name}?`, async () => { await api(`/api/projects/${project.id}/action`, { method: "POST", body: JSON.stringify({ action: "down" }) }); toast(`${project.name}: down`); }), "danger"), button("Delete", () => confirmAction(`Stop and delete Compose project ${project.name}?`, () => api(`/api/projects/${project.id}?down=true`, { method: "DELETE" })), "danger")]) ]));
  content(toolbar("Versioned Compose YAML for images and named volumes on the selected host.", [button("New project", () => editProject(null, hostId), "primary")]), rows.length ? h("div", { class: "card-list" }, cards) : empty("No Compose projects", "Create a portable image-based stack."));
}
function defaultCompose() { return `services:\n  app:\n    image: oven/bun:1\n    command: ["bun", "--version"]\n    labels:\n      io.magma.managed: "true"\n`; }
function editProject(project = null, hostId = state.hostId) { modal(project ? "Edit Compose project" : "New Compose project", [field("Name", "name", { required: true, value: project?.name || "" }), field(project ? "Magma namespace" : "Namespace suffix", "slug", { value: project?.slug || "", disabled: !!project }), field("Compose YAML", "yaml", { type: "textarea", rows: 18, full: true, value: project?.yaml || defaultCompose(), required: true })], data => api(project ? `/api/projects/${project.id}` : "/api/projects", { method: project ? "PUT" : "POST", body: JSON.stringify({ ...data, hostId }) }), project ? "Save revision" : "Create"); }
async function composeAction(project, action) { const view = state.view, hostId = state.hostId; try { const result = await api(`/api/projects/${project.id}/action`, { method: "POST", body: JSON.stringify({ action }) }); toast(`${project.name}: ${action}`); if (result.output && state.view === view && state.hostId === hostId) showOutput(`${project.name} · ${action}`, result.output); await refresh(); } catch (e) { toast(e.message, true); } }
function showOutput(title, output) { displayModal(title, code(output)); }

async function renderTemplates(options = {}) {
  const hostId = state.hostId, templates = (await api("/api/templates", options)).filter(item => item.host_id === hostId);
  const cards = templates.map(template => h("article", { class: "resource-card" }, [h("h3", { text: template.name }), h("p", { text: template.description || template.config.image }), h("div", { class: "resource-meta" }, [h("span", { text: template.config.image }), h("span", { text: template.config.cpus ? `${template.config.cpus} CPU` : "default CPU" })]), h("div", { class: "actions" }, [button("Instantiate", () => instantiate(template), "primary"), button("Edit", () => templateForm(template)), button("Delete", () => confirmAction(`Delete template ${template.name}?`, () => api(`/api/templates/${template.id}`, { method: "DELETE" })), "danger")]) ]));
  content(toolbar("Templates turn immutable images and runtime settings into repeatable replicas.", [button("New template", () => templateForm(null, hostId), "primary")]), templates.length ? h("div", { class: "card-list" }, cards) : empty("No templates", "Create a template before running experiments."));
}
function templateForm(template = null, hostId = state.hostId) { const c = template?.config || {}; modal(template ? "Edit template" : "New template", [field("Name", "name", { required: true, value: template?.name || "" }), field("Image", "image", { required: true, value: c.image || "oven/bun:1" }), field("Description", "description", { full: true, value: template?.description || "" }), field("Command JSON array or shell string", "command", { full: true, value: Array.isArray(c.command) ? JSON.stringify(c.command) : c.command || "" }), field("Environment JSON or KEY=value", "env", { type: "textarea", value: JSON.stringify(c.env || {}, null, 2) }), field("Memory", "memory", { value: c.memory || "" }), field("CPUs", "cpus", { type: "number", value: c.cpus ?? "", min: 0.05, step: 0.05 })], data => api(template ? `/api/templates/${template.id}` : "/api/templates", { method: template ? "PUT" : "POST", body: JSON.stringify({ hostId: template?.host_id || hostId, name: data.name, description: data.description, config: { ...c, image: data.image, command: parseCommand(data.command), env: parseEnv(data.env), memory: data.memory || undefined, cpus: data.cpus ? Number(data.cpus) : undefined } }) }), template ? "Save" : "Create"); }
function instantiate(template) { modal(`Instantiate ${template.name}`, [field("Base name", "name", { value: template.name }), field("Copies", "count", { type: "number", value: 1, min: 1, max: 100 })], data => api(`/api/templates/${template.id}/instantiate`, { method: "POST", body: JSON.stringify({ name: data.name, count: Number(data.count), start: true }) }), "Create replicas"); }

async function renderExperiments(options = {}) {
  const hostId = state.hostId, experiments = (await api("/api/experiments", options)).filter(item => item.host_id === hostId);
  const columns = [{ label: "Experiment", render: row => h("strong", { text: row.name }) }, { label: "Mode", render: row => h("span", { text: row.mode }) }, { label: "Status", render: row => status(row.status) }, { label: "Progress", render: row => h("div", {}, [h("span", { class: "muted", text: `${row.completed}/${row.total} · ${row.passed} passed` }), h("div", { class: "progress" }, h("span", { style: `width:${row.total ? row.completed / row.total * 100 : 0}%` }))]) }, { label: "Actions", render: row => h("div", { class: "actions" }, [button("Details", () => experimentDetail(row.id)), ...(["queued","running","cleanup_failed"].includes(row.status) ? [button("Cancel", () => cancelExperiment(row.id), "danger")] : [])]) }];
  content(toolbar("Run up to 500 isolated cases with controlled concurrency, logs, exit codes, and cleanup.", [button("New experiment", () => experimentForm(hostId), "primary")]), dataTable(columns, experiments));
}
async function experimentForm(hostId = state.hostId) { const operation = pendingModal("New experiment", "Loading templates..."); if (!operation) return; try { const templates = (await api("/api/templates")).filter(item => item.host_id === hostId); if ($("modal").operation !== operation || state.hostId !== hostId) return; if (!templates.length) { $("modal").close(); return toast("Create a template first", true); } modal("New experiment", [field("Name", "name", { required: true }), field("Template", "templateId", { type: "select", options: templates.map(item => ({ value: item.id, label: item.name })) }), field("Cases", "count", { type: "number", value: 10, min: 1, max: 500 }), field("Concurrency", "concurrency", { type: "number", value: 4, min: 1, max: 32 }), field("Mode", "mode", { type: "select", options: [{ value: "ephemeral", label: "Ephemeral cleanup" }, { value: "persistent", label: "Keep containers" }] }), field("Command per case", "command", { full: true, placeholder: "bun test" })], data => { const count = Math.max(1, Math.min(500, Math.floor(Number(data.count) || 1))); return api("/api/experiments", { method: "POST", body: JSON.stringify({ name: data.name, templateId: data.templateId, count, concurrency: Math.max(1, Math.min(32, Math.floor(Number(data.concurrency) || 1))), mode: data.mode, cases: Array.from({ length: count }, (_, i) => ({ name: `Case ${i + 1}`, ...(data.command ? { command: data.command } : {}) })) }) }); }, "Launch"); } catch (error) { if ($("modal").operation === operation) $("modal").close(); toast(error.message, true); } }
async function experimentDetail(id) { const view = state.view, hostId = state.hostId; try { const experiment = await api(`/api/experiments/${id}`); if (state.view !== view || state.hostId !== hostId) return; const details = () => [h("div", { class: "metric-grid" }, [metric("Total", experiment.total, experiment.mode), metric("Completed", experiment.completed, experiment.status), metric("Passed", experiment.passed, "exit 0"), metric("Failed", experiment.failed, "failed / cancelled")]), h("div", { class: "run-list" }, experiment.runs.map(run => h("button", { type: "button", class: "run-row", onClick: () => updateResultModal(`${run.name} output`, button("Back to experiment", () => updateResultModal(experiment.name, ...details())), code(run.output)) }, [h("span", { text: `#${run.case_index + 1}` }), h("span", { text: run.name }), status(run.status), h("span", { class: "muted", text: run.duration_ms == null ? "-" : `${run.duration_ms}ms` })])))]; displayModal(experiment.name, ...details()); } catch (e) { toast(e.message, true); } }
function cancelExperiment(id) { confirmAction("Stop this experiment and settle every active container?", async () => { await api(`/api/experiments/${id}/cancel`, { method: "POST", body: "{}" }); toast("Experiment cancelled"); }); }

function openTerminal(row, hostId = state.hostId) {
  const dialog = $("terminalModal"), target = $("terminal"); target.replaceChildren(); $("terminalTitle").textContent = `${row.name} · ${hostId}`; dialog.showModal();
  const term = new Terminal({ cursorBlink: true, screenReaderMode: true, fontFamily: "IBM Plex Mono, monospace", fontSize: 13, theme: { background: "#070808", foreground: "#e7e1d8", cursor: "#ff4d16", black: "#151719", red: "#ff5a5f", green: "#55d68b", yellow: "#f5c45b", blue: "#62a8ff", magenta: "#d66bff", cyan: "#54d4d0", white: "#ece7df" } });
  const fit = new FitAddon.FitAddon(); term.loadAddon(fit); term.open(target); fit.fit();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws/terminal?host=${encodeURIComponent(hostId)}&container=${encodeURIComponent(row.id)}&session=shared&name=Web`); state.terminalSocket = ws;
  let clientId = null, controlsTerminal = false, terminalExited = false;
  const updateTerminalState = message => {
    if (message.clientId != null) clientId = message.clientId;
    controlsTerminal = message.controllerId === clientId;
    term.options.disableStdin = !controlsTerminal;
    $("terminalState").textContent = `${message.clients?.length || 1} connected · ${controlsTerminal ? "you control" : "view only"}`;
    $("terminalControl").disabled = controlsTerminal;
    if (controlsTerminal && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
  };
  ws.onmessage = event => { try { const message = JSON.parse(event.data); if (message.type === "history" || message.type === "output") term.write(message.data || ""); if (message.type === "welcome" || message.type === "state") updateTerminalState(message); if (message.type === "error") term.writeln(`\r\n[Magma] ${message.message}`); if (message.type === "exit") { terminalExited = true; controlsTerminal = false; term.options.disableStdin = true; $("terminalState").textContent = `session exited · code ${message.code ?? "unknown"}`; $("terminalControl").disabled = true; } } catch { term.write(String(event.data)); } };
  ws.onopen = () => { fit.fit(); term.focus(); };
  ws.onclose = () => { if (state.terminalSocket === ws) { if (!terminalExited) $("terminalState").textContent = "session disconnected"; $("terminalControl").disabled = true; } };
  term.onData(data => controlsTerminal && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "input", data })));
  term.onBinary(data => controlsTerminal && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "binary", data: btoa(data) })));
  term.onResize(size => controlsTerminal && ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "resize", ...size })));
  const resize = () => fit.fit(); window.addEventListener("resize", resize, { passive: true }); dialog.addEventListener("close", () => { window.removeEventListener("resize", resize); ws.close(); term.dispose(); if (state.terminalSocket === ws) state.terminalSocket = null; }, { once: true });
}

const renderers = { dashboard: renderDashboard, hosts: renderHosts, containers: renderContainers, images: renderImages, compose: renderCompose, templates: renderTemplates, experiments: renderExperiments };
function canAutoRefresh() { const active = document.activeElement; return !$("modal").open && !$("terminalModal").open && (!active || active === document.body || active === $("content")); }
async function refresh({ automatic = false } = {}) {
  if (automatic && (state.refreshController || !canAutoRefresh())) return;
  state.refreshController?.abort();
  const controller = new AbortController(); controller.automatic = automatic;
  state.refreshController = controller;
  if (!automatic) loading();
  try { if (await loadHosts({ signal: controller.signal, automatic }) === false) return; await renderers[state.view]({ signal: controller.signal }); }
  catch (error) { if (error.name !== "AbortError" && state.refreshController === controller) { content(empty("Operation failed", error.message)); toast(error.message, true); } }
  finally { if (state.refreshController === controller) state.refreshController = null; }
}

function navigate(view) { state.view = renderers[view] ? view : "dashboard"; $("viewTitle").textContent = titles[state.view]; document.querySelectorAll("#nav a").forEach(link => link.classList.toggle("active", link.dataset.view === state.view)); setMenu(false); refresh(); }

function connectEvents() {
  state.eventSocket?.close();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:", ws = new WebSocket(`${protocol}//${location.host}/ws/events?host=${encodeURIComponent(state.hostId)}`); state.eventSocket = ws;
  ws.onopen = () => { if (state.eventSocket === ws) { $("eventPulse").classList.add("online"); $("eventState").textContent = "event stream online"; } };
  ws.onclose = () => { if (state.eventSocket === ws) { $("eventPulse").classList.remove("online"); $("eventState").textContent = "event stream offline"; setTimeout(() => state.eventSocket === ws && connectEvents(), 3000); } };
  let timer; ws.onmessage = event => { try { const message = JSON.parse(event.data); if (message.type === "docker_event") { clearTimeout(timer); timer = setTimeout(() => refresh({ automatic: true }), 600); } } catch {} };
}

$("hostSelect").addEventListener("change", event => { state.hostId = event.target.value; localStorage.setItem("magma_host", state.hostId); connectEvents(); refresh(); });
$("refreshButton").addEventListener("click", refresh);
function setMenu(open) { const sidebar = document.querySelector(".sidebar"), mobile = innerWidth <= 680; if (!open && sidebar.contains(document.activeElement)) $("content").focus(); sidebar.classList.toggle("open", open); document.body.classList.toggle("menu-open", mobile && open); $("menuButton").setAttribute("aria-expanded", String(open)); $("menuButton").setAttribute("aria-label", open ? "Close menu" : "Open menu"); sidebar.inert = mobile && !open; }
$("menuButton").addEventListener("click", () => { const open = !document.querySelector(".sidebar").classList.contains("open"); setMenu(open); if (open) document.querySelector("#nav a")?.focus(); });
$("nav").addEventListener("click", event => { const link = event.target.closest("a[data-view]"); if (link) { event.preventDefault(); if (location.hash === `#${link.dataset.view}`) navigate(link.dataset.view); else location.hash = link.dataset.view; } });
$("terminalClose").addEventListener("click", () => $("terminalModal").close());
$("terminalControl").addEventListener("click", () => { const ws = state.terminalSocket; if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "take_control" })); });
$("modalClose").addEventListener("click", () => $("modal").close());
$("modal").addEventListener("close", () => { $("modal").operation = null; });
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
window.addEventListener("resize", () => setMenu(innerWidth > 680 ? false : document.querySelector(".sidebar").classList.contains("open")), { passive: true });
document.addEventListener("keydown", event => { if (event.key === "Escape" && document.querySelector(".sidebar").classList.contains("open")) setMenu(false); });
document.addEventListener("click", event => { if (document.body.classList.contains("menu-open") && !event.target.closest(".sidebar") && !event.target.closest("#menuButton")) setMenu(false); });

async function bootstrap() {
  try { await loadHosts(); connectEvents(); setMenu(false); navigate(location.hash.slice(1) || "dashboard"); }
  catch (error) { content(empty("Magma is unavailable", error.message)); toast(error.message, true); setTimeout(bootstrap, 3000); }
}
setMenu(false);
await bootstrap();
state.refreshTimer = setInterval(() => { if (!document.hidden) refresh({ automatic: true }); }, 15_000);
