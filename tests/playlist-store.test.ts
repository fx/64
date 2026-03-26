import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PlaylistStore } from "../src/server/lib/playlist-store.ts";
import type { Track } from "../src/shared/types.ts";

function testDataPath() {
  return join(tmpdir(), `playlists-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeTracks(count = 2): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `/USB0/Music/song${i + 1}.sid`,
    type: "sid" as const,
    title: `Song ${i + 1}`,
    songnr: i === 0 ? 1 : undefined,
  }));
}

describe("PlaylistStore", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("starts with empty list", () => {
    const store = new PlaylistStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("creates a playlist with generated id and timestamps", () => {
    const store = new PlaylistStore(dataPath);
    const tracks = makeTracks();
    const playlist = store.create({ name: "My Playlist", tracks });

    expect(playlist.id).toBeDefined();
    expect(playlist.name).toBe("My Playlist");
    expect(playlist.tracks).toEqual(tracks);
    expect(playlist.createdAt).toBeDefined();
    expect(playlist.updatedAt).toBeDefined();
  });

  it("creates a playlist with empty tracks by default", () => {
    const store = new PlaylistStore(dataPath);
    const playlist = store.create({ name: "Empty Playlist" });

    expect(playlist.tracks).toEqual([]);
  });

  it("lists all playlists", () => {
    const store = new PlaylistStore(dataPath);
    store.create({ name: "Playlist 1", tracks: makeTracks() });
    store.create({ name: "Playlist 2", tracks: makeTracks() });

    expect(store.list()).toHaveLength(2);
  });

  it("gets playlist by id", () => {
    const store = new PlaylistStore(dataPath);
    const created = store.create({ name: "Test", tracks: makeTracks() });

    const retrieved = store.get(created.id);
    expect(retrieved).toEqual(created);
  });

  it("returns undefined for non-existent id", () => {
    const store = new PlaylistStore(dataPath);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("updates playlist name and sets updatedAt", () => {
    const store = new PlaylistStore(dataPath);
    const created = store.create({ name: "Old Name", tracks: makeTracks() });

    const updated = store.update(created.id, { name: "New Name" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.updatedAt).toBeDefined();
    expect(updated?.tracks).toEqual(created.tracks);
  });

  it("updates playlist tracks", () => {
    const store = new PlaylistStore(dataPath);
    const created = store.create({ name: "Playlist", tracks: makeTracks(2) });

    const newTracks = makeTracks(3);
    const updated = store.update(created.id, { tracks: newTracks });
    expect(updated?.tracks).toHaveLength(3);
  });

  it("returns undefined when updating non-existent playlist", () => {
    const store = new PlaylistStore(dataPath);
    expect(store.update("nonexistent", { name: "x" })).toBeUndefined();
  });

  it("removes a playlist", () => {
    const store = new PlaylistStore(dataPath);
    const created = store.create({ name: "Playlist", tracks: makeTracks() });

    expect(store.remove(created.id)).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.get(created.id)).toBeUndefined();
  });

  it("returns false when removing non-existent playlist", () => {
    const store = new PlaylistStore(dataPath);
    expect(store.remove("nonexistent")).toBe(false);
  });

  it("persists to disk and reloads", () => {
    const store1 = new PlaylistStore(dataPath);
    const created = store1.create({ name: "Persistent", tracks: makeTracks() });

    const store2 = new PlaylistStore(dataPath);
    expect(store2.list()).toHaveLength(1);
    expect(store2.get(created.id)?.name).toBe("Persistent");
  });

  it("persists updates across reloads", () => {
    const store1 = new PlaylistStore(dataPath);
    const created = store1.create({ name: "Original", tracks: makeTracks() });
    store1.update(created.id, { name: "Updated" });

    const store2 = new PlaylistStore(dataPath);
    expect(store2.get(created.id)?.name).toBe("Updated");
  });

  it("persists removals across reloads", () => {
    const store1 = new PlaylistStore(dataPath);
    const created = store1.create({ name: "ToDelete", tracks: makeTracks() });
    store1.remove(created.id);

    const store2 = new PlaylistStore(dataPath);
    expect(store2.list()).toHaveLength(0);
  });

  it("handles corrupt JSON file gracefully", () => {
    writeFileSync(dataPath, "not valid json{{{");
    const store = new PlaylistStore(dataPath);
    expect(store.list()).toEqual([]);
  });

  it("generates unique IDs for each playlist", () => {
    const store = new PlaylistStore(dataPath);
    const p1 = store.create({ name: "A" });
    const p2 = store.create({ name: "B" });
    expect(p1.id).not.toBe(p2.id);
  });

  it("preserves tracks with MOD type", () => {
    const store = new PlaylistStore(dataPath);
    const tracks: Track[] = [
      { path: "/USB0/Mods/cool.mod", type: "mod", title: "Cool MOD" },
    ];
    const playlist = store.create({ name: "MOD Playlist", tracks });
    expect(playlist.tracks[0].type).toBe("mod");
    expect(playlist.tracks[0].songnr).toBeUndefined();
  });

  it("preserves tracks with SID songnr", () => {
    const store = new PlaylistStore(dataPath);
    const tracks: Track[] = [
      { path: "/USB0/SIDs/multi.sid", type: "sid", title: "Multi SID", songnr: 3 },
    ];
    const playlist = store.create({ name: "SID Playlist", tracks });
    expect(playlist.tracks[0].songnr).toBe(3);
  });
});
