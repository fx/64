import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProfileStore } from "../src/server/lib/profile-store.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createProfileRoutes } from "../src/server/routes/profiles.ts";

function makeConfig(): Record<string, Record<string, string | number>> {
  return {
    "Audio": { "SID Engine": "ReSID", "SID Model": "6581" },
    "Video": { "Border": "Normal", "Palette": 1 },
  };
}

function createApp(profileStore: ProfileStore, deviceStore: DeviceStore) {
  return new Hono()
    .basePath("/api")
    .route("/", createProfileRoutes(profileStore, deviceStore));
}

describe("Profile CRUD routes", () => {
  let dataPath: string;
  let devDataPath: string;
  let profileStore: ProfileStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataPath = join(tmpdir(), `prof-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    devDataPath = join(tmpdir(), `dev-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    profileStore = new ProfileStore(dataPath);
    deviceStore = new DeviceStore(devDataPath);
    app = createApp(profileStore, deviceStore);
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
    if (existsSync(devDataPath)) unlinkSync(devDataPath);
  });

  // ── GET /api/profiles ──────────────────────────────

  it("GET /profiles returns empty list initially", async () => {
    const res = await app.request("/api/profiles");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /profiles returns all profiles", async () => {
    profileStore.create({ name: "Profile 1", config: makeConfig() });
    profileStore.create({ name: "Profile 2", config: makeConfig() });

    const res = await app.request("/api/profiles");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  // ── POST /api/profiles ─────────────────────────────

  it("POST /profiles creates a profile", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Profile", config: makeConfig() }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("My Profile");
    expect(data.id).toBeDefined();
    expect(data.config).toEqual(makeConfig());
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
  });

  it("POST /profiles with description and deviceProduct", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "U64 Profile",
        description: "For Ultimate 64",
        deviceProduct: "Ultimate 64",
        config: makeConfig(),
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.description).toBe("For Ultimate 64");
    expect(data.deviceProduct).toBe("Ultimate 64");
  });

  it("POST /profiles with empty config object", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Empty Config", config: {} }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.config).toEqual({});
  });

  it("POST /profiles returns 400 for missing name", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("name");
  });

  it("POST /profiles returns 400 for empty name", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  ", config: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /profiles returns 400 for missing config", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("config");
  });

  it("POST /profiles returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("POST /profiles returns 400 for non-object config", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", config: "not an object" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("config must be an object");
  });

  it("POST /profiles returns 400 for array config", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", config: [1, 2, 3] }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("config must be an object");
  });

  it("POST /profiles returns 400 for non-object config category", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", config: { "Audio": "bad" } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Audio");
    expect(data.error).toContain("must be an object");
  });

  it("POST /profiles returns 400 for invalid config value type", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", config: { "Audio": { "SID": true } } }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("string or number");
  });

  it("POST /profiles returns 400 for non-string description", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", description: 123, config: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("description");
  });

  it("POST /profiles returns 400 for non-string deviceProduct", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", deviceProduct: 42, config: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("deviceProduct");
  });

  it("POST /profiles strips dangerous prototype keys from config", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        config: { "__proto__": { "polluted": "yes" }, "Audio": { "SID": "ReSID" } },
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    const configKeys = Object.keys(data.config);
    expect(configKeys).not.toContain("__proto__");
    expect(data.config["Audio"]).toEqual({ "SID": "ReSID" });
  });

  it("POST /profiles trims name", async () => {
    const res = await app.request("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  Trimmed  ", config: {} }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Trimmed");
  });

  // ── GET /api/profiles/:id ──────────────────────────

  it("GET /profiles/:id returns profile", async () => {
    const created = profileStore.create({ name: "Test", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Test");
  });

  it("GET /profiles/:id returns 404 for missing", async () => {
    const res = await app.request("/api/profiles/nonexistent");
    expect(res.status).toBe(404);
  });

  // ── PUT /api/profiles/:id ──────────────────────────

  it("PUT /profiles/:id updates name", async () => {
    const created = profileStore.create({ name: "Old", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("New");
  });

  it("PUT /profiles/:id updates config", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const newConfig = { "Drive": { "Type": "1541" } };
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: newConfig }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.config).toEqual(newConfig);
  });

  it("PUT /profiles/:id updates description", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "Updated" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.description).toBe("Updated");
  });

  it("PUT /profiles/:id updates deviceProduct", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceProduct: "Ultimate II+" }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deviceProduct).toBe("Ultimate II+");
  });

  it("PUT /profiles/:id returns 404 for missing", async () => {
    const res = await app.request("/api/profiles/nonexistent", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "X" }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT /profiles/:id returns 400 for invalid JSON", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "bad json",
    });
    expect(res.status).toBe(400);
  });

  it("PUT /profiles/:id returns 400 for empty name", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  " }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("name");
  });

  it("PUT /profiles/:id trims name", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "  Trimmed  " }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Trimmed");
  });

  it("PUT /profiles/:id returns 400 for non-string description", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: 999 }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("description");
  });

  it("PUT /profiles/:id returns 400 for non-string deviceProduct", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceProduct: true }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("deviceProduct");
  });

  it("PUT /profiles/:id returns 400 for invalid config", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: "not an object" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("config");
  });

  // ── DELETE /api/profiles/:id ───────────────────────

  it("DELETE /profiles/:id removes profile", async () => {
    const created = profileStore.create({ name: "Profile", config: makeConfig() });
    const res = await app.request(`/api/profiles/${created.id}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(profileStore.get(created.id)).toBeUndefined();
  });

  it("DELETE /profiles/:id returns 404 for missing", async () => {
    const res = await app.request("/api/profiles/nonexistent", {
      method: "DELETE",
    });
    expect(res.status).toBe(404);
  });
});
