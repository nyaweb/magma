import { describe, expect, test } from "bun:test";
import { clamp, dockerIdentifier, dockerImage, integerClamp, originAllowed, parseJsonLines, slug, truncate } from "../modules/utils.js";

describe("utility helpers", () => {
  test("slug creates Docker-safe identifiers", () => {
    expect(slug("  Bun Experiment #100  ")).toBe("bun-experiment-100");
    expect(slug("***", "fallback")).toBe("fallback");
  });

  test("clamp enforces concurrency limits", () => {
    expect(clamp(100, 1, 32, 4)).toBe(32);
    expect(clamp("bad", 1, 32, 4)).toBe(4);
    expect(integerClamp(3.9, 1, 10, 1)).toBe(3);
  });

  test("JSON line parser ignores invalid records", () => {
    expect(parseJsonLines('{"id":1}\ninvalid\n{"id":2}\n')).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("truncate bounds operation output", () => {
    expect(truncate("abcdef", 3)).toContain("abc");
    expect(truncate("abc", 3)).toBe("abc");
  });

  test("Docker values reject option and path injection", () => {
    expect(dockerIdentifier("container_01")).toBe("container_01");
    expect(() => dockerIdentifier("../container")).toThrow("Invalid docker identifier");
    expect(dockerImage("oven/bun:1")).toBe("oven/bun:1");
    expect(() => dockerImage("--privileged")).toThrow("Invalid image reference");
  });

  test("browser origins must be same-origin or explicitly allowed", () => {
    expect(originAllowed(new Request("http://127.0.0.1:4000/api/health", { headers: { Origin: "http://127.0.0.1:4000" } }))).toBe(true);
    expect(originAllowed(new Request("http://magma.test/api/health", { headers: { Origin: "http://magma.test" } }))).toBe(false);
    expect(originAllowed(new Request("http://magma.test/api/health", { headers: { Origin: "https://evil.test" } }))).toBe(false);
    expect(originAllowed(new Request("http://magma.test/api/health", { headers: { Origin: "https://magma.test" } }), ["https://magma.test"])).toBe(true);
    expect(originAllowed(new Request("http://magma.test/api/health"))).toBe(true);
  });
});
