import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DeviceStore, toPublicDevice } from "../src/server/lib/device-store.ts";
import type { Device } from "../src/shared/types.ts";

function testDataPath() {
  return join(tmpdir(), `devices-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

describe("DeviceStore", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("starts with empty list", () => {
    const store = new DeviceStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("upserts and retrieves a device", () => {
    const store = new DeviceStore(dataPath);
    const device = makeDevice();
    store.upsert(device);
    expect(store.get("ABC123")).toEqual(device);
    expect(store.list()).toHaveLength(1);
  });

  it("deduplicates by id on upsert", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice({ ip: "192.168.1.1" }));
    store.upsert(makeDevice({ ip: "192.168.1.2" }));
    expect(store.list()).toHaveLength(1);
    expect(store.get("ABC123")?.ip).toBe("192.168.1.2");
  });

  it("updates device fields", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice());
    const updated = store.update("ABC123", { name: "My C64", ip: "10.0.0.1" });
    expect(updated?.name).toBe("My C64");
    expect(updated?.ip).toBe("10.0.0.1");
  });

  it("returns undefined when updating non-existent device", () => {
    const store = new DeviceStore(dataPath);
    expect(store.update("NOPE", { name: "x" })).toBeUndefined();
  });

  it("removes a device", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice());
    expect(store.remove("ABC123")).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.remove("ABC123")).toBe(false);
  });

  it("persists to disk and reloads", () => {
    const store1 = new DeviceStore(dataPath);
    store1.upsert(makeDevice());

    const store2 = new DeviceStore(dataPath);
    expect(store2.list()).toHaveLength(1);
    expect(store2.get("ABC123")?.name).toBe("Test Device");
  });

  it("marks device online/offline", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice({ online: true }));

    store.markOffline("ABC123");
    expect(store.get("ABC123")?.online).toBe(false);

    const now = new Date().toISOString();
    store.markOnline("ABC123", now);
    expect(store.get("ABC123")?.online).toBe(true);
    expect(store.get("ABC123")?.lastSeen).toBe(now);
  });

  it("checks has()", () => {
    const store = new DeviceStore(dataPath);
    expect(store.has("ABC123")).toBe(false);
    store.upsert(makeDevice());
    expect(store.has("ABC123")).toBe(true);
  });
});

describe("DeviceStore.updateDeviceInfo", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("updates product, firmware, and fpga fields", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice({ product: "Old", firmware: "1.0", fpga: "01" }));
    store.updateDeviceInfo("ABC123", { product: "Ultimate 64", firmware: "3.12", fpga: "11F" });

    const device = store.get("ABC123");
    expect(device?.product).toBe("Ultimate 64");
    expect(device?.firmware).toBe("3.12");
    expect(device?.fpga).toBe("11F");
  });

  it("updates name when provided", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice());
    store.updateDeviceInfo("ABC123", { product: "X", firmware: "Y", fpga: "Z", name: "New Name" });

    expect(store.get("ABC123")?.name).toBe("New Name");
  });

  it("does not update name when not provided", () => {
    const store = new DeviceStore(dataPath);
    store.upsert(makeDevice({ name: "Original" }));
    store.updateDeviceInfo("ABC123", { product: "X", firmware: "Y", fpga: "Z" });

    expect(store.get("ABC123")?.name).toBe("Original");
  });

  it("does nothing for non-existent device", () => {
    const store = new DeviceStore(dataPath);
    // Should not throw
    store.updateDeviceInfo("NONEXISTENT", { product: "X", firmware: "Y", fpga: "Z" });
    expect(store.get("NONEXISTENT")).toBeUndefined();
  });

  it("persists info changes to disk", () => {
    const store1 = new DeviceStore(dataPath);
    store1.upsert(makeDevice());
    store1.updateDeviceInfo("ABC123", { product: "New Product", firmware: "4.0", fpga: "22A" });

    const store2 = new DeviceStore(dataPath);
    const device = store2.get("ABC123");
    expect(device?.product).toBe("New Product");
    expect(device?.firmware).toBe("4.0");
    expect(device?.fpga).toBe("22A");
  });
});

describe("toPublicDevice", () => {
  it("strips password from device", () => {
    const device = makeDevice({ password: "secret123" });
    const pub = toPublicDevice(device);
    expect(pub).not.toHaveProperty("password");
    expect(pub.id).toBe("ABC123");
  });
});
