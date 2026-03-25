import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDeviceRoutes } from "../src/server/routes/devices.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";

function testDataPath() {
  return join(tmpdir(), `devices-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

// Mock fetch for C64U API responses
const originalFetch = globalThis.fetch;

function mockC64Fetch() {
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (url.includes("/v1/version")) {
      return new Response(JSON.stringify({ version: "0.1", errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/v1/info")) {
      return new Response(
        JSON.stringify({
          product: "Ultimate 64",
          firmware_version: "3.12",
          fpga_version: "11F",
          core_version: "143",
          hostname: "TestDevice",
          unique_id: "8D927F",
          errors: [],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  }) as typeof fetch;
}

describe("Device Routes", () => {
  let app: Hono;
  let store: DeviceStore;
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    const routes = createDeviceRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
    mockC64Fetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("GET /api/devices returns empty list initially", async () => {
    const res = await app.request("/api/devices");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("POST /api/devices registers a device", async () => {
    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    expect(res.status).toBe(201);
    const device = await res.json();
    expect(device.id).toBe("8D927F");
    expect(device.product).toBe("Ultimate 64");
    expect(device.online).toBe(true);
    expect(device).not.toHaveProperty("password");
  });

  it("POST /api/devices returns 400 without ip", async () => {
    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/devices returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/devices rejects non-private IPs", async () => {
    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "8.8.8.8" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private");
  });

  it("POST /api/devices deduplicates by unique_id", async () => {
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.43" }),
    });

    const res = await app.request("/api/devices");
    const devices = await res.json();
    expect(devices).toHaveLength(1);
    expect(devices[0].ip).toBe("192.168.1.43");
  });

  it("GET /api/devices/:id returns device without password", async () => {
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42", password: "secret" }),
    });

    const res = await app.request("/api/devices/8D927F");
    expect(res.status).toBe(200);
    const device = await res.json();
    expect(device.id).toBe("8D927F");
    expect(device).not.toHaveProperty("password");
  });

  it("GET /api/devices/:id returns 404 for unknown", async () => {
    const res = await app.request("/api/devices/NOPE");
    expect(res.status).toBe(404);
  });

  it("PUT /api/devices/:id updates device", async () => {
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });

    const res = await app.request("/api/devices/8D927F", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "My C64" }),
    });
    expect(res.status).toBe(200);
    const device = await res.json();
    expect(device.name).toBe("My C64");
  });

  it("PUT /api/devices/:id returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/devices/8D927F", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/devices/:id removes device", async () => {
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });

    const res = await app.request("/api/devices/8D927F", { method: "DELETE" });
    expect(res.status).toBe(200);

    const listRes = await app.request("/api/devices");
    const devices = await listRes.json();
    expect(devices).toHaveLength(0);
  });

  it("DELETE /api/devices/:id returns 404 for unknown", async () => {
    const res = await app.request("/api/devices/NOPE", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST /api/devices/scan returns 400 without subnet", async () => {
    const res = await app.request("/api/devices/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/devices/scan returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/devices/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  // ── Error status mapping for POST /api/devices ──

  it("POST /api/devices returns 403 when version probe gets auth error", async () => {
    globalThis.fetch = mock(async () =>
      new Response("Forbidden", { status: 403 }),
    ) as typeof fetch;

    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Authentication");
  });

  it("POST /api/devices returns 504 when version probe times out", async () => {
    globalThis.fetch = mock(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as typeof fetch;

    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toContain("timeout");
  });

  it("POST /api/devices returns 502 when version probe gets network error", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;

    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    expect(res.status).toBe(502);
  });

  it("POST /api/devices returns 403 when info fetch gets auth error", async () => {
    // Version succeeds, but info returns 403
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/v1/version")) {
        return new Response(JSON.stringify({ version: "0.1", errors: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      // info returns 403
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Authentication");
  });

  it("POST /api/devices returns 504 when info fetch times out", async () => {
    let callCount = 0;
    globalThis.fetch = mock(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/v1/version")) {
        return new Response(JSON.stringify({ version: "0.1", errors: [] }), {
          headers: { "content-type": "application/json" },
        });
      }
      // info times out
      throw new DOMException("The operation was aborted", "AbortError");
    }) as typeof fetch;

    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });
    expect(res.status).toBe(504);
  });

  // ── PUT validation ──

  it("PUT /api/devices/:id returns 400 for non-private IP", async () => {
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });

    const res = await app.request("/api/devices/8D927F", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "8.8.8.8" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("private");
  });

  it("PUT /api/devices/:id returns 404 for non-existent device", async () => {
    const res = await app.request("/api/devices/NONEXISTENT", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  // ── Scan error handling ──

  it("POST /api/devices/scan returns 400 for invalid subnet format", async () => {
    const res = await app.request("/api/devices/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subnet: "not-a-subnet" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("/24");
  });

  it("POST /api/devices/scan returns discovered devices on success", async () => {
    // All IPs will fail except none - empty result
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const res = await app.request("/api/devices/scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subnet: "192.168.1.0/24" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.discovered).toEqual([]);
  });
});
