import { Hono } from "hono";
import type { DeviceRegistration, DeviceUpdate, ScanRequest } from "@shared/types.ts";
import { fetchDeviceInfo, probeVersion } from "../lib/c64-client.ts";
import type { DeviceStore } from "../lib/device-store.ts";
import { emitDeviceEvent } from "../lib/device-events.ts";
import { scanSubnet } from "../lib/scanner.ts";

export function createDeviceRoutes(store: DeviceStore) {
  const devices = new Hono()
    // List all devices
    .get("/devices", (c) => {
      return c.json(store.list());
    })

    // Register device manually
    .post("/devices", async (c) => {
      const body = await c.req.json<DeviceRegistration>();

      if (!body.ip) {
        return c.json({ error: "ip is required" }, 400);
      }

      const port = body.port ?? 80;

      // Probe device
      const version = await probeVersion(body.ip, port, body.password);
      if (!version) {
        return c.json({ error: "Device not reachable or not a C64U device" }, 502);
      }

      const info = await fetchDeviceInfo(body.ip, port, body.password);
      if (!info) {
        return c.json({ error: "Failed to fetch device info" }, 502);
      }

      const device = store.upsert({
        id: info.unique_id,
        name: body.name ?? info.hostname,
        ip: body.ip,
        port,
        password: body.password,
        product: info.product,
        firmware: info.firmware_version,
        fpga: info.fpga_version,
        online: true,
        lastSeen: new Date().toISOString(),
      });

      emitDeviceEvent({
        type: "device:discovered",
        data: { id: device.id, ip: device.ip, product: device.product },
      });

      return c.json(device, 201);
    })

    // Get device by ID
    .get("/devices/:id", (c) => {
      const device = store.get(c.req.param("id"));
      if (!device) {
        return c.json({ error: "Device not found" }, 404);
      }
      return c.json(device);
    })

    // Update device
    .put("/devices/:id", async (c) => {
      const id = c.req.param("id");
      const body = await c.req.json<DeviceUpdate>();
      const device = store.update(id, body);
      if (!device) {
        return c.json({ error: "Device not found" }, 404);
      }
      return c.json(device);
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
      const body = await c.req.json<ScanRequest>();

      if (!body.subnet) {
        return c.json({ error: "subnet is required" }, 400);
      }

      try {
        const discovered = await scanSubnet(body.subnet, store);
        return c.json({ discovered });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scan failed";
        return c.json({ error: message }, 400);
      }
    });

  return devices;
}
