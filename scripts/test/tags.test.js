import { describe, expect, test } from "bun:test";
import { bumpSeq, matchLineage, peekSeq } from "../modules/tags.js";

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
