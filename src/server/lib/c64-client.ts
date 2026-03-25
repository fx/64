import type { C64DeviceInfo, C64VersionResponse } from "@shared/types.ts";

async function c64Fetch<T extends { errors?: string[] }>(
  ip: string,
  port: number,
  path: string,
  password?: string,
  timeoutMs = 2000,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (password) headers["X-Password"] = password;
    const res = await fetch(`http://${ip}:${port}${path}`, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as T;
    if (data.errors?.length) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function probeVersion(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 2000,
): Promise<C64VersionResponse | null> {
  return c64Fetch<C64VersionResponse>(ip, port, "/v1/version", password, timeoutMs);
}

export function fetchDeviceInfo(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 5000,
): Promise<C64DeviceInfo | null> {
  return c64Fetch<C64DeviceInfo>(ip, port, "/v1/info", password, timeoutMs);
}
