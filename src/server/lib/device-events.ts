import type { DeviceEvent } from "@shared/types.ts";

type Listener = (event: DeviceEvent) => void;

const listeners = new Set<Listener>();

export function emitDeviceEvent(event: DeviceEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function onDeviceEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
