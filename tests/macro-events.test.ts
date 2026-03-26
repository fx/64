import { describe, it, expect } from "bun:test";
import { emitMacroEvent, onMacroEvent } from "../src/server/lib/macro-events.ts";
import type { MacroEvent } from "../src/shared/types.ts";

describe("macro-events", () => {
  it("emits events to listeners", () => {
    const received: MacroEvent[] = [];
    const unsub = onMacroEvent((e) => received.push(e));

    const event: MacroEvent = {
      type: "macro:step",
      executionId: "exec1",
      macroId: "macro1",
      deviceId: "dev1",
      data: { currentStep: 0, totalSteps: 3 },
    };
    emitMacroEvent(event);

    unsub();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("unsubscribes correctly", () => {
    const received: MacroEvent[] = [];
    const unsub = onMacroEvent((e) => received.push(e));

    unsub();

    emitMacroEvent({
      type: "macro:complete",
      executionId: "exec1",
      macroId: "macro1",
      deviceId: "dev1",
      data: { currentStep: 3, totalSteps: 3 },
    });

    expect(received).toHaveLength(0);
  });

  it("supports multiple listeners", () => {
    const received1: MacroEvent[] = [];
    const received2: MacroEvent[] = [];
    const unsub1 = onMacroEvent((e) => received1.push(e));
    const unsub2 = onMacroEvent((e) => received2.push(e));

    emitMacroEvent({
      type: "macro:failed",
      executionId: "exec1",
      macroId: "macro1",
      deviceId: "dev1",
      data: { currentStep: 1, totalSteps: 3, error: "Step failed" },
    });

    unsub1();
    unsub2();
    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it("delivers events with correct types", () => {
    const received: MacroEvent[] = [];
    const unsub = onMacroEvent((e) => received.push(e));

    emitMacroEvent({
      type: "macro:step",
      executionId: "e1",
      macroId: "m1",
      deviceId: "d1",
      data: { currentStep: 0, totalSteps: 2, step: { action: "reset" } },
    });

    emitMacroEvent({
      type: "macro:complete",
      executionId: "e1",
      macroId: "m1",
      deviceId: "d1",
      data: { currentStep: 2, totalSteps: 2 },
    });

    unsub();
    expect(received).toHaveLength(2);
    expect(received[0]!.type).toBe("macro:step");
    expect(received[0]!.data.step).toEqual({ action: "reset" });
    expect(received[1]!.type).toBe("macro:complete");
  });
});
