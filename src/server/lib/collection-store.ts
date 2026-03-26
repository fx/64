import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DiskFlipCollection, DiskEntry } from "@shared/types.ts";

const DEFAULT_DATA_PATH = "data/collections.json";

export class CollectionStore {
  private collections: Map<string, DiskFlipCollection> = new Map();
  private readonly dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? DEFAULT_DATA_PATH;
    mkdirSync(dirname(this.dataPath), { recursive: true });
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.dataPath, "utf-8");
      const arr = JSON.parse(raw) as DiskFlipCollection[];
      for (const collection of arr) {
        this.collections.set(collection.id, collection);
      }
    } catch {
      // Start with empty store if file doesn't exist or is corrupt
    }
  }

  private persist(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.list(), null, 2));
  }

  list(): DiskFlipCollection[] {
    return Array.from(this.collections.values());
  }

  get(id: string): DiskFlipCollection | undefined {
    return this.collections.get(id);
  }

  create(data: { name: string; description?: string; disks: DiskEntry[] }): DiskFlipCollection {
    const now = new Date().toISOString();
    const collection: DiskFlipCollection = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description,
      disks: data.disks,
      createdAt: now,
      updatedAt: now,
    };
    this.collections.set(collection.id, collection);
    this.persist();
    return collection;
  }

  update(
    id: string,
    fields: Partial<Pick<DiskFlipCollection, "name" | "description" | "disks">>,
  ): DiskFlipCollection | undefined {
    const collection = this.collections.get(id);
    if (!collection) return undefined;
    if (fields.name !== undefined) collection.name = fields.name;
    if (fields.description !== undefined) collection.description = fields.description;
    if (fields.disks !== undefined) collection.disks = fields.disks;
    collection.updatedAt = new Date().toISOString();
    this.collections.set(id, collection);
    this.persist();
    return collection;
  }

  remove(id: string): boolean {
    const existed = this.collections.delete(id);
    if (existed) this.persist();
    return existed;
  }
}
