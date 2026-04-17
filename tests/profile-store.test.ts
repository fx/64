import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProfileStore } from "../src/server/lib/profile-store.ts";

function testDataPath() {
  return join(tmpdir(), `profiles-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeConfig(): Record<string, Record<string, string | number>> {
  return {
    "Audio": { "SID Engine": "ReSID", "SID Model": "6581" },
    "Video": { "Border": "Normal", "Palette": 1 },
  };
}

describe("ProfileStore", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("starts with empty list", () => {
    const store = new ProfileStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("creates a profile with generated id and timestamps", () => {
    const store = new ProfileStore(dataPath);
    const config = makeConfig();
    const profile = store.create({ name: "My Profile", config });

    expect(profile.id).toBeDefined();
    expect(profile.name).toBe("My Profile");
    expect(profile.config).toEqual(config);
    expect(profile.createdAt).toBeDefined();
    expect(profile.updatedAt).toBeDefined();
    expect(profile.description).toBeUndefined();
    expect(profile.deviceProduct).toBeUndefined();
  });

  it("creates a profile with description and deviceProduct", () => {
    const store = new ProfileStore(dataPath);
    const profile = store.create({
      name: "U64 Profile",
      description: "For my Ultimate 64",
      deviceProduct: "Ultimate 64",
      config: makeConfig(),
    });

    expect(profile.description).toBe("For my Ultimate 64");
    expect(profile.deviceProduct).toBe("Ultimate 64");
  });

  it("lists all profiles", () => {
    const store = new ProfileStore(dataPath);
    store.create({ name: "Profile 1", config: makeConfig() });
    store.create({ name: "Profile 2", config: makeConfig() });

    expect(store.list()).toHaveLength(2);
  });

  it("gets profile by id", () => {
    const store = new ProfileStore(dataPath);
    const created = store.create({ name: "Test", config: makeConfig() });

    const retrieved = store.get(created.id);
    expect(retrieved).toEqual(created);
  });

  it("returns undefined for non-existent id", () => {
    const store = new ProfileStore(dataPath);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("updates profile name", () => {
    const store = new ProfileStore(dataPath);
    const created = store.create({ name: "Old Name", config: makeConfig() });

    const updated = store.update(created.id, { name: "New Name" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.updatedAt).toBeDefined();
    expect(new Date(updated!.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.createdAt).getTime(),
    );
  });

  it("updates profile description", () => {
    const store = new ProfileStore(dataPath);
    const created = store.create({ name: "Profile", config: makeConfig() });

    const updated = store.update(created.id, { description: "Updated desc" });
    expect(updated?.description).toBe("Updated desc");
  });

  it("updates profile deviceProduct", () => {
    const store = new ProfileStore(dataPath);
    const created = store.create({ name: "Profile", config: makeConfig() });

    const updated = store.update(created.id, { deviceProduct: "Ultimate II+" });
    expect(updated?.deviceProduct).toBe("Ultimate II+");
  });

  it("updates profile config", () => {
    const store = new ProfileStore(dataPath);
    const created = store.create({ name: "Profile", config: makeConfig() });

    const newConfig = { "Audio": { "SID Engine": "FastSID", "SID Model": "8580" } };
    const updated = store.update(created.id, { config: newConfig });
    expect(updated?.config).toEqual(newConfig);
  });

  it("returns undefined when updating non-existent profile", () => {
    const store = new ProfileStore(dataPath);
    expect(store.update("nonexistent", { name: "x" })).toBeUndefined();
  });

  it("removes a profile", () => {
    const store = new ProfileStore(dataPath);
    const created = store.create({ name: "Profile", config: makeConfig() });

    expect(store.remove(created.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.get(created.id)).toBeUndefined();
  });

  it("returns false when removing non-existent profile", () => {
    const store = new ProfileStore(dataPath);
    expect(store.remove("nonexistent")).toBe(false);
  });

  it("persists to disk and reloads", () => {
    const store1 = new ProfileStore(dataPath);
    const created = store1.create({ name: "Persistent", config: makeConfig() });

    const store2 = new ProfileStore(dataPath);
    expect(store2.list()).toHaveLength(1);
    expect(store2.get(created.id)?.name).toBe("Persistent");
  });

  it("persists updates across reloads", () => {
    const store1 = new ProfileStore(dataPath);
    const created = store1.create({ name: "Original", config: makeConfig() });
    store1.update(created.id, { name: "Updated" });

    const store2 = new ProfileStore(dataPath);
    expect(store2.get(created.id)?.name).toBe("Updated");
  });

  it("persists removals across reloads", () => {
    const store1 = new ProfileStore(dataPath);
    const created = store1.create({ name: "ToDelete", config: makeConfig() });
    store1.remove(created.id);

    const store2 = new ProfileStore(dataPath);
    expect(store2.list()).toHaveLength(0);
  });

  it("handles corrupt JSON file gracefully", () => {
    writeFileSync(dataPath, "not valid json{{{");
    const store = new ProfileStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("generates unique IDs for each profile", () => {
    const store = new ProfileStore(dataPath);
    const p1 = store.create({ name: "A", config: {} });
    const p2 = store.create({ name: "B", config: {} });
    expect(p1.id).not.toBe(p2.id);
  });
});
