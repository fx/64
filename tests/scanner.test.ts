import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { scanSubnet } from "../src/server/lib/scanner.ts";
import type { Device, DeviceEvent } from "../src/shared/types.ts";
import { onDeviceEvent } from "../src/server/lib/device-events.ts";

const originalFetch = globalThis.fetch;

function testDataPath() {
  return join(tmpdir(), `scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

describe("scanner", () => {
  let dataPath: string;
  let store: DeviceStore;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  describe("parseSubnet (via scanSubnet)", () => {
    it("rejects non-/24 subnets", async () => {
      globalThis.fetch = mock(async () => new Response("", { status: 404 })) as typeof fetch;

      await expect(scanSubnet("192.168.1.0/16", store)).rejects.toThrow("/24");
    });

    it("rejects invalid subnet format", async () => {
      globalThis.fetch = mock(async () => new Response("", { status: 404 })) as typeof fetch;

      await expect(scanSubnet("not-a-subnet", store)).rejects.toThrow("/24");
    });

    it("accepts valid /24 subnet", async () => {
      // All IPs timeout — should return empty
      globalThis.fetch = mock(async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch;

      const result = await scanSubnet("192.168.1.0/24", store, 80, 50, 50);
      expect(result).toEqual([]);
    });
  });

  describe("discovery", () => {
    it("discovers a new device and emits device:discovered", async () => {
      const targetIp = "192.168.1.42";
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        // Only respond to the target IP
        if (!url.includes(targetIp)) {
          throw new Error("ECONNREFUSED");
        }

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
              hostname: "MyC64",
              unique_id: "DEV42",
              errors: [],
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      const events: DeviceEvent[] = [];
      const unsub = onDeviceEvent((e) => events.push(e));

      const result = await scanSubnet("192.168.1.0/24", store, 80, 50, 50);

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("DEV42");
      expect(result[0]?.ip).toBe(targetIp);
      expect(result[0]?.product).toBe("Ultimate 64");

      // Should be in the store
      expect(store.get("DEV42")).toBeDefined();
      expect(store.get("DEV42")?.online).toBe(true);

      // Should emit device:discovered
      const discoverEvents = events.filter((e) => e.type === "device:discovered");
      expect(discoverEvents).toHaveLength(1);

      unsub();
    });

    it("re-discovers existing device and emits device:online", async () => {
      // Pre-populate an existing device
      store.upsert(makeDevice({ id: "DEV42", ip: "192.168.1.42", name: "Custom Name", password: "secret" }));

      const targetIp = "192.168.1.42";
      globalThis.fetch = mock(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (!url.includes(targetIp)) {
          throw new Error("ECONNREFUSED");
        }

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
              hostname: "DeviceHostname",
              unique_id: "DEV42",
              errors: [],
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        return new Response("Not found", { status: 404 });
      }) as typeof fetch;

      const events: DeviceEvent[] = [];
      const unsub = onDeviceEvent((e) => events.push(e));

      const result = await scanSubnet("192.168.1.0/24", store, 80, 50, 50);

      expect(result).toHaveLength(1);
      // Should preserve custom name and password
      expect(result[0]?.name).toBe("Custom Name");
      expect(store.get("DEV42")?.password).toBe("secret");

      // Should emit device:online (not discovered) since it already existed
      const onlineEvents = events.filter((e) => e.type === "device:online");
      expect(onlineEvents).toHaveLength(1);

      unsub();
    });

    it("returns empty when all IPs timeout", async () => {
      globalThis.fetch = mock(async () => {
        throw new DOMException("The operation was aborted", "AbortError");
      }) as typeof fetch;

      const result = await scanSubnet("192.168.1.0/24", store, 80, 50, 50);
      expect(result).toEqual([]);
    });

    it("handles version ok but info fail", async () => {
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

      const result = await scanSubnet("192.168.1.0/24", store, 80, 50, 50);
      // Info failed so no devices should be discovered
      expect(result).toEqual([]);
    });
  });
});
