import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePublic } from "../modules/paths.js";

const root = mkdtempSync(join(tmpdir(), "magma-pub-"));
writeFileSync(join(root, "app.js"), "ok");

describe("resolvePublic", () => {
  test("ok", () => expect(resolvePublic("/public/app.js", root)).toBe(join(root, "app.js")));
  test("blocks ..", () => expect(resolvePublic("/public/../modules/api.js", root)).toBeNull());
  test("blocks encoded ..", () => expect(resolvePublic("/public/%2e%2e/secret", root)).toBeNull());
  test("empty", () => expect(resolvePublic("/public/", root)).toBeNull());
});
