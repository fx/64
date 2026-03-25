# 0008 — SID/MOD Jukebox

## Overview

Browse the device's music collection (SID and MOD files), build playlists, and control playback with a jukebox-style UI. Leverages the file browser (spec 0005) for discovery and the C64U's `sidplay`/`modplay` runner endpoints for playback.

## Background

The C64U can play SID files (C64 chiptunes) and Amiga MOD files natively via the `/v1/runners:sidplay` and `/v1/runners:modplay` endpoints. SID files can contain multiple sub-songs. The device looks for song length data in a `SONGLENGTHS` directory for proper timing.

The existing control panel has basic "play a file" inputs but no browsing, playlists, or playback queue.

## Goals

- Browse SID/MOD files on the device via the file browser
- Build and manage playlists (ordered collections of music files)
- Playback queue with current/next/previous navigation
- SID sub-song selection (multi-tune SID files)
- Now-playing display with file metadata
- Server-side playlists (persistent, shareable)

## Non-Goals

- Audio streaming to the browser (the C64U outputs audio through its own hardware)
- SID/MOD file metadata parsing on the server (just filename-based for now)
- Visualizations or waveform display
- Song length database management

## Technical Design

### Data Model

```typescript
interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: string
  updatedAt: string
}

interface Track {
  path: string           // file path on device
  type: 'sid' | 'mod'
  title: string          // user-assigned or derived from filename
  songnr?: number        // for multi-tune SID files
}

interface PlaybackState {
  deviceId: string
  status: 'playing' | 'stopped'
  currentTrack?: Track
  playlistId?: string
  position: number       // index in playlist
}
```

Playlists persisted to `data/playlists.json`. Playback state is in-memory only.

### API Endpoints

```
# Playlists
GET    /api/playlists                          → list playlists
POST   /api/playlists                          → create playlist
GET    /api/playlists/:id                      → get playlist
PUT    /api/playlists/:id                      → update playlist
DELETE /api/playlists/:id                      → delete playlist

# Playback
POST   /api/devices/:deviceId/playback/play    → play track or start playlist { path?, playlistId?, position? }
POST   /api/devices/:deviceId/playback/next    → next track in playlist
POST   /api/devices/:deviceId/playback/prev    → previous track
POST   /api/devices/:deviceId/playback/stop    → stop playback (reset machine)
GET    /api/devices/:deviceId/playback         → get current playback state
```

### Playback Logic

- **Play single track:** Call `PUT /v1/runners:sidplay?file=<path>` or `PUT /v1/runners:modplay?file=<path>` on the device
- **Play playlist:** Start at position, track the current index server-side
- **Next/Previous:** Advance position, call the appropriate runner
- **Stop:** Call `PUT /v1/machine:reset` to stop playback (no dedicated stop command in the API)

Note: The C64U has no "playback finished" callback. For playlists, the user manually advances to the next track. Auto-advance could be added later if song length data is available.

### SSE Events

```
event: playback
data: { "deviceId": "8D927F", "status": "playing", "track": { "path": "/USB0/Music/Commando.sid", "type": "sid" } }
```

### UI

- **Music browser:** Filtered view of file browser showing only SID/MOD files
- **Playlist manager:** Create/edit playlists, drag-to-reorder tracks
- **Now playing bar:** Persistent bottom bar showing current track, playlist position, next/prev/stop controls
- **Quick play:** Click any SID/MOD file to play immediately

## Acceptance Criteria

- [ ] CRUD operations for playlists via API
- [ ] Play a SID file on a device via the playback endpoint
- [ ] Play a MOD file on a device via the playback endpoint
- [ ] Playlist navigation (next/prev) mounts the correct track
- [ ] Playback state is tracked server-side and available via GET
- [ ] SSE events emitted on playback state changes
- [ ] UI shows now-playing bar with controls
- [ ] SID sub-song selection works (songnr parameter)

## Tasks

- [ ] Implement playlist CRUD API with JSON persistence
  - [ ] Create `Playlist`, `Track`, and `PlaybackState` TypeScript types
  - [ ] Implement `PlaylistStore`: load/save `data/playlists.json`
  - [ ] `GET /api/playlists`, `POST /api/playlists`, `GET /api/playlists/:id`, `PUT /api/playlists/:id`, `DELETE /api/playlists/:id`
- [ ] Implement playback control API
  - [ ] `POST /api/devices/:deviceId/playback/play` — play single track (by path) or start playlist (by playlistId + position)
  - [ ] Route to `PUT /v1/runners:sidplay` or `PUT /v1/runners:modplay` based on file type, pass `songnr` for SID
  - [ ] `POST /api/devices/:deviceId/playback/next` and `/prev` — advance playlist position, play next/prev track
  - [ ] `POST /api/devices/:deviceId/playback/stop` — reset machine via `PUT /v1/machine:reset`
  - [ ] `GET /api/devices/:deviceId/playback` — return current playback state
  - [ ] Track playback state per device in memory (current track, playlist position, status)
- [ ] Implement playback SSE events
  - [ ] Emit `playback` event on play, next, prev, stop with device ID, track info, and status
- [ ] Build music browser UI
  - [ ] Filtered file browser view showing only `.sid` and `.mod` files
  - [ ] Quick-play: click a file to play immediately on selected device
  - [ ] Add-to-playlist action in file context menu
- [ ] Build playlist manager UI
  - [ ] Playlist list with name, track count
  - [ ] Playlist editor: add/remove/reorder tracks, edit track titles
  - [ ] SID sub-song selector for multi-tune files
- [ ] Build now-playing bar UI component
  - [ ] Persistent bottom bar showing current track name, type icon, playlist position
  - [ ] Next/previous/stop controls
  - [ ] Playlist name and progress (track N of M)
