import { describe, expect, test } from "bun:test";
import { withSec } from "../modules/security.js";

describe("withSec", () => {
  test("adds security headers to 404 responses", () => {
    const res = withSec(new Response("Not Found", { status: 404 }));
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
