import type { Device } from "@shared/types.ts";
import { fetchDeviceInfo, probeVersion } from "./c64-client.ts";
import type { DeviceStore } from "./device-store.ts";
import { emitDeviceEvent } from "./device-events.ts";

function parseSubnet(subnet: string): string[] {
  // Supports CIDR /24 notation only (e.g., 192.168.1.0/24)
  const match = subnet.match(/^(\d+\.\d+\.\d+)\.\d+\/24$/);
  if (!match) {
    throw new Error("Only /24 subnets are supported (e.g., 192.168.1.0/24)");
  }
  const prefix = match[1];
  const ips: string[] = [];
  for (let i = 1; i < 255; i++) {
    ips.push(`${prefix}.${i}`);
  }
  return ips;
}

export async function scanSubnet(
  subnet: string,
  store: DeviceStore,
  port = 80,
  concurrency = 50,
  timeoutMs = 2000,
): Promise<Device[]> {
  const ips = parseSubnet(subnet);
  const discovered: Device[] = [];

  // Process IPs with concurrency limit
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < ips.length) {
      const ip = ips[index++]!;
      const version = await probeVersion(ip, port, undefined, timeoutMs);
      if (!version) continue;

      const info = await fetchDeviceInfo(ip, port, undefined, timeoutMs);
      if (!info) continue;

      // Skip already-registered devices
      if (store.has(info.unique_id)) continue;

      const device: Device = {
        id: info.unique_id,
        name: info.hostname,
        ip,
        port,
        product: info.product,
        firmware: info.firmware_version,
        fpga: info.fpga_version,
        online: true,
        lastSeen: new Date().toISOString(),
      };

      store.upsert(device);
      discovered.push(device);

      emitDeviceEvent({
        type: "device:discovered",
        data: { id: device.id, ip: device.ip, product: device.product },
      });
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, ips.length) }, () => processNext());
  await Promise.all(workers);

  return discovered;
}
