import { Hono } from "hono";
import type { DeviceRegistration, DeviceUpdate, ScanRequest } from "@shared/types.ts";
import { fetchDeviceInfo, probeVersion } from "../lib/c64-client.ts";
import { type DeviceStore, toPublicDevice } from "../lib/device-store.ts";
import { emitDeviceEvent } from "../lib/device-events.ts";
import { scanSubnet } from "../lib/scanner.ts";

/** Validate that an IP is in a private RFC1918 range */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts as [number, number, number, number];
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function parseJSON<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function createDeviceRoutes(store: DeviceStore) {
  const devices = new Hono()
    // List all devices
    .get("/devices", (c) => {
      return c.json(store.list().map(toPublicDevice));
    })

    // Register device manually
    .post("/devices", async (c) => {
      const body = await parseJSON<DeviceRegistration>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (!body.ip) {
        return c.json({ error: "ip is required" }, 400);
      }

      if (!isPrivateIP(body.ip)) {
        return c.json({ error: "Only private network IPs are allowed" }, 400);
      }

      const port = body.port ?? 80;

      // Probe device
      const version = await probeVersion(body.ip, port, body.password);
      if (!version.ok) {
        const status = version.reason.includes("Authentication") ? 403
          : version.reason.includes("timeout") ? 504 : 502;
        return c.json({ error: version.reason }, status as 403);
      }

      const info = await fetchDeviceInfo(body.ip, port, body.password);
      if (!info.ok) {
        const status = info.reason.includes("Authentication") ? 403
          : info.reason.includes("timeout") ? 504 : 502;
        return c.json({ error: info.reason }, status as 403);
      }

      const device = store.upsert({
        id: info.data.unique_id,
        name: body.name ?? info.data.hostname,
        ip: body.ip,
        port,
        password: body.password,
        product: info.data.product,
        firmware: info.data.firmware_version,
        fpga: info.data.fpga_version,
        online: true,
        lastSeen: new Date().toISOString(),
      });

      emitDeviceEvent({
        type: "device:discovered",
        data: { id: device.id, ip: device.ip, product: device.product },
      });

      return c.json(toPublicDevice(device), 201);
    })

    // Get device by ID
    .get("/devices/:id", (c) => {
      const device = store.get(c.req.param("id"));
      if (!device) {
        return c.json({ error: "Device not found" }, 404);
      }
      return c.json(toPublicDevice(device));
    })

    // Update device
    .put("/devices/:id", async (c) => {
      const id = c.req.param("id");
      const body = await parseJSON<DeviceUpdate>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (body.ip && !isPrivateIP(body.ip)) {
        return c.json({ error: "Only private network IPs are allowed" }, 400);
      }

      const device = store.update(id, body);
      if (!device) {
        return c.json({ error: "Device not found" }, 404);
      }
      return c.json(toPublicDevice(device));
    })

    // Delete device
    .delete("/devices/:id", (c) => {
      const id = c.req.param("id");
      const removed = store.remove(id);
      if (!removed) {
        return c.json({ error: "Device not found" }, 404);
      }
      return c.json({ ok: true });
    })

    // Trigger network scan
    .post("/devices/scan", async (c) => {
      const body = await parseJSON<ScanRequest>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (!body.subnet) {
        return c.json({ error: "subnet is required" }, 400);
      }

      try {
        const discovered = await scanSubnet(body.subnet, store);
        return c.json({ discovered: discovered.map(toPublicDevice) });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scan failed";
        return c.json({ error: message }, 400);
      }
    });

  return devices;
}
