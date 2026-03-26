import { Hono } from "hono";
import type { CollectionStore } from "../lib/collection-store.ts";
import type { DeviceStore } from "../lib/device-store.ts";
import type { DiskEntry } from "@shared/types.ts";

/** In-memory flip position tracking: collectionId -> deviceId -> current slot index */
const flipPositions = new Map<string, Map<string, number>>();

function getPosition(collectionId: string, deviceId: string): number {
  return flipPositions.get(collectionId)?.get(deviceId) ?? 0;
}

function setPosition(collectionId: string, deviceId: string, slot: number): void {
  if (!flipPositions.has(collectionId)) {
    flipPositions.set(collectionId, new Map());
  }
  flipPositions.get(collectionId)!.set(deviceId, slot);
}

async function parseJSON<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

/** Mount a disk image on the target device */
async function mountDisk(
  device: { ip: string; port: number; password?: string },
  disk: DiskEntry,
): Promise<{ ok: boolean; error?: string }> {
  const url = `http://${device.ip}:${device.port}/v1/drives/${disk.drive}:mount?image=${encodeURIComponent(disk.path)}`;
  const headers: Record<string, string> = {};
  if (device.password) headers["X-Password"] = device.password;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "PUT",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, error: `Device returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Device did not respond (timeout)" };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Cannot reach device — ${msg}` };
  }
}

export function createCollectionRoutes(collectionStore: CollectionStore, deviceStore: DeviceStore) {
  const app = new Hono()

    // List all collections
    .get("/collections", (c) => {
      return c.json(collectionStore.list());
    })

    // Create collection
    .post("/collections", async (c) => {
      const body = await parseJSON<{ name?: string; description?: string; disks?: DiskEntry[] }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return c.json({ error: "name is required" }, 400);
      }

      if (!Array.isArray(body.disks)) {
        return c.json({ error: "disks must be an array" }, 400);
      }

      const collection = collectionStore.create({
        name: body.name.trim(),
        description: body.description,
        disks: body.disks,
      });
      return c.json(collection, 201);
    })

    // Get collection by ID
    .get("/collections/:id", (c) => {
      const collection = collectionStore.get(c.req.param("id"));
      if (!collection) return c.json({ error: "Collection not found" }, 404);
      return c.json(collection);
    })

    // Update collection
    .put("/collections/:id", async (c) => {
      const id = c.req.param("id");
      const body = await parseJSON<{ name?: string; description?: string; disks?: DiskEntry[] }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (body.disks !== undefined && !Array.isArray(body.disks)) {
        return c.json({ error: "disks must be an array" }, 400);
      }

      const collection = collectionStore.update(id, body);
      if (!collection) return c.json({ error: "Collection not found" }, 404);
      return c.json(collection);
    })

    // Delete collection
    .delete("/collections/:id", (c) => {
      const id = c.req.param("id");
      const removed = collectionStore.remove(id);
      if (!removed) return c.json({ error: "Collection not found" }, 404);
      // Clean up flip positions for deleted collection
      flipPositions.delete(id);
      return c.json({ ok: true });
    })

    // Flip action — mount next/prev/specific disk
    .post("/collections/:id/flip", async (c) => {
      const id = c.req.param("id");
      const collection = collectionStore.get(id);
      if (!collection) return c.json({ error: "Collection not found" }, 404);

      if (collection.disks.length === 0) {
        return c.json({ error: "Collection has no disks" }, 400);
      }

      const url = new URL(c.req.url);
      const deviceId = url.searchParams.get("deviceId");
      if (!deviceId) return c.json({ error: "deviceId query parameter is required" }, 400);

      const device = deviceStore.get(deviceId);
      if (!device) return c.json({ error: "Device not found" }, 404);
      if (!device.online) return c.json({ error: "Device is offline" }, 503);

      const slotParam = url.searchParams.get("slot");
      const direction = url.searchParams.get("direction");
      const current = getPosition(id, deviceId);
      let targetSlot: number;

      if (slotParam !== null) {
        targetSlot = parseInt(slotParam, 10);
        if (isNaN(targetSlot) || targetSlot < 0 || targetSlot >= collection.disks.length) {
          return c.json(
            { error: `Invalid slot: must be 0-${collection.disks.length - 1}` },
            400,
          );
        }
      } else if (direction === "prev") {
        targetSlot = current <= 0 ? collection.disks.length - 1 : current - 1;
      } else {
        // Default: next
        targetSlot = current >= collection.disks.length - 1 ? 0 : current + 1;
      }

      const disk = collection.disks[targetSlot]!;
      const result = await mountDisk(device, disk);

      if (!result.ok) {
        return c.json({ error: `Mount failed: ${result.error}` }, 502);
      }

      setPosition(id, deviceId, targetSlot);

      return c.json({
        disk,
        position: targetSlot,
        total: collection.disks.length,
      });
    });

  return app;
}

// Exported for testing
export { flipPositions, getPosition, setPosition, mountDisk };
