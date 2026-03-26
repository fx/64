import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { Hono } from "hono";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPlaylistRoutes } from "../src/server/routes/playlists.ts";
import { PlaylistStore } from "../src/server/lib/playlist-store.ts";
import { PlaybackStateManager } from "../src/server/lib/playback-state.ts";
import { DeviceStore } from "../src/server/lib/device-store.ts";
import type { Device, Track } from "../src/shared/types.ts";

function testDataPath(prefix: string) {
  return join(tmpdir(), `${prefix}-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "dev1",
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

function makeTracks(count = 3): Track[] {
  return Array.from({ length: count }, (_, i) => ({
    path: `/USB0/Music/song${i + 1}.sid`,
    type: "sid" as const,
    title: `Song ${i + 1}`,
    songnr: i + 1,
  }));
}

const originalFetch = globalThis.fetch;

describe("Playlist Routes", () => {
  let app: Hono;
  let playlistStore: PlaylistStore;
  let playbackState: PlaybackStateManager;
  let deviceStore: DeviceStore;
  let playlistDataPath: string;
  let deviceDataPath: string;

  beforeEach(() => {
    playlistDataPath = testDataPath("playlists-route");
    deviceDataPath = testDataPath("devices-route");
    playlistStore = new PlaylistStore(playlistDataPath);
    playbackState = new PlaybackStateManager();
    deviceStore = new DeviceStore(deviceDataPath);
    deviceStore.upsert(makeDevice());

    const routes = createPlaylistRoutes(playlistStore, playbackState, deviceStore);
    app = new Hono().basePath("/api").route("/", routes);

    // Mock fetch for device API calls
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ errors: [] }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (existsSync(playlistDataPath)) unlinkSync(playlistDataPath);
    if (existsSync(deviceDataPath)) unlinkSync(deviceDataPath);
  });

  // ── Playlist CRUD ───────────────────────────────────

  describe("CRUD", () => {
    it("GET /api/playlists returns empty list", async () => {
      const res = await app.request("/api/playlists");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual([]);
    });

    it("POST /api/playlists creates a playlist", async () => {
      const res = await app.request("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "My SIDs", tracks: makeTracks(2) }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("My SIDs");
      expect(body.tracks).toHaveLength(2);
      expect(body.id).toBeDefined();
    });

    it("POST /api/playlists rejects missing name", async () => {
      const res = await app.request("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tracks: [] }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("name");
    });

    it("POST /api/playlists rejects empty name", async () => {
      const res = await app.request("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      });
      expect(res.status).toBe(400);
    });

    it("POST /api/playlists rejects invalid JSON", async () => {
      const res = await app.request("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      });
      expect(res.status).toBe(400);
    });

    it("GET /api/playlists/:id returns playlist", async () => {
      const created = playlistStore.create({ name: "Test", tracks: makeTracks() });
      const res = await app.request(`/api/playlists/${created.id}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("Test");
    });

    it("GET /api/playlists/:id returns 404 for unknown", async () => {
      const res = await app.request("/api/playlists/nonexistent");
      expect(res.status).toBe(404);
    });

    it("PUT /api/playlists/:id updates playlist", async () => {
      const created = playlistStore.create({ name: "Old", tracks: makeTracks() });
      const res = await app.request(`/api/playlists/${created.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("New");
    });

    it("PUT /api/playlists/:id returns 404 for unknown", async () => {
      const res = await app.request("/api/playlists/nonexistent", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New" }),
      });
      expect(res.status).toBe(404);
    });

    it("PUT /api/playlists/:id rejects invalid JSON", async () => {
      const created = playlistStore.create({ name: "Test", tracks: [] });
      const res = await app.request(`/api/playlists/${created.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "bad",
      });
      expect(res.status).toBe(400);
    });

    it("DELETE /api/playlists/:id removes playlist", async () => {
      const created = playlistStore.create({ name: "Test", tracks: makeTracks() });
      const res = await app.request(`/api/playlists/${created.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(playlistStore.get(created.id)).toBeUndefined();
    });

    it("DELETE /api/playlists/:id returns 404 for unknown", async () => {
      const res = await app.request("/api/playlists/nonexistent", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("GET /api/playlists lists multiple playlists", async () => {
      playlistStore.create({ name: "A", tracks: [] });
      playlistStore.create({ name: "B", tracks: [] });
      const res = await app.request("/api/playlists");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
    });
  });

  // ── Playback Control ────────────────────────────────

  describe("Playback", () => {
    it("GET /api/devices/:deviceId/playback returns stopped state", async () => {
      const res = await app.request("/api/devices/dev1/playback");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("stopped");
      expect(body.deviceId).toBe("dev1");
    });

    it("GET /api/devices/:deviceId/playback returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/unknown/playback");
      expect(res.status).toBe(404);
    });

    it("POST play with single track", async () => {
      const track: Track = { path: "/USB0/song.sid", type: "sid", title: "Song", songnr: 1 };
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("playing");
      expect(body.currentTrack.path).toBe("/USB0/song.sid");

      // Verify fetch was called with sidplay
      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      const url = String(fetchCalls[0][0]);
      expect(url).toContain("/v1/runners:sidplay");
      expect(url).toContain("file=%2FUSB0%2Fsong.sid");
      expect(url).toContain("songnr=1");
    });

    it("POST play with MOD track uses modplay runner", async () => {
      const track: Track = { path: "/USB0/song.mod", type: "mod", title: "Mod Song" };
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track }),
      });
      expect(res.status).toBe(200);

      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      const url = String(fetchCalls[0][0]);
      expect(url).toContain("/v1/runners:modplay");
    });

    it("POST play with playlist starts at position 0", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("playing");
      expect(body.playlistId).toBe(playlist.id);
      expect(body.position).toBe(0);
      expect(body.currentTrack.title).toBe("Song 1");
    });

    it("POST play with playlist at specific position", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 2 }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(2);
      expect(body.currentTrack.title).toBe("Song 3");
    });

    it("POST play rejects invalid position", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(2) });
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 5 }),
      });
      expect(res.status).toBe(400);
    });

    it("POST play rejects negative position", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(2) });
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: -1 }),
      });
      expect(res.status).toBe(400);
    });

    it("POST play rejects empty playlist", async () => {
      const playlist = playlistStore.create({ name: "Empty", tracks: [] });
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id }),
      });
      expect(res.status).toBe(400);
    });

    it("POST play rejects unknown playlist", async () => {
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: "nonexistent" }),
      });
      expect(res.status).toBe(404);
    });

    it("POST play rejects missing track and playlistId", async () => {
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });

    it("POST play returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/unknown/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track: { path: "/song.sid", type: "sid", title: "S" } }),
      });
      expect(res.status).toBe(404);
    });

    it("POST play returns 503 for offline device", async () => {
      deviceStore.upsert(makeDevice({ id: "offline1", online: false }));
      const res = await app.request("/api/devices/offline1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track: { path: "/song.sid", type: "sid", title: "S" } }),
      });
      expect(res.status).toBe(503);
    });

    it("POST play rejects invalid JSON", async () => {
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "bad json",
      });
      expect(res.status).toBe(400);
    });

    it("POST play returns 502 when device returns error", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Internal Error", { status: 500 });
      }) as typeof fetch;

      const track: Track = { path: "/USB0/song.sid", type: "sid", title: "Song" };
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track }),
      });
      expect(res.status).toBe(502);
    });

    it("POST play returns 502 when device is unreachable", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("ECONNREFUSED");
      }) as typeof fetch;

      const track: Track = { path: "/USB0/song.sid", type: "sid", title: "Song" };
      const res = await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track }),
      });
      expect(res.status).toBe(502);
    });

    it("POST play sends password header when device has password", async () => {
      deviceStore.upsert(makeDevice({ id: "authdev", password: "secret123" }));
      const track: Track = { path: "/song.sid", type: "sid", title: "S" };
      await app.request("/api/devices/authdev/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track }),
      });

      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      const opts = fetchCalls[0][1] as RequestInit;
      expect((opts.headers as Record<string, string>)["X-Password"]).toBe("secret123");
    });

    // ── Next/Prev ─────────────────────────────────────

    it("POST next advances to next track with wraparound", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      // Start playing at position 2 (last)
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 2 }),
      });

      const res = await app.request("/api/devices/dev1/playback/next", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(0); // wrapped around
      expect(body.currentTrack.title).toBe("Song 1");
    });

    it("POST next advances sequentially", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 0 }),
      });

      const res = await app.request("/api/devices/dev1/playback/next", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(1);
    });

    it("POST next returns 400 with no active playlist", async () => {
      const res = await app.request("/api/devices/dev1/playback/next", { method: "POST" });
      expect(res.status).toBe(400);
    });

    it("POST next returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/unknown/playback/next", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("POST next returns 503 for offline device", async () => {
      deviceStore.upsert(makeDevice({ id: "off1", online: false }));
      const res = await app.request("/api/devices/off1/playback/next", { method: "POST" });
      expect(res.status).toBe(503);
    });

    it("POST prev goes to previous track with wraparound", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      // Start playing at position 0 (first)
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 0 }),
      });

      const res = await app.request("/api/devices/dev1/playback/prev", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(2); // wrapped to last
      expect(body.currentTrack.title).toBe("Song 3");
    });

    it("POST prev goes back sequentially", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 2 }),
      });

      const res = await app.request("/api/devices/dev1/playback/prev", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.position).toBe(1);
    });

    it("POST prev returns 400 with no active playlist", async () => {
      const res = await app.request("/api/devices/dev1/playback/prev", { method: "POST" });
      expect(res.status).toBe(400);
    });

    it("POST prev returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/unknown/playback/prev", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("POST prev returns 503 for offline device", async () => {
      deviceStore.upsert(makeDevice({ id: "off2", online: false }));
      const res = await app.request("/api/devices/off2/playback/prev", { method: "POST" });
      expect(res.status).toBe(503);
    });

    // ── Stop ──────────────────────────────────────────

    it("POST stop resets device and clears state", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks() });
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id }),
      });

      const res = await app.request("/api/devices/dev1/playback/stop", { method: "POST" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("stopped");

      // Verify machine:reset was called
      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      const lastUrl = String(fetchCalls[fetchCalls.length - 1][0]);
      expect(lastUrl).toContain("/v1/machine:reset");
    });

    it("POST stop returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/unknown/playback/stop", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("POST stop returns 503 for offline device", async () => {
      deviceStore.upsert(makeDevice({ id: "off3", online: false }));
      const res = await app.request("/api/devices/off3/playback/stop", { method: "POST" });
      expect(res.status).toBe(503);
    });

    it("POST stop returns 502 when device returns error", async () => {
      globalThis.fetch = mock(async () => {
        return new Response("Error", { status: 500 });
      }) as typeof fetch;

      const res = await app.request("/api/devices/dev1/playback/stop", { method: "POST" });
      expect(res.status).toBe(502);
    });

    it("POST stop returns 502 when device unreachable", async () => {
      globalThis.fetch = mock(async () => {
        throw new Error("connection refused");
      }) as typeof fetch;

      const res = await app.request("/api/devices/dev1/playback/stop", { method: "POST" });
      expect(res.status).toBe(502);
    });

    // ── Next/prev with device errors ──────────────────

    it("POST next returns 502 when device returns error", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      // First play succeeds
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id }),
      });

      // Now make device fail
      globalThis.fetch = mock(async () => {
        return new Response("Error", { status: 500 });
      }) as typeof fetch;

      const res = await app.request("/api/devices/dev1/playback/next", { method: "POST" });
      expect(res.status).toBe(502);
    });

    it("POST prev returns 502 when device unreachable", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id, position: 1 }),
      });

      globalThis.fetch = mock(async () => {
        throw new Error("timeout");
      }) as typeof fetch;

      const res = await app.request("/api/devices/dev1/playback/prev", { method: "POST" });
      expect(res.status).toBe(502);
    });

    it("POST next with deleted playlist returns 404", async () => {
      const playlist = playlistStore.create({ name: "Test", tracks: makeTracks(3) });
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playlistId: playlist.id }),
      });

      // Delete the playlist
      playlistStore.remove(playlist.id);

      const res = await app.request("/api/devices/dev1/playback/next", { method: "POST" });
      expect(res.status).toBe(404);
    });

    it("SID track without songnr does not include songnr param", async () => {
      const track: Track = { path: "/USB0/song.sid", type: "sid", title: "Song" };
      await app.request("/api/devices/dev1/playback/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track }),
      });

      const fetchCalls = (globalThis.fetch as ReturnType<typeof mock>).mock.calls;
      const url = String(fetchCalls[0][0]);
      expect(url).not.toContain("songnr");
    });
  });
});
