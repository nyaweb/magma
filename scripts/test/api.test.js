import { describe, expect, test } from "bun:test";
import "./env.js";
import { handleApi } from "../modules/api.js";
import { VERSION } from "../modules/config.js";

const call = async (path, init = {}) => {
  const url = new URL(`http://magma.local${path}`);
  return handleApi(new Request(url, init), url);
};

const json = async (res) => ({ status: res.status, data: await res.json() });

describe("handleApi", () => {
  test("health", async () => {
    const { status, data } = await json(await call("/api/health"));
    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.name).toBe("magma");
    expect(data.version).toBe(VERSION);
    expect(data.maxN).toBeGreaterThan(0);
  });
  test("unknown 404", async () => {
    const { status, data } = await json(await call("/api/nope"));
    expect(status).toBe(404);
    expect(data.error).toBe("Not Found");
  });
  test("inspect requires ref", async () => {
    const { status, data } = await json(await call("/api/inspect"));
    expect(status).toBe(400);
    expect(data.error).toMatch(/ref/);
  });
  test("stop requires ref", async () => {
    const { status, data } = await json(await call("/api/containers/stop", { method: "POST", body: "{}" }));
    expect(status).toBe(400);
    expect(data.error).toMatch(/ref/);
  });
  test("stop invalid json", async () => {
    const { status, data } = await json(await call("/api/containers/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json" }));
    expect(status).toBe(400);
    expect(data.error).toMatch(/invalid json/i);
  });
  test("run requires image", async () => {
    const { status, data } = await json(await call("/api/containers/run", { method: "POST", body: "{}" }));
    expect(status).toBe(400);
    expect(data.error).toMatch(/image/);
  });
  test("stack junk name", async () => {
    const { status, data } = await json(await call("/api/stacks", { method: "POST", body: JSON.stringify({ name: "???" }) }));
    expect(status).toBe(400);
    expect(data.error).toMatch(/inválido/);
  });
  test("put not allowed", async () => {
    const { status, data } = await json(await call("/api/health", { method: "PUT" }));
    expect(status).toBe(405);
    expect(data.error).toMatch(/Method/);
  });
  test("evolve needs container", async () => {
    const { status, data } = await json(await call("/api/evolve", { method: "POST", body: "{}" }));
    expect(status).toBe(400);
    expect(data.error).toMatch(/container/);
  });
  test("template yaml", async () => {
    const { status, data } = await json(await call("/api/stacks/template", { method: "POST", body: JSON.stringify({ service: "lab2", image: "debian:bookworm-slim" }) }));
    expect(status).toBe(200);
    expect(data.yaml).toContain("lab2");
    expect(data.yaml).toContain("debian:bookworm-slim");
  });
});
