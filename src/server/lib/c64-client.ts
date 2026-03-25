import type { C64DeviceInfo, C64VersionResponse } from "@shared/types.ts";

export async function probeVersion(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 2000,
): Promise<C64VersionResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (password) headers["X-Password"] = password;
    const res = await fetch(`http://${ip}:${port}/v1/version`, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as C64VersionResponse;
    if (data.errors?.length) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchDeviceInfo(
  ip: string,
  port: number,
  password?: string,
  timeoutMs = 5000,
): Promise<C64DeviceInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {};
    if (password) headers["X-Password"] = password;
    const res = await fetch(`http://${ip}:${port}/v1/info`, {
      signal: controller.signal,
      headers,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as C64DeviceInfo;
    if (data.errors?.length) return null;
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
