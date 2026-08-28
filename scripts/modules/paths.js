import { resolve } from "node:path";

export const resolvePublic = (urlPath, root = "public") => {
  const base = resolve(root);
  let rel = String(urlPath || "");
  try { rel = decodeURIComponent(rel); } catch { return null; }
  rel = rel.replace(/^\/public\/?/, "");
  if (!rel || rel.split(/[/\\]/).includes("..")) return null;
  const path = resolve(base, rel);
  if (path !== base && !path.startsWith(`${base}/`)) return null;
  return path;
};
