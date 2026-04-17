import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createMemoryRoutes } from "../src/server/routes/memory.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDataPath() {
  return join(tmpdir(), `memory-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

describe("Memory Routes", () => {
  let dataPath: string;
  let store: DeviceStore;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    const routes = createMemoryRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  // ── GET /devices/:deviceId/memory — validation ──

  it("returns 404 when device not found", async () => {
    const res = await app.request("/api/devices/NOPE/memory?address=0400&length=16");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errors[0]).toContain("not found");
    expect(body.proxy_error).toBe(true);
  });

  it("returns 503 when device is offline", async () => {
    store.upsert(makeDevice({ online: false }));
    const res = await app.request("/api/devices/ABC123/memory?address=0400&length=16");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.errors[0]).toContain("offline");
  });

  it("returns 400 when address param is missing", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory?length=16");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("address");
  });

  it("returns 400 when length param is missing", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory?address=0400");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("length");
  });

  it("returns 400 for invalid hex address", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory?address=ZZZZ&length=16");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("valid hex");
  });

  it("returns 400 when length is 0", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory?address=0400&length=0");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("between 1 and 65536");
  });

  it("returns 400 when length exceeds 65536", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=65537");
    expect(res.status).toBe(400);
  });

  it("returns 400 when address + length exceeds 64KB", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory?address=FF00&length=512");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("exceeds");
  });

  // ── GET /devices/:deviceId/memory — small read (no chunking needed) ──

  it("reads a small memory range in a single chunk", async () => {
    store.upsert(makeDevice());
    const data = new Uint8Array([0x48, 0x45, 0x4C, 0x4C, 0x4F]);

    globalThis.fetch = mock(async () =>
      new Response(data, { headers: { "content-type": "application/octet-stream" } }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0400&length=5");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    const result = new Uint8Array(await res.arrayBuffer());
    expect(result).toEqual(data);
  });

  // ── GET /devices/:deviceId/memory — chunked read ──

  it("reads large range in 256-byte chunks", async () => {
    store.upsert(makeDevice());
    const totalLength = 512;
    let fetchCount = 0;

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      fetchCount++;
      // Return chunk filled with the chunk index
      const chunk = new Uint8Array(256).fill(fetchCount);
      return new Response(chunk, { headers: { "content-type": "application/octet-stream" } });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0400&length=512");
    expect(res.status).toBe(200);
    const result = new Uint8Array(await res.arrayBuffer());
    expect(result.length).toBe(totalLength);
    // 512 bytes / 256 chunk = 2 fetch calls
    expect(fetchCount).toBe(2);
    // First 256 bytes filled with 1, next 256 with 2
    expect(result[0]).toBe(1);
    expect(result[255]).toBe(1);
    expect(result[256]).toBe(2);
    expect(result[511]).toBe(2);
  });

  it("handles non-aligned chunk sizes", async () => {
    store.upsert(makeDevice());
    let fetchCount = 0;
    const lengths: number[] = [];

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      const parsed = new URL(url);
      lengths.push(parseInt(parsed.searchParams.get("length") || "0", 10));
      fetchCount++;
      const chunkLen = parseInt(parsed.searchParams.get("length") || "256", 10);
      return new Response(new Uint8Array(chunkLen).fill(0xAA), {
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=300");
    expect(res.status).toBe(200);
    const result = new Uint8Array(await res.arrayBuffer());
    expect(result.length).toBe(300);
    // Should be 2 chunks: 256 + 44
    expect(fetchCount).toBe(2);
    expect(lengths).toEqual([256, 44]);
  });

  // ── GET /devices/:deviceId/memory — auto-pause/resume for >4KB ──

  it("pauses and resumes CPU for reads >4KB", async () => {
    store.upsert(makeDevice());
    const calls: string[] = [];

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("machine:pause")) {
        calls.push("pause");
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:resume")) {
        calls.push("resume");
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:readmem")) {
        calls.push("readmem");
        const parsed = new URL(url);
        const len = parseInt(parsed.searchParams.get("length") || "256", 10);
        return new Response(new Uint8Array(len), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    // 4097 bytes > 4096 threshold
    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=4097");
    expect(res.status).toBe(200);
    const result = new Uint8Array(await res.arrayBuffer());
    expect(result.length).toBe(4097);

    // Should start with pause, end with resume
    expect(calls[0]).toBe("pause");
    expect(calls[calls.length - 1]).toBe("resume");
    // All middle calls should be readmem
    const readmemCalls = calls.filter((c) => c === "readmem");
    // 4097 / 256 = 17 chunks (16 full + 1 partial)
    expect(readmemCalls.length).toBe(17);
  });

  it("does not pause/resume for reads <=4KB", async () => {
    store.upsert(makeDevice());
    const calls: string[] = [];

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("machine:pause")) calls.push("pause");
      if (url.includes("machine:resume")) calls.push("resume");
      if (url.includes("machine:readmem")) {
        calls.push("readmem");
        const parsed = new URL(url);
        const len = parseInt(parsed.searchParams.get("length") || "256", 10);
        return new Response(new Uint8Array(len), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("", { status: 200 });
    }) as typeof fetch;

    // Exactly 4096 — at the threshold, not over
    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=4096");
    expect(res.status).toBe(200);
    expect(calls).not.toContain("pause");
    expect(calls).not.toContain("resume");
  });

  it("resumes CPU even if readmem fails mid-read", async () => {
    store.upsert(makeDevice());
    let readCount = 0;
    let resumed = false;

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("machine:pause")) return new Response("", { status: 200 });
      if (url.includes("machine:resume")) {
        resumed = true;
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:readmem")) {
        readCount++;
        if (readCount > 2) {
          return new Response("error", { status: 500 });
        }
        return new Response(new Uint8Array(256), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=8192");
    expect(res.status).toBe(502);
    // CPU should have been resumed despite the error
    expect(resumed).toBe(true);
  });

  // ── GET /devices/:deviceId/memory — full 64KB read ──

  it("reads full 64KB memory space", async () => {
    store.upsert(makeDevice());
    const calls: string[] = [];

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("machine:pause")) {
        calls.push("pause");
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:resume")) {
        calls.push("resume");
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:readmem")) {
        calls.push("readmem");
        const parsed = new URL(url);
        const len = parseInt(parsed.searchParams.get("length") || "256", 10);
        return new Response(new Uint8Array(len).fill(0x42), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=65536");
    expect(res.status).toBe(200);
    const result = new Uint8Array(await res.arrayBuffer());
    expect(result.length).toBe(65536);
    // Should pause + resume for >4KB
    expect(calls[0]).toBe("pause");
    expect(calls[calls.length - 1]).toBe("resume");
    // 65536 / 256 = 256 readmem calls
    expect(calls.filter((c) => c === "readmem").length).toBe(256);
  });

  it("returns 502 when pause CPU fails for large read", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("machine:pause")) {
        return new Response("error", { status: 500 });
      }
      return new Response(new Uint8Array(256), {
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0000&length=8192");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.errors[0]).toContain("Failed to pause CPU");
  });

  // ── GET — device error handling ──

  it("returns 502 when readmem device call fails", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("Internal Server Error", { status: 500 }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory?address=0400&length=16");
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.errors[0]).toContain("readmem failed");
    expect(body.proxy_error).toBe(true);
  });

  // ── GET — address forwarding ──

  it("forwards correct hex address to device", async () => {
    store.upsert(makeDevice());
    let capturedUrl = "";

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("readmem")) capturedUrl = url;
      return new Response(new Uint8Array(16), {
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;

    await app.request("/api/devices/ABC123/memory?address=C000&length=16");
    expect(capturedUrl).toContain("address=C000");
    expect(capturedUrl).toContain("length=16");
  });

  it("pads short hex addresses to 4 digits", async () => {
    store.upsert(makeDevice());
    let capturedUrl = "";

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url.includes("readmem")) capturedUrl = url;
      return new Response(new Uint8Array(1), {
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;

    await app.request("/api/devices/ABC123/memory?address=02&length=1");
    expect(capturedUrl).toContain("address=0002");
  });

  // ── GET — password forwarding ──

  it("sends X-Password header to device for reads", async () => {
    store.upsert(makeDevice({ password: "secret123" }));
    let capturedHeaders: Headers | null = null;

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers) {
        capturedHeaders = new Headers(init.headers as HeadersInit);
      }
      return new Response(new Uint8Array(1), {
        headers: { "content-type": "application/octet-stream" },
      });
    }) as typeof fetch;

    await app.request("/api/devices/ABC123/memory?address=0400&length=1");
    expect(capturedHeaders).not.toBeNull();
    expect(capturedHeaders!.get("X-Password")).toBe("secret123");
  });

  // ── PUT /devices/:deviceId/memory — validation ──

  it("returns 404 for write when device not found", async () => {
    const res = await app.request("/api/devices/NOPE/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "48454C4C4F" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 503 for write when device is offline", async () => {
    store.upsert(makeDevice({ online: false }));
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "48454C4C4F" }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 400 for write with invalid JSON body", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("Invalid JSON");
  });

  it("returns 400 when write address is missing", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: "48454C4C4F" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("required");
  });

  it("returns 400 when write data is missing", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("required");
  });

  it("returns 400 for invalid hex address in write", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "ZZZZ", data: "FF" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("valid hex");
  });

  it("returns 400 for odd-length hex data in write", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "ABC" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("even length");
  });

  it("returns 400 for non-hex data in write", async () => {
    store.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "GHIJ" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("hex-encoded");
  });

  it("returns 400 when write data exceeds 64KB boundary", async () => {
    store.upsert(makeDevice());
    // Address FFFF + 2 bytes = overflow
    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "FFFF", data: "AABB" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("exceeds");
  });

  // ── PUT /devices/:deviceId/memory — successful write ──

  it("writes memory successfully", async () => {
    store.upsert(makeDevice());
    let capturedUrl = "";
    let capturedBody: Uint8Array | null = null;

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      capturedUrl = url;
      if (init?.body) {
        capturedBody = new Uint8Array(init.body as ArrayBuffer);
      }
      return new Response(JSON.stringify({ errors: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "48454C4C4F" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address).toBe("0400");
    expect(body.bytes).toBe(5);

    expect(capturedUrl).toContain("machine:writemem");
    expect(capturedUrl).toContain("address=0400");
    expect(capturedBody).toEqual(new Uint8Array([0x48, 0x45, 0x4C, 0x4C, 0x4F]));
  });

  it("uppercases address in write response", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ errors: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "c000", data: "FF" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address).toBe("C000");
  });

  it("sends X-Password header for writes", async () => {
    store.upsert(makeDevice({ password: "mypass" }));
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return new Response(JSON.stringify({ errors: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "FF" }),
    });

    expect(capturedHeaders["X-Password"]).toBe("mypass");
  });

  it("returns 502 when writemem device call fails", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("error", { status: 500 }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "FF" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.errors[0]).toContain("writemem failed");
    expect(body.proxy_error).toBe(true);
  });

  it("returns 502 when write fetch throws network error", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new Error("connect ECONNREFUSED");
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/memory", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "0400", data: "FF" }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.proxy_error).toBe(true);
  });
});
