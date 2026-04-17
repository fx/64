import type { Context } from "hono";
import type { Device } from "@shared/types.ts";

const DEVICE_TIMEOUT_MS = 5000;
const CHUNK_SIZE = 256;

function deviceUrl(device: Device, path: string): string {
  return `http://${device.ip}:${device.port}${path}`;
}

function deviceHeaders(device: Device): Record<string, string> {
  const headers: Record<string, string> = {};
  if (device.password) headers["X-Password"] = device.password;
  return headers;
}

export async function deviceFetch(device: Device, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(deviceHeaders(device))) {
    headers.set(key, value);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);
  try {
    return await fetch(deviceUrl(device, path), {
      ...init,
      headers,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function proxyError(c: Context, message: string, status: number) {
  return c.json({ errors: [message], proxy_error: true as const }, status);
}

export function mapDeviceError(c: Context, err: unknown): Response {
  if (err instanceof DOMException && err.name === "AbortError") {
    return proxyError(c, "Device did not respond", 504);
  }
  const message = err instanceof Error ? err.message : "Device request failed";
  return proxyError(c, message, 502);
}

export class AuthError extends Error {
  constructor() { super("Authentication failed — check device password"); }
}

/** Read a single chunk of memory from the device */
export async function readChunk(device: Device, address: number, length: number): Promise<Uint8Array> {
  const addr = address.toString(16).toUpperCase().padStart(4, "0");
  const res = await deviceFetch(device, `/v1/machine:readmem?address=${addr}&length=${length}`);
  if (res.status === 403) {
    throw new AuthError();
  }
  if (!res.ok) {
    throw new Error(`readmem failed at $${addr}: HTTP ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/** Pause the device CPU */
export async function pauseCpu(device: Device): Promise<void> {
  const res = await deviceFetch(device, "/v1/machine:pause", { method: "PUT" });
  if (res.status === 403) throw new AuthError();
  if (!res.ok) {
    throw new Error(`Failed to pause CPU: HTTP ${res.status}`);
  }
}

/** Resume the device CPU */
export async function resumeCpu(device: Device): Promise<void> {
  const res = await deviceFetch(device, "/v1/machine:resume", { method: "PUT" });
  if (!res.ok) {
    throw new Error(`Failed to resume CPU: HTTP ${res.status}`);
  }
}

/** Read a full memory range from a device, chunking in 256-byte reads */
export async function readFullMemory(device: Device, address: number, length: number): Promise<Uint8Array> {
  const result = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const chunkLen = Math.min(CHUNK_SIZE, length - offset);
    const chunk = await readChunk(device, address + offset, chunkLen);
    result.set(chunk, offset);
    offset += chunkLen;
  }
  return result;
}
