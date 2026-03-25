import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Device } from "@shared/types.ts";

const DATA_PATH = "data/devices.json";

export class DeviceStore {
  private devices: Map<string, Device> = new Map();

  constructor() {
    this.load();
  }

  private load(): void {
    try {
      if (existsSync(DATA_PATH)) {
        const raw = readFileSync(DATA_PATH, "utf-8");
        const arr = JSON.parse(raw) as Device[];
        for (const device of arr) {
          this.devices.set(device.id, device);
        }
      }
    } catch {
      // Start with empty store if file is corrupt
    }
  }

  private persist(): void {
    const dir = dirname(DATA_PATH);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(DATA_PATH, JSON.stringify(this.list(), null, 2));
  }

  list(): Device[] {
    return Array.from(this.devices.values());
  }

  get(id: string): Device | undefined {
    return this.devices.get(id);
  }

  upsert(device: Device): Device {
    this.devices.set(device.id, device);
    this.persist();
    return device;
  }

  update(id: string, fields: Partial<Pick<Device, "name" | "password" | "ip" | "port">>): Device | undefined {
    const device = this.devices.get(id);
    if (!device) return undefined;
    if (fields.name !== undefined) device.name = fields.name;
    if (fields.password !== undefined) device.password = fields.password;
    if (fields.ip !== undefined) device.ip = fields.ip;
    if (fields.port !== undefined) device.port = fields.port;
    this.devices.set(id, device);
    this.persist();
    return device;
  }

  remove(id: string): boolean {
    const existed = this.devices.delete(id);
    if (existed) this.persist();
    return existed;
  }

  has(id: string): boolean {
    return this.devices.has(id);
  }

  markOnline(id: string, lastSeen: string): void {
    const device = this.devices.get(id);
    if (device) {
      device.online = true;
      device.lastSeen = lastSeen;
      this.persist();
    }
  }

  markOffline(id: string): void {
    const device = this.devices.get(id);
    if (device) {
      device.online = false;
      this.persist();
    }
  }

  updateDeviceInfo(id: string, info: { product: string; firmware: string; fpga: string; name?: string }): void {
    const device = this.devices.get(id);
    if (device) {
      device.product = info.product;
      device.firmware = info.firmware;
      device.fpga = info.fpga;
      if (info.name) device.name = info.name;
      this.persist();
    }
  }
}
