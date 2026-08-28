import { SELF } from "./config.js";
import { joinRef, stripName } from "./names.js";

export const parseLabels = (raw) => {
  const out = {};
  for (const part of String(raw || "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
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
  return { id: i.ID, repository, tag, ref: joinRef(repository, tag), size: i.Size || "", dangling: repository === "<none>" || tag === "<none>", kind: "image" };
};
