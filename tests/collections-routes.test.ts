import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CollectionStore } from "../src/server/lib/collection-store.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createCollectionRoutes, flipPositions } from "../src/server/routes/collections.ts";
import type { Device } from "../src/shared/types.ts";
import type { DiskEntry } from "../src/shared/types.ts";

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "DEV001",
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

function makeDisks(count = 3): DiskEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    slot: i,
    label: `Disk ${i + 1}`,
    path: `/USB0/Games/game/disk${i + 1}.d64`,
    drive: "a" as const,
  }));
}

function createApp(collectionStore: CollectionStore, deviceStore: DeviceStore) {
  return new Hono()
    .basePath("/api")
    .route("/", createCollectionRoutes(collectionStore, deviceStore));
}

describe("Collection CRUD routes", () => {
  let collectionDataPath: string;
  let deviceDataPath: string;
  let collectionStore: CollectionStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    collectionDataPath = join(tmpdir(), `coll-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    deviceDataPath = join(tmpdir(), `dev-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    collectionStore = new CollectionStore(collectionDataPath);
    deviceStore = new DeviceStore(deviceDataPath);
    app = createApp(collectionStore, deviceStore);
    flipPositions.clear();
  });

  afterEach(() => {
    if (existsSync(collectionDataPath)) unlinkSync(collectionDataPath);
    if (existsSync(deviceDataPath)) unlinkSync(deviceDataPath);
  });

  // ── GET /api/collections ──────────────────────────────

  it("GET /collections returns empty list initially", async () => {
    const res = await app.request("/api/collections");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /collections returns all collections", async () => {
    collectionStore.create({ name: "Game 1", disks: makeDisks() });
    collectionStore.create({ name: "Game 2", disks: makeDisks() });

    const res = await app.request("/api/collections");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  // ── POST /api/collections ─────────────────────────────

  it("POST /collections creates a collection", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Maniac Mansion", disks: makeDisks() }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Maniac Mansion");
    expect(data.id).toBeDefined();
    expect(data.disks).toHaveLength(3);
  });

  it("POST /collections with description", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Game", description: "A classic", disks: [] }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.description).toBe("A classic");
  });

  it("POST /collections returns 400 for missing name", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disks: [] }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("name");
  });

  it("POST /collections returns 400 for empty name", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  ", disks: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /collections returns 400 for missing disks", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("disks");
  });

  it("POST /collections returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  // ── GET /api/collections/:id ──────────────────────────

  it("GET /collections/:id returns collection", async () => {
    const created = collectionStore.create({ name: "Test", disks: makeDisks() });
    const res = await app.request(`/api/collections/${created.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Test");
  });

  it("GET /collections/:id returns 404 for missing", async () => {
    const res = await app.request("/api/collections/nonexistent");
    expect(res.status).toBe(404);
  });

  // ── PUT /api/collections/:id ──────────────────────────

  it("PUT /collections/:id updates name", async () => {
    const created = collectionStore.create({ name: "Old", disks: makeDisks() });
    const res = await app.request(`/api/collections/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("New");
  });

  it("PUT /collections/:id updates disks", async () => {
    const created = collectionStore.create({ name: "Game", disks: makeDisks(2) });
    const res = await app.request(`/api/collections/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disks: makeDisks(4) }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.disks).toHaveLength(4);
  });

  it("PUT /collections/:id returns 404 for missing", async () => {
    const res = await app.request("/api/collections/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT /collections/:id returns 400 for invalid JSON", async () => {
    const created = collectionStore.create({ name: "Game", disks: makeDisks() });
    const res = await app.request(`/api/collections/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "bad json",
    });
    expect(res.status).toBe(400);
  });

  it("PUT /collections/:id returns 400 for non-array disks", async () => {
    const created = collectionStore.create({ name: "Game", disks: makeDisks() });
    const res = await app.request(`/api/collections/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disks: "not an array" }),
    });
    expect(res.status).toBe(400);
  });

  // ── DELETE /api/collections/:id ───────────────────────

  it("DELETE /collections/:id removes collection", async () => {
    const created = collectionStore.create({ name: "Game", disks: makeDisks() });
    const res = await app.request(`/api/collections/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(collectionStore.get(created.id)).toBeUndefined();
  });

  it("DELETE /collections/:id returns 404 for missing", async () => {
    const res = await app.request("/api/collections/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /collections/:id cleans up flip positions", async () => {
    const created = collectionStore.create({ name: "Game", disks: makeDisks() });
    flipPositions.set(created.id, new Map([["DEV001", 1]]));

    await app.request(`/api/collections/${created.id}`, { method: "DELETE" });
    expect(flipPositions.has(created.id)).toBe(false);
  });
});

describe("Flip action endpoint", () => {
  let collectionDataPath: string;
  let deviceDataPath: string;
  let collectionStore: CollectionStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    collectionDataPath = join(tmpdir(), `coll-flip-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    deviceDataPath = join(tmpdir(), `dev-flip-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    collectionStore = new CollectionStore(collectionDataPath);
    deviceStore = new DeviceStore(deviceDataPath);
    app = createApp(collectionStore, deviceStore);
    flipPositions.clear();

    // Register a test device
    deviceStore.upsert(makeDevice());

    // Mock fetch for device mount calls
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/v1/drives/")) {
        return new Response(JSON.stringify({ errors: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(collectionDataPath)) unlinkSync(collectionDataPath);
    if (existsSync(deviceDataPath)) unlinkSync(deviceDataPath);
  });

  it("flips to next disk (default)", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });
    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.position).toBe(1);
    expect(data.disk.label).toBe("Disk 2");
    expect(data.total).toBe(3);
  });

  it("flips to next disk sequentially", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    // First flip: 0 -> 1
    await app.request(`/api/collections/${collection.id}/flip?deviceId=DEV001`, { method: "POST" });
    // Second flip: 1 -> 2
    const res = await app.request(`/api/collections/${collection.id}/flip?deviceId=DEV001`, { method: "POST" });
    const data = await res.json();
    expect(data.position).toBe(2);
  });

  it("wraps around to first disk from last", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    // Set position to last disk
    flipPositions.set(collection.id, new Map([["DEV001", 2]]));

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001`,
      { method: "POST" },
    );
    const data = await res.json();
    expect(data.position).toBe(0);
    expect(data.disk.label).toBe("Disk 1");
  });

  it("flips to previous disk", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });
    flipPositions.set(collection.id, new Map([["DEV001", 2]]));

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&direction=prev`,
      { method: "POST" },
    );
    const data = await res.json();
    expect(data.position).toBe(1);
  });

  it("wraps around to last disk when going prev from first", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });
    // Position defaults to 0

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&direction=prev`,
      { method: "POST" },
    );
    const data = await res.json();
    expect(data.position).toBe(2);
    expect(data.disk.label).toBe("Disk 3");
  });

  it("flips to specific slot", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&slot=2`,
      { method: "POST" },
    );
    const data = await res.json();
    expect(data.position).toBe(2);
    expect(data.disk.label).toBe("Disk 3");
  });

  it("returns 400 for invalid slot (negative)", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&slot=-1`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid slot");
  });

  it("returns 400 for invalid slot (out of range)", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&slot=5`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid slot (NaN)", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&slot=abc`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent collection", async () => {
    const res = await app.request(
      "/api/collections/nonexistent/flip?deviceId=DEV001",
      { method: "POST" },
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 for collection with no disks", async () => {
    const collection = collectionStore.create({ name: "Empty", disks: [] });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("no disks");
  });

  it("returns 400 for missing deviceId", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    const res = await app.request(
      `/api/collections/${collection.id}/flip`,
      { method: "POST" },
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("deviceId");
  });

  it("returns 404 for non-existent device", async () => {
    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=NODEV`,
      { method: "POST" },
    );
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Device not found");
  });

  it("returns 503 for offline device", async () => {
    deviceStore.upsert(makeDevice({ id: "OFFDEV", online: false }));
    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=OFFDEV`,
      { method: "POST" },
    );
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("offline");
  });

  it("returns 502 when device mount fails", async () => {
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ errors: ["mount error"] }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    };

    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001`,
      { method: "POST" },
    );
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("Mount failed");
  });

  it("returns 502 when device is unreachable (fetch throws)", async () => {
    globalThis.fetch = async () => {
      throw new Error("ECONNREFUSED");
    };

    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001`,
      { method: "POST" },
    );
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("Mount failed");
  });

  it("returns 502 when device mount times out", async () => {
    globalThis.fetch = async () => {
      const err = new DOMException("The operation was aborted", "AbortError");
      throw err;
    };

    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    const res = await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001`,
      { method: "POST" },
    );
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("timeout");
  });

  it("sends correct mount URL to device", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedUrl = url;
      capturedMethod = init?.method ?? "GET";
      if (init?.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return new Response(JSON.stringify({ errors: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const disks: DiskEntry[] = [{
      slot: 0,
      label: "Disk 1",
      path: "/USB0/Games/test.d64",
      drive: "b",
    }];
    const collection = collectionStore.create({ name: "Game", disks });

    // Position starts at 0, so "next" goes to slot 0 (wraps around in a single-disk collection back to 0... actually next from 0 in a 1-disk collection wraps to 0)
    // With slot=0 explicitly
    await app.request(
      `/api/collections/${collection.id}/flip?deviceId=DEV001&slot=0`,
      { method: "POST" },
    );

    expect(capturedUrl).toContain("/v1/drives/b:mount");
    expect(capturedUrl).toContain("image=%2FUSB0%2FGames%2Ftest.d64");
    expect(capturedMethod).toBe("PUT");
  });

  it("sends X-Password header for password-protected devices", async () => {
    deviceStore.upsert(makeDevice({ id: "AUTHDEV", password: "secret123" }));
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.headers) {
        capturedHeaders = init.headers as Record<string, string>;
      }
      return new Response(JSON.stringify({ errors: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const collection = collectionStore.create({ name: "Game", disks: makeDisks() });

    await app.request(
      `/api/collections/${collection.id}/flip?deviceId=AUTHDEV&slot=0`,
      { method: "POST" },
    );

    expect(capturedHeaders["X-Password"]).toBe("secret123");
  });

  it("tracks positions independently per device", async () => {
    deviceStore.upsert(makeDevice({ id: "DEV002" }));
    const collection = collectionStore.create({ name: "Game", disks: makeDisks(3) });

    // Flip DEV001 once: 0 -> 1
    await app.request(`/api/collections/${collection.id}/flip?deviceId=DEV001`, { method: "POST" });

    // Flip DEV002 once: 0 -> 1
    await app.request(`/api/collections/${collection.id}/flip?deviceId=DEV002`, { method: "POST" });

    // Flip DEV001 again: 1 -> 2
    const res = await app.request(`/api/collections/${collection.id}/flip?deviceId=DEV001`, { method: "POST" });
    const data = await res.json();
    expect(data.position).toBe(2);

    // DEV002 should still be at 1 -> flip goes to 2
    const res2 = await app.request(`/api/collections/${collection.id}/flip?deviceId=DEV002`, { method: "POST" });
    const data2 = await res2.json();
    expect(data2.position).toBe(2);
  });
});
