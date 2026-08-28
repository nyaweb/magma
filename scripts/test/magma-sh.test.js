import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("magma.sh", () => {
  test("help mentions ready", () => {
    const text = readFileSync(join(import.meta.dir, "..", "magma.sh"), "utf8");
    expect(text).toContain("magma.sh ping|ready|containers|images|stacks|");
  });

  test("ready case calls get ready", () => {
    const text = readFileSync(join(import.meta.dir, "..", "magma.sh"), "utf8");
    expect(text).toContain("ready) get ready ;;\n");
  });
});
