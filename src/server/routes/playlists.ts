import { Hono } from "hono";
import type { Context } from "hono";
import type { PlaylistStore } from "../lib/playlist-store.ts";
import type { PlaybackStateManager } from "../lib/playback-state.ts";
import type { DeviceStore } from "../lib/device-store.ts";
import type { Device, Track, PlaybackState, PlaybackEventType } from "@shared/types.ts";

async function parseJSON<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
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

  try {
    const res = await fetch(`http://${device.ip}:${device.port}${runnerPath}?${params}`, {
      method: "PUT",
      headers,
    });
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: `Device returned ${res.status}: ${text}` }, 502);
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Cannot reach device: ${msg}` }, 502);
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
    const playlist = playlistStore.update(c.req.param("id"), body);
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

    try {
      const res = await fetch(`http://${device.ip}:${device.port}/v1/machine:reset`, {
        method: "PUT",
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        return c.json({ error: `Device returned ${res.status}: ${text}` }, 502);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Cannot reach device: ${msg}` }, 502);
    }

    playbackState.clear(deviceId);
    return c.json(playbackState.get(deviceId));
  });

  return app;
}
