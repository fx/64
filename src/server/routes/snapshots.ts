import { Hono } from "hono";
import type { Context } from "hono";
import type { DeviceStore } from "../lib/device-store.ts";
import type { SnapshotStore } from "../lib/snapshot-store.ts";
import type { Device } from "@shared/types.ts";
import {
  proxyError,
  mapDeviceError,
  readFullMemory,
  pauseCpu,
  resumeCpu,
  AuthError,
} from "../lib/device-helpers.ts";

const FULL_MEMORY_SIZE = 65536;

export function createSnapshotRoutes(deviceStore: DeviceStore, snapshotStore: SnapshotStore) {
  const snapshots = new Hono();

  function resolveDevice(c: Context): Device | Response {
    const device = deviceStore.get(c.req.param("deviceId"));
    if (!device) return proxyError(c, "Device not found", 404);
    return device;
  }

  function resolveOnlineDevice(c: Context): Device | Response {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;
    if (!device.online) return proxyError(c, "Device is offline", 503);
    return device;
  }

  // ── POST /devices/:deviceId/snapshots — capture full 64KB ──
  snapshots.post("/devices/:deviceId/snapshots", async (c) => {
    const device = resolveOnlineDevice(c);
    if (device instanceof Response) return device;

    let body: { name?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ errors: ["Invalid JSON body"] }, 400);
    }

    if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
      return c.json({ errors: ["name is required"] }, 400);
    }

    try {
      await pauseCpu(device);

      let data: Uint8Array;
      try {
        data = await readFullMemory(device, 0x0000, FULL_MEMORY_SIZE);
      } catch (err) {
        // Best-effort resume if read fails
        try { await resumeCpu(device); } catch { /* ignore */ }
        throw err;
      }

      await resumeCpu(device);

      const snapshot = snapshotStore.create(device.id, body.name.trim(), data);
      return c.json(snapshot, 201);
    } catch (err) {
      if (err instanceof AuthError) {
        return proxyError(c, err.message, 403);
      }
      return mapDeviceError(c, err);
    }
  });

  // ── GET /devices/:deviceId/snapshots — list snapshots ──
  snapshots.get("/devices/:deviceId/snapshots", (c) => {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;

    const list = snapshotStore.list(device.id);
    return c.json(list);
  });

  // ── GET /devices/:deviceId/snapshots/:id/data — download binary ──
  snapshots.get("/devices/:deviceId/snapshots/:id/data", (c) => {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;

    const snap = snapshotStore.get(c.req.param("id"));
    if (!snap || snap.deviceId !== device.id) {
      return c.json({ errors: ["Snapshot not found"] }, 404);
    }

    const data = snapshotStore.getData(snap.id);
    if (!data) {
      return c.json({ errors: ["Snapshot data missing"] }, 404);
    }

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${snap.name}.bin"`,
      },
    });
  });

  // ── DELETE /devices/:deviceId/snapshots/:id ──
  snapshots.delete("/devices/:deviceId/snapshots/:id", (c) => {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;

    const snap = snapshotStore.get(c.req.param("id"));
    if (!snap || snap.deviceId !== device.id) {
      return c.json({ errors: ["Snapshot not found"] }, 404);
    }

    snapshotStore.remove(snap.id);
    return c.json({ ok: true });
  });

  // ── GET /devices/:deviceId/snapshots/:id/diff?against=:otherId ──
  snapshots.get("/devices/:deviceId/snapshots/:id/diff", (c) => {
    const device = resolveDevice(c);
    if (device instanceof Response) return device;

    const snapshotId = c.req.param("id");
    const againstId = c.req.query("against");

    if (!againstId) {
      return c.json({ errors: ["against query parameter is required"] }, 400);
    }

    const snapA = snapshotStore.get(snapshotId);
    if (!snapA || snapA.deviceId !== device.id) {
      return c.json({ errors: ["Snapshot not found"] }, 404);
    }

    const snapB = snapshotStore.get(againstId);
    if (!snapB || snapB.deviceId !== device.id) {
      return c.json({ errors: ["Comparison snapshot not found"] }, 404);
    }

    const dataA = snapshotStore.getData(snapshotId);
    const dataB = snapshotStore.getData(againstId);

    if (!dataA || !dataB) {
      return c.json({ errors: ["Snapshot data missing"] }, 404);
    }

    const offsets: number[] = [];
    const totalBytes = Math.max(dataA.length, dataB.length);
    for (let i = 0; i < totalBytes; i++) {
      if ((dataA[i] ?? 0) !== (dataB[i] ?? 0)) {
        offsets.push(i);
      }
    }

    return c.json({
      snapshotId,
      againstId,
      changedBytes: offsets.length,
      totalBytes,
      offsets,
    });
  });

  return snapshots;
}
