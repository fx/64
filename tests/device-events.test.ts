import { describe, it, expect } from "bun:test";
import { emitDeviceEvent, onDeviceEvent } from "../src/server/lib/device-events.ts";
import type { DeviceEvent } from "../src/shared/types.ts";

describe("device-events", () => {
  it("emits events to listeners", () => {
    const received: DeviceEvent[] = [];
    const unsubscribe = onDeviceEvent((e) => received.push(e));

    emitDeviceEvent({
      type: "device:online",
      data: { id: "ABC123", ip: "192.168.1.42" },
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe("device:online");
    unsubscribe();
  });

  it("unsubscribes correctly", () => {
    const received: DeviceEvent[] = [];
    const unsubscribe = onDeviceEvent((e) => received.push(e));
    unsubscribe();

    emitDeviceEvent({
      type: "device:offline",
      data: { id: "ABC123", ip: "192.168.1.42" },
    });

    expect(received).toHaveLength(0);
  });

  it("supports multiple listeners", () => {
    let count1 = 0;
    let count2 = 0;
    const unsub1 = onDeviceEvent(() => count1++);
    const unsub2 = onDeviceEvent(() => count2++);

    emitDeviceEvent({
      type: "device:discovered",
      data: { id: "DEF456", ip: "192.168.1.55", product: "Ultimate 64" },
    });

    expect(count1).toBe(1);
    expect(count2).toBe(1);
    unsub1();
    unsub2();
  });
});
