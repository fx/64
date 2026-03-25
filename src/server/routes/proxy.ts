import { Hono } from "hono";
import { proxy } from "hono/proxy";
import type { DeviceStore } from "../lib/device-store.ts";
import type {
  C64UInfoResponse,
  C64UVersionResponse,
  C64UConfigCategoriesResponse,
  C64UConfigValuesResponse,
  C64UConfigDetailResponse,
  C64UDrivesResponse,
  C64UDebugRegResponse,
  C64UActionResponse,
  C64URunnerResponse,
  C64UStreamResponse,
  C64UFileInfoResponse,
  C64UFileCreateResponse,
  ProxyErrorResponse,
} from "@shared/c64u-types.ts";

const PROXY_TIMEOUT_MS = 5000;

function proxyError(message: string, status: number, c: { json: (data: ProxyErrorResponse, status: number) => Response }) {
  return c.json({ errors: [message], proxy_error: true as const }, status);
}

/**
 * Forward a request to a C64U device via Hono's proxy() helper.
 * Returns the device response or a proxy error envelope.
 */
async function forwardToDevice(
  c: { req: { raw: Request; url: string }; json: (data: ProxyErrorResponse, status: number) => Response },
  deviceIp: string,
  devicePort: number,
  devicePath: string,
  password?: string,
): Promise<Response> {
  const targetUrl = `http://${deviceIp}:${devicePort}${devicePath}`;

  const headers: Record<string, string> = {};
  // Copy original headers
  for (const [key, value] of c.req.raw.headers.entries()) {
    headers[key] = value;
  }
  // Inject X-Password if device has auth configured
  if (password) {
    headers["X-Password"] = password;
  }
  // Remove host header — it should reflect the target
  delete headers["host"];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

  try {
    const res = await proxy(targetUrl, {
      raw: c.req.raw,
      headers,
      signal: controller.signal,
    });

    // Check for auth failure from device
    if (res.status === 403) {
      return proxyError("Authentication failed — check device password", 403, c);
    }

    return res;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return proxyError("Device did not respond", 504, c);
    }
    return proxyError(`Cannot reach device at ${deviceIp}`, 502, c);
  } finally {
    clearTimeout(timer);
  }
}

export function createProxyRoutes(store: DeviceStore) {
  const proxyApp = new Hono();

  /** Resolve device or return error response */
  function resolveDevice(deviceId: string, c: { json: (data: ProxyErrorResponse, status: number) => Response }) {
    const device = store.get(deviceId);
    if (!device) {
      return { error: proxyError("Device not found", 404, c) };
    }
    if (!device.online) {
      return { error: proxyError("Device is offline", 503, c) };
    }
    return { device };
  }

  // ── About ──────────────────────────────────────────

  const aboutRoutes = proxyApp
    .get("/devices/:deviceId/v1/info", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/info", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UInfoResponse;
        return c.json(data);
      }
      return res;
    })
    .get("/devices/:deviceId/v1/version", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/version", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UVersionResponse;
        return c.json(data);
      }
      return res;
    });

  // ── Runners ────────────────────────────────────────

  const runnerRoutes = proxyApp
    .put("/devices/:deviceId/v1/runners\\:sidplay", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:sidplay${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/runners\\:sidplay", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:sidplay${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/runners\\:modplay", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:modplay${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/runners\\:modplay", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:modplay${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/runners\\:load_prg", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:load_prg${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/runners\\:load_prg", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/runners:load_prg", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/runners\\:run_prg", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:run_prg${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/runners\\:run_prg", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/runners:run_prg", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/runners\\:run_crt", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/runners:run_crt${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/runners\\:run_crt", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/runners:run_crt", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64URunnerResponse;
        return c.json(data);
      }
      return res;
    });

  // ── Configuration ──────────────────────────────────

  const configRoutes = proxyApp
    .get("/devices/:deviceId/v1/configs", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/configs", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UConfigCategoriesResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/configs", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/configs", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/configs\\:load_from_flash", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/configs:load_from_flash", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/configs\\:save_to_flash", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/configs:save_to_flash", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/configs\\:reset_to_default", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/configs:reset_to_default", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    });

  // ── Machine ────────────────────────────────────────

  const machineRoutes = proxyApp
    .put("/devices/:deviceId/v1/machine\\:reset", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:reset", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:reboot", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:reboot", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:pause", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:pause", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:resume", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:resume", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:poweroff", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:poweroff", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:menu_button", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:menu_button", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:writemem", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/machine:writemem${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .post("/devices/:deviceId/v1/machine\\:writemem", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/machine:writemem${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UActionResponse;
        return c.json(data);
      }
      return res;
    })
    .get("/devices/:deviceId/v1/machine\\:readmem", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/machine:readmem${url.search}`, device.password);
      // readmem returns binary (application/octet-stream) — pass through as-is
      return res;
    })
    .get("/devices/:deviceId/v1/machine\\:debugreg", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/machine:debugreg", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UDebugRegResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/machine\\:debugreg", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/machine:debugreg${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UDebugRegResponse;
        return c.json(data);
      }
      return res;
    });

  // ── Floppy Drives ──────────────────────────────────

  const driveRoutes = proxyApp
    .get("/devices/:deviceId/v1/drives", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const res = await forwardToDevice(c, device.ip, device.port, "/v1/drives", device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UDrivesResponse;
        return c.json(data);
      }
      return res;
    });

  // ── Data Streams ───────────────────────────────────

  const streamRoutes = proxyApp
    .put("/devices/:deviceId/v1/streams/:stream\\:start", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const stream = c.req.param("stream");
      const url = new URL(c.req.url);
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/streams/${stream}:start${url.search}`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UStreamResponse;
        return c.json(data);
      }
      return res;
    })
    .put("/devices/:deviceId/v1/streams/:stream\\:stop", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;
      const stream = c.req.param("stream");
      const res = await forwardToDevice(c, device.ip, device.port, `/v1/streams/${stream}:stop`, device.password);
      if (res.headers.get("content-type")?.includes("application/json")) {
        const data = await res.json() as C64UStreamResponse;
        return c.json(data);
      }
      return res;
    });

  // ── Catch-all proxy ────────────────────────────────
  // Forwards any /devices/:deviceId/v1/* that didn't match a typed route above.
  // This handles config sub-paths, drive sub-commands, file operations, etc.

  const catchAllRoutes = proxyApp
    .all("/devices/:deviceId/v1/*", async (c) => {
      const result = resolveDevice(c.req.param("deviceId"), c);
      if ("error" in result) return result.error;
      const { device } = result;

      // Extract the /v1/... portion from the URL path
      const fullPath = new URL(c.req.url).pathname;
      const prefix = `/api/devices/${c.req.param("deviceId")}`;
      const devicePath = fullPath.slice(prefix.length);
      const url = new URL(c.req.url);

      const res = await forwardToDevice(c, device.ip, device.port, `${devicePath}${url.search}`, device.password);
      return res;
    });

  return proxyApp;
}
