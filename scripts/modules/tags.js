export const peekSeq = (seq, base = "magma/snapshot") => `${base}:${(seq?.[base] || 0) + 1}`;

export const bumpSeq = (seq, base = "magma/snapshot") => {
  const next = { ...(seq || {}) };
  next[base] = (next[base] || 0) + 1;
  return { seq: next, tag: `${base}:${next[base]}` };
};

export const matchLineage = (entries, ref) =>
  (entries || []).filter((e) => [e.container, e.repository].includes(ref) || (ref && e.imageId?.startsWith(ref)));
