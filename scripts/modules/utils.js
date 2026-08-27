export class AppError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

export function slug(value, fallback = "resource") {
  const normalized = String(value || "").toLowerCase().trim()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return normalized || fallback;
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function readJson(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("Invalid JSON body");
  return body;
}

export function parseJson(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function parseJsonLines(value) {
  return String(value || "").split(/\r?\n/).filter(Boolean).map(line => parseJson(line)).filter(Boolean);
}

export function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export const integerClamp = (value, min, max, fallback) => Math.floor(clamp(value, min, max, fallback));

export function truncate(value, max) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

export function dockerIdentifier(value, label = "Docker identifier") {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,255}$/.test(text)) throw new AppError(`Invalid ${label.toLowerCase()}`);
  return text;
}

export function dockerImage(value) {
  const image = String(value || "").trim();
  if (!image || image.startsWith("-")) throw new AppError("Invalid image reference");
  return image;
}

export function originAllowed(req, allowed = []) {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin), target = new URL(req.url);
    const directAddress = source.hostname === target.hostname && (source.hostname === "localhost" || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(source.hostname) || source.hostname.includes(":"));
    return allowed.includes(origin) || directAddress && source.origin === target.origin;
  } catch {
    return false;
  }
}

export async function handleErrors(callback) {
  try {
    return await callback();
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    const message = error instanceof AppError ? error.message : "Internal server error";
    if (status === 500) console.error(error);
    return json({ error: message, details: error.details || undefined }, status);
  }
}
