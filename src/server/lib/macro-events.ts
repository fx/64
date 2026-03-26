import type { MacroEvent } from "@shared/types.ts";

type Listener = (event: MacroEvent) => void;

const listeners = new Set<Listener>();

export function emitMacroEvent(event: MacroEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

export function onMacroEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
