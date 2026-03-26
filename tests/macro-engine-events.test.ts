import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MacroEngine } from "../src/server/lib/macro-engine.ts";
import { onMacroEvent } from "../src/server/lib/macro-events.ts";
import type { Device, Macro, MacroEvent, MacroStep } from "../src/shared/types.ts";

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

describe("MacroEngine SSE events", () => {
  let engine: MacroEngine;
  let events: MacroEvent[];
  let unsub: () => void;

  beforeEach(() => {
    engine = new MacroEngine();
    events = [];
    unsub = onMacroEvent((e) => events.push(e));
  });

  afterEach(() => {
    unsub();
    globalThis.fetch = originalFetch;
  });

  it("emits macro:step after each successful step", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as any;

    const macro = makeMacro([{ action: "reset" }, { action: "pause" }]);
    const device = makeDevice();
    await engine.execute(macro, device);
    await new Promise((r) => setTimeout(r, 100));

    const stepEvents = events.filter((e) => e.type === "macro:step");
    expect(stepEvents).toHaveLength(2);
    expect(stepEvents[0]!.data.currentStep).toBe(0);
    expect(stepEvents[0]!.data.totalSteps).toBe(2);
    expect(stepEvents[1]!.data.currentStep).toBe(1);
  });

  it("emits macro:complete when all steps finish", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as any;

    const macro = makeMacro([{ action: "reset" }]);
    const device = makeDevice();
    await engine.execute(macro, device);
    await new Promise((r) => setTimeout(r, 100));

    const completeEvents = events.filter((e) => e.type === "macro:complete");
    expect(completeEvents).toHaveLength(1);
    expect(completeEvents[0]!.macroId).toBe("MACRO001");
    expect(completeEvents[0]!.deviceId).toBe("DEV001");
    expect(completeEvents[0]!.data.currentStep).toBe(1);
    expect(completeEvents[0]!.data.totalSteps).toBe(1);
  });

  it("emits macro:failed on step failure", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("server error", { status: 500 }),
      )) as any;

    const macro = makeMacro([{ action: "reset" }]);
    const device = makeDevice();
    await engine.execute(macro, device);
    await new Promise((r) => setTimeout(r, 100));

    const failedEvents = events.filter((e) => e.type === "macro:failed");
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]!.data.error).toContain("HTTP 500");
    expect(failedEvents[0]!.data.currentStep).toBe(0);
  });

  it("emits macro:failed on cancellation", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as any;

    const macro = makeMacro([
      { action: "reset" },
      { action: "delay", ms: 5000 },
      { action: "pause" },
    ]);
    const device = makeDevice();
    const exec = await engine.execute(macro, device);

    // Wait for first step to complete, then cancel during delay
    await new Promise((r) => setTimeout(r, 50));
    engine.cancel(exec.id);
    await new Promise((r) => setTimeout(r, 200));

    const failedEvents = events.filter((e) => e.type === "macro:failed");
    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]!.data.error).toBe("Cancelled");
  });

  it("includes step data in macro:step events", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as any;

    const macro = makeMacro([
      { action: "mount", drive: "a", image: "/USB0/game.d64" },
    ]);
    const device = makeDevice();
    await engine.execute(macro, device);
    await new Promise((r) => setTimeout(r, 100));

    const stepEvents = events.filter((e) => e.type === "macro:step");
    expect(stepEvents).toHaveLength(1);
    expect(stepEvents[0]!.data.step).toEqual({
      action: "mount",
      drive: "a",
      image: "/USB0/game.d64",
    });
  });

  it("includes executionId in all events", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as any;

    const macro = makeMacro([{ action: "reset" }]);
    const device = makeDevice();
    const exec = await engine.execute(macro, device);
    await new Promise((r) => setTimeout(r, 100));

    for (const event of events) {
      expect(event.executionId).toBe(exec.id);
    }
  });

  it("emits macro:step for all steps including delay", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response("", { status: 200 }))) as any;

    const macro = makeMacro([
      { action: "reset" },
      { action: "delay", ms: 10 },
      { action: "pause" },
    ]);
    const device = makeDevice();
    await engine.execute(macro, device);
    await new Promise((r) => setTimeout(r, 200));

    const stepEvents = events.filter((e) => e.type === "macro:step");
    // All 3 steps (including delay) emit macro:step
    expect(stepEvents).toHaveLength(3);
    expect(stepEvents[0]!.data.currentStep).toBe(0);
    expect(stepEvents[1]!.data.currentStep).toBe(1);
    expect(stepEvents[2]!.data.currentStep).toBe(2);
  });
});
