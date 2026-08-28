import { describe, expect, test } from "bun:test";
import { lines } from "../modules/util.js";

describe("lines", () => {
  test("parses jsonl", () => {
    expect(lines('{"a":1}\n{"b":2}\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });
  test("skips junk", () => expect(lines("nope\n{\"ok\":true}\n")).toEqual([{ ok: true }]));
  test("empty", () => expect(lines("")).toEqual([]));
});
