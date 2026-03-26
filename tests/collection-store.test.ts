import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CollectionStore } from "../src/server/lib/collection-store.ts";
import type { DiskEntry } from "../src/shared/types.ts";

function testDataPath() {
  return join(tmpdir(), `collections-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeDisks(count = 2): DiskEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    slot: i,
    label: `Disk ${i + 1}`,
    path: `/USB0/Games/game/disk${i + 1}.d64`,
    drive: "a" as const,
  }));
}

describe("CollectionStore", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("starts with empty list", () => {
    const store = new CollectionStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("creates a collection with generated id and timestamps", () => {
    const store = new CollectionStore(dataPath);
    const disks = makeDisks();
    const collection = store.create({ name: "Maniac Mansion", disks });

    expect(collection.id).toBeDefined();
    expect(collection.name).toBe("Maniac Mansion");
    expect(collection.disks).toEqual(disks);
    expect(collection.createdAt).toBeDefined();
    expect(collection.updatedAt).toBeDefined();
    expect(collection.description).toBeUndefined();
  });

  it("creates a collection with description", () => {
    const store = new CollectionStore(dataPath);
    const collection = store.create({
      name: "Ultima IV",
      description: "Classic RPG",
      disks: makeDisks(4),
    });

    expect(collection.description).toBe("Classic RPG");
    expect(collection.disks).toHaveLength(4);
  });

  it("lists all collections", () => {
    const store = new CollectionStore(dataPath);
    store.create({ name: "Game 1", disks: makeDisks() });
    store.create({ name: "Game 2", disks: makeDisks() });

    expect(store.list()).toHaveLength(2);
  });

  it("gets collection by id", () => {
    const store = new CollectionStore(dataPath);
    const created = store.create({ name: "Test", disks: makeDisks() });

    const retrieved = store.get(created.id);
    expect(retrieved).toEqual(created);
  });

  it("returns undefined for non-existent id", () => {
    const store = new CollectionStore(dataPath);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("updates collection name", () => {
    const store = new CollectionStore(dataPath);
    const created = store.create({ name: "Old Name", disks: makeDisks() });

    const updated = store.update(created.id, { name: "New Name" });
    expect(updated?.name).toBe("New Name");
    // updatedAt is refreshed (may be same ms, just verify it's a valid ISO string)
    expect(updated?.updatedAt).toBeDefined();
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.createdAt).getTime(),
    );
  });

  it("updates collection description", () => {
    const store = new CollectionStore(dataPath);
    const created = store.create({ name: "Game", disks: makeDisks() });

    const updated = store.update(created.id, { description: "A great game" });
    expect(updated?.description).toBe("A great game");
  });

  it("updates collection disks", () => {
    const store = new CollectionStore(dataPath);
    const created = store.create({ name: "Game", disks: makeDisks(2) });

    const newDisks = makeDisks(3);
    const updated = store.update(created.id, { disks: newDisks });
    expect(updated?.disks).toHaveLength(3);
  });

  it("returns undefined when updating non-existent collection", () => {
    const store = new CollectionStore(dataPath);
    expect(store.update("nonexistent", { name: "x" })).toBeUndefined();
  });

  it("removes a collection", () => {
    const store = new CollectionStore(dataPath);
    const created = store.create({ name: "Game", disks: makeDisks() });

    expect(store.remove(created.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.get(created.id)).toBeUndefined();
  });

  it("returns false when removing non-existent collection", () => {
    const store = new CollectionStore(dataPath);
    expect(store.remove("nonexistent")).toBe(false);
  });

  it("persists to disk and reloads", () => {
    const store1 = new CollectionStore(dataPath);
    const created = store1.create({ name: "Persistent", disks: makeDisks() });

    const store2 = new CollectionStore(dataPath);
    expect(store2.list()).toHaveLength(1);
    expect(store2.get(created.id)?.name).toBe("Persistent");
  });

  it("persists updates across reloads", () => {
    const store1 = new CollectionStore(dataPath);
    const created = store1.create({ name: "Original", disks: makeDisks() });
    store1.update(created.id, { name: "Updated" });

    const store2 = new CollectionStore(dataPath);
    expect(store2.get(created.id)?.name).toBe("Updated");
  });

  it("persists removals across reloads", () => {
    const store1 = new CollectionStore(dataPath);
    const created = store1.create({ name: "ToDelete", disks: makeDisks() });
    store1.remove(created.id);

    const store2 = new CollectionStore(dataPath);
    expect(store2.list()).toHaveLength(0);
  });

  it("handles corrupt JSON file gracefully", () => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(dataPath, "not valid json{{{");
    const store = new CollectionStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("generates unique IDs for each collection", () => {
    const store = new CollectionStore(dataPath);
    const c1 = store.create({ name: "A", disks: [] });
    const c2 = store.create({ name: "B", disks: [] });
    expect(c1.id).not.toBe(c2.id);
  });
});
