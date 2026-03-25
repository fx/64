import { fetchDeviceInfo, probeVersion } from "./c64-client.ts";
import type { DeviceStore } from "./device-store.ts";
import { emitDeviceEvent } from "./device-events.ts";

const BASE_INTERVAL_MS = 30_000;
const MAX_INTERVAL_MS = 300_000; // 5 minutes

// Track backoff multipliers per device
const backoff = new Map<string, number>();

let timer: ReturnType<typeof setTimeout> | null = null;

async function checkDevice(store: DeviceStore, deviceId: string): Promise<void> {
  const device = store.get(deviceId);
  if (!device) {
    backoff.delete(deviceId);
    return;
  }

  const version = await probeVersion(device.ip, device.port, device.password);
  if (version) {
    // Device is online
    const wasOffline = !device.online;
    store.markOnline(deviceId, new Date().toISOString());
    backoff.set(deviceId, 1); // Reset backoff

    if (wasOffline) {
      // Refresh device info on recovery
      const info = await fetchDeviceInfo(device.ip, device.port, device.password);
      if (info) {
        store.updateDeviceInfo(deviceId, {
          product: info.product,
          firmware: info.firmware_version,
          fpga: info.fpga_version,
          name: device.name === device.id ? info.hostname : undefined,
        });
      }
      emitDeviceEvent({
        type: "device:online",
        data: { id: device.id, ip: device.ip },
      });
    }
  } else {
    // Device is offline
    const wasOnline = device.online;
    store.markOffline(deviceId);

    // Increase backoff
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

async function runHealthCheck(store: DeviceStore): Promise<void> {
  const devices = store.list();
  const now = Date.now();

  const checks = devices.map((device) => {
    const multiplier = backoff.get(device.id) ?? 1;
    const interval = BASE_INTERVAL_MS * multiplier;
    const lastSeen = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;

    // Only check if enough time has passed based on backoff
    if (device.online || now - lastSeen >= interval) {
      return checkDevice(store, device.id);
    }
    return Promise.resolve();
  });

  await Promise.all(checks);
}

export function startHealthChecker(store: DeviceStore): void {
  if (timer) return; // Already running

  async function loop(): Promise<void> {
    await runHealthCheck(store);
    timer = setTimeout(loop, BASE_INTERVAL_MS);
  }

  // Start after a short delay to let the server boot
  timer = setTimeout(loop, 5000);
}

export function stopHealthChecker(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
