import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createUploadMountRoutes } from "../src/server/routes/upload-mount.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDataPath() {
  return join(tmpdir(), `upload-mount-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
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

function makeFormData(file?: File, drive?: string, mode?: string): FormData {
  const form = new FormData();
  if (file) form.append("file", file);
  if (drive !== undefined) form.append("drive", drive);
  if (mode !== undefined) form.append("mode", mode);
  return form;
}

describe("Upload Mount Routes", () => {
  let dataPath: string;
  let store: DeviceStore;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    const routes = createUploadMountRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("successfully uploads and mounts a disk image", async () => {
    store.upsert(makeDevice());

    let capturedUrl = "";
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const file = new File([new Uint8Array(1024)], "game.d64", { type: "application/octet-stream" });
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([]);

    // Verify URL includes drive, mode, and type
    expect(capturedUrl).toContain("/v1/drives/a:mount");
    expect(capturedUrl).toContain("mode=readwrite");
    expect(capturedUrl).toContain("type=d64");
  });

  it("returns 404 when device not found", async () => {
    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/NONEXISTENT/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 503 when device is offline", async () => {
    store.upsert(makeDevice({ online: false }));

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("offline");
  });

  it("returns 400 when file is missing", async () => {
    store.upsert(makeDevice());

    const form = makeFormData(undefined, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("file is required");
  });

  it("returns 400 for invalid drive", async () => {
    store.upsert(makeDevice());

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "c", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("drive must be");
  });

  it("returns 400 for invalid mode", async () => {
    store.upsert(makeDevice());

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "execute");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("mode must be");
  });

  it("extracts file extension for image type", async () => {
    store.upsert(makeDevice());

    let capturedUrl = "";
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const file = new File([new Uint8Array(1)], "disk.g64", { type: "application/octet-stream" });
    const form = makeFormData(file, "b", "readonly");

    await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(capturedUrl).toContain("type=g64");
    expect(capturedUrl).toContain("/drives/b:mount");
    expect(capturedUrl).toContain("mode=readonly");
  });

  it("handles file with no extension", async () => {
    store.upsert(makeDevice());

    let capturedUrl = "";
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      capturedUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const file = new File([new Uint8Array(1)], "diskimage", { type: "application/octet-stream" });
    const form = makeFormData(file, "a", "readwrite");

    await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    // Should not include type parameter when no extension
    expect(capturedUrl).not.toContain("type=");
  });

  it("returns 504 on timeout", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    }) as typeof fetch;

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error).toContain("timeout");
  });

  it("returns 502 on ECONNREFUSED", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new Error("connect ECONNREFUSED 192.168.1.42:80");
    }) as typeof fetch;

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Connection refused");
  });

  it("returns 502 on generic network error", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new Error("some network issue");
    }) as typeof fetch;

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("Cannot reach");
  });

  it("injects X-Password header for devices with password", async () => {
    store.upsert(makeDevice({ password: "secret123" }));

    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = mock(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      capturedHeaders = headers ?? {};
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(capturedHeaders["X-Password"]).toBe("secret123");
  });

  it("forwards device JSON response as-is", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify({ errors: [], mounted: true, drive: "a" }), {
        headers: { "content-type": "application/json" },
      }),
    ) as typeof fetch;

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mounted).toBe(true);
  });

  it("returns empty errors for non-JSON device response", async () => {
    store.upsert(makeDevice());

    globalThis.fetch = mock(async () =>
      new Response("OK", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ) as typeof fetch;

    const file = new File([new Uint8Array(1)], "test.d64");
    const form = makeFormData(file, "a", "readwrite");

    const res = await app.request("/api/devices/ABC123/upload-mount", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toEqual([]);
  });
});
