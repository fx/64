import { Hono } from "hono";
import type { Context } from "hono";
import type { PlaylistStore } from "../lib/playlist-store.ts";
import type { PlaybackStateManager } from "../lib/playback-state.ts";
import type { DeviceStore } from "../lib/device-store.ts";
import type { Device, Track, PlaybackState, PlaybackEventType } from "@shared/types.ts";

const DEVICE_TIMEOUT_MS = 5000;

async function parseJSON<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

/** Validate that a track object has required fields */
function isValidTrack(t: unknown): t is Track {
  if (!t || typeof t !== "object") return false;
  const obj = t as Record<string, unknown>;
  return (
    typeof obj.path === "string" &&
    obj.path.length > 0 &&
    (obj.type === "sid" || obj.type === "mod") &&
    typeof obj.title === "string"
  );
}

/** Check a C64U JSON response for errors array. Returns error string or null. */
function extractDeviceErrors(res: Response, body: unknown): string | null {
  if (body && typeof body === "object" && "errors" in body) {
    const errors = (body as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      return errors.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join("; ");
    }
  }
  return null;
}

/** Send a track play command to a C64U device. Returns null on success, or an error Response. */
async function sendTrackToDevice(c: Context, device: Device, track: Track): Promise<Response | null> {
  const runnerPath = track.type === "sid" ? "/v1/runners:sidplay" : "/v1/runners:modplay";
  const params = new URLSearchParams({ file: track.path });
  if (track.type === "sid" && track.songnr !== undefined) {
    params.set("songnr", String(track.songnr));
  }

  const headers: Record<string, string> = {};
  if (device.password) headers["X-Password"] = device.password;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);

  try {
    const res = await fetch(`http://${device.ip}:${device.port}${runnerPath}?${params}`, {
      method: "PUT",
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: `Device returned ${res.status}: ${text}` }, 502);
    }
    // Check for C64U errors array in JSON responses
    if (res.headers.get("content-type")?.includes("application/json")) {
      try {
        const body = await res.json();
        const errMsg = extractDeviceErrors(res, body);
        if (errMsg) return c.json({ error: `Device reported error: ${errMsg}` }, 502);
      } catch {
        // JSON parse failure on 2xx — treat as success
      }
    }
    return null;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return c.json({ error: "Device did not respond (timeout)" }, 504);
    }
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Cannot reach device: ${msg}` }, 502);
  } finally {
    clearTimeout(timer);
  }
}

export function createPlaylistRoutes(
  playlistStore: PlaylistStore,
  playbackState: PlaybackStateManager,
  deviceStore: DeviceStore,
) {
  const app = new Hono();

  // ── Playlist CRUD ───────────────────────────────────

  app.get("/playlists", (c) => {
    return c.json(playlistStore.list());
  });

  app.post("/playlists", async (c) => {
    const body = await parseJSON<{ name?: string; tracks?: Track[] }>(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);
    if (!body.name || !body.name.trim()) {
      return c.json({ error: "name is required" }, 400);
    }
    if (body.tracks !== undefined) {
      if (!Array.isArray(body.tracks)) return c.json({ error: "tracks must be an array" }, 400);
      for (const t of body.tracks) {
        if (!isValidTrack(t)) return c.json({ error: "Each track must have path, type (sid|mod), and title" }, 400);
      }
    }
    const playlist = playlistStore.create({ name: body.name.trim(), tracks: body.tracks });
    return c.json(playlist, 201);
  });

  app.get("/playlists/:id", (c) => {
    const playlist = playlistStore.get(c.req.param("id"));
    if (!playlist) return c.json({ error: "Playlist not found" }, 404);
    return c.json(playlist);
  });

  app.put("/playlists/:id", async (c) => {
    const body = await parseJSON<{ name?: string; tracks?: Track[] }>(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);
    if (body.name !== undefined && !body.name.trim()) {
      return c.json({ error: "name cannot be empty" }, 400);
    }
    if (body.tracks !== undefined) {
      if (!Array.isArray(body.tracks)) return c.json({ error: "tracks must be an array" }, 400);
      for (const t of body.tracks) {
        if (!isValidTrack(t)) return c.json({ error: "Each track must have path, type (sid|mod), and title" }, 400);
      }
    }
    const data = { ...body, name: body.name?.trim() };
    const playlist = playlistStore.update(c.req.param("id"), data);
    if (!playlist) return c.json({ error: "Playlist not found" }, 404);
    return c.json(playlist);
  });

  app.delete("/playlists/:id", (c) => {
    const removed = playlistStore.remove(c.req.param("id"));
    if (!removed) return c.json({ error: "Playlist not found" }, 404);
    return c.json({ ok: true });
  });

  // ── Playback Control ────────────────────────────────

  app.get("/devices/:deviceId/playback", (c) => {
    const deviceId = c.req.param("deviceId");
    const device = deviceStore.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    return c.json(playbackState.get(deviceId));
  });

  app.post("/devices/:deviceId/playback/play", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = deviceStore.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const body = await parseJSON<{
      track?: Track;
      playlistId?: string;
      position?: number;
    }>(c);
    if (!body) return c.json({ error: "Invalid JSON" }, 400);

    let track: Track;
    let playlistId: string | undefined;
    let position = 0;

    if (body.track) {
      if (!isValidTrack(body.track)) {
        return c.json({ error: "Track must have path, type (sid|mod), and title" }, 400);
      }
      track = body.track;
    } else if (body.playlistId) {
      const playlist = playlistStore.get(body.playlistId);
      if (!playlist) return c.json({ error: "Playlist not found" }, 404);
      if (playlist.tracks.length === 0) return c.json({ error: "Playlist is empty" }, 400);
      position = body.position ?? 0;
      if (position < 0 || position >= playlist.tracks.length) {
        return c.json({ error: "Position out of range" }, 400);
      }
      track = playlist.tracks[position];
      playlistId = body.playlistId;
    } else {
      return c.json({ error: "track or playlistId is required" }, 400);
    }

    const err = await sendTrackToDevice(c, device, track);
    if (err) return err;

    const state: PlaybackState = {
      deviceId,
      status: "playing",
      currentTrack: track,
      playlistId,
      position,
    };
    playbackState.set(deviceId, state, "playback:play");
    return c.json(state);
  });

  /** Shared handler for next/prev — advances playlist position by delta (+1 or -1). */
  async function advancePlaylist(c: Context, delta: number, eventType: PlaybackEventType) {
    const deviceId = c.req.param("deviceId");
    const device = deviceStore.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const current = playbackState.get(deviceId);
    if (!current.playlistId) {
      return c.json({ error: "No active playlist" }, 400);
    }

    const playlist = playlistStore.get(current.playlistId);
    if (!playlist || playlist.tracks.length === 0) {
      return c.json({ error: "Playlist not found or empty" }, 404);
    }

    const newPos = ((current.position + delta) % playlist.tracks.length + playlist.tracks.length) % playlist.tracks.length;
    const track = playlist.tracks[newPos];

    const err = await sendTrackToDevice(c, device, track);
    if (err) return err;

    const state: PlaybackState = {
      deviceId,
      status: "playing",
      currentTrack: track,
      playlistId: current.playlistId,
      position: newPos,
    };
    playbackState.set(deviceId, state, eventType);
    return c.json(state);
  }

  app.post("/devices/:deviceId/playback/next", (c) => advancePlaylist(c, 1, "playback:next"));
  app.post("/devices/:deviceId/playback/prev", (c) => advancePlaylist(c, -1, "playback:prev"));

  app.post("/devices/:deviceId/playback/stop", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = deviceStore.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const headers: Record<string, string> = {};
    if (device.password) headers["X-Password"] = device.password;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);

    try {
      const res = await fetch(`http://${device.ip}:${device.port}/v1/machine:reset`, {
        method: "PUT",
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        return c.json({ error: `Device returned ${res.status}: ${text}` }, 502);
      }
      // Check for C64U errors array
      if (res.headers.get("content-type")?.includes("application/json")) {
        try {
          const body = await res.json();
          const errMsg = extractDeviceErrors(res, body);
          if (errMsg) return c.json({ error: `Device reported error: ${errMsg}` }, 502);
        } catch {
          // JSON parse failure — treat as success
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return c.json({ error: "Device did not respond (timeout)" }, 504);
      }
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Cannot reach device: ${msg}` }, 502);
    } finally {
      clearTimeout(timer);
    }

    playbackState.clear(deviceId);
    return c.json(playbackState.get(deviceId));
  });

  return app;
}
