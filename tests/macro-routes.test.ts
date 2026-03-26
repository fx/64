import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MacroStore } from "../src/server/lib/macro-store.ts";
import { MacroEngine } from "../src/server/lib/macro-engine.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createMacroRoutes } from "../src/server/routes/macros.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function testDataPath(prefix: string) {
  return join(
    tmpdir(),
    `${prefix}-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

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

describe("Macro Routes", () => {
  let app: Hono;
  let macroStore: MacroStore;
  let engine: MacroEngine;
  let deviceStore: DeviceStore;
  let macroDataPath: string;
  let deviceDataPath: string;

  beforeEach(() => {
    macroDataPath = testDataPath("macros");
    deviceDataPath = testDataPath("devices");
    macroStore = new MacroStore(macroDataPath);
    engine = new MacroEngine();
    deviceStore = new DeviceStore(deviceDataPath);
    const routes = createMacroRoutes(macroStore, engine, deviceStore);
    app = new Hono().basePath("/api").route("/", routes);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(macroDataPath)) unlinkSync(macroDataPath);
    if (existsSync(deviceDataPath)) unlinkSync(deviceDataPath);
  });

  describe("GET /api/macros", () => {
    it("returns seeded built-in macros", async () => {
      const res = await app.request("/api/macros");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(3);
    });
  });

  describe("POST /api/macros", () => {
    it("creates a macro", async () => {
      const res = await app.request("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Custom Macro",
          description: "A test macro",
          steps: [{ action: "reset" }, { action: "delay", ms: 1000 }],
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe("Custom Macro");
      expect(data.steps).toHaveLength(2);
      expect(data.id).toBeDefined();
    });

    it("rejects missing name", async () => {
      const res = await app.request("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: [{ action: "reset" }] }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("name is required");
    });

    it("rejects missing steps", async () => {
      const res = await app.request("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "No Steps" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("steps must be a non-empty array");
    });

    it("rejects empty steps array", async () => {
      const res = await app.request("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Empty", steps: [] }),
      });
      expect(res.status).toBe(400);
    });

    it("rejects invalid JSON", async () => {
      const res = await app.request("/api/macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("Invalid JSON");
    });
  });

  describe("GET /api/macros/:id", () => {
    it("returns a macro by id", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(macro.id);
      expect(data.name).toBe("Test");
    });

    it("returns 404 for non-existent macro", async () => {
      const res = await app.request("/api/macros/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/macros/:id", () => {
    it("updates a macro", async () => {
      const macro = macroStore.create({
        name: "Original",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated",
          steps: [{ action: "pause" }],
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("Updated");
      expect(data.steps).toEqual([{ action: "pause" }]);
    });

    it("returns 404 for non-existent macro", async () => {
      const res = await app.request("/api/macros/nope", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      });
      expect(res.status).toBe(404);
    });

    it("rejects invalid JSON", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "bad json",
      });
      expect(res.status).toBe(400);
    });

    it("rejects empty steps array in update", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /api/macros/:id", () => {
    it("deletes a user macro", async () => {
      const macro = macroStore.create({
        name: "To Delete",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it("returns 404 for non-existent macro", async () => {
      const res = await app.request("/api/macros/nope", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("returns 403 for built-in macro", async () => {
      const builtIn = macroStore.list().find((m) => m.builtIn)!;
      const res = await app.request(`/api/macros/${builtIn.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("built-in");
    });
  });

  describe("POST /api/macros/:id/execute", () => {
    it("starts execution and returns 202", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = macroStore.create({
        name: "Exec Test",
        steps: [{ action: "reset" }],
      });
      deviceStore.upsert(makeDevice());

      const res = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "DEV001" }),
      });
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.status).toBe("running");
      expect(data.macroId).toBe(macro.id);
      expect(data.deviceId).toBe("DEV001");
    });

    it("returns 404 for non-existent macro", async () => {
      const res = await app.request("/api/macros/nope/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "DEV001" }),
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 when deviceId missing", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("deviceId is required");
    });

    it("returns 404 for non-existent device", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "NOPE" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Device not found");
    });

    it("returns 503 for offline device", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      deviceStore.upsert(makeDevice({ online: false }));

      const res = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "DEV001" }),
      });
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain("offline");
    });

    it("returns 400 for invalid JSON", async () => {
      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      const res = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "invalid",
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/macros/executions", () => {
    it("returns empty array initially", async () => {
      const res = await app.request("/api/macros/executions");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual([]);
    });

    it("returns executions after running a macro", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      deviceStore.upsert(makeDevice());

      await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "DEV001" }),
      });

      const res = await app.request("/api/macros/executions");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toHaveLength(1);
    });
  });

  describe("GET /api/macros/executions/:execId", () => {
    it("returns 404 for non-existent execution", async () => {
      const res = await app.request("/api/macros/executions/nope");
      expect(res.status).toBe(404);
    });

    it("returns execution by id", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = macroStore.create({
        name: "Test",
        steps: [{ action: "reset" }],
      });
      deviceStore.upsert(makeDevice());

      const execRes = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "DEV001" }),
      });
      const execData = await execRes.json();

      const res = await app.request(
        `/api/macros/executions/${execData.id}`,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.id).toBe(execData.id);
    });
  });

  describe("POST /api/macros/executions/:execId/cancel", () => {
    it("returns 404 for non-existent execution", async () => {
      const res = await app.request(
        "/api/macros/executions/nope/cancel",
        { method: "POST" },
      );
      expect(res.status).toBe(404);
    });

    it("cancels a running execution", async () => {
      globalThis.fetch = (() =>
        Promise.resolve(new Response("", { status: 200 }))) as any;

      const macro = macroStore.create({
        name: "Test",
        steps: [
          { action: "reset" },
          { action: "delay", ms: 10000 },
          { action: "pause" },
        ],
      });
      deviceStore.upsert(makeDevice());

      const execRes = await app.request(`/api/macros/${macro.id}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: "DEV001" }),
      });
      const execData = await execRes.json();

      // Wait a bit for first step to process
      await new Promise((r) => setTimeout(r, 50));

      const cancelRes = await app.request(
        `/api/macros/executions/${execData.id}/cancel`,
        { method: "POST" },
      );
      expect(cancelRes.status).toBe(200);
      const cancelData = await cancelRes.json();
      expect(cancelData.ok).toBe(true);
    });
  });
});
