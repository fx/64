import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import { cors } from "../src/server/middleware/cors.ts";

describe("CORS middleware", () => {
  const app = new Hono();
  app.use("/*", cors);
  app.get("/test", (c) => c.json({ ok: true }));
  app.post("/test", (c) => c.json({ ok: true }));

  it("OPTIONS preflight returns 204 with CORS headers", async () => {
    const res = await app.request("/test", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PUT");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-Password");
  });

  it("GET response includes CORS headers", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("X-Password");
  });

  it("POST response includes CORS headers", async () => {
    const res = await app.request("/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("X-Password is listed in Access-Control-Allow-Headers", async () => {
    const res = await app.request("/test", { method: "OPTIONS" });
    const allowedHeaders = res.headers.get("Access-Control-Allow-Headers") ?? "";
    expect(allowedHeaders).toContain("X-Password");
  });
});
