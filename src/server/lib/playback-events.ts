import type { PlaybackEvent } from "@shared/types.ts";

type Listener = (event: PlaybackEvent) => void;

const listeners = new Set<Listener>();

export function emitPlaybackEvent(event: PlaybackEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function onPlaybackEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
