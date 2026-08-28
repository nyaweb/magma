import { describe, expect, test } from "bun:test";
import { renderTemplate } from "../modules/compose.js";

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
});
