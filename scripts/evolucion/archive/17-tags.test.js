import { describe, expect, test } from "bun:test";
import { bumpSeq, makeEntry, matchLineage, peekSeq, pruneLineage } from "../modules/tags.js";

describe("seq", () => {
  test("peek empty is :1", () => expect(peekSeq({}, "magma/snapshot")).toBe("magma/snapshot:1"));
  test("peek after 4 is :5", () => expect(peekSeq({ "magma/snapshot": 4 })).toBe("magma/snapshot:5"));
  test("bump does not mutate", () => {
    const seq = { "magma/slim": 1 };
    const { seq: next, tag } = bumpSeq(seq, "magma/slim");
    expect(tag).toBe("magma/slim:2");
    expect(seq["magma/slim"]).toBe(1);
    expect(next["magma/slim"]).toBe(2);
  });
});

describe("matchLineage", () => {
  const rows = [
    { container: "lab", repository: "magma/lab:1", imageId: "sha256:abcd1234" },
    { container: "other", repository: "magma/x:2", imageId: "sha256:ffff" },
  ];
  test("by container", () => expect(matchLineage(rows, "lab")).toHaveLength(1));
  test("by repo", () => expect(matchLineage(rows, "magma/x:2")).toHaveLength(1));
  test("by image prefix", () => expect(matchLineage(rows, "sha256:abcd")).toHaveLength(1));
  test("empty", () => expect(matchLineage(null, "lab")).toEqual([]));
});

describe("makeEntry", () => {
  test("fills message", () => {
    const e = makeEntry({ container: "lab", repository: "x:1", imageId: "sha256:aa" });
    expect(e.message).toBe("");
    expect(e.at).toMatch(/^\d{4}-/);
    expect(e.container).toBe("lab");
  });
});

describe("pruneLineage", () => {
  const rows = [
    { container: "lab", repository: "magma/lab:1", imageId: "sha256:abcd1234" },
    { container: "other", repository: "magma/x:2", imageId: "sha256:ffff" },
  ];
  test("removes matching container", () => expect(pruneLineage(rows, "lab")).toEqual([rows[1]]));
  test("no match keeps all", () => expect(pruneLineage(rows, "nomatch")).toEqual(rows));
  test("empty", () => expect(pruneLineage(null, "lab")).toEqual([]));
  test("prefix removes by imageId", () => expect(pruneLineage(rows, "sha256:abcd")).toEqual([rows[1]]));
});
