import type { C64DeviceInfo, C64VersionResponse } from "@shared/types.ts";
import type { C64UDrivesResponse } from "@shared/c64u-types.ts";

export type C64FetchResult<T> = { ok: true; data: T } | { ok: false; reason: string };

async function c64Fetch<T extends { errors?: string[] }>(
  ip: string,
  port: number,
  path: string,
  password?: string,
  timeoutMs = 2000,
): Promise<C64FetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (password) headers["X-Password"] = password;
    const res = await fetch(`http://${ip}:${port}${path}`, {
      signal: controller.signal,
      headers,
    });
    if (res.status === 403) {
      return { ok: false, reason: `Authentication failed — check device password` };
    }
    if (!res.ok) {
      return { ok: false, reason: `Device returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    if (data.errors?.length) {
      return { ok: false, reason: data.errors.join("; ") };
    }
    return { ok: true, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, reason: `Device at ${ip}:${port} did not respond (timeout after ${timeoutMs}ms)` };
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED")) {
      return { ok: false, reason: `Connection refused by ${ip}:${port} — is the device powered on?` };
    }
    if (msg.includes("EHOSTUNREACH") || msg.includes("ENETUNREACH")) {
      return { ok: false, reason: `${ip} is unreachable — check network connection` };
    }
    if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
      return { ok: false, reason: `Cannot resolve ${ip} — check the address` };
    }
    return { ok: false, reason: `Cannot connect to ${ip}:${port} — ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function probeVersion(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 2000,
): Promise<C64FetchResult<C64VersionResponse>> {
  return c64Fetch<C64VersionResponse>(ip, port, "/v1/version", password, timeoutMs);
}

export async function fetchDeviceInfo(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 5000,
): Promise<C64FetchResult<C64DeviceInfo>> {
  return c64Fetch<C64DeviceInfo>(ip, port, "/v1/info", password, timeoutMs);
}

export async function fetchDrives(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 5000,
): Promise<C64FetchResult<C64UDrivesResponse>> {
  return c64Fetch<C64UDrivesResponse>(ip, port, "/v1/drives", password, timeoutMs);
}
