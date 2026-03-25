import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { DeviceStore } from "../lib/device-store.ts";
import { onDeviceEvent } from "../lib/device-events.ts";

export function createEventRoutes(store: DeviceStore) {
  const events = new Hono().get("/events/devices", (c) => {
    return streamSSE(c, async (stream) => {
      let id = 0;

      // Send current device list as initial events
      for (const device of store.list()) {
        await stream.writeSSE({
          event: device.online ? "device:online" : "device:offline",
          data: JSON.stringify({ id: device.id, ip: device.ip, product: device.product }),
          id: String(id++),
        });
      }

      // Listen for new events
      const unsubscribe = onDeviceEvent((event) => {
        stream
          .writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
            id: String(id++),
          })
          .catch(() => {
            // Stream closed
          });
      });

      // Keep stream alive until client disconnects
      stream.onAbort(() => {
        unsubscribe();
      });

      // Keep the stream open by waiting indefinitely
      await new Promise<void>((resolve) => {
        stream.onAbort(() => resolve());
      });
    });
  });

  return events;
}
