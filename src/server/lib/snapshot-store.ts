import { mkdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Snapshot } from "@shared/types.ts";

const DEFAULT_INDEX_PATH = "data/snapshots.json";
const DEFAULT_DATA_DIR = "data/snapshots";

export class SnapshotStore {
  private snapshots: Map<string, Snapshot> = new Map();
  private readonly indexPath: string;
  private readonly dataDir: string;

  constructor(indexPath?: string, dataDir?: string) {
    this.indexPath = indexPath ?? DEFAULT_INDEX_PATH;
    this.dataDir = dataDir ?? DEFAULT_DATA_DIR;
    mkdirSync(dirname(this.indexPath), { recursive: true });
    mkdirSync(this.dataDir, { recursive: true });
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.indexPath, "utf-8");
      const arr = JSON.parse(raw) as Snapshot[];
      for (const snap of arr) {
        this.snapshots.set(snap.id, snap);
      }
    } catch {
      // Start with empty store if file doesn't exist or is corrupt
    }
  }

  private persist(): void {
    writeFileSync(this.indexPath, JSON.stringify(this.list(), null, 2));
  }

  private binaryPath(id: string): string {
    return join(this.dataDir, `${id}.bin`);
  }

  list(deviceId?: string): Snapshot[] {
    const all = Array.from(this.snapshots.values());
    if (!deviceId) return all;
    return all.filter((s) => s.deviceId === deviceId);
  }

  get(id: string): Snapshot | undefined {
    return this.snapshots.get(id);
  }

  create(deviceId: string, name: string, data: Uint8Array): Snapshot {
    const now = new Date().toISOString();
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      deviceId,
      name,
      size: data.length,
      createdAt: now,
    };
    this.snapshots.set(snapshot.id, snapshot);
    writeFileSync(this.binaryPath(snapshot.id), data);
    this.persist();
    return snapshot;
  }

  getData(id: string): Uint8Array | undefined {
    const snap = this.snapshots.get(id);
    if (!snap) return undefined;
    const path = this.binaryPath(id);
    if (!existsSync(path)) return undefined;
    return new Uint8Array(readFileSync(path));
  }

  remove(id: string): boolean {
    const existed = this.snapshots.delete(id);
    if (existed) {
      const path = this.binaryPath(id);
      if (existsSync(path)) {
        try { unlinkSync(path); } catch { /* ignore cleanup error */ }
      }
      this.persist();
    }
    return existed;
  }
}
