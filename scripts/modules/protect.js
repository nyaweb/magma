import { SELF } from "./config.js";
import { joinRef, splitRef, stripName } from "./names.js";

export const parseLabels = (raw) => {
  const out = {};
  for (const part of String(raw || "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
};

export const asLabels = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  return parseLabels(raw);
};

export const isProtectedName = (name, labels = {}, self = SELF) =>
  labels["io.magma.protected"] === "true" || stripName(name) === self;

export const containerFromPs = (c, self = SELF) => {
  const name = stripName(c.Names || c.Name || "");
  return {
    id: c.ID, name, image: c.Image, status: c.Status, state: c.State,
    ports: c.Ports || "", running: String(c.State).toLowerCase() === "running",
    protected: isProtectedName(name, asLabels(c.Labels), self), kind: "container",
  };
};

export const imageFromList = (i) => {
  const repository = i.Repository || "<none>", tag = i.Tag || "<none>";
  return { id: i.ID, repository, tag, ref: joinRef(repository, tag), size: i.Size || "", dangling: repository === "<none>" || tag === "<none>", protected: repository === "magma", kind: "image" };
};

export const looksLikeImageId = (ref) => {
  const s = String(ref || "").trim();
  return /^sha256:[0-9a-f]+$/i.test(s) || /^[0-9a-f]{12,64}$/i.test(s);
};

export const isProtectedImageRef = (ref, images) => {
  if (splitRef(ref).repository === "magma") return true;
  if (!Array.isArray(images) || !images.length) return false;
  const s = String(ref || "");
  if (!s) return false;
  const bare = s.replace(/^sha256:/i, "");
  return images.some((i) => {
    if (!i.protected) return false;
    if (s === i.ref || s === i.id) return true;
    const idBare = String(i.id || "").replace(/^sha256:/i, "");
    if (!bare || !idBare) return false;
    return idBare.startsWith(bare) || (bare.length >= 12 && idBare.startsWith(bare.slice(0, idBare.length)));
  });
};
