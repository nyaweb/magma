import { describe, expect, test } from "bun:test";
import { cap, joinRef, nextFreeNames, requireRef, safeName, slug, splitRef, stripName } from "../modules/names.js";
import { MAX_N } from "../modules/config.js";

describe("slug", () => {
  test("lowercases and dashes", () => expect(slug("Foo Bar")).toBe("foo-bar"));
  test("empty falls back", () => expect(slug("", "lab")).toBe("lab"));
  test("strips edges", () => expect(slug("--x--")).toBe("x"));
  test("keeps underscore", () => expect(slug("my_lab")).toBe("my_lab"));
});

describe("safeName", () => {
  test("keeps underscore", () => expect(safeName("My_Lab")).toBe("my_lab"));
  test("rejects junk", () => expect(() => safeName("???")).toThrow("inválido"));
  test("rejects empty", () => expect(() => safeName("")).toThrow("inválido"));
});

describe("cap", () => {
  test("default 1", () => expect(cap(undefined)).toBe(1));
  test("clamps to MAX_N", () => expect(cap(9999)).toBe(MAX_N));
  test("clamps floor", () => expect(cap(0)).toBe(1));
  test("keeps 3", () => expect(cap(3)).toBe(3));
});

describe("nextFreeNames", () => {
  test("fills holes", () => expect(nextFreeNames("tmp", 2, ["tmp-1"])).toEqual(["tmp-2", "tmp-3"]));
  test("starts at 1", () => expect(nextFreeNames("lab", 3, [])).toEqual(["lab-1", "lab-2", "lab-3"]));
  test("past a dense taken set", () => {
    const taken = Array.from({ length: 20 }, (_, i) => `lab-${i + 1}`);
    expect(nextFreeNames("lab", 2, taken)).toEqual(["lab-21", "lab-22"]);
  });
});

describe("requireRef", () => {
  test("ok", () => expect(requireRef(" lab ")).toBe("lab"));
  test("empty", () => expect(() => requireRef("")).toThrow("ref required"));
});

describe("stripName", () => {
  test("drops leading slash", () => expect(stripName("/magma")).toBe("magma"));
});

describe("splitRef", () => {
  test("repo:tag", () => expect(splitRef("debian:bookworm-slim")).toEqual({ repository: "debian", tag: "bookworm-slim" }));
  test("no tag", () => expect(splitRef("debian")).toEqual({ repository: "debian", tag: "<none>" }));
  test("join", () => expect(joinRef("debian", "12")).toBe("debian:12"));
  test("registry port", () => expect(splitRef("localhost:5000/foo")).toEqual({ repository: "localhost:5000/foo", tag: "<none>" }));
  test("registry port + tag", () => expect(splitRef("localhost:5000/foo:bar")).toEqual({ repository: "localhost:5000/foo", tag: "bar" }));
  test("digest", () => expect(splitRef("sha256:deadbeef")).toEqual({ repository: "sha256:deadbeef", tag: "<none>" }));
});
