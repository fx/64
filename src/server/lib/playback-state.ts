import type { PlaybackState } from "@shared/types.ts";
import { emitPlaybackEvent } from "./playback-events.ts";
import type { PlaybackEventType } from "@shared/types.ts";

export class PlaybackStateManager {
  private states: Map<string, PlaybackState> = new Map();

  get(deviceId: string): PlaybackState {
    return (
      this.states.get(deviceId) ?? {
        deviceId,
        status: "stopped",
        position: 0,
      }
    );
  }

  set(deviceId: string, state: PlaybackState, eventType: PlaybackEventType): void {
    this.states.set(deviceId, state);
    emitPlaybackEvent({ type: eventType, deviceId, data: state });
  }

  clear(deviceId: string): void {
    const state: PlaybackState = {
      deviceId,
      status: "stopped",
      position: 0,
    };
    this.states.set(deviceId, state);
    emitPlaybackEvent({ type: "playback:stop", deviceId, data: state });
  }
}
