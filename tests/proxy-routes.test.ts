import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createProxyRoutes } from "../src/server/routes/proxy.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDataPath() {
  return join(tmpdir(), `proxy-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "ABC123",
    name: "Test Device",
    ip: "192.168.1.42",
    port: 80,
    product: "Ultimate 64",
    firmware: "3.12",
    fpga: "11F",
    online: true,
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

describe("Proxy Routes", () => {
  let dataPath: string;
  let store: DeviceStore;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    const routes = createProxyRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("proxies JSON response from device", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ version: "0.1", errors: [] }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/version");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe("0.1");
  });

  it("proxies binary response from device", async () => {
    store.upsert(makeDevice());

    const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    globalThis.fetch = mock(async () =>
      new Response(binaryData, {
        headers: { "content-type": "application/octet-stream" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/machine:readmem?addr=0&len=4");
    expect(res.status).toBe(200);
    const data = new Uint8Array(await res.arrayBuffer());
    expect(data).toEqual(binaryData);
  });

  it("returns 404 when device not found", async () => {
    const res = await app.request("/api/devices/NONEXISTENT/v1/version");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errors).toBeDefined();
    expect(body.proxy_error).toBe(true);
  });

  it("returns 503 when device is offline", async () => {
    store.upsert(makeDevice({ online: false }));

    const res = await app.request("/api/devices/ABC123/v1/version");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errors[0]).toContain("offline");
    expect(body.proxy_error).toBe(true);
  });

  it("returns 403 when device returns auth error", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("Forbidden", { status: 403 }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/version");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.errors[0]).toContain("Authentication");
    expect(body.proxy_error).toBe(true);
  });

  it("returns 504 on timeout", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/version");
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.errors[0]).toContain("did not respond");
    expect(body.proxy_error).toBe(true);
  });

  it("returns 502 on network error", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/version");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.errors[0]).toContain("Cannot reach");
    expect(body.proxy_error).toBe(true);
  });

  it("injects X-Password header for devices with password", async () => {
    store.upsert(makeDevice({ password: "secret123" }));

    let capturedHeaders: Headers | null = null;
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input instanceof Request) {
        capturedHeaders = input.headers;
      } else if (init?.headers) {
        if (init.headers instanceof Headers) {
          capturedHeaders = init.headers;
        } else {
          capturedHeaders = new Headers(init.headers as HeadersInit);
        }
      }
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/version");
    expect(res.status).toBe(200);

    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get("X-Password")).toBe("secret123");
  });

  it("forwards query string to device via catch-all route", async () => {
    store.upsert(makeDevice());

    let capturedUrl = "";
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      if (input instanceof Request) {
        capturedUrl = input.url;
      } else if (typeof input === "string") {
        capturedUrl = input;
      } else {
        capturedUrl = input.toString();
      }
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    // Use a path handled by the catch-all which uses extractDevicePath (includes query string)
    await app.request("/api/devices/ABC123/v1/runners/sidplay?file=test.sid&loop=1");

    expect(capturedUrl).toContain("file=test.sid");
    expect(capturedUrl).toContain("loop=1");
  });

  it("handles catch-all route for untyped v1 endpoints", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/runners/sidplay?file=test.sid", {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  // ── Typed JSON proxy routes ──

  it("proxies /v1/info as typed JSON", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          product: "Ultimate 64",
          firmware_version: "3.12",
          fpga_version: "11F",
          core_version: "143",
          hostname: "TestDevice",
          unique_id: "ABC123",
          errors: [],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/info");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.product).toBe("Ultimate 64");
  });

  it("proxies /v1/configs as typed JSON", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ categories: ["Audio", "Video"], errors: [] }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/configs");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.categories).toEqual(["Audio", "Video"]);
  });

  it("proxies /v1/drives as typed JSON", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ drives: [], errors: [] }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/drives");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.drives).toEqual([]);
  });

  it("proxies /v1/machine:debugreg GET as typed JSON", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ value: "0x42", errors: [] }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/machine:debugreg");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe("0x42");
  });

  it("proxies /v1/machine:debugreg PUT as typed JSON", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ value: "0xFF", errors: [] }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/machine:debugreg?value=0xFF", {
      method: "PUT",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.value).toBe("0xFF");
  });

  it("proxies /v1/machine:debugreg PUT returns non-JSON as-is", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/machine:debugreg?value=0xFF", {
      method: "PUT",
    });
    expect(res.status).toBe(200);
  });

  it("proxies /v1/machine:readmem as binary", async () => {
    store.upsert(makeDevice());

    const binaryData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF]);
    globalThis.fetch = mock(async () =>
      new Response(binaryData, {
        headers: { "content-type": "application/octet-stream" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/machine:readmem?addr=0&len=4");
    expect(res.status).toBe(200);
    const data = new Uint8Array(await res.arrayBuffer());
    expect(data).toEqual(binaryData);
  });

  it("returns 404 for readmem when device not found", async () => {
    const res = await app.request("/api/devices/NOPE/v1/machine:readmem?addr=0&len=4");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.proxy_error).toBe(true);
  });

  it("returns 503 for readmem when device offline", async () => {
    store.upsert(makeDevice({ online: false }));

    const res = await app.request("/api/devices/ABC123/v1/machine:readmem?addr=0&len=4");
    expect(res.status).toBe(503);
  });

  it("returns non-JSON response from typed proxy as-is", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("plain text", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/info");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("plain text");
  });

  it("returns non-JSON response from catch-all as-is", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("binary-data", {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/v1/streams/audio");
    expect(res.status).toBe(200);
  });
});
