import { describe, expect, test } from "bun:test";
import { assertPortableCompose, composeProjectSlug } from "../modules/projects.js";

describe("portable Compose validation", () => {
  test("isolates projects from user-selected Compose namespaces", () => {
    const first = composeProjectSlug("11111111-1111-4111-8111-111111111111", "magma");
    const second = composeProjectSlug("22222222-2222-4222-8222-222222222222", "magma");
    expect(first).not.toBe("magma");
    expect(first).not.toBe(second);
  });

  test("allows image services and named volumes", () => {
    expect(() => assertPortableCompose({ services: { app: { image: "oven/bun:1", volumes: [{ type: "volume", source: "data", target: "/data" }] } } })).not.toThrow();
  });

  test("rejects local build and file-backed resources", () => {
    expect(() => assertPortableCompose({ services: { app: { build: { context: "." } } } })).toThrow("unsupported build context");
    expect(() => assertPortableCompose({ services: { app: { image: "alpine" } }, secrets: { token: { file: "./token" } } })).toThrow("file-backed secret");
  });

  test("rejects host bind mounts", () => {
    expect(() => assertPortableCompose({ services: { app: { volumes: [{ type: "bind", source: "/srv/app", target: "/app" }] } } })).toThrow("host bind mount");
    expect(() => assertPortableCompose({ services: { app: { volumes: [{ type: "volume", source: "data", target: "/app" }] } }, volumes: { data: { driver_opts: { type: "none", o: "bind", device: "/srv/app" } } } })).toThrow("volume driver options");
  });
});
