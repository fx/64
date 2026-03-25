import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createEventRoutes } from "../src/server/routes/events.ts";
import { emitDeviceEvent } from "../src/server/lib/device-events.ts";
import type { Device } from "../src/shared/types.ts";

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
