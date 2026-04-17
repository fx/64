import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SnapshotStore } from "../src/server/lib/snapshot-store.ts";

function testDir() {
  return join(tmpdir(), `snapshot-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("SnapshotStore", () => {
  let dir: string;
  let indexPath: string;
  let dataDir: string;
  let store: SnapshotStore;

  beforeEach(() => {
    dir = testDir();
    mkdirSync(dir, { recursive: true });
    indexPath = join(dir, "snapshots.json");
    dataDir = join(dir, "snapshots");
    store = new SnapshotStore(indexPath, dataDir);
  });

  afterEach(() => {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("starts with empty list", () => {
    expect(store.list()).toEqual([]);
  });

  it("creates a snapshot with correct metadata", () => {
    const data = new Uint8Array(65536).fill(0x42);
    const snap = store.create("DEV1", "Test Snapshot", data);

    expect(snap.id).toBeDefined();
    expect(snap.deviceId).toBe("DEV1");
    expect(snap.name).toBe("Test Snapshot");
    expect(snap.size).toBe(65536);
    expect(snap.createdAt).toBeDefined();
  });

  it("lists snapshots for a device", () => {
    const data = new Uint8Array(65536).fill(0x00);
    store.create("DEV1", "Snap A", data);
    store.create("DEV2", "Snap B", data);
    store.create("DEV1", "Snap C", data);

    const dev1Snaps = store.list("DEV1");
    expect(dev1Snaps).toHaveLength(2);
    expect(dev1Snaps.map((s) => s.name).sort()).toEqual(["Snap A", "Snap C"]);

    const dev2Snaps = store.list("DEV2");
    expect(dev2Snaps).toHaveLength(1);
    expect(dev2Snaps[0].name).toBe("Snap B");
  });

  it("lists all snapshots when no deviceId filter", () => {
    const data = new Uint8Array(256).fill(0xFF);
    store.create("DEV1", "A", data);
    store.create("DEV2", "B", data);

    expect(store.list()).toHaveLength(2);
  });

  it("gets a snapshot by id", () => {
    const data = new Uint8Array(100).fill(0xAA);
    const snap = store.create("DEV1", "My Snap", data);

    const retrieved = store.get(snap.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("My Snap");
  });

  it("returns undefined for non-existent id", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("gets binary data for a snapshot", () => {
    const data = new Uint8Array(65536);
    data[0] = 0x12;
    data[100] = 0x34;
    data[65535] = 0x56;
    const snap = store.create("DEV1", "Binary Test", data);

    const retrieved = store.getData(snap.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.length).toBe(65536);
    expect(retrieved![0]).toBe(0x12);
    expect(retrieved![100]).toBe(0x34);
    expect(retrieved![65535]).toBe(0x56);
  });

  it("returns undefined data for non-existent id", () => {
    expect(store.getData("nonexistent")).toBeUndefined();
  });

  it("removes a snapshot and its binary data", () => {
    const data = new Uint8Array(256).fill(0xBB);
    const snap = store.create("DEV1", "To Delete", data);

    expect(store.get(snap.id)).toBeDefined();
    expect(store.getData(snap.id)).toBeDefined();

    const removed = store.remove(snap.id);
    expect(removed).toBe(true);
    expect(store.get(snap.id)).toBeUndefined();
    expect(store.getData(snap.id)).toBeUndefined();
  });

  it("returns false when removing non-existent snapshot", () => {
    expect(store.remove("nonexistent")).toBe(false);
  });

  it("persists snapshots across store instances", () => {
    const data = new Uint8Array(1024).fill(0xCC);
    const snap = store.create("DEV1", "Persistent", data);

    // Create a new store instance with same paths
    const store2 = new SnapshotStore(indexPath, dataDir);
    const retrieved = store2.get(snap.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Persistent");

    const binaryData = store2.getData(snap.id);
    expect(binaryData).toBeDefined();
    expect(binaryData!.length).toBe(1024);
    expect(binaryData![0]).toBe(0xCC);
  });

  it("handles corrupt index file gracefully", () => {
    // Write garbage to the index file
    const { writeFileSync } = require("node:fs");
    writeFileSync(indexPath, "not valid json {{{");

    // Should not throw, just start empty
    const store2 = new SnapshotStore(indexPath, dataDir);
    expect(store2.list()).toEqual([]);
  });

  it("creates directory structure if missing", () => {
    const newDir = join(dir, "nested", "deep");
    const newIndex = join(newDir, "index.json");
    const newData = join(newDir, "data");

    const store2 = new SnapshotStore(newIndex, newData);
    expect(store2.list()).toEqual([]);
    expect(existsSync(newDir)).toBe(true);
    expect(existsSync(newData)).toBe(true);
  });
});
