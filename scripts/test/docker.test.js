import { describe, expect, test } from "bun:test";
import "./env.js";
import { join } from "node:path";
import { persistPrune, removeImage, runContainer, startContainer } from "../modules/docker.js";

describe("removeImage", () => {
  test("blocks protected magma images before docker rmi", async () => {
    await expect(removeImage("magma:1.4.0")).rejects.toThrow(/protegido/);
  });
});

test("runContainer blocks protected magma name before docker run", async () => {
  await expect(runContainer({ image: "debian:bookworm-slim", name: "magma" })).rejects.toThrow(/protegido/);
});

describe("startContainer", () => {
  test("blocks protected magma refs before docker start", async () => {
    await expect(startContainer("magma")).rejects.toThrow(/protegido/);
  });
});

describe("persistPrune", () => {
  test("prunes lineage inside locked writes", async () => {
    const lineage = join(process.env.MAGMA_DATA, "lineage.json");
    const keep = { container: "other", repository: "repo", imageId: "sha256:keep" };
    await Bun.write(lineage, JSON.stringify([{ container: "lab", repository: "repo", imageId: "sha256:match" }, keep]));
    await persistPrune("lab");
    expect(await Bun.file(lineage).json()).toEqual([keep]);
  });
});

