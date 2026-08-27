import { describe, expect, test } from "bun:test";
import { runProcess } from "../modules/docker.js";

describe("bounded process execution", () => {
  test("drains output while retaining only the configured limit", async () => {
    const result = await runProcess(["/bin/sh", "-lc", "printf 1234567890abcdef"], { maxOutput: 10 });
    expect(result.stdout).toStartWith("1234567890");
    expect(result.stdout).toContain("[truncated]");
  });

  test("terminates commands after their deadline", async () => {
    await expect(runProcess(["/bin/sh", "-lc", "sleep 5"], { timeout: 20 })).rejects.toMatchObject({ status: 504 });
  });
});
