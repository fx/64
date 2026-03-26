import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Playlist, Track } from "@shared/types.ts";

const DEFAULT_DATA_PATH = "data/playlists.json";

export class PlaylistStore {
  private playlists: Map<string, Playlist> = new Map();
  private readonly dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? DEFAULT_DATA_PATH;
    mkdirSync(dirname(this.dataPath), { recursive: true });
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.dataPath, "utf-8");
      const arr = JSON.parse(raw) as Playlist[];
      for (const playlist of arr) {
        this.playlists.set(playlist.id, playlist);
      }
    } catch {
      // Start with empty store if file doesn't exist or is corrupt
    }
  }

  private persist(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.list(), null, 2));
  }

  list(): Playlist[] {
    return Array.from(this.playlists.values());
  }

  get(id: string): Playlist | undefined {
    return this.playlists.get(id);
  }

  create(data: { name: string; tracks?: Track[] }): Playlist {
    const now = new Date().toISOString();
    const playlist: Playlist = {
      id: randomUUID(),
      name: data.name,
      tracks: data.tracks ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.playlists.set(playlist.id, playlist);
    this.persist();
    return playlist;
  }

  update(id: string, data: { name?: string; tracks?: Track[] }): Playlist | undefined {
    const playlist = this.playlists.get(id);
    if (!playlist) return undefined;
    if (data.name !== undefined) playlist.name = data.name;
    if (data.tracks !== undefined) playlist.tracks = data.tracks;
    playlist.updatedAt = new Date().toISOString();
    this.playlists.set(id, playlist);
    this.persist();
    return playlist;
  }

  remove(id: string): boolean {
    const existed = this.playlists.delete(id);
    if (existed) this.persist();
    return existed;
  }
}
