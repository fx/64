import { describe, it, expect } from "bun:test";
import { emitPlaybackEvent, onPlaybackEvent } from "../src/server/lib/playback-events.ts";
import type { PlaybackEvent } from "../src/shared/types.ts";

describe("playback-events", () => {
  it("emits events to listeners", () => {
    const received: PlaybackEvent[] = [];
    const unsub = onPlaybackEvent((e) => received.push(e));

    const event: PlaybackEvent = {
      type: "playback:play",
      deviceId: "dev1",
      data: { deviceId: "dev1", status: "playing", position: 0 },
    };
    emitPlaybackEvent(event);

    unsub();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("unsubscribes correctly", () => {
    const received: PlaybackEvent[] = [];
    const unsub = onPlaybackEvent((e) => received.push(e));

    unsub();

    emitPlaybackEvent({
      type: "playback:stop",
      deviceId: "dev1",
      data: { deviceId: "dev1", status: "stopped", position: 0 },
    });

    expect(received).toHaveLength(0);
  });

  it("supports multiple listeners", () => {
    const received1: PlaybackEvent[] = [];
    const received2: PlaybackEvent[] = [];
    const unsub1 = onPlaybackEvent((e) => received1.push(e));
    const unsub2 = onPlaybackEvent((e) => received2.push(e));

    emitPlaybackEvent({
      type: "playback:next",
      deviceId: "dev1",
      data: { deviceId: "dev1", status: "playing", position: 1 },
    });

    unsub1();
    unsub2();
    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });
});
