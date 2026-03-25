import { describe, it, expect } from "bun:test";
import { Hono } from "hono";
import health from "../src/server/routes/health.ts";

describe("GET /api/health", () => {
  const app = new Hono().basePath("/api").route("/", health);

  it("returns { status: 'ok' }", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  it("returns application/json content type", async () => {
    const res = await app.request("/api/health");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
