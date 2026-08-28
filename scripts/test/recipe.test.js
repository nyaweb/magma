import { describe, expect, test } from "bun:test";
import { APT, assertFrom, prepExec, recipe } from "../modules/recipe.js";

describe("prepExec", () => {
  test("apt alias", () => expect(prepExec("apt")).toBe(APT));
  test("true alias", () => expect(prepExec(true)).toBe(APT));
  test("custom", () => expect(prepExec("echo hi")).toBe("echo hi"));
  test("empty", () => expect(prepExec("")).toBe(""));
  test("missing", () => expect(prepExec(undefined)).toBe(""));
});

describe("recipe", () => {
  test("default from slim", () => {
    const df = recipe();
    expect(df.startsWith("FROM debian:bookworm-slim")).toBe(true);
    expect(df).toContain("CMD [\"sleep\", \"infinity\"]");
  });
});

describe("assertFrom", () => {
  test("ok", () => expect(assertFrom("FROM debian\n")).toBe("FROM debian\n"));
  test("rejects", () => expect(() => assertFrom("RUN echo")).toThrow("FROM"));
});
