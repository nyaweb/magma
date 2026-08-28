import { describe, expect, test } from "bun:test";
import { asLabels, containerFromPs, imageFromList, isProtectedImageRef, isProtectedName, looksLikeImageId, parseLabels } from "../modules/protect.js";

describe("parseLabels", () => {
  test("empty", () => expect(parseLabels("")).toEqual({}));
  test("k=v list", () => expect(parseLabels("io.magma.protected=true,foo=bar")).toEqual({
    "io.magma.protected": "true", foo: "bar",
  }));
});

describe("asLabels", () => {
  test("object passthrough", () => expect(asLabels({ a: "1" })).toEqual({ a: "1" }));
  test("string", () => expect(asLabels("a=1")).toEqual({ a: "1" }));
  test("null", () => expect(asLabels(null)).toEqual({}));
});

describe("isProtectedName", () => {
  test("self", () => expect(isProtectedName("magma", {}, "magma")).toBe(true));
  test("slash self", () => expect(isProtectedName("/magma", {}, "magma")).toBe(true));
  test("label", () => expect(isProtectedName("other", { "io.magma.protected": "true" })).toBe(true));
  test("plain", () => expect(isProtectedName("lab", {})).toBe(false));
});

describe("containerFromPs", () => {
  test("maps running", () => {
    const c = containerFromPs({ ID: "abc", Names: "lab", Image: "debian", State: "running", Status: "Up", Labels: "" });
    expect(c).toMatchObject({ name: "lab", running: true, protected: false, kind: "container" });
  });
  test("flags protected", () => {
    const c = containerFromPs({ ID: "x", Names: "other", Image: "magma:1.4.0", State: "running", Labels: " io.magma.protected = true " });
    expect(c.protected).toBe(true);
  });
  test("inspect-style label object", () => {
    const c = containerFromPs({ ID: "x", Names: "x", Image: "d", State: "running", Labels: { "io.magma.protected": "true" } });
    expect(c.protected).toBe(true);
  });
});

describe("imageFromList", () => {
  test("builds ref", () => {
    expect(imageFromList({ ID: "1", Repository: "debian", Tag: "bookworm-slim" }).ref).toBe("debian:bookworm-slim");
  });
  test("dangling", () => {
    expect(imageFromList({ ID: "1", Repository: "<none>", Tag: "<none>" })).toMatchObject({ dangling: true, protected: false });
  });
  test("protects only magma repository", () => {
    expect(imageFromList({ ID: "1", Repository: "magma", Tag: "latest" }).protected).toBe(true);
    expect(imageFromList({ ID: "2", Repository: "magma/slim", Tag: "latest" }).protected).toBe(false);
  });
});

describe("isProtectedImageRef", () => {
  test("magma tag", () => expect(isProtectedImageRef("magma:1.4.0")).toBe(true));
  test("slim repo", () => expect(isProtectedImageRef("magma/slim:1.4.0")).toBe(false));
  test("digest prefix protected", () => expect(isProtectedImageRef("sha256:abcd", [{ id: "sha256:abcd9999", ref: "magma:1.4.0", protected: true }])).toBe(true));
  test("digest prefix debian", () => expect(isProtectedImageRef("sha256:abcd", [{ id: "sha256:abcd9999", ref: "debian:bookworm-slim", protected: false }])).toBe(false));
  test("slim stays false", () => expect(isProtectedImageRef("magma/slim:1")).toBe(false));
  test("short id matches sha256 id", () => expect(isProtectedImageRef("c2ade414e734", [
    { id: "sha256:c2ade414e734abcd9999", ref: "magma:1.4.0", protected: true },
  ])).toBe(true));
});

describe("looksLikeImageId", () => {
  test("sha256", () => expect(looksLikeImageId("sha256:abcd")).toBe(true));
  test("short hex", () => expect(looksLikeImageId("c2ade414e734")).toBe(true));
  test("repo tag is not an id", () => expect(looksLikeImageId("debian:bookworm-slim")).toBe(false));
  test("magma tag is not an id", () => expect(looksLikeImageId("magma:1.4.0")).toBe(false));
});
