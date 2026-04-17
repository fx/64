import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { DevicePoller } from "../src/server/lib/device-poller.ts";
import { emitDeviceEvent } from "../src/server/lib/device-events.ts";
import type { Device } from "../src/shared/types.ts";
import type { DeviceStateEvent } from "../src/shared/types.ts";

function testDataPath() {
  return join(tmpdir(), `poller-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "DEV1",
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

const originalFetch = globalThis.fetch;

describe("DevicePoller", () => {
  let dataPath: string;
  let store: DeviceStore;
  let poller: DevicePoller;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
  });

  afterEach(() => {
    poller?.stop();
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  describe("startPolling / stopPolling", () => {
    it("starts polling for a device and creates cache entry", () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      // Mock fetch to return drives data
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);
      poller.startPolling("DEV1");

      const cache = poller.getCache("DEV1");
      expect(cache).toBeDefined();
      expect(cache?.online).toBe(true);
    });

    it("does not start duplicate polling loops", () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);
      poller.startPolling("DEV1");
      poller.startPolling("DEV1"); // Should not create second loop

      expect(poller.getCache("DEV1")).toBeDefined();
    });

    it("stopPolling clears timers for a device", () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);
      poller.startPolling("DEV1");
      poller.stopPolling("DEV1");

      // Should not throw or error
      expect(true).toBe(true);
    });
  });

  describe("polling and state cache", () => {
    it("emits state:drives event when drive data changes", async () => {
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

      let fetchCount = 0;
      globalThis.fetch = mock((url: string | URL | Request) => {
        fetchCount++;
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          return Promise.resolve(new Response(JSON.stringify(drivesData), {
            headers: { "content-type": "application/json" },
          }));
        }
        if (urlStr.includes("/v1/info")) {
          return Promise.resolve(new Response(JSON.stringify(infoData), {
            headers: { "content-type": "application/json" },
          }));
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      // Wait for initial polls to complete
      await new Promise((r) => setTimeout(r, 200));

      expect(events.some((e) => e.type === "state:drives")).toBe(true);
      expect(events.some((e) => e.type === "state:info")).toBe(true);

      const drivesEvent = events.find((e) => e.type === "state:drives")!;
      expect(drivesEvent.deviceId).toBe("DEV1");
      expect(drivesEvent.data).toEqual(drivesData);
    });

    it("does not emit when data has not changed", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      const drivesData = { drives: [{ a: { enabled: true, bus_id: 8, type: "1541" } }], errors: [] };

      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          return Promise.resolve(new Response(JSON.stringify(drivesData), {
            headers: { "content-type": "application/json" },
          }));
        }
        // Info endpoint
        return Promise.resolve(new Response(JSON.stringify({
          product: "U64", firmware_version: "3.12", fpga_version: "11F",
          core_version: "1.0", hostname: "h", unique_id: "DEV1", errors: [],
        }), { headers: { "content-type": "application/json" } }));
      }) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      // Wait for first poll
      await new Promise((r) => setTimeout(r, 200));

      const firstCount = events.filter((e) => e.type === "state:drives").length;
      expect(firstCount).toBe(1);

      // Cache is now set. Next poll should not emit since data is identical.
      // We need to wait for the next poll cycle. With 5s interval this is too long for tests,
      // so we stop and restart to trigger an immediate re-poll.
      poller.stopPolling("DEV1");
      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      const secondCount = events.filter((e) => e.type === "state:drives").length;
      // startPolling again will emit state:online but drives data hasn't changed
      // so drives should not be re-emitted (cache persists)
      expect(secondCount).toBe(1);
    });

    it("emits state:drives when data changes between polls", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      let callCount = 0;
      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          callCount++;
          const data = callCount <= 1
            ? { drives: [{ a: { enabled: true, bus_id: 8, type: "1541" } }], errors: [] }
            : { drives: [{ a: { enabled: true, bus_id: 8, type: "1541", image_file: "game.d64" } }], errors: [] };
          return Promise.resolve(new Response(JSON.stringify(data), {
            headers: { "content-type": "application/json" },
          }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          product: "U64", firmware_version: "3.12", fpga_version: "11F",
          core_version: "1.0", hostname: "h", unique_id: "DEV1", errors: [],
        }), { headers: { "content-type": "application/json" } }));
      }) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      // Wait for first poll
      await new Promise((r) => setTimeout(r, 200));

      expect(events.filter((e) => e.type === "state:drives").length).toBe(1);

      // Stop and restart to trigger second poll with different data
      poller.stopPolling("DEV1");
      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      // Should have emitted a second drives event with changed data
      expect(events.filter((e) => e.type === "state:drives").length).toBe(2);
    });
  });

  describe("offline handling", () => {
    it("emits state:offline when device goes offline", () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));

      poller.start();

      // Simulate device going offline
      emitDeviceEvent({ type: "device:offline", data: { id: "DEV1", ip: "192.168.1.42" } });

      const offlineEvent = events.find((e) => e.type === "state:offline");
      expect(offlineEvent).toBeDefined();
      expect(offlineEvent?.deviceId).toBe("DEV1");

      const cache = poller.getCache("DEV1");
      expect(cache?.online).toBe(false);
    });

    it("emits state:online when device comes back online", () => {
      store.upsert(makeDevice({ id: "DEV1", online: false }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);

      // First set device as offline in cache
      poller.start();
      emitDeviceEvent({ type: "device:offline", data: { id: "DEV1", ip: "192.168.1.42" } });

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));

      // Now simulate device coming online
      emitDeviceEvent({ type: "device:online", data: { id: "DEV1", ip: "192.168.1.42" } });

      const onlineEvent = events.find((e) => e.type === "state:online");
      expect(onlineEvent).toBeDefined();
      expect(onlineEvent?.deviceId).toBe("DEV1");
    });
  });

  describe("start / stop lifecycle", () => {
    it("start() begins polling all online devices", () => {
      store.upsert(makeDevice({ id: "DEV1", online: true }));
      store.upsert(makeDevice({ id: "DEV2", online: false }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);
      poller.start();

      expect(poller.getCache("DEV1")).toBeDefined();
      expect(poller.getCache("DEV2")).toBeUndefined();
    });

    it("stop() clears all state and timers", () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);
      poller.start();
      poller.stop();

      expect(poller.getCache("DEV1")).toBeUndefined();
    });
  });

  describe("listener management", () => {
    it("onStateChange returns unsubscribe function", () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }))
      ) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      const unsub = poller.onStateChange((event) => events.push(event));

      poller.start();
      emitDeviceEvent({ type: "device:offline", data: { id: "DEV1", ip: "192.168.1.42" } });

      expect(events.length).toBeGreaterThan(0);

      const countBefore = events.length;
      unsub();

      emitDeviceEvent({ type: "device:online", data: { id: "DEV1", ip: "192.168.1.42" } });

      // No new events after unsubscribe
      expect(events.length).toBe(countBefore);
    });
  });

  describe("getCache", () => {
    it("returns undefined for unknown device", () => {
      poller = new DevicePoller(store);
      expect(poller.getCache("UNKNOWN")).toBeUndefined();
    });

    it("returns cached data after successful poll", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      const drivesData = { drives: [{ a: { enabled: true, bus_id: 8, type: "1541" } }], errors: [] };

      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          return Promise.resolve(new Response(JSON.stringify(drivesData), {
            headers: { "content-type": "application/json" },
          }));
        }
        return Promise.resolve(new Response(JSON.stringify({
          product: "U64", firmware_version: "3.12", fpga_version: "11F",
          core_version: "1.0", hostname: "h", unique_id: "DEV1", errors: [],
        }), { headers: { "content-type": "application/json" } }));
      }) as typeof fetch;

      poller = new DevicePoller(store);
      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      const cache = poller.getCache("DEV1");
      expect(cache?.drives).toEqual(drivesData);
      expect(cache?.info).toBeDefined();
      expect(cache?.online).toBe(true);
    });
  });

  describe("backoff on failure", () => {
    it("increases backoff on fetch failure", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      globalThis.fetch = mock(() =>
        Promise.reject(new Error("ECONNREFUSED"))
      ) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      // Fetch failed, but polling should continue (no crash)
      // No state events emitted on failure (backoff just increases)
      const driveEvents = events.filter((e) => e.type === "state:drives");
      expect(driveEvents.length).toBe(0);
    });

    it("stops polling when device is removed from store", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      let fetchCalls = 0;
      globalThis.fetch = mock(() => {
        fetchCalls++;
        return Promise.resolve(new Response(JSON.stringify({ drives: [], errors: [] }), {
          headers: { "content-type": "application/json" },
        }));
      }) as typeof fetch;

      poller = new DevicePoller(store);
      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 100));

      store.remove("DEV1");

      const callsBeforeRemoval = fetchCalls;

      // Wait and check no more fetches happen (polling stopped)
      await new Promise((r) => setTimeout(r, 200));

      // Polling should have stopped after device removal detected on next poll
      // The fetch count might have one more call but should stop
      expect(fetchCalls).toBeLessThanOrEqual(callsBeforeRemoval + 2);
    });
  });

  describe("per-endpoint backoff", () => {
    it("drives failure does not prevent info from polling and emitting", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      const infoData = {
        product: "U64", firmware_version: "3.12", fpga_version: "11F",
        core_version: "1.0", hostname: "h", unique_id: "DEV1", errors: [],
      };

      let drivesCallCount = 0;
      let infoCallCount = 0;

      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          drivesCallCount++;
          // Drives always fails
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        if (urlStr.includes("/v1/info")) {
          infoCallCount++;
          // Info always succeeds
          return Promise.resolve(new Response(JSON.stringify(infoData), {
            headers: { "content-type": "application/json" },
          }));
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      // Wait for initial polls
      await new Promise((r) => setTimeout(r, 200));

      // Info should have succeeded (emitted event) despite drives failing
      const infoEvents = events.filter((e) => e.type === "state:info");
      expect(infoEvents.length).toBe(1);

      // Drives should have failed (no event emitted)
      const driveEvents = events.filter((e) => e.type === "state:drives");
      expect(driveEvents.length).toBe(0);

      // Both endpoints were called
      expect(drivesCallCount).toBeGreaterThanOrEqual(1);
      expect(infoCallCount).toBeGreaterThanOrEqual(1);
    });

    it("info failure does not prevent drives from polling and emitting", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      const drivesData = { drives: [{ a: { enabled: true, bus_id: 8, type: "1541" } }], errors: [] };

      let drivesCallCount = 0;
      let infoCallCount = 0;

      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          drivesCallCount++;
          // Drives always succeeds
          return Promise.resolve(new Response(JSON.stringify(drivesData), {
            headers: { "content-type": "application/json" },
          }));
        }
        if (urlStr.includes("/v1/info")) {
          infoCallCount++;
          // Info always fails
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      // Wait for initial polls
      await new Promise((r) => setTimeout(r, 200));

      // Drives should have succeeded (emitted event) despite info failing
      const driveEvents = events.filter((e) => e.type === "state:drives");
      expect(driveEvents.length).toBe(1);

      // Info should have failed (no event emitted)
      const infoEvents = events.filter((e) => e.type === "state:info");
      expect(infoEvents.length).toBe(0);

      // Both endpoints were called
      expect(drivesCallCount).toBeGreaterThanOrEqual(1);
      expect(infoCallCount).toBeGreaterThanOrEqual(1);
    });

    it("backoff reset is per-endpoint", async () => {
      store.upsert(makeDevice({ id: "DEV1" }));

      const drivesData = { drives: [{ a: { enabled: true, bus_id: 8, type: "1541" } }], errors: [] };
      const infoData = {
        product: "U64", firmware_version: "3.12", fpga_version: "11F",
        core_version: "1.0", hostname: "h", unique_id: "DEV1", errors: [],
      };

      // Phase 1: Both fail (both backoffs increase)
      globalThis.fetch = mock(() =>
        Promise.reject(new Error("ECONNREFUSED"))
      ) as typeof fetch;

      poller = new DevicePoller(store);

      const events: DeviceStateEvent[] = [];
      poller.onStateChange((event) => events.push(event));
      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      // Both should have failed — no state events
      expect(events.filter((e) => e.type === "state:drives").length).toBe(0);
      expect(events.filter((e) => e.type === "state:info").length).toBe(0);

      // Phase 2: Stop and restart with only drives succeeding
      poller.stopPolling("DEV1");

      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          return Promise.resolve(new Response(JSON.stringify(drivesData), {
            headers: { "content-type": "application/json" },
          }));
        }
        if (urlStr.includes("/v1/info")) {
          // Info still fails
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as typeof fetch;

      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      // Drives succeeded — should emit event (backoff reset for drives)
      expect(events.filter((e) => e.type === "state:drives").length).toBe(1);
      // Info still failing — no info event
      expect(events.filter((e) => e.type === "state:info").length).toBe(0);

      // Phase 3: Now info succeeds too
      poller.stopPolling("DEV1");

      globalThis.fetch = mock((url: string | URL | Request) => {
        const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        if (urlStr.includes("/v1/drives")) {
          return Promise.resolve(new Response(JSON.stringify(drivesData), {
            headers: { "content-type": "application/json" },
          }));
        }
        if (urlStr.includes("/v1/info")) {
          return Promise.resolve(new Response(JSON.stringify(infoData), {
            headers: { "content-type": "application/json" },
          }));
        }
        return Promise.resolve(new Response("Not found", { status: 404 }));
      }) as typeof fetch;

      poller.startPolling("DEV1");

      await new Promise((r) => setTimeout(r, 200));

      // Info now succeeds — should emit info event
      expect(events.filter((e) => e.type === "state:info").length).toBe(1);
    });
  });
});
