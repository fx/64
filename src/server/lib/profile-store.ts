import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ConfigProfile } from "@shared/types.ts";

const DEFAULT_DATA_PATH = "data/profiles.json";

export class ProfileStore {
  private profiles: Map<string, ConfigProfile> = new Map();
  private readonly dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? DEFAULT_DATA_PATH;
    mkdirSync(dirname(this.dataPath), { recursive: true });
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.dataPath, "utf-8");
      const arr = JSON.parse(raw) as ConfigProfile[];
      for (const profile of arr) {
        this.profiles.set(profile.id, profile);
      }
    } catch {
      // Start with empty store if file doesn't exist or is corrupt
    }
  }

  private persist(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.list(), null, 2));
  }

  list(): ConfigProfile[] {
    return Array.from(this.profiles.values());
  }

  get(id: string): ConfigProfile | undefined {
    return this.profiles.get(id);
  }

  create(data: {
    name: string;
    description?: string;
    deviceProduct?: string;
    config: Record<string, Record<string, string | number>>;
  }): ConfigProfile {
    const now = new Date().toISOString();
    const profile: ConfigProfile = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description,
      deviceProduct: data.deviceProduct,
      config: data.config,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.set(profile.id, profile);
    this.persist();
    return profile;
  }

  update(
    id: string,
    fields: Partial<Pick<ConfigProfile, "name" | "description" | "deviceProduct" | "config">>,
  ): ConfigProfile | undefined {
    const profile = this.profiles.get(id);
    if (!profile) return undefined;
    if (fields.name !== undefined) profile.name = fields.name;
    if (fields.description !== undefined) profile.description = fields.description;
    if (fields.deviceProduct !== undefined) profile.deviceProduct = fields.deviceProduct;
    if (fields.config !== undefined) profile.config = fields.config;
    profile.updatedAt = new Date().toISOString();
    this.profiles.set(id, profile);
    this.persist();
    return profile;
  }

  remove(id: string): boolean {
    const existed = this.profiles.delete(id);
    if (existed) this.persist();
    return existed;
  }
}
