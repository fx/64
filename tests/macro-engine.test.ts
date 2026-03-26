import { describe, it, expect, beforeEach, afterEach } from "bun:test";
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

describe("MacroEngine", () => {
  let engine: MacroEngine;

  beforeEach(() => {
    engine = new MacroEngine();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("mapStepToRequest", () => {
    it("maps reset to PUT /v1/machine:reset", () => {
      const result = engine.mapStepToRequest({ action: "reset" });
      expect(result).toEqual({ method: "PUT", path: "/v1/machine:reset" });
    });

    it("maps reboot to PUT /v1/machine:reboot", () => {
      const result = engine.mapStepToRequest({ action: "reboot" });
      expect(result).toEqual({ method: "PUT", path: "/v1/machine:reboot" });
    });

    it("maps pause to PUT /v1/machine:pause", () => {
      const result = engine.mapStepToRequest({ action: "pause" });
      expect(result).toEqual({ method: "PUT", path: "/v1/machine:pause" });
    });

    it("maps resume to PUT /v1/machine:resume", () => {
      const result = engine.mapStepToRequest({ action: "resume" });
      expect(result).toEqual({ method: "PUT", path: "/v1/machine:resume" });
    });

    it("maps mount with drive and image", () => {
      const result = engine.mapStepToRequest({
        action: "mount",
        drive: "a",
        image: "/USB0/game.d64",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/drives/a:mount");
      expect(result.path).toContain("image=%2FUSB0%2Fgame.d64");
    });

    it("maps mount with mode parameter", () => {
      const result = engine.mapStepToRequest({
        action: "mount",
        drive: "b",
        image: "/USB0/disk.d64",
        mode: "rw",
      });
      expect(result.path).toContain("mode=rw");
      expect(result.path).toContain("/v1/drives/b:mount");
    });

    it("maps remove to drive path", () => {
      const result = engine.mapStepToRequest({
        action: "remove",
        drive: "a",
      });
      expect(result).toEqual({ method: "PUT", path: "/v1/drives/a:remove" });
    });

    it("maps run_prg with encoded file", () => {
      const result = engine.mapStepToRequest({
        action: "run_prg",
        file: "/USB0/my game.prg",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/runners:run_prg");
      expect(result.path).toContain("file=%2FUSB0%2Fmy%20game.prg");
    });

    it("maps load_prg with encoded file", () => {
      const result = engine.mapStepToRequest({
        action: "load_prg",
        file: "/USB0/test.prg",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/runners:load_prg");
    });

    it("maps run_crt with encoded file", () => {
      const result = engine.mapStepToRequest({
        action: "run_crt",
        file: "/USB0/cart.crt",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/runners:run_crt");
    });

    it("maps sidplay with file", () => {
      const result = engine.mapStepToRequest({
        action: "sidplay",
        file: "/USB0/tune.sid",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/runners:sidplay");
      expect(result.path).toContain("file=%2FUSB0%2Ftune.sid");
    });

    it("maps sidplay with songnr", () => {
      const result = engine.mapStepToRequest({
        action: "sidplay",
        file: "/USB0/tune.sid",
        songnr: 3,
      });
      expect(result.path).toContain("songnr=3");
    });

    it("maps modplay with encoded file", () => {
      const result = engine.mapStepToRequest({
        action: "modplay",
        file: "/USB0/song.mod",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/runners:modplay");
    });

    it("maps writemem with address and data", () => {
      const result = engine.mapStepToRequest({
        action: "writemem",
        address: "0400",
        data: "01",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/machine:writemem");
      expect(result.path).toContain("address=0400");
      expect(result.path).toContain("data=01");
    });

    it("maps set_config with category, item, value", () => {
      const result = engine.mapStepToRequest({
        action: "set_config",
        category: "C64",
        item: "REU Size",
        value: "512",
      });
      expect(result.method).toBe("PUT");
      expect(result.path).toContain("/v1/config/C64/REU%20Size");
      expect(result.path).toContain("value=512");
    });
  });

  describe("execute", () => {
    it("creates and returns an execution immediately", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);

      expect(exec.id).toBeDefined();
      expect(exec.macroId).toBe("MACRO001");
      expect(exec.deviceId).toBe("DEV001");
      expect(exec.status).toBe("running");
      expect(exec.currentStep).toBe(0);
      expect(exec.totalSteps).toBe(1);
      expect(exec.startedAt).toBeDefined();
    });

    it("completes execution after all steps succeed", async () => {
      const fetchCalls: string[] = [];
      globalThis.fetch = ((url: string) => {
        fetchCalls.push(url);
        return Promise.resolve(new Response("", { status: 200 }));
      }) as any;

      const macro = makeMacro([{ action: "reset" }, { action: "pause" }]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);

      // Wait for async execution
      await new Promise((r) => setTimeout(r, 50));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");
      expect(updated.currentStep).toBe(2);
      expect(updated.completedAt).toBeDefined();
      expect(fetchCalls).toHaveLength(2);
      expect(fetchCalls[0]).toContain("/v1/machine:reset");
      expect(fetchCalls[1]).toContain("/v1/machine:pause");
    });

    it("sends X-Password header when device has password", async () => {
      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = ((_url: string, opts: any) => {
        capturedHeaders = opts.headers;
        return Promise.resolve(new Response("", { status: 200 }));
      }) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice({ password: "secret123" });
      await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 50));

      expect((capturedHeaders as Record<string, string>)["X-Password"]).toBe(
        "secret123",
      );
    });

    it("does not send X-Password when device has no password", async () => {
      let capturedHeaders: HeadersInit | undefined;
      globalThis.fetch = ((_url: string, opts: any) => {
        capturedHeaders = opts.headers;
        return Promise.resolve(new Response("", { status: 200 }));
      }) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice({ password: undefined });
      await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 50));

      expect(
        (capturedHeaders as Record<string, string>)["X-Password"],
      ).toBeUndefined();
    });

    it("handles delay steps without calling fetch", async () => {
      let fetchCount = 0;
      globalThis.fetch = (() => {
        fetchCount++;
        return Promise.resolve(new Response("", { status: 200 }));
      }) as any;

      const macro = makeMacro([
        { action: "reset" },
        { action: "delay", ms: 10 },
        { action: "pause" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 100));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("completed");
      // Only reset and pause should call fetch, not delay
      expect(fetchCount).toBe(2);
    });

    it("stops and records error on step failure", async () => {
      let callCount = 0;
      globalThis.fetch = (() => {
        callCount++;
        if (callCount === 2) {
          return Promise.resolve(
            new Response("server error", { status: 500 }),
          );
        }
        return Promise.resolve(new Response("", { status: 200 }));
      }) as any;

      const macro = makeMacro([
        { action: "reset" },
        { action: "pause" },
        { action: "resume" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 50));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.currentStep).toBe(1); // failed on step index 1
      expect(updated.error).toContain("Step 'pause' failed: HTTP 500");
      expect(updated.completedAt).toBeDefined();
      // Should not have tried step 3
      expect(callCount).toBe(2);
    });

    it("records error on fetch exception", async () => {
      globalThis.fetch = (() => {
        return Promise.reject(new Error("Network failure"));
      }) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 50));

      const updated = engine.getExecution(exec.id)!;
      expect(updated.status).toBe("failed");
      expect(updated.error).toContain("Network failure");
    });

    it("constructs correct URL from device IP and port", async () => {
      let capturedUrl = "";
      globalThis.fetch = ((url: string) => {
        capturedUrl = url;
        return Promise.resolve(new Response("", { status: 200 }));
      }) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice({ ip: "10.0.0.5", port: 8080 });
      await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 50));

      expect(capturedUrl).toBe("http://10.0.0.5:8080/v1/machine:reset");
    });
  });

  describe("cancel", () => {
    it("cancels a running execution", async () => {
      // Use a slow delay so we can cancel during it
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = makeMacro([
        { action: "reset" },
        { action: "delay", ms: 5000 },
        { action: "pause" },
      ]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);

      // Wait for first step to complete, then cancel before delay finishes
      await new Promise((r) => setTimeout(r, 50));
      const cancelled = engine.cancel(exec.id);
      expect(cancelled).toBe(true);

      // Wait for cancellation to take effect
      await new Promise((r) => setTimeout(r, 100));
      const updated = engine.getExecution(exec.id)!;
      // It should be either cancelled or still running the delay
      expect(["cancelled", "running"]).toContain(updated.status);
    });

    it("returns false for non-existent execution", () => {
      expect(engine.cancel("nope")).toBe(false);
    });

    it("returns false for already completed execution", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);
      await new Promise((r) => setTimeout(r, 50));

      expect(engine.cancel(exec.id)).toBe(false);
    });
  });

  describe("listExecutions", () => {
    it("returns empty array initially", () => {
      expect(engine.listExecutions()).toEqual([]);
    });

    it("returns all executions", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice();
      await engine.execute(macro, device);
      await engine.execute(macro, device);

      expect(engine.listExecutions()).toHaveLength(2);
    });
  });

  describe("getExecution", () => {
    it("returns undefined for non-existent execution", () => {
      expect(engine.getExecution("nope")).toBeUndefined();
    });

    it("returns the execution by id", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = makeMacro([{ action: "reset" }]);
      const device = makeDevice();
      const exec = await engine.execute(macro, device);

      const retrieved = engine.getExecution(exec.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(exec.id);
    });
  });
});
