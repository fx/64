import { Hono } from "hono";
import type { DeviceStore } from "../lib/device-store.ts";

const UPLOAD_TIMEOUT_MS = 15000;
const VALID_DRIVES = ["a", "b"];
const VALID_MODES = ["readwrite", "readonly", "unlinked"];

export function createUploadMountRoutes(store: DeviceStore) {
  const app = new Hono();

  app.post("/devices/:deviceId/upload-mount", async (c) => {
    const device = store.get(c.req.param("deviceId"));
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const body = await c.req.parseBody();
    const file = body["file"];
    const drive = String(body["drive"] ?? "").toLowerCase();
    const mode = String(body["mode"] ?? "readwrite").toLowerCase();

    if (!(file instanceof File)) {
      return c.json({ error: "file is required" }, 400);
    }
    if (!VALID_DRIVES.includes(drive)) {
      return c.json({ error: "drive must be 'a' or 'b'" }, 400);
    }
    if (!VALID_MODES.includes(mode)) {
      return c.json({ error: "mode must be readwrite, readonly, or unlinked" }, 400);
    }

    // Derive image type from file extension so the device can identify the format
    let imageType = "";
    if (file.name) {
      const lastDot = file.name.lastIndexOf(".");
      if (lastDot !== -1 && lastDot < file.name.length - 1) {
        imageType = file.name.slice(lastDot + 1).toLowerCase();
      }
    }

    let targetUrl = `http://${device.ip}:${device.port}/v1/drives/${drive}:mount?mode=${encodeURIComponent(mode)}`;
    if (imageType) {
      targetUrl += `&type=${encodeURIComponent(imageType)}`;
    }
    const headers: Record<string, string> = {
      "content-type": file.type || "application/octet-stream",
    };
    if (device.password) {
      headers["X-Password"] = device.password;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const fileBuffer = await file.arrayBuffer();
      const res = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: fileBuffer,
        signal: controller.signal,
      });

      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json();
        return c.json(data as Record<string, unknown>, res.status as 200);
      }
      return c.json({ errors: [] }, res.status as 200);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return c.json({ error: `Device at ${device.ip} did not respond (timeout)` }, 504);
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ECONNREFUSED")) {
        return c.json({ error: `Connection refused by ${device.ip}:${device.port} — is the device powered on?` }, 502);
      }
      return c.json({ error: `Cannot reach device at ${device.ip} — ${msg}` }, 502);
    } finally {
      clearTimeout(timer);
    }
  });

  return app;
}
