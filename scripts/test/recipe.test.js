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
  test("FROM first", () => expect(assertFrom("FROM debian\n")).toBe("FROM debian\n"));
  test("comment then FROM", () => expect(assertFrom("# comment\nFROM debian\n")).toBe("# comment\nFROM debian\n"));
  test("RUN then FROM rejects", () => expect(() => assertFrom("RUN echo\nFROM debian\n")).toThrow("FROM"));
  test("commented FROM rejects", () => expect(() => assertFrom("# FROM debian\n")).toThrow("FROM"));
  test("empty rejects", () => expect(() => assertFrom("")).toThrow("FROM"));
});
