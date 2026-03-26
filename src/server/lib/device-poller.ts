import type { DeviceStore } from "./device-store.ts";
import type { C64FetchResult } from "./c64-client.ts";
import { fetchDeviceInfo, fetchDrives } from "./c64-client.ts";
import { onDeviceEvent } from "./device-events.ts";
import type { DeviceStateEvent, DeviceStateEventType } from "@shared/types.ts";

export interface DeviceStateCache {
  drives?: unknown;
  info?: unknown;
  online: boolean;
}

type StateListener = (event: DeviceStateEvent) => void;
type CacheField = "drives" | "info";

const DRIVES_INTERVAL_MS = 5_000;
const INFO_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes

export class DevicePoller {
  private readonly store: DeviceStore;
  private readonly cache = new Map<string, DeviceStateCache>();
  private readonly driveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly infoTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly backoff = new Map<string, number>();
  private readonly listeners = new Set<StateListener>();
  private unsubscribeDeviceEvents: (() => void) | null = null;

  constructor(store: DeviceStore) {
    this.store = store;
  }

  /** Start listening for device online/offline events and begin polling online devices */
  start(): void {
    if (this.unsubscribeDeviceEvents) return;
    this.unsubscribeDeviceEvents = onDeviceEvent((event) => {
      if (event.type === "device:online") {
        this.startPolling(event.data.id);
      } else if (event.type === "device:offline") {
        this.handleOffline(event.data.id);
      }
    });

    // Start polling for all currently online devices
    for (const device of this.store.list()) {
      if (device.online) {
        this.startPolling(device.id);
      }
    }
  }

  /** Stop all polling and cleanup */
  stop(): void {
    if (this.unsubscribeDeviceEvents) {
      this.unsubscribeDeviceEvents();
      this.unsubscribeDeviceEvents = null;
    }
    const allDeviceIds = new Set([...this.driveTimers.keys(), ...this.infoTimers.keys()]);
    for (const deviceId of allDeviceIds) {
      this.stopPolling(deviceId);
    }
    this.cache.clear();
    this.backoff.clear();
  }

  startPolling(deviceId: string): void {
    // Don't start duplicate polling loops
    if (this.driveTimers.has(deviceId)) return;

    if (!this.cache.has(deviceId)) {
      this.cache.set(deviceId, { online: true });
    } else {
      const cached = this.cache.get(deviceId)!;
      if (!cached.online) {
        cached.online = true;
        this.emit({ type: "state:online", deviceId, data: {} });
      }
    }

    this.backoff.set(deviceId, 1);
    this.scheduleDrivePoll(deviceId, 0);
    this.scheduleInfoPoll(deviceId, 0);
  }

  stopPolling(deviceId: string): void {
    const driveTimer = this.driveTimers.get(deviceId);
    if (driveTimer) {
      clearTimeout(driveTimer);
      this.driveTimers.delete(deviceId);
    }
    const infoTimer = this.infoTimers.get(deviceId);
    if (infoTimer) {
      clearTimeout(infoTimer);
      this.infoTimers.delete(deviceId);
    }
  }

  getCache(deviceId: string): DeviceStateCache | undefined {
    return this.cache.get(deviceId);
  }

  onStateChange(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: DeviceStateEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private handleOffline(deviceId: string): void {
    this.stopPolling(deviceId);
    const cached = this.cache.get(deviceId);
    if (cached) {
      cached.online = false;
    } else {
      this.cache.set(deviceId, { online: false });
    }
    this.emit({ type: "state:offline", deviceId, data: {} });
  }

  private scheduleDrivePoll(deviceId: string, delayMs: number): void {
    const timer = setTimeout(async () => {
      await this.pollState(deviceId, "drives", "state:drives", (d) =>
        fetchDrives(d.ip, d.port, d.password));
      if (this.driveTimers.has(deviceId)) {
        const multiplier = this.backoff.get(deviceId) ?? 1;
        this.scheduleDrivePoll(deviceId, DRIVES_INTERVAL_MS * multiplier);
      }
    }, delayMs);
    this.driveTimers.set(deviceId, timer);
  }

  private scheduleInfoPoll(deviceId: string, delayMs: number): void {
    const timer = setTimeout(async () => {
      await this.pollState(deviceId, "info", "state:info", (d) =>
        fetchDeviceInfo(d.ip, d.port, d.password));
      if (this.infoTimers.has(deviceId)) {
        const multiplier = this.backoff.get(deviceId) ?? 1;
        this.scheduleInfoPoll(deviceId, INFO_INTERVAL_MS * multiplier);
      }
    }, delayMs);
    this.infoTimers.set(deviceId, timer);
  }

  private async pollState(
    deviceId: string,
    field: CacheField,
    eventType: DeviceStateEventType,
    fetcher: (device: { ip: string; port: number; password?: string }) => Promise<C64FetchResult<unknown>>,
  ): Promise<void> {
    const device = this.store.get(deviceId);
    if (!device) {
      this.stopPolling(deviceId);
      this.cache.delete(deviceId);
      this.backoff.delete(deviceId);
      return;
    }

    const result = await fetcher(device);
    if (result.ok) {
      this.backoff.set(deviceId, 1);
      const cached = this.cache.get(deviceId);
      const newJson = JSON.stringify(result.data);
      const oldJson = cached?.[field] !== undefined ? JSON.stringify(cached[field]) : undefined;

      if (oldJson !== newJson) {
        if (!cached) {
          this.cache.set(deviceId, { [field]: result.data, online: true });
        } else {
          cached[field] = result.data;
        }
        this.emit({ type: eventType, deviceId, data: result.data });
      }
    } else {
      this.increaseBackoff(deviceId);
    }
  }

  private increaseBackoff(deviceId: string): void {
    const current = this.backoff.get(deviceId) ?? 1;
    // Cap so neither drives nor info interval exceeds MAX_BACKOFF_MS
    const maxMultiplier = MAX_BACKOFF_MS / Math.max(DRIVES_INTERVAL_MS, INFO_INTERVAL_MS);
    const next = Math.min(current * 2, maxMultiplier);
    this.backoff.set(deviceId, next);
  }
}
