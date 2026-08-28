import { describe, expect, test } from "bun:test";
import { APT, prepExec, recipe } from "../modules/recipe.js";

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
