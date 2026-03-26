import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { DeviceStore } from "../lib/device-store.ts";
import type { DevicePoller } from "../lib/device-poller.ts";
import { onDeviceEvent } from "../lib/device-events.ts";
import { onPlaybackEvent } from "../lib/playback-events.ts";
import { onMacroEvent } from "../lib/macro-events.ts";

export function createEventRoutes(store: DeviceStore, poller?: DevicePoller) {
  const events = new Hono();

  // Global device event stream (existing, enhanced with state events)
  events.get("/events/devices", (c) => {
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

      // Listen for device registry events
      const unsubDevice = onDeviceEvent((event) => {
        stream
          .writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
            id: String(id++),
          })
          .catch(() => {
            unsubDevice();
          });
      });

      // Listen for state change events from poller
      const unsubState = poller?.onStateChange((event) => {
        stream
          .writeSSE({
            event: event.type,
            data: JSON.stringify({ deviceId: event.deviceId, data: event.data }),
            id: String(id++),
          })
          .catch(() => {
            unsubState?.();
          });
      });

      // Listen for macro execution events
      const unsubMacro = onMacroEvent((event) => {
        stream
          .writeSSE({
            event: event.type,
            data: JSON.stringify({
              executionId: event.executionId,
              macroId: event.macroId,
              deviceId: event.deviceId,
              ...event.data,
            }),
            id: String(id++),
          })
          .catch(() => {
            unsubMacro();
          });
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubDevice();
          unsubState?.();
          unsubMacro();
          resolve();
        });
      });
    });
  });

  // Per-device state stream
  events.get("/events/devices/:deviceId", (c) => {
    const deviceId = c.req.param("deviceId");
    const device = store.get(deviceId);
    if (!device) {
      return c.json({ error: "Device not found" }, 404);
    }

    return streamSSE(c, async (stream) => {
      let id = 0;

      // Send current cached state as initial events
      if (poller) {
        const cached = poller.getCache(deviceId);
        if (cached) {
          if (cached.drives !== undefined) {
            await stream.writeSSE({
              event: "drives",
              data: JSON.stringify(cached.drives),
              id: String(id++),
            });
          }
          if (cached.info !== undefined) {
            await stream.writeSSE({
              event: "info",
              data: JSON.stringify(cached.info),
              id: String(id++),
            });
          }
        }
      }

      // Subscribe to state changes for this device only
      const unsubState = poller?.onStateChange((event) => {
        if (event.deviceId !== deviceId) return;

        // Map state:drives -> drives, state:info -> info, etc.
        const sseEvent = event.type.replace("state:", "");

        stream
          .writeSSE({
            event: sseEvent,
            data: JSON.stringify(event.data),
            id: String(id++),
          })
          .catch(() => {
            unsubState?.();
          });
      });

      // Also listen for device online/offline registry events
      const unsubDevice = onDeviceEvent((event) => {
        if (event.data.id !== deviceId) return;
        if (event.type !== "device:online" && event.type !== "device:offline") return;

        const sseEvent = event.type === "device:online" ? "online" : "offline";
        stream
          .writeSSE({
            event: sseEvent,
            data: JSON.stringify(event.data),
            id: String(id++),
          })
          .catch(() => {
            unsubDevice();
          });
      });

      // Listen for playback events for this device
      const unsubPlayback = onPlaybackEvent((event) => {
        if (event.deviceId !== deviceId) return;

        stream
          .writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
            id: String(id++),
          })
          .catch(() => {
            unsubPlayback();
          });
      });

      // Listen for macro execution events for this device
      const unsubMacro = onMacroEvent((event) => {
        if (event.deviceId !== deviceId) return;

        stream
          .writeSSE({
            event: event.type,
            data: JSON.stringify({
              executionId: event.executionId,
              macroId: event.macroId,
              ...event.data,
            }),
            id: String(id++),
          })
          .catch(() => {
            unsubMacro();
          });
      });

      await new Promise<void>((resolve) => {
        stream.onAbort(() => {
          unsubState?.();
          unsubDevice();
          unsubPlayback();
          unsubMacro();
          resolve();
        });
      });
    });
  });

  return events;
}
