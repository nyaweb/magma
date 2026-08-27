import { db } from "./db.js";
import { createContainerBatch } from "./resources.js";
import { AppError, integerClamp, newId, now, parseJson, slug } from "./utils.js";

const hydrate = row => row ? { ...row, config: parseJson(row.config, {}) } : null;

export function listTemplates() {
  return db.query("SELECT * FROM templates ORDER BY updated_at DESC").all().map(hydrate);
}

export function getTemplate(id) {
  const template = hydrate(db.query("SELECT * FROM templates WHERE id=?").get(id));
  if (!template) throw new AppError("Template not found", 404);
  return template;
}

function validateConfig(value) {
  const config = value && typeof value === "object" ? value : {};
  if (!String(config.image || "").trim()) throw new AppError("Template image is required");
  return config;
}

export function createTemplate(body) {
  const id = newId(), timestamp = now(), config = validateConfig(body.config);
  db.query("INSERT INTO templates (id,host_id,name,description,config,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
    .run(id, String(body.hostId || "local"), String(body.name || config.image), String(body.description || ""), JSON.stringify(config), timestamp, timestamp);
  return getTemplate(id);
}

export function updateTemplate(id, body) {
  const current = getTemplate(id), config = validateConfig(body.config || current.config), timestamp = now();
  db.query("UPDATE templates SET host_id=?,name=?,description=?,config=?,updated_at=? WHERE id=?")
    .run(String(body.hostId || current.host_id), String(body.name || current.name), String(body.description ?? current.description), JSON.stringify(config), timestamp, id);
  return getTemplate(id);
}

export function deleteTemplate(id) {
  const used = db.query("SELECT COUNT(*) count FROM experiments WHERE template_id=?").get(id).count;
  if (used) throw new AppError("Template is used by experiments", 409);
  if (!db.query("DELETE FROM templates WHERE id=?").run(id).changes) throw new AppError("Template not found", 404);
}

export async function instantiateTemplate(id, body) {
  const template = getTemplate(id), count = integerClamp(body.count, 1, 100, 1), baseName = slug(body.name || template.name);
  const bodies = Array.from({ length: count }, (_, index) => ({
    ...template.config, ...body.overrides,
    name: `${baseName}-${String(index + 1).padStart(2, "0")}`,
    start: body.start !== false,
  }));
  return createContainerBatch(template.host_id, bodies, { "io.magma.template": id, "io.magma.persistent": "true" });
}
