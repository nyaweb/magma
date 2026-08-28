import { describe, expect, test } from "bun:test";
import "./env.js";
import { join } from "node:path";

const { renderTemplate, removeStack, writeStack } = await import("../modules/compose.js");

describe("renderTemplate", () => {
  test("plain service", () => {
    const y = renderTemplate({ service: "lab", image: "debian:bookworm-slim" });
    expect(y).toContain("container_name: lab");
    expect(y).toContain("image: debian:bookworm-slim");
    expect(y).not.toContain("dockerfile_inline");
  });
  test("bake inlines dockerfile", () => {
    const y = renderTemplate({ service: "slim", bake: true, image: "magma/slim:upgraded" });
    expect(y).toContain("dockerfile_inline");
    expect(y).toContain("FROM debian:bookworm-slim");
  });
  test("ports", () => {
    expect(renderTemplate({ service: "web", ports: ["8080:80"] })).toContain("8080:80");
  });
  test("sanitizes service key", () => {
    const y = renderTemplate({ service: "x:\n  evil", image: "debian:12" });
    expect(y).not.toMatch(/\n  evil/);
    expect(y).toContain("x-evil:");
  });
});

describe("removeStack", () => {
  test("prunes lineage for stack name without compose down", async () => {
    await writeStack({ name: "lab", yaml: "services:\n  app:\n    image: debian:bookworm-slim\n" });
    const lineage = join(process.env.MAGMA_DATA, "lineage.json");
    const distractor = { container: "other", repository: "repo", imageId: "sha256:distractor" };
    await Bun.write(lineage, JSON.stringify([{ container: "lab", repository: "repo", imageId: "sha256:match" }, distractor]));

    await removeStack("lab", { down: false });

    expect(await Bun.file(lineage).json()).toEqual([distractor]);
  });
});
