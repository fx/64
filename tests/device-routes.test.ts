import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { createDeviceRoutes } from "../src/server/routes/devices.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";

const DATA_PATH = "data/devices.json";

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

  beforeEach(() => {
    mkdirSync("data", { recursive: true });
    if (existsSync(DATA_PATH)) unlinkSync(DATA_PATH);
    store = new DeviceStore();
    const routes = createDeviceRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
    mockC64Fetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(DATA_PATH)) unlinkSync(DATA_PATH);
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
  });

  it("POST /api/devices returns 400 without ip", async () => {
    const res = await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
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

  it("GET /api/devices/:id returns device", async () => {
    await app.request("/api/devices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip: "192.168.1.42" }),
    });

    const res = await app.request("/api/devices/8D927F");
    expect(res.status).toBe(200);
    const device = await res.json();
    expect(device.id).toBe("8D927F");
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
});
