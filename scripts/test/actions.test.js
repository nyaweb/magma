import { describe, expect, test } from "bun:test";
import "./env.js";
import { pickCloneName } from "../modules/actions.js";

describe("pickCloneName", () => {
  test("free name stays", () => expect(pickCloneName("lab", [])).toBe("lab"));
  test("collision uses nextFreeNames", () => expect(pickCloneName("lab", ["lab"])).toBe("lab-1"));
  test("empty taken keeps wanted", () => expect(pickCloneName("lab", undefined)).toBe("lab"));
});
