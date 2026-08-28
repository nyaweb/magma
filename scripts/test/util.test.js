import { describe, expect, test } from "bun:test";
import { lines, locked } from "../modules/util.js";

describe("lines", () => {
  test("parses jsonl", () => {
    expect(lines('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  test("skips junk", () => expect(lines("nope\n{\"ok\":true}\n")).toEqual([{ ok: true }]));
  test("empty", () => expect(lines("")).toEqual([]));
});

describe("locked", () => {
  test("does not pass the error to the next job", async () => {
    const args = [];
    await locked(async (...a) => { args.push(a); throw new Error("x"); }).catch(() => {});
    await locked(async (...a) => { args.push(a); });
    expect(args[0]).toEqual([]);
    expect(args[1]).toEqual([]);
  });
  test("serializes", async () => {
    const order = [];
    const a = locked(async () => { await Bun.sleep(20); order.push(1); });
    const b = locked(async () => { order.push(2); });
    await Promise.all([a, b]);
    expect(order).toEqual([1, 2]);
  });
});
