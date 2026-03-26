import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { PlaybackStateManager } from "../src/server/lib/playback-state.ts";
import { onPlaybackEvent } from "../src/server/lib/playback-events.ts";
import type { PlaybackEvent } from "../src/shared/types.ts";

describe("PlaybackStateManager", () => {
  let manager: PlaybackStateManager;

  beforeEach(() => {
    manager = new PlaybackStateManager();
  });

  it("returns stopped state for unknown device", () => {
    const state = manager.get("unknown-device");
    expect(state.deviceId).toBe("unknown-device");
    expect(state.status).toBe("stopped");
    expect(state.position).toBe(0);
    expect(state.currentTrack).toBeUndefined();
    expect(state.playlistId).toBeUndefined();
  });

  it("sets and retrieves playback state", () => {
    const state = {
      deviceId: "dev1",
      status: "playing" as const,
      currentTrack: { path: "/USB0/song.sid", type: "sid" as const, title: "Song" },
      playlistId: "pl1",
      position: 2,
    };
    manager.set("dev1", state, "playback:play");

    const retrieved = manager.get("dev1");
    expect(retrieved).toEqual(state);
  });

  it("clears playback state to stopped", () => {
    manager.set(
      "dev1",
      {
        deviceId: "dev1",
        status: "playing",
        currentTrack: { path: "/song.sid", type: "sid", title: "Song" },
        position: 3,
      },
      "playback:play",
    );

    manager.clear("dev1");
    const state = manager.get("dev1");
    expect(state.status).toBe("stopped");
    expect(state.position).toBe(0);
    expect(state.currentTrack).toBeUndefined();
    expect(state.playlistId).toBeUndefined();
  });

  it("tracks state independently per device", () => {
    manager.set(
      "dev1",
      {
        deviceId: "dev1",
        status: "playing",
        currentTrack: { path: "/song1.sid", type: "sid", title: "Song 1" },
        position: 0,
      },
      "playback:play",
    );
    manager.set(
      "dev2",
      {
        deviceId: "dev2",
        status: "playing",
        currentTrack: { path: "/song2.mod", type: "mod", title: "Song 2" },
        position: 1,
      },
      "playback:play",
    );

    expect(manager.get("dev1").currentTrack?.title).toBe("Song 1");
    expect(manager.get("dev2").currentTrack?.title).toBe("Song 2");
  });

  it("emits playback:play event on set", () => {
    const events: PlaybackEvent[] = [];
    const unsub = onPlaybackEvent((e) => events.push(e));

    manager.set(
      "dev1",
      {
        deviceId: "dev1",
        status: "playing",
        currentTrack: { path: "/song.sid", type: "sid", title: "Song" },
        position: 0,
      },
      "playback:play",
    );

    unsub();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("playback:play");
    expect(events[0].deviceId).toBe("dev1");
    expect(events[0].data.status).toBe("playing");
  });

  it("emits playback:stop event on clear", () => {
    const events: PlaybackEvent[] = [];
    const unsub = onPlaybackEvent((e) => events.push(e));

    manager.clear("dev1");

    unsub();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("playback:stop");
    expect(events[0].data.status).toBe("stopped");
  });

  it("emits playback:next event", () => {
    const events: PlaybackEvent[] = [];
    const unsub = onPlaybackEvent((e) => events.push(e));

    manager.set(
      "dev1",
      {
        deviceId: "dev1",
        status: "playing",
        currentTrack: { path: "/song2.sid", type: "sid", title: "Song 2" },
        position: 1,
      },
      "playback:next",
    );

    unsub();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("playback:next");
  });

  it("emits playback:prev event", () => {
    const events: PlaybackEvent[] = [];
    const unsub = onPlaybackEvent((e) => events.push(e));

    manager.set(
      "dev1",
      {
        deviceId: "dev1",
        status: "playing",
        currentTrack: { path: "/song1.sid", type: "sid", title: "Song 1" },
        position: 0,
      },
      "playback:prev",
    );

    unsub();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("playback:prev");
  });
});
