import { fetchDeviceInfo, probeVersion } from "./c64-client.ts";
import type { DeviceStore } from "./device-store.ts";
import { emitDeviceEvent } from "./device-events.ts";

const BASE_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 300_000; // 5 minutes

// Track backoff multipliers and last attempt time per device
const backoff = new Map<string, number>();
const lastChecked = new Map<string, number>();

let timer: ReturnType<typeof setTimeout> | null = null;

export async function checkDevice(store: DeviceStore, deviceId: string): Promise<void> {
  const device = store.get(deviceId);
  if (!device) {
    backoff.delete(deviceId);
    lastChecked.delete(deviceId);
    return;
  }

  lastChecked.set(deviceId, Date.now());

  const version = await probeVersion(device.ip, device.port, device.password);
  if (version.ok) {
    const wasOffline = !device.online;
    store.markOnline(deviceId, new Date().toISOString());
    backoff.set(deviceId, 1);

    if (wasOffline) {
      const info = await fetchDeviceInfo(device.ip, device.port, device.password);
      if (info.ok) {
        store.updateDeviceInfo(deviceId, {
          product: info.data.product,
          firmware: info.data.firmware_version,
          fpga: info.data.fpga_version,
        });
      }
      emitDeviceEvent({
        type: "device:online",
        data: { id: device.id, ip: device.ip },
      });
    }
  } else {
    const wasOnline = device.online;
    store.markOffline(deviceId);

    const currentBackoff = backoff.get(deviceId) ?? 1;
    backoff.set(deviceId, Math.min(currentBackoff * 2, MAX_INTERVAL_MS / BASE_INTERVAL_MS));

    if (wasOnline) {
      emitDeviceEvent({
        type: "device:offline",
        data: { id: device.id, ip: device.ip },
      });
    }
  }
}

export async function runHealthCheck(store: DeviceStore): Promise<void> {
  const devices = store.list();
  const now = Date.now();

  const checks = devices.map((device) => {
    const multiplier = backoff.get(device.id) ?? 1;
    const interval = BASE_INTERVAL_MS * multiplier;
    const lastAttempt = lastChecked.get(device.id) ?? 0;

    // Only check if enough time has passed based on backoff
    if (now - lastAttempt >= interval) {
      return checkDevice(store, device.id);
    }
    return Promise.resolve();
  });

  await Promise.all(checks);
}

export function startHealthChecker(store: DeviceStore): void {
  if (timer) return;

  async function loop(): Promise<void> {
    try {
      await runHealthCheck(store);
    } catch (error) {
      console.error("Health checker loop error:", error);
    }
    timer = setTimeout(loop, BASE_INTERVAL_MS);
  }

  timer = setTimeout(loop, 5000);
}

export function stopHealthChecker(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** Reset internal state — only for testing */
export function resetHealthState(): void {
  backoff.clear();
  lastChecked.clear();
}
