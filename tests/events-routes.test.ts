import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { DevicePoller } from "../src/server/lib/device-poller.ts";
import { createEventRoutes } from "../src/server/routes/events.ts";
import { emitDeviceEvent } from "../src/server/lib/device-events.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDataPath() {
  return join(tmpdir(), `events-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "ABC123",
    name: "Test Device",
    ip: "192.168.1.42",
    port: 80,
    product: "Ultimate 64",
    firmware: "3.12",
    fpga: "11F",
    online: true,
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

/** Read SSE stream with a timeout — aborts after ms and returns what was collected */
async function readSSE(res: Response, timeoutMs = 200): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";

  const timeout = setTimeout(() => reader.cancel(), timeoutMs);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
  } catch {
    // reader.cancel() causes an error — expected
  } finally {
    clearTimeout(timeout);
  }
  return result;
}

describe("Event Routes (SSE)", () => {
  let dataPath: string;
  let store: DeviceStore;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    const routes = createEventRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("returns text/event-stream content type", async () => {
    const res = await app.request("/api/events/devices");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    // Cancel the stream to avoid hanging
    if (res.body) res.body.cancel();
  });

  it("sends initial snapshot events for existing devices", async () => {
    store.upsert(makeDevice({ id: "DEV1", online: true }));
    store.upsert(makeDevice({ id: "DEV2", online: false }));

    const res = await app.request("/api/events/devices");
    const body = await readSSE(res);

    // Should contain events for both devices
    expect(body).toContain("event: device:online");
    expect(body).toContain("event: device:offline");
    expect(body).toContain("DEV1");
    expect(body).toContain("DEV2");
  });

  it("includes event IDs in SSE format", async () => {
    store.upsert(makeDevice({ id: "DEV1", online: true }));

    const res = await app.request("/api/events/devices");
    const body = await readSSE(res);

    expect(body).toContain("id: 0");
  });

  it("forwards live events emitted after connection", async () => {
    const res = await app.request("/api/events/devices");

    // Emit a live event shortly after connection
    setTimeout(() => {
      emitDeviceEvent({
        type: "device:discovered",
        data: { id: "LIVE1", ip: "192.168.1.99", product: "Ultimate II+" },
      });
    }, 50);

    const body = await readSSE(res, 300);

    expect(body).toContain("event: device:discovered");
    expect(body).toContain("LIVE1");
  });
});

describe("Per-Device SSE Stream", () => {
  let dataPath: string;
  let store: DeviceStore;
  let poller: DevicePoller;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
        headers: { "content-type": "application/json" },
      }))
    ) as typeof fetch;

    poller = new DevicePoller(store);
    const routes = createEventRoutes(store, poller);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    poller.stop();
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("returns 404 for unknown device", async () => {
    const res = await app.request("/api/events/devices/UNKNOWN");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Device not found");
  });

  it("returns text/event-stream for known device", async () => {
    store.upsert(makeDevice({ id: "DEV1" }));

    const res = await app.request("/api/events/devices/DEV1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    if (res.body) res.body.cancel();
  });

  it("sends cached state as initial events", async () => {
    store.upsert(makeDevice({ id: "DEV1" }));

    const drivesData = { drives: [{ a: { enabled: true, bus_id: 8, type: "1541" } }], errors: [] };
    const infoData = {
      product: "Ultimate 64",
      firmware_version: "3.12",
      fpga_version: "11F",
      core_version: "1.0",
      hostname: "test",
      unique_id: "DEV1",
      errors: [],
    };

    globalThis.fetch = mock((url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("/v1/drives")) {
        return Promise.resolve(new Response(JSON.stringify(drivesData), {
          headers: { "content-type": "application/json" },
        }));
      }
      return Promise.resolve(new Response(JSON.stringify(infoData), {
        headers: { "content-type": "application/json" },
      }));
    }) as typeof fetch;

    // Start polling and wait for cache to populate
    poller.startPolling("DEV1");
    await new Promise((r) => setTimeout(r, 200));

    // Now connect to the per-device SSE stream
    const res = await app.request("/api/events/devices/DEV1");
    const body = await readSSE(res, 200);

    expect(body).toContain("event: drives");
    expect(body).toContain("event: info");
    expect(body).toContain("1541");
  });

  it("streams live state changes for the specific device", async () => {
    store.upsert(makeDevice({ id: "DEV1" }));
    store.upsert(makeDevice({ id: "DEV2" }));

    const res = await app.request("/api/events/devices/DEV1");

    // Emit a device event for DEV1 after connection
    setTimeout(() => {
      emitDeviceEvent({
        type: "device:offline",
        data: { id: "DEV1", ip: "192.168.1.42" },
      });
    }, 50);

    const body = await readSSE(res, 300);

    expect(body).toContain("event: offline");
    expect(body).toContain("DEV1");
  });

  it("does not receive events for other devices", async () => {
    store.upsert(makeDevice({ id: "DEV1" }));
    store.upsert(makeDevice({ id: "DEV2" }));

    const res = await app.request("/api/events/devices/DEV1");

    // Emit event for DEV2 only
    setTimeout(() => {
      emitDeviceEvent({
        type: "device:offline",
        data: { id: "DEV2", ip: "192.168.1.43" },
      });
    }, 50);

    const body = await readSSE(res, 300);

    // Should NOT contain DEV2 events
    expect(body).not.toContain("DEV2");
  });

  it("forwards poller state events for the device", async () => {
    store.upsert(makeDevice({ id: "DEV1" }));

    const res = await app.request("/api/events/devices/DEV1");

    // Trigger poller state event by simulating offline
    setTimeout(() => {
      poller.start();
      emitDeviceEvent({
        type: "device:offline",
        data: { id: "DEV1", ip: "192.168.1.42" },
      });
    }, 50);

    const body = await readSSE(res, 300);

    // The poller emits state:offline which gets mapped to "offline" SSE event
    expect(body).toContain("event: offline");
  });
});

describe("Global SSE with Poller State Events", () => {
  let dataPath: string;
  let store: DeviceStore;
  let poller: DevicePoller;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);

    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
        headers: { "content-type": "application/json" },
      }))
    ) as typeof fetch;

    poller = new DevicePoller(store);
    const routes = createEventRoutes(store, poller);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    poller.stop();
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("global stream receives poller state change events", async () => {
    store.upsert(makeDevice({ id: "DEV1" }));

    const res = await app.request("/api/events/devices");

    // Trigger state event through poller
    setTimeout(() => {
      poller.start();
      emitDeviceEvent({
        type: "device:offline",
        data: { id: "DEV1", ip: "192.168.1.42" },
      });
    }, 50);

    const body = await readSSE(res, 300);

    // Global stream should include both the device:offline event
    // and the state:offline event from the poller
    expect(body).toContain("event: device:offline");
    expect(body).toContain("event: state:offline");
  });

  it("backward compatible: works without poller", async () => {
    // Recreate routes without poller
    const routes = createEventRoutes(store);
    const appNoPoller = new Hono().basePath("/api").route("/", routes);

    store.upsert(makeDevice({ id: "DEV1", online: true }));

    const res = await appNoPoller.request("/api/events/devices");
    const body = await readSSE(res);

    expect(body).toContain("event: device:online");
    expect(body).toContain("DEV1");
  });
});
