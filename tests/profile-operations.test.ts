import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProfileStore } from "../src/server/lib/profile-store.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import { createProfileRoutes } from "../src/server/routes/profiles.ts";
import type { Device } from "../src/shared/types.ts";

const originalFetch = globalThis.fetch;

function makeConfig(): Record<string, Record<string, string | number>> {
  return {
    "Audio": { "SID Engine": "ReSID", "SID Model": "6581" },
    "Video": { "Border": "Normal", "Palette": 1 },
  };
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "dev-1",
    name: "Test Device",
    ip: "192.168.1.100",
    port: 80,
    product: "Ultimate 64",
    firmware: "3.10",
    fpga: "1.0",
    online: true,
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

function createApp(profileStore: ProfileStore, deviceStore: DeviceStore) {
  return new Hono()
    .basePath("/api")
    .route("/", createProfileRoutes(profileStore, deviceStore));
}

function uniquePath(prefix: string) {
  return join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

// ── Capture tests ──────────────────────────────────

describe("POST /api/profiles/capture", () => {
  let dataPath: string;
  let devDataPath: string;
  let profileStore: ProfileStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataPath = uniquePath("prof-cap");
    devDataPath = uniquePath("dev-cap");
    profileStore = new ProfileStore(dataPath);
    deviceStore = new DeviceStore(devDataPath);
    app = createApp(profileStore, deviceStore);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
    if (existsSync(devDataPath)) unlinkSync(devDataPath);
  });

  it("captures device config and creates a profile", async () => {
    const device = makeDevice();
    deviceStore.upsert(device);

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (u.includes("/v1/configs") && !u.includes("/v1/configs/")) {
        return new Response(JSON.stringify({ categories: ["Audio", "Video"], errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/v1/configs/Audio")) {
        return new Response(JSON.stringify({ Audio: { "SID Engine": "ReSID", "SID Model": "6581" }, errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/v1/configs/Video")) {
        return new Response(JSON.stringify({ Video: { "Border": "Normal", "Palette": 1 }, errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1", name: "Captured Config" }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Captured Config");
    expect(data.deviceProduct).toBe("Ultimate 64");
    expect(data.config.Audio).toEqual({ "SID Engine": "ReSID", "SID Model": "6581" });
    expect(data.config.Video).toEqual({ "Border": "Normal", "Palette": 1 });
    expect(data.id).toBeDefined();
    // Verify profile was persisted
    expect(profileStore.get(data.id)).toBeDefined();
  });

  it("returns 400 for missing deviceId", async () => {
    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("deviceId");
  });

  it("returns 400 for missing name", async () => {
    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("name");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown device", async () => {
    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "unknown", name: "Test" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Device not found");
  });

  it("returns 503 for offline device", async () => {
    deviceStore.upsert(makeDevice({ online: false }));

    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1", name: "Test" }),
    });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("offline");
  });

  it("returns error when device returns errors array", async () => {
    deviceStore.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ categories: [], errors: ["Config subsystem unavailable"] }), {
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1", name: "Test" }),
    });
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("Config subsystem unavailable");
  });

  it("returns error when device fetch fails", async () => {
    deviceStore.upsert(makeDevice());

    globalThis.fetch = mock(async () => {
      throw new Error("Connection refused");
    }) as typeof fetch;

    const res = await app.request("/api/profiles/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1", name: "Test" }),
    });
    expect(res.status).toBe(502);
  });
});

// ── Apply tests ─────────────────────────────────────

describe("POST /api/profiles/:id/apply", () => {
  let dataPath: string;
  let devDataPath: string;
  let profileStore: ProfileStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataPath = uniquePath("prof-apply");
    devDataPath = uniquePath("dev-apply");
    profileStore = new ProfileStore(dataPath);
    deviceStore = new DeviceStore(devDataPath);
    app = createApp(profileStore, deviceStore);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
    if (existsSync(devDataPath)) unlinkSync(devDataPath);
  });

  it("applies profile config to device", async () => {
    const profile = profileStore.create({ name: "Test", config: makeConfig() });
    deviceStore.upsert(makeDevice());

    const putUrls: string[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      const method = init?.method ?? "GET";
      if (method === "PUT") {
        putUrls.push(u);
        return new Response(JSON.stringify({ errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appliedCount).toBe(4); // 2 Audio items + 2 Video items
    expect(data.errors).toEqual([]);
    // Should have PUT for each config item using query params
    expect(putUrls.length).toBe(4);
    expect(putUrls.some((u) => u.includes("/v1/configs/Audio/SID%20Engine?value=ReSID"))).toBe(true);
    expect(putUrls.some((u) => u.includes("/v1/configs/Video/Border?value=Normal"))).toBe(true);
    expect(putUrls.some((u) => u.includes("/v1/configs/Video/Palette?value=1"))).toBe(true);
  });

  it("applies with saveToFlash", async () => {
    const profile = profileStore.create({ name: "Test", config: { "Audio": { "Volume": "10" } } });
    deviceStore.upsert(makeDevice());

    const putUrls: string[] = [];
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (init?.method === "PUT") {
        putUrls.push(u);
        return new Response(JSON.stringify({ errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1", saveToFlash: true }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appliedCount).toBe(1);
    // Should have one item PUT + save_to_flash PUT
    expect(putUrls.length).toBe(2);
    expect(putUrls.some((u) => u.includes("save_to_flash"))).toBe(true);
  });

  it("returns 404 for missing profile", async () => {
    const res = await app.request("/api/profiles/nonexistent/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Profile not found");
  });

  it("returns 400 for missing deviceId", async () => {
    const profile = profileStore.create({ name: "Test", config: makeConfig() });
    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("deviceId");
  });

  it("returns 400 for invalid JSON", async () => {
    const profile = profileStore.create({ name: "Test", config: makeConfig() });
    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown device", async () => {
    const profile = profileStore.create({ name: "Test", config: makeConfig() });
    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "unknown" }),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Device not found");
  });

  it("returns 503 for offline device", async () => {
    const profile = profileStore.create({ name: "Test", config: makeConfig() });
    deviceStore.upsert(makeDevice({ online: false }));

    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("offline");
  });

  it("returns 400 for non-boolean saveToFlash", async () => {
    const profile = profileStore.create({ name: "Test", config: makeConfig() });
    deviceStore.upsert(makeDevice());

    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1", saveToFlash: "yes" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("saveToFlash");
  });

  it("reports partial failures when some items fail", async () => {
    const profile = profileStore.create({
      name: "Test",
      config: { "Audio": { "Volume": "10", "Broken": "yes" } },
    });
    deviceStore.upsert(makeDevice());

    let callCount = 0;
    globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") {
        callCount++;
        if (callCount === 2) {
          return new Response("Server Error", { status: 500 });
        }
        return new Response(JSON.stringify({ errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appliedCount).toBe(1);
    expect(data.errors.length).toBe(1);
  });

  it("reports error when device PUT returns errors array", async () => {
    const profile = profileStore.create({
      name: "Test",
      config: { "Audio": { "Volume": "10" } },
    });
    deviceStore.upsert(makeDevice());

    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Response(JSON.stringify({ errors: ["Read-only setting"] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const res = await app.request(`/api/profiles/${profile.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.appliedCount).toBe(0);
    expect(data.errors.length).toBe(1);
    expect(data.errors[0]).toContain("Read-only setting");
  });
});

// ── Diff tests ──────────────────────────────────────

describe("GET /api/profiles/:id/diff", () => {
  let dataPath: string;
  let devDataPath: string;
  let profileStore: ProfileStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataPath = uniquePath("prof-diff");
    devDataPath = uniquePath("dev-diff");
    profileStore = new ProfileStore(dataPath);
    deviceStore = new DeviceStore(devDataPath);
    app = createApp(profileStore, deviceStore);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(dataPath)) unlinkSync(dataPath);
    if (existsSync(devDataPath)) unlinkSync(devDataPath);
  });

  it("diffs two profiles with changes", async () => {
    const p1 = profileStore.create({
      name: "Profile A",
      config: { "Audio": { "SID Engine": "ReSID", "Volume": "10" } },
    });
    const p2 = profileStore.create({
      name: "Profile B",
      config: { "Audio": { "SID Engine": "FastSID", "Volume": "10" } },
    });

    const res = await app.request(`/api/profiles/${p1.id}/diff?against=${p2.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].category).toBe("Audio");
    expect(data.changes[0].item).toBe("SID Engine");
    expect(data.changes[0].left).toBe("ReSID");
    expect(data.changes[0].right).toBe("FastSID");
    expect(data.identicalCount).toBe(1); // Volume is identical
    expect(data.leftOnly).toHaveLength(0);
    expect(data.rightOnly).toHaveLength(0);
  });

  it("diffs profiles with left-only and right-only items", async () => {
    const p1 = profileStore.create({
      name: "Profile A",
      config: { "Audio": { "SID Engine": "ReSID" }, "Video": { "Border": "Normal" } },
    });
    const p2 = profileStore.create({
      name: "Profile B",
      config: { "Audio": { "SID Engine": "ReSID" }, "Drive": { "Type": "1541" } },
    });

    const res = await app.request(`/api/profiles/${p1.id}/diff?against=${p2.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.identicalCount).toBe(1); // Audio.SID Engine
    expect(data.leftOnly).toHaveLength(1);
    expect(data.leftOnly[0].category).toBe("Video");
    expect(data.leftOnly[0].item).toBe("Border");
    expect(data.rightOnly).toHaveLength(1);
    expect(data.rightOnly[0].category).toBe("Drive");
    expect(data.rightOnly[0].item).toBe("Type");
  });

  it("diffs identical profiles", async () => {
    const config = makeConfig();
    const p1 = profileStore.create({ name: "A", config });
    const p2 = profileStore.create({ name: "B", config });

    const res = await app.request(`/api/profiles/${p1.id}/diff?against=${p2.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.changes).toHaveLength(0);
    expect(data.leftOnly).toHaveLength(0);
    expect(data.rightOnly).toHaveLength(0);
    expect(data.identicalCount).toBe(4); // 2 Audio + 2 Video items
  });

  it("diffs profile against live device", async () => {
    const p1 = profileStore.create({
      name: "Profile",
      config: { "Audio": { "SID Engine": "ReSID" } },
    });
    deviceStore.upsert(makeDevice());

    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (u.includes("/v1/configs") && !u.includes("/v1/configs/")) {
        return new Response(JSON.stringify({ categories: ["Audio"], errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/v1/configs/Audio")) {
        return new Response(JSON.stringify({ Audio: { "SID Engine": "FastSID" }, errors: [] }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const res = await app.request(`/api/profiles/${p1.id}/diff?deviceId=dev-1`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.changes).toHaveLength(1);
    expect(data.changes[0].left).toBe("ReSID");
    expect(data.changes[0].right).toBe("FastSID");
  });

  it("returns 404 for missing profile", async () => {
    const res = await app.request("/api/profiles/nonexistent/diff?against=other");
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Profile not found");
  });

  it("returns 404 for missing comparison profile", async () => {
    const p1 = profileStore.create({ name: "A", config: makeConfig() });
    const res = await app.request(`/api/profiles/${p1.id}/diff?against=nonexistent`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Comparison profile not found");
  });

  it("returns 400 when both against and deviceId provided", async () => {
    const p1 = profileStore.create({ name: "A", config: makeConfig() });
    const p2 = profileStore.create({ name: "B", config: makeConfig() });
    deviceStore.upsert(makeDevice());

    const res = await app.request(`/api/profiles/${p1.id}/diff?against=${p2.id}&deviceId=dev-1`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not both");
  });

  it("returns 400 when no query params provided", async () => {
    const p1 = profileStore.create({ name: "A", config: makeConfig() });
    const res = await app.request(`/api/profiles/${p1.id}/diff`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("against");
  });

  it("returns 404 for missing device in device diff", async () => {
    const p1 = profileStore.create({ name: "A", config: makeConfig() });
    const res = await app.request(`/api/profiles/${p1.id}/diff?deviceId=unknown`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("Device not found");
  });

  it("returns 503 for offline device in device diff", async () => {
    const p1 = profileStore.create({ name: "A", config: makeConfig() });
    deviceStore.upsert(makeDevice({ online: false }));

    const res = await app.request(`/api/profiles/${p1.id}/diff?deviceId=dev-1`);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain("offline");
  });
});

// ── Export tests ─────────────────────────────────────

describe("GET /api/profiles/:id/export", () => {
  let dataPath: string;
  let devDataPath: string;
  let profileStore: ProfileStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataPath = uniquePath("prof-exp");
    devDataPath = uniquePath("dev-exp");
    profileStore = new ProfileStore(dataPath);
    deviceStore = new DeviceStore(devDataPath);
    app = createApp(profileStore, deviceStore);
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
    if (existsSync(devDataPath)) unlinkSync(devDataPath);
  });

  it("exports profile as downloadable JSON", async () => {
    const profile = profileStore.create({
      name: "My Profile",
      description: "Test description",
      deviceProduct: "Ultimate 64",
      config: makeConfig(),
    });

    const res = await app.request(`/api/profiles/${profile.id}/export`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("My_Profile.json");

    const data = await res.json();
    expect(data.name).toBe("My Profile");
    expect(data.description).toBe("Test description");
    expect(data.deviceProduct).toBe("Ultimate 64");
    expect(data.config).toEqual(makeConfig());
    // Should not include id, createdAt, updatedAt
    expect(data.id).toBeUndefined();
    expect(data.createdAt).toBeUndefined();
    expect(data.updatedAt).toBeUndefined();
  });

  it("sanitizes filename for special characters", async () => {
    const profile = profileStore.create({
      name: "My Profile / Test <special>",
      config: {},
    });

    const res = await app.request(`/api/profiles/${profile.id}/export`);
    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition") ?? "";
    expect(disposition).not.toContain("/");
    expect(disposition).not.toContain("<");
    expect(disposition).not.toContain(">");
  });

  it("returns 404 for missing profile", async () => {
    const res = await app.request("/api/profiles/nonexistent/export");
    expect(res.status).toBe(404);
  });
});

// ── Import tests ─────────────────────────────────────

describe("POST /api/profiles/import", () => {
  let dataPath: string;
  let devDataPath: string;
  let profileStore: ProfileStore;
  let deviceStore: DeviceStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataPath = uniquePath("prof-imp");
    devDataPath = uniquePath("dev-imp");
    profileStore = new ProfileStore(dataPath);
    deviceStore = new DeviceStore(devDataPath);
    app = createApp(profileStore, deviceStore);
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
    if (existsSync(devDataPath)) unlinkSync(devDataPath);
  });

  it("imports a profile from JSON", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Imported Profile",
        description: "From export",
        deviceProduct: "Ultimate 64",
        config: makeConfig(),
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("Imported Profile");
    expect(data.description).toBe("From export");
    expect(data.deviceProduct).toBe("Ultimate 64");
    expect(data.config).toEqual(makeConfig());
    expect(data.id).toBeDefined();
    // Verify persisted
    expect(profileStore.get(data.id)).toBeDefined();
  });

  it("returns 400 for missing name", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("name");
  });

  it("returns 400 for missing config", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("config");
  });

  it("returns 400 for invalid config", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", config: "bad" }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("config must be an object");
  });

  it("returns 400 for invalid JSON", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-string description", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", description: 123, config: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("description");
  });

  it("returns 400 for non-string deviceProduct", async () => {
    const res = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", deviceProduct: 42, config: {} }),
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("deviceProduct");
  });

  it("round-trips with export", async () => {
    const original = profileStore.create({
      name: "Round Trip",
      description: "Test",
      deviceProduct: "Ultimate 64",
      config: makeConfig(),
    });

    // Export
    const exportRes = await app.request(`/api/profiles/${original.id}/export`);
    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.text();

    // Import
    const importRes = await app.request("/api/profiles/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: exportData,
    });
    expect(importRes.status).toBe(201);
    const imported = await importRes.json();

    expect(imported.name).toBe(original.name);
    expect(imported.description).toBe(original.description);
    expect(imported.deviceProduct).toBe(original.deviceProduct);
    expect(imported.config).toEqual(original.config);
    expect(imported.id).not.toBe(original.id); // New ID
  });
});
