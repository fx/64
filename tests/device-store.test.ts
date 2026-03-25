import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import type { Device } from "../src/shared/types.ts";

const DATA_PATH = "data/devices.json";

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

describe("DeviceStore", () => {
  beforeEach(() => {
    // Ensure data directory exists and clean up
    mkdirSync("data", { recursive: true });
    if (existsSync(DATA_PATH)) unlinkSync(DATA_PATH);
  });

  afterEach(() => {
    if (existsSync(DATA_PATH)) unlinkSync(DATA_PATH);
  });

  it("starts with empty list", () => {
    const store = new DeviceStore();
    expect(store.list()).toEqual([]);
  });

  it("upserts and retrieves a device", () => {
    const store = new DeviceStore();
    const device = makeDevice();
    store.upsert(device);
    expect(store.get("ABC123")).toEqual(device);
    expect(store.list()).toHaveLength(1);
  });

  it("deduplicates by id on upsert", () => {
    const store = new DeviceStore();
    store.upsert(makeDevice({ ip: "192.168.1.1" }));
    store.upsert(makeDevice({ ip: "192.168.1.2" }));
    expect(store.list()).toHaveLength(1);
    expect(store.get("ABC123")?.ip).toBe("192.168.1.2");
  });

  it("updates device fields", () => {
    const store = new DeviceStore();
    store.upsert(makeDevice());
    const updated = store.update("ABC123", { name: "My C64", ip: "10.0.0.1" });
    expect(updated?.name).toBe("My C64");
    expect(updated?.ip).toBe("10.0.0.1");
  });

  it("returns undefined when updating non-existent device", () => {
    const store = new DeviceStore();
    expect(store.update("NOPE", { name: "x" })).toBeUndefined();
  });

  it("removes a device", () => {
    const store = new DeviceStore();
    store.upsert(makeDevice());
    expect(store.remove("ABC123")).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove("ABC123")).toBe(false);
  });

  it("persists to disk and reloads", () => {
    const store1 = new DeviceStore();
    store1.upsert(makeDevice());

    // Create new store instance — should load from disk
    const store2 = new DeviceStore();
    expect(store2.list()).toHaveLength(1);
    expect(store2.get("ABC123")?.name).toBe("Test Device");
  });

  it("marks device online/offline", () => {
    const store = new DeviceStore();
    store.upsert(makeDevice({ online: true }));

    store.markOffline("ABC123");
    expect(store.get("ABC123")?.online).toBe(false);

    const now = new Date().toISOString();
    store.markOnline("ABC123", now);
    expect(store.get("ABC123")?.online).toBe(true);
    expect(store.get("ABC123")?.lastSeen).toBe(now);
  });

  it("checks has()", () => {
    const store = new DeviceStore();
    expect(store.has("ABC123")).toBe(false);
    store.upsert(makeDevice());
    expect(store.has("ABC123")).toBe(true);
  });
});
