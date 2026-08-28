import { describe, expect, test } from "bun:test";
import { ACTS, confirmRm } from "../public/js/acts.js";

describe("ACTS", () => {
  test("protected image has no rm", () => {
    expect(ACTS.image({ item: { protected: true } })).toEqual(["run", "spawn", "inspect"]);
  });

  test("plain image has rm", () => {
    expect(ACTS.image({ item: { protected: false } })).toEqual(["run", "spawn", "inspect", "rm"]);
  });

  test("protected container stays inspect-only", () => {
    expect(ACTS.container({ item: { protected: true, running: true } })).toEqual(["inspect"]);
  });
});

test("confirm rm", () => {
  expect(confirmRm(() => true)).toBe(true);
  expect(confirmRm(() => false)).toBe(false);
});
