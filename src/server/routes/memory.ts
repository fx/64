import { Hono } from "hono";
import type { Context } from "hono";
import type { DeviceStore } from "../lib/device-store.ts";
import type { Device } from "@shared/types.ts";

const CHUNK_SIZE = 256;
const AUTO_PAUSE_THRESHOLD = 4096;
const DEVICE_TIMEOUT_MS = 5000;

function deviceUrl(device: Device, path: string): string {
  return `http://${device.ip}:${device.port}${path}`;
}

function deviceHeaders(device: Device): Record<string, string> {
  const headers: Record<string, string> = {};
  if (device.password) headers["X-Password"] = device.password;
  return headers;
}

async function deviceFetch(device: Device, path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);
  try {
    return await fetch(deviceUrl(device, path), {
      ...init,
      headers: { ...deviceHeaders(device), ...init?.headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Read a single chunk of memory from the device */
async function readChunk(device: Device, address: number, length: number): Promise<Uint8Array> {
  const addr = address.toString(16).toUpperCase().padStart(4, "0");
  const res = await deviceFetch(device, `/v1/machine:readmem?address=${addr}&length=${length}`);
  if (!res.ok) {
    throw new Error(`readmem failed at $${addr}: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Pause the device CPU */
async function pauseCpu(device: Device): Promise<void> {
  const res = await deviceFetch(device, "/v1/machine:pause", { method: "PUT" });
  if (!res.ok) {
    throw new Error(`Failed to pause CPU: HTTP ${res.status}`);
  }
}

/** Resume the device CPU */
async function resumeCpu(device: Device): Promise<void> {
  const res = await deviceFetch(device, "/v1/machine:resume", { method: "PUT" });
  if (!res.ok) {
    throw new Error(`Failed to resume CPU: HTTP ${res.status}`);
  }
}

export function createMemoryRoutes(store: DeviceStore) {
  const memory = new Hono();

  function resolveDevice(c: Context): Device | Response {
    const device = store.get(c.req.param("deviceId"));
    if (!device) return c.json({ errors: ["Device not found"], proxy_error: true as const }, 404);
    if (!device.online) return c.json({ errors: ["Device is offline"], proxy_error: true as const }, 503);
    return device;
  }

  // ── Read memory ────────────────────────────────────────
  memory.get("/devices/:deviceId/memory", async (c) => {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;

    const addressParam = c.req.query("address");
    const lengthParam = c.req.query("length");

    if (!addressParam || !lengthParam) {
      return c.json({ errors: ["address and length query parameters are required"] }, 400);
    }

    const address = parseInt(addressParam, 16);
    const length = parseInt(lengthParam, 10);

    if (isNaN(address) || address < 0 || address > 0xFFFF) {
      return c.json({ errors: ["address must be a valid hex value (0000-FFFF)"] }, 400);
    }
    if (isNaN(length) || length < 1 || length > 65536) {
      return c.json({ errors: ["length must be between 1 and 65536"] }, 400);
    }
    if (address + length > 0x10000) {
      return c.json({ errors: ["address + length exceeds 64KB address space"] }, 400);
    }

    const needsPause = length > AUTO_PAUSE_THRESHOLD;

    try {
      if (needsPause) {
        await pauseCpu(device);
      }

      const result = new Uint8Array(length);
      let offset = 0;

      while (offset < length) {
        const chunkLen = Math.min(CHUNK_SIZE, length - offset);
        const chunk = await readChunk(device, address + offset, chunkLen);
        result.set(chunk, offset);
        offset += chunkLen;
      }

      if (needsPause) {
        await resumeCpu(device);
      }

      return new Response(result, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    } catch (err) {
      // Best-effort resume if we paused
      if (needsPause) {
        try { await resumeCpu(device); } catch { /* ignore resume error */ }
      }
      const message = err instanceof Error ? err.message : "Memory read failed";
      return c.json({ errors: [message], proxy_error: true as const }, 502);
    }
  });

  // ── Write memory ───────────────────────────────────────
  memory.put("/devices/:deviceId/memory", async (c) => {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;

    let body: { address?: string; data?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ errors: ["Invalid JSON body"] }, 400);
    }

    if (!body.address || !body.data) {
      return c.json({ errors: ["address and data fields are required"] }, 400);
    }

    const address = parseInt(body.address, 16);
    if (isNaN(address) || address < 0 || address > 0xFFFF) {
      return c.json({ errors: ["address must be a valid hex value (0000-FFFF)"] }, 400);
    }

    if (!/^[0-9a-fA-F]*$/.test(body.data) || body.data.length % 2 !== 0) {
      return c.json({ errors: ["data must be a hex-encoded string with even length"] }, 400);
    }

    const byteLength = body.data.length / 2;
    if (address + byteLength > 0x10000) {
      return c.json({ errors: ["address + data length exceeds 64KB address space"] }, 400);
    }

    try {
      const res = await deviceFetch(device, `/v1/machine:writemem?address=${body.address.toUpperCase()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/binary" },
        body: hexToBytes(body.data),
      });

      if (!res.ok) {
        return c.json({ errors: [`writemem failed: HTTP ${res.status}`], proxy_error: true as const }, 502);
      }

      return c.json({ ok: true, address: body.address.toUpperCase(), bytes: byteLength });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Memory write failed";
      return c.json({ errors: [message], proxy_error: true as const }, 502);
    }
  });

  return memory;
}

/** Convert a hex string to a Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
