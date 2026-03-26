import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MacroEngine } from "../src/server/lib/macro-engine.ts";
import type { Device, Macro, MacroStep } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "DEV001",
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

function makeMacro(
  steps: MacroStep[],
  overrides: Partial<Macro> = {},
): Macro {
  return {
    id: "MACRO001",
    name: "Test Macro",
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MacroEngine upload steps", () => {
  let engine: MacroEngine;
  let tempDir: string;
  let originalCwd: () => string;

  beforeEach(() => {
    engine = new MacroEngine();
    tempDir = join(tmpdir(), `macro-upload-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, "data", "games"), { recursive: true });
    originalCwd = process.cwd;
    process.cwd = () => tempDir;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.cwd = originalCwd;
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe("upload_mount", () => {
    it("reads file and POSTs binary to device mount endpoint", async () => {
      const fileContent = Buffer.from("fake-d64-content");
      writeFileSync(join(tempDir, "data", "games", "test.d64"), fileContent);

      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody: ArrayBuffer | null = null;
      let capturedHeaders: Record<string, string> = {};

      globalThis.fetch = (async (url: string | URL | Request, opts?: any) => {
        capturedUrl = String(url);
        capturedMethod = opts?.method || "GET";
        capturedHeaders = opts?.headers || {};
        if (opts?.body) {
          capturedBody = opts.body instanceof Buffer
            ? opts.body.buffer.slice(opts.body.byteOffset, opts.body.byteOffset + opts.body.byteLength)
            : opts.body;
        }
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_mount", localFile: "test.d64", drive: "a" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");
      expect(capturedMethod).toBe("POST");
      expect(capturedUrl).toContain("/v1/drives/a:mount");
      expect(capturedUrl).toContain("mode=readwrite");
      expect(capturedUrl).toContain("type=d64");
      expect(capturedHeaders["content-type"]).toBe("application/octet-stream");
    });

    it("uses specified drive and mode", async () => {
      writeFileSync(join(tempDir, "data", "games", "game.d81"), Buffer.alloc(10));

      let capturedUrl = "";
      globalThis.fetch = (async (url: string | URL | Request) => {
        capturedUrl = String(url);
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_mount", localFile: "game.d81", drive: "b", mode: "readonly" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");
      expect(capturedUrl).toContain("/v1/drives/b:mount");
      expect(capturedUrl).toContain("mode=readonly");
      expect(capturedUrl).toContain("type=d81");
    });

    it("includes X-Password header when device has password", async () => {
      writeFileSync(join(tempDir, "data", "games", "test.d64"), Buffer.alloc(10));

      let capturedHeaders: Record<string, string> = {};
      globalThis.fetch = (async (_url: string | URL | Request, opts?: any) => {
        capturedHeaders = opts?.headers || {};
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_mount", localFile: "test.d64", drive: "a" },
      ]);
      const device = makeDevice({ password: "secret" });
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");
      expect(capturedHeaders["X-Password"]).toBe("secret");
    });

    it("fails with missing file error", async () => {
      globalThis.fetch = (async () => {
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_mount", localFile: "nonexistent.d64", drive: "a" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.error).toContain("file not found");
      expect(updated.error).toContain("nonexistent.d64");
    });

    it("fails when device returns HTTP error", async () => {
      writeFileSync(join(tempDir, "data", "games", "test.d64"), Buffer.alloc(10));

      globalThis.fetch = (async () => {
        return new Response("Drive error", { status: 500 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_mount", localFile: "test.d64", drive: "a" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.error).toContain("HTTP 500");
    });
  });

  describe("upload_and_run", () => {
    it("mounts then runs PRG when runFile is provided", async () => {
      writeFileSync(join(tempDir, "data", "games", "game.d64"), Buffer.alloc(10));

      const fetchCalls: { url: string; method: string }[] = [];
      globalThis.fetch = (async (url: string | URL | Request, opts?: any) => {
        fetchCalls.push({ url: String(url), method: opts?.method || "GET" });
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_and_run", localFile: "game.d64", drive: "a", runFile: "GAME.PRG" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");

      // Should have made two calls: POST mount then PUT run_prg
      expect(fetchCalls).toHaveLength(2);
      expect(fetchCalls[0]!.method).toBe("POST");
      expect(fetchCalls[0]!.url).toContain("/v1/drives/a:mount");
      expect(fetchCalls[1]!.method).toBe("PUT");
      expect(fetchCalls[1]!.url).toContain("/v1/runners:run_prg");
      expect(fetchCalls[1]!.url).toContain("file=GAME.PRG");
    });

    it("only mounts when runFile is not provided", async () => {
      writeFileSync(join(tempDir, "data", "games", "game.d64"), Buffer.alloc(10));

      const fetchCalls: { url: string; method: string }[] = [];
      globalThis.fetch = (async (url: string | URL | Request, opts?: any) => {
        fetchCalls.push({ url: String(url), method: opts?.method || "GET" });
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_and_run", localFile: "game.d64", drive: "a" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");

      // Should have only made the mount call
      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0]!.method).toBe("POST");
      expect(fetchCalls[0]!.url).toContain("/v1/drives/a:mount");
    });

    it("fails when run step returns HTTP error after successful mount", async () => {
      writeFileSync(join(tempDir, "data", "games", "game.d64"), Buffer.alloc(10));

      let callCount = 0;
      globalThis.fetch = (async () => {
        callCount++;
        if (callCount === 2) {
          return new Response("Run error", { status: 500 });
        }
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_and_run", localFile: "game.d64", drive: "a", runFile: "GAME.PRG" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.error).toContain("run failed");
      expect(updated.error).toContain("HTTP 500");
    });

    it("includes X-Password on both mount and run requests", async () => {
      writeFileSync(join(tempDir, "data", "games", "game.d64"), Buffer.alloc(10));

      const capturedHeaders: Record<string, string>[] = [];
      globalThis.fetch = (async (_url: string | URL | Request, opts?: any) => {
        capturedHeaders.push({ ...(opts?.headers || {}) });
        return new Response("", { status: 200 });
      }) as any;

      const macro = makeMacro([
        { action: "upload_and_run", localFile: "game.d64", drive: "a", runFile: "GAME.PRG" },
      ]);
      const device = makeDevice({ password: "mypass" });
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");
      expect(capturedHeaders).toHaveLength(2);
      expect(capturedHeaders[0]!["X-Password"]).toBe("mypass");
      expect(capturedHeaders[1]!["X-Password"]).toBe("mypass");
    });
  });
});
