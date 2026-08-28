import { describe, expect, test } from "bun:test";
import { containerFromPs, imageFromList, isProtectedName, parseLabels } from "../modules/protect.js";

describe("parseLabels", () => {
  test("empty", () => expect(parseLabels("")).toEqual({}));
  test("k=v list", () => expect(parseLabels("io.magma.protected=true,foo=bar")).toEqual({
    "io.magma.protected": "true", foo: "bar",
  }));
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
    const c = containerFromPs({ ID: "x", Names: "/magma", Image: "magma:1.4.0", State: "running", Labels: "io.magma.protected=true" });
    expect(c.protected).toBe(true);
  });
});

describe("imageFromList", () => {
  test("builds ref", () => {
    expect(imageFromList({ ID: "1", Repository: "debian", Tag: "bookworm-slim" }).ref).toBe("debian:bookworm-slim");
  });
  test("dangling", () => {
    expect(imageFromList({ ID: "1", Repository: "<none>", Tag: "<none>" }).dangling).toBe(true);
  });
});
