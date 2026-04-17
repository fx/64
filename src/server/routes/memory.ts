import { Hono } from "hono";
import type { Context } from "hono";
import type { DeviceStore } from "../lib/device-store.ts";
import type { Device } from "@shared/types.ts";
import {
  deviceFetch,
  proxyError,
  mapDeviceError,
  readChunk,
  pauseCpu,
  resumeCpu,
  AuthError,
} from "../lib/device-helpers.ts";

const CHUNK_SIZE = 256;
const AUTO_PAUSE_THRESHOLD = 4096;
const WRITEMEM_URL_MAX_BYTES = 128;

const HEX_PATTERN = /^[0-9a-fA-F]{1,4}$/;
const DECIMAL_PATTERN = /^[0-9]+$/;

export function createMemoryRoutes(store: DeviceStore) {
  const memory = new Hono();

  function resolveDevice(c: Context): Device | Response {
    const device = store.get(c.req.param("deviceId"));
    if (!device) return proxyError(c, "Device not found", 404);
    if (!device.online) return proxyError(c, "Device is offline", 503);
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

    if (!HEX_PATTERN.test(addressParam)) {
      return c.json({ errors: ["address must be a valid hex value (0000-FFFF)"] }, 400);
    }
    if (!DECIMAL_PATTERN.test(lengthParam)) {
      return c.json({ errors: ["length must be between 1 and 65536"] }, 400);
    }

    const address = parseInt(addressParam, 16);
    const length = parseInt(lengthParam, 10);

    if (address < 0 || address > 0xFFFF) {
      return c.json({ errors: ["address must be a valid hex value (0000-FFFF)"] }, 400);
    }
    if (length < 1 || length > 65536) {
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
      if (err instanceof AuthError) {
        return proxyError(c, err.message, 403);
      }
      return mapDeviceError(c, err);
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

    if (!HEX_PATTERN.test(body.address)) {
      return c.json({ errors: ["address must be a valid hex value (0000-FFFF)"] }, 400);
    }

    const address = parseInt(body.address, 16);
    if (address < 0 || address > 0xFFFF) {
      return c.json({ errors: ["address must be a valid hex value (0000-FFFF)"] }, 400);
    }

    if (!/^[0-9a-fA-F]*$/.test(body.data) || body.data.length % 2 !== 0) {
      return c.json({ errors: ["data must be a hex-encoded string with even length"] }, 400);
    }

    const byteLength = body.data.length / 2;
    if (address + byteLength > 0x10000) {
      return c.json({ errors: ["address + data length exceeds 64KB address space"] }, 400);
    }

    const normalizedAddress = body.address.toUpperCase();
    const normalizedData = body.data.toUpperCase();

    try {
      const res = byteLength <= WRITEMEM_URL_MAX_BYTES
        ? await deviceFetch(
            device,
            `/v1/machine:writemem?address=${normalizedAddress}&data=${normalizedData}`,
            { method: "PUT" },
          )
        : await deviceFetch(device, `/v1/machine:writemem?address=${normalizedAddress}`, {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: hexToBytes(body.data),
          });

      if (res.status === 403) {
        return proxyError(c, "Authentication failed — check device password", 403);
      }
      if (!res.ok) {
        return proxyError(c, `writemem failed: HTTP ${res.status}`, 502);
      }

      return c.json({ ok: true, address: normalizedAddress, bytes: byteLength });
    } catch (err) {
      return mapDeviceError(c, err);
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
