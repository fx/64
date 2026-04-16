# Jukebox

## Overview

The Jukebox feature provides SID and MOD music playback on Commodore 64 Ultimate devices, managed through a centralized web interface. Users create playlists of SID and MOD tracks sourced from device file systems, control playback (play, stop, next, previous) on any online device, and monitor the currently playing track via a persistent now-playing bar.

This spec covers four subsystems: **playlists** (CRUD and persistence), **playback control** (device-targeted transport commands), **now-playing bar** (real-time UI feedback), and **music browser** (device file system navigation filtered to music files).

## Background

The Ultimate 64 / Ultimate II+ hardware exposes runner endpoints for SID and MOD playback:

- **SID playback:** `PUT /v1/runners:sidplay?file=<path>[&songnr=<n>]` — plays a SID file, optionally selecting a sub-tune number for multi-tune SID files.
- **MOD playback:** `PUT /v1/runners:modplay?file=<path>` — plays an Amiga MOD tracker file.
- **Stop playback:** `PUT /v1/machine:reset` — resets the machine, which halts any active runner.

There is no device-side playlist or queue concept; the web interface is responsible for maintaining playlist state, sequencing tracks, and issuing the appropriate runner command for each track transition.

SID files (the C64's native sound format) MAY contain multiple sub-tunes addressable by `songnr`. MOD files (Amiga tracker format) are single-tune. Both formats are streamed from the device's local file system (USB, SD card).

## Requirements

### REQ-1: Playlist Persistence

The system MUST persist playlists to a JSON file so they survive server restarts.

```
GIVEN a user creates a playlist named "CHIPTUNES"
WHEN the server process restarts
THEN the playlist "CHIPTUNES" is still present in the playlist list (loaded from data/playlists.json)
```

### REQ-2: Playlist CRUD

The system MUST support creating, reading, updating, and deleting playlists.

```
GIVEN the user is on the playlist manager page
WHEN they enter a name and click CREATE
THEN a new empty playlist is created and appears in the list

GIVEN a playlist "DEMO MUSIC" exists
WHEN the user clicks EDIT on that playlist
THEN an editing panel opens showing the playlist name and its tracks

GIVEN the user is editing a playlist
WHEN they reorder tracks via drag-and-drop, add tracks via the music browser, or remove tracks, then click SAVE
THEN the playlist is updated with the new track list and order

GIVEN a playlist exists
WHEN the user clicks DEL on that playlist
THEN the playlist is permanently removed
```

### REQ-3: Track Validation

Every track in a playlist MUST have a `path` (non-empty string), a `type` (`"sid"` or `"mod"`), and a `title` (string). SID tracks MAY include a `songnr` (integer 0-255) for multi-tune selection.

```
GIVEN a user attempts to create a playlist with a track missing a path
WHEN the API receives the request
THEN it MUST return HTTP 400 with an error describing the validation failure

GIVEN a track has type "sid" and songnr is set to 3
WHEN that track is played on a device
THEN the sidplay runner command includes the query parameter songnr=3
```

### REQ-4: Single-Track Playback

The system MUST support playing a single track on a specific device without requiring a playlist.

```
GIVEN a device is online
WHEN the user sends a play request with a track object (no playlistId)
THEN the system issues the appropriate runner command (sidplay or modplay) to that device
AND the playback state reflects status "playing" with that track
```

### REQ-5: Playlist Playback

The system MUST support playing an entire playlist on a device, starting from a given position.

```
GIVEN a playlist with 5 tracks exists and a device is online
WHEN the user initiates playlist playback with position 0
THEN the first track is sent to the device and the playback state shows playlistId, position 0, and the track

GIVEN a playlist is actively playing at position 2
WHEN the user triggers "next"
THEN position advances to 3 and the track at index 3 is sent to the device
```

### REQ-6: Playlist Wrapping

Next/previous navigation MUST wrap around the playlist boundaries.

```
GIVEN a playlist with 5 tracks is playing at position 4 (last track)
WHEN the user triggers "next"
THEN position wraps to 0 and the first track plays

GIVEN a playlist is playing at position 0
WHEN the user triggers "prev"
THEN position wraps to 4 (last track) and that track plays
```

### REQ-7: Stop Playback

Stopping playback MUST reset the device and clear the playback state.

```
GIVEN a track is playing on a device
WHEN the user triggers "stop"
THEN a machine:reset command is sent to the device
AND the playback state is cleared to { status: "stopped", position: 0 }
```

### REQ-8: Offline Device Guard

Playback commands MUST be rejected for offline devices.

```
GIVEN a registered device is offline
WHEN a play, next, prev, or stop command is issued against that device
THEN the API MUST return HTTP 503 with error "Device is offline"
```

### REQ-9: Device Communication Timeout

All commands sent to a device MUST time out after 5000 ms to prevent indefinite hangs.

```
GIVEN a device is online but unresponsive
WHEN a playback command is sent
THEN the request aborts after 5000ms and the API returns HTTP 504
```

### REQ-10: Now-Playing Bar

The UI MUST display a fixed bottom bar showing the currently playing track when playback is active.

```
GIVEN playback is active on the current device
WHEN the user views any page in the device dashboard
THEN a bottom bar is visible showing: track type badge (SID/MOD), song number (SID only), track title, playlist position (e.g., "3/10"), and prev/next/stop controls

GIVEN playback is stopped
WHEN the user views the device dashboard
THEN the now-playing bar is hidden
```

### REQ-11: Music Browser

The playlist editing UI MUST include a music browser that navigates device file systems and filters to music files only.

```
GIVEN the user is editing a playlist and clicks "+ ADD TRACKS"
WHEN the music browser opens
THEN it shows a device selector listing online devices

GIVEN a device is selected in the music browser
WHEN the user navigates the file system
THEN only directories and files with .sid or .mod extensions are shown

GIVEN a .sid file is visible in the music browser
WHEN the user clicks the file
THEN a Track object is created from the file metadata and added to the playlist being edited
```

### REQ-12: Playback State Polling

The client MUST poll the server for playback state at a regular interval to stay current.

```
GIVEN the now-playing bar is displayed
WHEN 10 seconds have elapsed since the last poll
THEN the client fetches the latest playback state from the server
```

### REQ-13: Playback Events

The server MUST emit playback events when state changes, enabling real-time notification to other connected clients.

```
GIVEN a track starts playing on a device
WHEN the playback state is updated
THEN a "playback:play" event is emitted with the full PlaybackState

GIVEN playback is stopped
WHEN the state is cleared
THEN a "playback:stop" event is emitted
```

### REQ-14: SID Sub-Tune Selection

The playlist editor MUST allow setting the sub-tune number for SID tracks.

```
GIVEN a SID track is in the playlist editor track list
WHEN the user enters a number (0-255) in the SONG column input
THEN the track's songnr field is updated

GIVEN a MOD track is in the playlist editor track list
WHEN the user views the SONG column
THEN a dash ("-") is displayed and no input is available
```

### REQ-15: Drag-to-Reorder Tracks

The playlist editor MUST support drag-and-drop reordering of tracks.

```
GIVEN a playlist has tracks [A, B, C] in the editor
WHEN the user drags track C to position 1
THEN the track list updates to [A, C, B] with visual feedback during the drag
```

## Design

### Architecture

The Jukebox follows the application's monolith architecture: a Hono API server manages state and proxies commands to Ultimate devices, while a React SPA provides the user interface.

```
+------------------+       +------------------+       +---------------------+
|   React SPA      | ----> |   Hono API       | ----> |  Ultimate Device    |
|                  |       |   /api/playlists  |       |  /v1/runners:*      |
|  PlaylistManager |       |   /api/devices/   |       |  /v1/machine:reset  |
|  NowPlayingBar   |       |     :id/playback  |       +---------------------+
|  MusicBrowser    |       |                   |
+------------------+       |  PlaylistStore    |
                           |  PlaybackState    |
                           |  PlaybackEvents   |
                           +------------------+
```

**Server-side** components:

| Component | Responsibility |
|---|---|
| `PlaylistStore` | CRUD + JSON file persistence for playlists |
| `PlaybackStateManager` | In-memory per-device playback state tracking |
| `playback-events` | Pub/sub event emitter for playback state changes |
| `playlists.ts` routes | HTTP handlers for playlist CRUD and playback control |

**Client-side** components:

| Component | Responsibility |
|---|---|
| `PlaylistManagerPage` | Full playlist CRUD UI with inline editing |
| `NowPlayingBar` | Fixed bottom bar showing current track and transport controls |
| `MusicBrowser` / `MusicFileListing` | Device file browser filtered to .sid/.mod files |
| `use-playback.ts` hooks | TanStack Query hooks for all playlist and playback operations |

### Data Models

All types are defined in `src/shared/types.ts`.

#### Track

```typescript
interface Track {
  path: string;       // absolute path on device filesystem, e.g., "/USB0/Music/song.sid"
  type: "sid" | "mod";
  title: string;      // display name, typically derived from filename without extension
  songnr?: number;    // SID multi-tune index (0-255); omitted for MOD tracks
}
```

#### Playlist

```typescript
interface Playlist {
  id: string;          // UUID v4
  name: string;
  tracks: Track[];     // ordered list; position is array index
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
}
```

#### PlaybackState

```typescript
interface PlaybackState {
  deviceId: string;
  status: "playing" | "stopped";
  currentTrack?: Track;       // present when status is "playing"
  playlistId?: string;        // present when playing from a playlist
  position: number;           // current track index in playlist (0 when no playlist)
}
```

#### PlaybackEvent

```typescript
type PlaybackEventType = "playback:play" | "playback:stop" | "playback:next" | "playback:prev";

interface PlaybackEvent {
  type: PlaybackEventType;
  deviceId: string;
  data: PlaybackState;
}
```

### API Surface

Base path: `/api`

#### Playlist CRUD

| Method | Path | Request Body | Success | Error Cases |
|---|---|---|---|---|
| `GET` | `/playlists` | — | `200` `Playlist[]` | — |
| `POST` | `/playlists` | `{ name: string, tracks?: Track[] }` | `201` `Playlist` | `400` invalid name or tracks |
| `GET` | `/playlists/:id` | — | `200` `Playlist` | `404` not found |
| `PUT` | `/playlists/:id` | `{ name?: string, tracks?: Track[] }` | `200` `Playlist` | `400` validation, `404` not found |
| `DELETE` | `/playlists/:id` | — | `200` `{ ok: true }` | `404` not found |

#### Playback Control

| Method | Path | Request Body | Success | Error Cases |
|---|---|---|---|---|
| `GET` | `/devices/:deviceId/playback` | — | `200` `PlaybackState` | `404` device not found |
| `POST` | `/devices/:deviceId/playback/play` | `{ track: Track }` or `{ playlistId: string, position?: number }` | `200` `PlaybackState` | `400` invalid input, `404` device/playlist not found, `502` device error, `503` offline, `504` timeout |
| `POST` | `/devices/:deviceId/playback/next` | — | `200` `PlaybackState` | `400` no active playlist, `404` device/playlist not found, `502`/`503`/`504` |
| `POST` | `/devices/:deviceId/playback/prev` | — | `200` `PlaybackState` | Same as next |
| `POST` | `/devices/:deviceId/playback/stop` | — | `200` `PlaybackState` | `404` not found, `502`/`503`/`504` |

#### Device Runner Proxy Mapping

| Track Type | Device Endpoint | Query Parameters |
|---|---|---|
| `sid` | `PUT /v1/runners:sidplay` | `file=<path>`, `songnr=<n>` (optional) |
| `mod` | `PUT /v1/runners:modplay` | `file=<path>` |
| stop | `PUT /v1/machine:reset` | — |

Authentication: if the device has a password configured, the `X-Password` header is included in all proxied requests.

### UI Components

#### PlaylistManagerPage (`/playlists/`)

The top-level page providing full playlist management. Layout (top to bottom):

1. **Back navigation** — link to device list (`/`).
2. **Header box** — "PLAYLISTS" title, subtitle "SID/MOD MUSIC PLAYLIST MANAGER".
3. **New Playlist box** — text input for name + CREATE button. Enter key submits.
4. **All Playlists box** — list of playlists, each row showing:
   - Music note icon (green badge)
   - Playlist name (uppercase) with track count
   - EDIT, PLAY, DEL action buttons
5. **Editing panel** (visible when editing) — contains:
   - Rename input
   - Track list table: columns #, TYPE (SID/MOD badge), TITLE, SONG (SID songnr input or dash), remove button
   - Tracks are drag-reorderable; active drag item highlighted with reverse video
   - "+ ADD TRACKS" toggles the music browser; SAVE and CANCEL buttons

#### PlaylistPlayButton

Inline play flow: clicking PLAY expands to show online device names as buttons. Clicking a device name initiates playlist playback on that device. If no devices are online, shows "NO DEVICES ONLINE" in red.

#### MusicBrowser

Embedded in the playlist editing panel. Two-phase flow:

1. **Device selector** — lists online devices (name + IP). Clicking selects the device.
2. **File listing** — breadcrumb path display, parent directory navigation (`..`), directory entries and music file entries. Non-music files are filtered out. File type icons: `S` block for SID, `M` block for MOD. Clicking a music file adds it to the current playlist's track list.

Only files with extensions `.sid` and `.mod` are shown (case-derived from `DirectoryEntry.fileType`).

#### NowPlayingBar

Fixed-position bottom bar displayed on device dashboard pages when playback is active. Contents (left to right):

- **Type badge** — green background, black text: "SID" or "MOD", plus `#<songnr>` for SID tracks with a sub-tune.
- **Track title** — music note prefix, uppercase, truncated with ellipsis.
- **Playlist position** — e.g., "3/10" (only shown during playlist playback).
- **Transport controls** — PREV and NEXT buttons (only during playlist playback), STOP button (always).

The bar is hidden when `status === "stopped"` or no `currentTrack` exists.

### Business Logic

#### Playlist Store Lifecycle

- **Persistence file:** `data/playlists.json` (created on first write; directory auto-created).
- **Load:** on construction, reads and parses the JSON file. Corrupt or missing file results in an empty store (no error thrown).
- **Write:** after every mutation (create, update, remove), the entire playlist list is serialized to disk.
- **IDs:** generated via `crypto.randomUUID()`.
- **Timestamps:** `createdAt` set on creation; `updatedAt` set on every update.

#### Playback State Lifecycle

- **Storage:** in-memory `Map<deviceId, PlaybackState>`. State is lost on server restart (by design — playback is ephemeral).
- **Default state:** `{ deviceId, status: "stopped", position: 0 }` returned for any device without explicit state.
- **Play (single track):** sets state with the track, no `playlistId`, position 0.
- **Play (playlist):** resolves the track at the given position from the playlist, sets state with `playlistId` and `position`.
- **Next/Prev:** reads current state, requires an active `playlistId`. Computes new position with wrapping: `((position + delta) % length + length) % length`. Resolves the new track and sends it to the device.
- **Stop:** sends `machine:reset` to the device, then clears state to stopped defaults.
- **Events:** every state change emits a `PlaybackEvent` via the pub/sub system.

#### Device Communication

- All device commands use `fetch` with a 5000 ms `AbortController` timeout.
- Non-2xx responses return HTTP 502 with the device's error text.
- JSON responses with a non-empty `errors` array return HTTP 502 with the concatenated error messages.
- Abort due to timeout returns HTTP 504.
- Network errors return HTTP 502 with the error message.

#### Client Polling

- `usePlaybackState(deviceId)` polls `GET /api/devices/:deviceId/playback` every 10 seconds via TanStack Query's `refetchInterval`.
- Mutation hooks (`usePlayTrack`, `usePlaybackNext`, `usePlaybackPrev`, `usePlaybackStop`) optimistically set the query cache on success via `queryClient.setQueryData`, providing immediate UI feedback before the next poll.

## Constraints

1. **No device-side queue.** The Ultimate device has no concept of playlists or track queuing. All sequencing logic resides in the web server. If the server process stops, playlist advancement stops (the last-sent track continues playing on the device until manually stopped or reset).

2. **In-memory playback state.** Playback state is not persisted to disk. A server restart clears all active playback state. This is intentional: the server cannot know if the device is still playing after a restart.

3. **Single-device playback per playlist.** A playlist can be played on one device at a time from the UI flow (the PLAY button targets one device). The API does not enforce exclusivity — the same playlist MAY be played on multiple devices via separate API calls.

4. **No automatic track advancement.** The server does not detect when a track finishes playing on the device. Users MUST manually trigger next/prev. There is no auto-advance to the next track when the current one ends.

5. **File paths are device-local.** Track paths (e.g., `/USB0/Music/song.sid`) reference the device's local file system. A track added from Device A's browser will fail if played on Device B unless both devices have the same file at the same path.

6. **Music format support.** Only `.sid` (SID) and `.mod` (MOD) file types are supported. No other audio formats (e.g., `.wav`, `.mp3`) are recognized by the music browser or playback system.

7. **Stop uses machine reset.** Stopping playback issues a full `machine:reset` command, which halts ALL device activity (not just audio). This is a hardware limitation — the Ultimate API does not provide a runner-stop-only endpoint.

8. **Poll-based state synchronization.** The client polls for playback state every 10 seconds. State changes initiated by other clients or external factors are not reflected in real-time but within the polling window. Playback events are emitted server-side for SSE consumers but the now-playing bar currently relies on polling.

## Open Questions

1. **Auto-advance on track end.** Should the server detect when a SID/MOD track finishes and automatically advance to the next track in the playlist? This would require either device polling for runner status or a known track duration.

2. **Shuffle and repeat modes.** Should playlists support shuffle (random order) and repeat (loop, repeat-one) modes? The data model and API would need extension.

3. **Cross-device track compatibility.** Should the system warn users when playing a playlist on a device that may not have the same files as the device the tracks were browsed from?

4. **Playback state persistence.** Should playback state survive server restarts (persisted to disk) so the UI can show what was last playing, even if the server cannot confirm the device's actual state?

5. **Volume control.** The Ultimate API may support volume adjustment. Should playback controls include volume up/down?

6. **SSE-driven now-playing updates.** Should the now-playing bar subscribe to SSE playback events instead of polling, to reduce latency for multi-client scenarios?

## References

- [File Browser spec](../file-browser/) — device file system navigation, used by the music browser
- [Device Management spec](../device-management/) — device registry, online/offline status, health checks
- [Realtime Events spec](../realtime-events/) — SSE event system used by playback events
- [Architecture spec](../architecture/) — overall application architecture and conventions
- Ultimate 64 API: `PUT /v1/runners:sidplay`, `PUT /v1/runners:modplay`, `PUT /v1/machine:reset`
- Source files:
  - `src/shared/types.ts` — Track, Playlist, PlaybackState, PlaybackEvent type definitions
  - `src/server/lib/playlist-store.ts` — PlaylistStore implementation
  - `src/server/lib/playback-state.ts` — PlaybackStateManager implementation
  - `src/server/lib/playback-events.ts` — playback event pub/sub
  - `src/server/routes/playlists.ts` — API route handlers
  - `src/client/routes/playlists/index.tsx` — PlaylistManagerPage, MusicBrowser UI
  - `src/client/components/device/now-playing-bar.tsx` — NowPlayingBar component
  - `src/client/hooks/use-playback.ts` — TanStack Query hooks for playlists and playback

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-04-16 | Initial spec created | -- |
