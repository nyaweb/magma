import { describe, expect, test } from "bun:test";
import { buildCreateArgs } from "../modules/resources.js";

describe("Docker create argument builder", () => {
  test("builds a managed container without shell interpolation", () => {
    const args = buildCreateArgs({
      image: "oven/bun:1",
      name: "Case 01",
      command: ["bun", "test"],
      env: { CASE_ID: "1" },
      ports: [{ host: 4101, container: 3000 }],
      memory: "512m",
      cpus: 1,
    }, { "io.magma.experiment": "exp-1" });
    expect(args).toEqual([
      "create", "--label", "io.magma.managed=true", "--name", "case-01",
      "--label", "io.magma.experiment=exp-1", "--env", "CASE_ID=1",
      "--publish", "4101:3000/tcp", "--memory", "512m", "--cpus", "1",
      "--", "oven/bun:1", "bun", "test",
    ]);
  });

  test("rejects invalid environment names", () => {
    expect(() => buildCreateArgs({ image: "alpine", env: { "BAD-NAME": "x" } })).toThrow("Invalid environment key");
  });

  test("wraps string commands in a shell explicitly", () => {
    expect(buildCreateArgs({ image: "alpine", command: "echo ok" }).slice(-4)).toEqual(["alpine", "/bin/sh", "-lc", "echo ok"]);
  });

  test("preserves advanced runtime options without moving them after the image", () => {
    const args = buildCreateArgs({ image: "alpine", entrypoint: ["/init", "--flag"], command: ["run"], user: "1000:1000", workdir: "/work", network: "container:abc123" });
    expect(args.slice(args.indexOf("--") + 1)).toEqual(["alpine", "--flag", "run"]);
    expect(args).toContain("--entrypoint");
    expect(args).toContain("1000:1000");
    expect(args).toContain("container:abc123");
  });

  test("rejects an image that would be parsed as a Docker option", () => {
    expect(() => buildCreateArgs({ image: "--privileged", command: ["alpine"] })).toThrow("Invalid image reference");
  });
});
