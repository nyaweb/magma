import { describe, expect, test } from "bun:test";
import "./env.js";
import { removeImage } from "../modules/docker.js";

describe("removeImage", () => {
  test("blocks protected magma images before docker rmi", async () => {
    await expect(removeImage("magma:1.4.0")).rejects.toThrow(/protegido/);
  });
});
