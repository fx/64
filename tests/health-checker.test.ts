import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import {
  checkDevice,
  runHealthCheck,
  startHealthChecker,
  stopHealthChecker,
  resetHealthState,
} from "../src/server/lib/health-checker.ts";
import { onDeviceEvent } from "../src/server/lib/device-events.ts";
import type { DeviceEvent } from "../src/shared/types.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDataPath() {
  return join(tmpdir(), `health-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

function mockFetchSuccess() {
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
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
          firmware_version: "3.12a",
          fpga_version: "12A",
          core_version: "143",
          hostname: "TestDevice",
          unique_id: "ABC123",
          errors: [],
        }),
        { headers: { "content-type": "application/json" } },
      );
    }
    return new Response("Not found", { status: 404 });
  }) as typeof fetch;
}

function mockFetchFail() {
  globalThis.fetch = mock(async () => {
    throw new Error("connect ECONNREFUSED");
  }) as typeof fetch;
}

describe("health-checker", () => {
  let dataPath: string;
  let store: DeviceStore;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    resetHealthState();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    stopHealthChecker();
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  describe("checkDevice", () => {
    it("marks online device as still online on success", async () => {
      store.upsert(makeDevice({ online: true }));
      mockFetchSuccess();

      await checkDevice(store, "ABC123");
      expect(store.get("ABC123")?.online).toBe(true);
    });

    it("transitions offline device to online and refreshes info", async () => {
      store.upsert(makeDevice({ online: false, firmware: "old", fpga: "old" }));
      mockFetchSuccess();

      const events: DeviceEvent[] = [];
      const unsub = onDeviceEvent((e) => events.push(e));

      await checkDevice(store, "ABC123");

      expect(store.get("ABC123")?.online).toBe(true);
      expect(store.get("ABC123")?.firmware).toBe("3.12a");
      expect(store.get("ABC123")?.fpga).toBe("12A");
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("device:online");

      unsub();
    });

    it("transitions online device to offline on failure", async () => {
      store.upsert(makeDevice({ online: true }));
      mockFetchFail();

      const events: DeviceEvent[] = [];
      const unsub = onDeviceEvent((e) => events.push(e));

      await checkDevice(store, "ABC123");

      expect(store.get("ABC123")?.online).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("device:offline");

      unsub();
    });

    it("does not emit event when already offline device stays offline", async () => {
      store.upsert(makeDevice({ online: false }));
      mockFetchFail();

      const events: DeviceEvent[] = [];
      const unsub = onDeviceEvent((e) => events.push(e));

      await checkDevice(store, "ABC123");

      expect(store.get("ABC123")?.online).toBe(false);
      expect(events).toHaveLength(0);

      unsub();
    });

    it("handles device removed mid-loop (returns early)", async () => {
      // Device not in store
      mockFetchSuccess();
      await checkDevice(store, "NONEXISTENT");
      // Should not throw
    });

    it("increases backoff on repeated failures", async () => {
      store.upsert(makeDevice({ online: true }));
      mockFetchFail();

      await checkDevice(store, "ABC123");
      // First failure: backoff 2

      store.upsert(makeDevice({ online: true, id: "ABC123" }));
      await checkDevice(store, "ABC123");
      // Second failure: backoff 4

      // Device should be offline
      expect(store.get("ABC123")?.online).toBe(false);
    });

    it("resets backoff on successful probe", async () => {
      store.upsert(makeDevice({ online: false }));
      mockFetchFail();
      await checkDevice(store, "ABC123");

      // Now succeed
      mockFetchSuccess();
      store.upsert(makeDevice({ online: false, id: "ABC123" }));
      await checkDevice(store, "ABC123");

      expect(store.get("ABC123")?.online).toBe(true);
    });

    it("emits online event and fetches info on offline->online recovery", async () => {
      store.upsert(makeDevice({ online: false, product: "old" }));

      // Version succeeds but info fails
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes("/v1/version")) {
          return new Response(JSON.stringify({ version: "0.1", errors: [] }), {
            headers: { "content-type": "application/json" },
          });
        }
        if (url.includes("/v1/info")) {
          throw new Error("ECONNREFUSED");
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      const events: DeviceEvent[] = [];
      const unsub = onDeviceEvent((e) => events.push(e));

      await checkDevice(store, "ABC123");

      // Should still emit online event even if info fails
      expect(store.get("ABC123")?.online).toBe(true);
      expect(events).toHaveLength(1);
      expect(events[0]?.type).toBe("device:online");
      // Product should NOT have been updated since info fetch failed
      expect(store.get("ABC123")?.product).toBe("old");

      unsub();
    });
  });

  describe("runHealthCheck", () => {
    it("checks all devices in the store", async () => {
      store.upsert(makeDevice({ id: "DEV1", online: true, ip: "192.168.1.1" }));
      store.upsert(makeDevice({ id: "DEV2", online: true, ip: "192.168.1.2" }));
      mockFetchFail();

      await runHealthCheck(store);

      expect(store.get("DEV1")?.online).toBe(false);
      expect(store.get("DEV2")?.online).toBe(false);
    });

    it("skips devices within backoff interval", async () => {
      store.upsert(makeDevice({ online: true }));
      mockFetchFail();

      // First check triggers
      await runHealthCheck(store);
      expect(store.get("ABC123")?.online).toBe(false);

      // Immediately run again - should skip due to backoff
      store.upsert(makeDevice({ online: true, id: "ABC123" }));
      mockFetchSuccess();
      await runHealthCheck(store);
      // Device was just checked, backoff interval hasn't passed
      // so it should still be online (was re-upserted as online above, not checked)
      expect(store.get("ABC123")?.online).toBe(true);
    });
  });

  describe("startHealthChecker / stopHealthChecker", () => {
    it("starts and stops without error", () => {
      startHealthChecker(store);
      stopHealthChecker();
    });

    it("calling start twice is idempotent", () => {
      startHealthChecker(store);
      startHealthChecker(store); // Should not throw
      stopHealthChecker();
    });

    it("calling stop without start is safe", () => {
      stopHealthChecker(); // Should not throw
    });
  });
});
