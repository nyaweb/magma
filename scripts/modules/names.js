import { MAX_N } from "./config.js";

export const cap = (n) => Math.min(MAX_N, Math.max(1, Number(n) || 1));

export const slug = (s, fb = "lab") => String(s || fb).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fb;

export const safeName = (name) => {
  const n = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!n) throw new Error("nombre de stack inválido");
  return n;
};

export const nextFreeNames = (prefix, n, taken = []) => {
  const base = slug(prefix), want = cap(n), out = [];
  const used = new Set(taken);
  for (let i = 1; out.length < want && i < want + used.size + 2; i++) {
    const name = `${base}-${i}`;
    if (used.has(name)) continue;
    used.add(name);
    out.push(name);
  }
  return out;
};

export const stripName = (name) => String(name || "").replace(/^\//, "");

export const splitRef = (ref) => {
  const s = String(ref || "").trim();
  const i = s.lastIndexOf(":");
  if (i <= 0) return { repository: s || "<none>", tag: "<none>" };
  return { repository: s.slice(0, i), tag: s.slice(i + 1) };
};

export const joinRef = (repository, tag) => `${repository || "<none>"}:${tag || "<none>"}`;
