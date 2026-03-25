import { Hono } from "hono";
import { proxy } from "hono/proxy";
import type { Context } from "hono";
import type { DeviceStore } from "../lib/device-store.ts";
import type { Device } from "@shared/types.ts";
import type {
  C64UInfoResponse,
  C64UVersionResponse,
  C64UConfigCategoriesResponse,
  C64UDrivesResponse,
  C64UDebugRegResponse,
  C64UActionResponse,
  ProxyErrorResponse,
} from "@shared/c64u-types.ts";

const PROXY_TIMEOUT_MS = 5000;

function proxyError(c: Context, message: string, status: number) {
  return c.json({ errors: [message], proxy_error: true as const } satisfies ProxyErrorResponse, status);
}

/** Forward a request to a C64U device. Returns the device response or a proxy error envelope. */
async function forwardToDevice(c: Context, device: Device, devicePath: string): Promise<Response> {
  const targetUrl = `http://${device.ip}:${device.port}${devicePath}`;

  const headers: Record<string, string> = {};
  for (const [key, value] of c.req.raw.headers.entries()) {
    headers[key] = value;
  }
  if (device.password) {
    headers["X-Password"] = device.password;
  }
  delete headers["host"];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await proxy(targetUrl, {
      raw: c.req.raw,
      headers,
      signal: controller.signal,
    });

    if (res.status === 403) {
      return proxyError(c, "Authentication failed — check device password", 403);
    }
    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return proxyError(c, "Device did not respond", 504);
    }
    return proxyError(c, `Cannot reach device at ${device.ip}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the /v1/... device path and query string from the proxy request URL */
function extractDevicePath(c: Context): string {
  const url = new URL(c.req.url);
  const prefix = `/api/devices/${c.req.param("deviceId")}`;
  return url.pathname.slice(prefix.length) + url.search;
}

export function createProxyRoutes(store: DeviceStore) {
  const proxyApp = new Hono();

  /** Resolve a device by ID, returning 404/503 proxy errors for missing/offline devices */
  function resolveDevice(c: Context): Device | Response {
    const device = store.get(c.req.param("deviceId"));
    if (!device) return proxyError(c, "Device not found", 404);
    if (!device.online) return proxyError(c, "Device is offline", 503);
    return device;
  }

  /** Typed JSON proxy: resolve device, forward, parse JSON response with the given type */
  async function typedJsonProxy<T>(c: Context, path: string): Promise<Response> {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;
    const res = await forwardToDevice(c, device, path);
    if (res.headers.get("content-type")?.includes("application/json")) {
      const data = (await res.json()) as T;
      return c.json(data, res.status as 200);
    }
    return res;
  }

  // ── Typed routes for Hono RPC inference ────────────
  // Only endpoints with distinct response shapes get explicit routes.
  // Everything else is handled by the catch-all below.

  // About
  proxyApp
    .get("/devices/:deviceId/v1/info", (c) =>
      typedJsonProxy<C64UInfoResponse>(c, "/v1/info"))
    .get("/devices/:deviceId/v1/version", (c) =>
      typedJsonProxy<C64UVersionResponse>(c, "/v1/version"))

    // Configuration
    .get("/devices/:deviceId/v1/configs", (c) =>
      typedJsonProxy<C64UConfigCategoriesResponse>(c, "/v1/configs"))

    // Floppy Drives
    .get("/devices/:deviceId/v1/drives", (c) =>
      typedJsonProxy<C64UDrivesResponse>(c, "/v1/drives"))

    // Machine — readmem returns binary, debugreg has a unique response shape
    .get("/devices/:deviceId/v1/machine\\:readmem", async (c) => {
      const device = resolveDevice(c);
      if (device instanceof Response) return device;
      return forwardToDevice(c, device, `/v1/machine:readmem${new URL(c.req.url).search}`);
    })
    .get("/devices/:deviceId/v1/machine\\:debugreg", (c) =>
      typedJsonProxy<C64UDebugRegResponse>(c, "/v1/machine:debugreg"))
    .put("/devices/:deviceId/v1/machine\\:debugreg", async (c) => {
      const device = resolveDevice(c);
      if (device instanceof Response) return device;
      const res = await forwardToDevice(c, device, `/v1/machine:debugreg${new URL(c.req.url).search}`);
      if (res.headers.get("content-type")?.includes("application/json")) {
        return c.json((await res.json()) as C64UDebugRegResponse, res.status as 200);
      }
      return res;
    });

  // ── Catch-all proxy ────────────────────────────────
  // Handles all /v1/* endpoints not matched above: runners, machine actions,
  // config sub-paths, drive commands, streams, files.
  // Responses are untyped (the catch-all returns C64UActionResponse for JSON).

  proxyApp
    .all("/devices/:deviceId/v1/*", async (c) => {
      const device = resolveDevice(c);
      if (device instanceof Response) return device;
      const res = await forwardToDevice(c, device, extractDevicePath(c));
      if (res.headers.get("content-type")?.includes("application/json")) {
        return c.json((await res.json()) as C64UActionResponse, res.status as 200);
      }
      return res;
    });

  return proxyApp;
}
