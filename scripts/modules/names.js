import { MAX_N } from "./config.js";

export const cap = (n) => Math.min(MAX_N, Math.max(1, Number(n) || 1));

export const slug = (s, fb = "lab") => String(s || fb).toLowerCase().replace(/[^a-z0-9_]+/g, "-").replace(/^-|-$/g, "") || fb;

export const requireRef = (ref) => {
  const n = String(ref || "").trim();
  if (!n) throw new Error("ref required");
  return n;
};

export const safeName = (name) => {
  const n = String(name || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!n) throw new Error("nombre de stack inválido");
  return n;
};

export const nextFreeNames = (prefix, n, taken = []) => {
  const base = slug(prefix), want = cap(n), out = [];
  const used = new Set(taken.map((name) => String(name || "").toLowerCase()));
  for (let i = 1; out.length < want; i++) {
    if (i > 10_000) throw new Error("no hay nombres libres");
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
  if (!s) return { repository: "<none>", tag: "<none>" };
  if (/^sha256:[0-9a-f]+$/i.test(s)) return { repository: s, tag: "<none>" };
  const slash = s.lastIndexOf("/"), colon = s.lastIndexOf(":");
  if (colon <= 0 || colon < slash) return { repository: s, tag: "<none>" };
  return { repository: s.slice(0, colon), tag: s.slice(colon + 1) };
};

export const joinRef = (repository, tag) => `${repository || "<none>"}:${tag || "<none>"}`;
