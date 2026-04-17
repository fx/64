import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { SnapshotStore } from "../src/server/lib/snapshot-store.ts";
import { createSnapshotRoutes } from "../src/server/routes/snapshots.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDir() {
  return join(tmpdir(), `snap-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function testDataPath(dir: string) {
  return join(dir, "devices.json");
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "ABC123",
    name: "Test Device",
    ip: "192.168.1.42",
    port: 80,
    product: "Ultimate 64",
    firmware: "3.12",
    fpga: "11F",
    online: true,
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return input.url;
  return input.toString();
}

/** Mock fetch that simulates a device returning memory data */
function mockDeviceFetch(fillByte = 0x42) {
  return mock(async (input: RequestInfo | URL) => {
    const url = extractUrl(input);
    if (url.includes("machine:pause")) {
      return new Response("", { status: 200 });
    }
    if (url.includes("machine:resume")) {
      return new Response("", { status: 200 });
    }
    if (url.includes("machine:readmem")) {
      const parsed = new URL(url);
      const len = parseInt(parsed.searchParams.get("length") || "256", 10);
      return new Response(new Uint8Array(len).fill(fillByte), {
        headers: { "content-type": "application/octet-stream" },
      });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
}

describe("Snapshot Routes", () => {
  let dir: string;
  let deviceStore: DeviceStore;
  let snapshotStore: SnapshotStore;
  let app: Hono;

  beforeEach(() => {
    dir = testDir();
    mkdirSync(dir, { recursive: true });
    deviceStore = new DeviceStore(testDataPath(dir));
    snapshotStore = new SnapshotStore(join(dir, "snapshots.json"), join(dir, "snapshots"));
    const routes = createSnapshotRoutes(deviceStore, snapshotStore);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // ── POST /devices/:deviceId/snapshots — capture ──

  it("captures a full 64KB snapshot", async () => {
    deviceStore.upsert(makeDevice());
    globalThis.fetch = mockDeviceFetch(0xAA);

    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Capture" }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Test Capture");
    expect(body.deviceId).toBe("ABC123");
    expect(body.size).toBe(65536);
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
  });

  it("pauses CPU before reading and resumes after", async () => {
    deviceStore.upsert(makeDevice());
    const calls: string[] = [];

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = extractUrl(input);
      if (url.includes("machine:pause")) {
        calls.push("pause");
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:resume")) {
        calls.push("resume");
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:readmem")) {
        calls.push("readmem");
        const parsed = new URL(url);
        const len = parseInt(parsed.searchParams.get("length") || "256", 10);
        return new Response(new Uint8Array(len), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CPU Test" }),
    });

    expect(res.status).toBe(201);
    expect(calls[0]).toBe("pause");
    expect(calls[calls.length - 1]).toBe("resume");
    // 65536 / 256 = 256 readmem calls
    expect(calls.filter((c) => c === "readmem").length).toBe(256);
  });

  it("returns 404 when device not found", async () => {
    const res = await app.request("/api/devices/NOPE/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errors[0]).toContain("not found");
  });

  it("returns 503 when device is offline", async () => {
    deviceStore.upsert(makeDevice({ online: false }));
    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    deviceStore.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("Invalid JSON");
  });

  it("returns 400 when name is missing", async () => {
    deviceStore.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("name");
  });

  it("returns 400 when name is empty string", async () => {
    deviceStore.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when device returns auth error", async () => {
    deviceStore.upsert(makeDevice());
    globalThis.fetch = mock(async () =>
      new Response("Forbidden", { status: 403 }),
    ) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Auth Test" }),
    });
    expect(res.status).toBe(403);
  });

  it("resumes CPU even if readmem fails", async () => {
    deviceStore.upsert(makeDevice());
    let readCount = 0;
    let resumed = false;

    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = extractUrl(input);
      if (url.includes("machine:pause")) return new Response("", { status: 200 });
      if (url.includes("machine:resume")) {
        resumed = true;
        return new Response("", { status: 200 });
      }
      if (url.includes("machine:readmem")) {
        readCount++;
        if (readCount > 5) return new Response("error", { status: 500 });
        const parsed = new URL(url);
        const len = parseInt(parsed.searchParams.get("length") || "256", 10);
        return new Response(new Uint8Array(len), {
          headers: { "content-type": "application/octet-stream" },
        });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;

    const res = await app.request("/api/devices/ABC123/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Fail Test" }),
    });

    expect(res.status).toBe(502);
    expect(resumed).toBe(true);
  });

  // ── GET /devices/:deviceId/snapshots — list ──

  it("lists snapshots for a device", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(65536).fill(0x00);
    snapshotStore.create("ABC123", "Snap 1", data);
    snapshotStore.create("ABC123", "Snap 2", data);
    snapshotStore.create("OTHER", "Snap 3", data);

    const res = await app.request("/api/devices/ABC123/snapshots");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body.map((s: { name: string }) => s.name).sort()).toEqual(["Snap 1", "Snap 2"]);
  });

  it("returns empty array when no snapshots exist", async () => {
    deviceStore.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/snapshots");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 404 for list when device not found", async () => {
    const res = await app.request("/api/devices/NOPE/snapshots");
    expect(res.status).toBe(404);
  });

  it("can list snapshots for offline devices", async () => {
    deviceStore.upsert(makeDevice({ online: false }));
    const data = new Uint8Array(100).fill(0x00);
    snapshotStore.create("ABC123", "Offline Snap", data);

    const res = await app.request("/api/devices/ABC123/snapshots");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  // ── GET /devices/:deviceId/snapshots/:id/data — download binary ──

  it("downloads binary snapshot data", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(65536);
    data[0] = 0x12;
    data[100] = 0x34;
    const snap = snapshotStore.create("ABC123", "Binary", data);

    const res = await app.request(`/api/devices/ABC123/snapshots/${snap.id}/data`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toContain("Binary.bin");

    const result = new Uint8Array(await res.arrayBuffer());
    expect(result.length).toBe(65536);
    expect(result[0]).toBe(0x12);
    expect(result[100]).toBe(0x34);
  });

  it("returns 404 for non-existent snapshot data", async () => {
    deviceStore.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/snapshots/nonexistent/data");
    expect(res.status).toBe(404);
  });

  it("returns 404 when snapshot belongs to different device", async () => {
    deviceStore.upsert(makeDevice());
    deviceStore.upsert(makeDevice({ id: "OTHER" }));
    const data = new Uint8Array(100).fill(0x00);
    const snap = snapshotStore.create("OTHER", "Wrong Device", data);

    const res = await app.request(`/api/devices/ABC123/snapshots/${snap.id}/data`);
    expect(res.status).toBe(404);
  });

  // ── DELETE /devices/:deviceId/snapshots/:id ──

  it("deletes a snapshot", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(100).fill(0xBB);
    const snap = snapshotStore.create("ABC123", "To Delete", data);

    const res = await app.request(`/api/devices/ABC123/snapshots/${snap.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify it's gone
    expect(snapshotStore.get(snap.id)).toBeUndefined();
  });

  it("returns 404 when deleting non-existent snapshot", async () => {
    deviceStore.upsert(makeDevice());
    const res = await app.request("/api/devices/ABC123/snapshots/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when deleting snapshot of different device", async () => {
    deviceStore.upsert(makeDevice());
    deviceStore.upsert(makeDevice({ id: "OTHER" }));
    const data = new Uint8Array(100).fill(0x00);
    const snap = snapshotStore.create("OTHER", "Wrong", data);

    const res = await app.request(`/api/devices/ABC123/snapshots/${snap.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  // ── GET /devices/:deviceId/snapshots/:id/diff?against=:otherId ──

  it("diffs two snapshots correctly", async () => {
    deviceStore.upsert(makeDevice());
    const dataA = new Uint8Array(65536).fill(0x00);
    const dataB = new Uint8Array(65536).fill(0x00);
    // Create known differences
    dataB[0] = 0xFF;
    dataB[100] = 0xAA;
    dataB[65535] = 0x01;

    const snapA = snapshotStore.create("ABC123", "Base", dataA);
    const snapB = snapshotStore.create("ABC123", "Changed", dataB);

    const res = await app.request(
      `/api/devices/ABC123/snapshots/${snapA.id}/diff?against=${snapB.id}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.snapshotId).toBe(snapA.id);
    expect(body.againstId).toBe(snapB.id);
    expect(body.changedBytes).toBe(3);
    expect(body.totalBytes).toBe(65536);
    expect(body.offsets).toEqual([0, 100, 65535]);
  });

  it("returns empty diff for identical snapshots", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(256).fill(0x42);
    const snapA = snapshotStore.create("ABC123", "Same A", data);
    const snapB = snapshotStore.create("ABC123", "Same B", new Uint8Array(data));

    const res = await app.request(
      `/api/devices/ABC123/snapshots/${snapA.id}/diff?against=${snapB.id}`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.changedBytes).toBe(0);
    expect(body.offsets).toEqual([]);
  });

  it("returns 400 when against param is missing", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(100).fill(0x00);
    const snap = snapshotStore.create("ABC123", "Test", data);

    const res = await app.request(`/api/devices/ABC123/snapshots/${snap.id}/diff`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors[0]).toContain("against");
  });

  it("returns 404 when first snapshot not found", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(100).fill(0x00);
    const snap = snapshotStore.create("ABC123", "B", data);

    const res = await app.request(
      `/api/devices/ABC123/snapshots/nonexistent/diff?against=${snap.id}`,
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when comparison snapshot not found", async () => {
    deviceStore.upsert(makeDevice());
    const data = new Uint8Array(100).fill(0x00);
    const snap = snapshotStore.create("ABC123", "A", data);

    const res = await app.request(
      `/api/devices/ABC123/snapshots/${snap.id}/diff?against=nonexistent`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errors[0]).toContain("Comparison snapshot");
  });

  it("returns 404 when diff snapshots belong to different device", async () => {
    deviceStore.upsert(makeDevice());
    deviceStore.upsert(makeDevice({ id: "OTHER" }));
    const data = new Uint8Array(100).fill(0x00);
    const snapA = snapshotStore.create("ABC123", "Mine", data);
    const snapB = snapshotStore.create("OTHER", "Theirs", data);

    const res = await app.request(
      `/api/devices/ABC123/snapshots/${snapA.id}/diff?against=${snapB.id}`,
    );
    expect(res.status).toBe(404);
  });
});
