# 0006 — Workflows & Media: Disk Flip, Macros, and Jukebox

## Overview

Three related features that automate common C64U operations: (1) disk flip collections for multi-disk games, (2) macros for scripted action sequences, and (3) a SID/MOD jukebox for music browsing and playlist playback. All share the pattern of server-side collections with JSON persistence and device-targeted execution via the proxy.

## Goals

### Disk Flip Collections
- Named presets of ordered disk images for multi-disk games
- One-click next/prev/go-to-N disk swapping
- Server-side storage, accessible from any browser
- UI: collection manager + compact flip widget for gameplay

### Automation / Macros
- Scripted sequences of C64U API actions (mount, run, reset, config, delay)
- Execute against a specific device with real-time progress via SSE
- Pre-execution validation, cancellation support
- Built-in templates for common workflows

### SID/MOD Jukebox
- Browse device's music files (SID/MOD) via file browser
- Build and manage playlists (server-side, persistent)
- Playback queue with next/prev/stop controls
- SID sub-song selection for multi-tune files
- Now-playing bar UI

## Non-Goals

- Auto-detection of "insert disk 2" prompts
- Conditional logic in macros (linear sequences only)
- Scheduled macro execution (cron)
- Audio streaming to the browser (C64U outputs audio through its hardware)
- SID/MOD metadata parsing (filename-based only)

## Technical Design

### Part 1: Disk Flip Collections

#### Data Model

```typescript
interface DiskFlipCollection {
  id: string
  name: string            // "Maniac Mansion", "Ultima IV"
  description?: string
  disks: DiskEntry[]
  createdAt: string
  updatedAt: string
}

interface DiskEntry {
  slot: number
  label: string           // "Disk 1 - Side A"
  path: string            // "/USB0/Games/ManiacMansion/disk1.d64"
  drive: 'a' | 'b'
  type?: string           // inferred from extension
}
```

Persisted to `data/collections.json`.

#### API Endpoints

```
GET    /api/collections                     → list all
POST   /api/collections                     → create
GET    /api/collections/:id                 → get
PUT    /api/collections/:id                 → update
DELETE /api/collections/:id                 → delete
POST   /api/collections/:id/flip            → mount next disk
POST   /api/collections/:id/flip?slot=2     → mount specific disk
POST   /api/collections/:id/flip?direction=prev → mount previous
```

Flip action calls `PUT /v1/drives/<drive>:mount?image=<path>` on the device. Tracks current position per collection per device in memory.

#### UI

- **Collection manager page** (`/collections`): CRUD, drag-to-reorder disks, file browser integration
- **Flip widget**: compact panel on device dashboard showing current disk, next/prev buttons

### Part 2: Automation / Macros

#### Data Model

```typescript
interface Macro {
  id: string
  name: string
  description?: string
  steps: MacroStep[]
  createdAt: string
  updatedAt: string
}

type MacroStep =
  | { action: 'reset' }
  | { action: 'reboot' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'mount', drive: 'a' | 'b', image: string, mode?: string }
  | { action: 'remove', drive: 'a' | 'b' }
  | { action: 'run_prg', file: string }
  | { action: 'load_prg', file: string }
  | { action: 'run_crt', file: string }
  | { action: 'sidplay', file: string, songnr?: number }
  | { action: 'modplay', file: string }
  | { action: 'writemem', address: string, data: string }
  | { action: 'set_config', category: string, item: string, value: string }
  | { action: 'delay', ms: number }

interface MacroExecution {
  id: string
  macroId: string
  deviceId: string
  status: 'running' | 'completed' | 'failed'
  currentStep: number
  totalSteps: number
  error?: string
  startedAt: string
  completedAt?: string
}
```

Persisted to `data/macros.json`.

#### API Endpoints

```
GET    /api/macros                           → list
POST   /api/macros                           → create
GET    /api/macros/:id                       → get
PUT    /api/macros/:id                       → update
DELETE /api/macros/:id                       → delete
POST   /api/macros/:id/execute               → run on device { deviceId }
GET    /api/macros/executions                → list running/recent
GET    /api/macros/executions/:execId        → status
POST   /api/macros/executions/:execId/cancel → cancel
```

#### Execution Engine

1. Pre-validate: device online, file paths exist for mount/run steps
2. Execute steps sequentially, mapping each action to C64U API call
3. Emit SSE events after each step (`macro:step`, `macro:complete`, `macro:failed`)
4. `delay` steps use `await Bun.sleep(ms)` (or `setTimeout` in Node)
5. Cancellation: abort after current step

#### Built-in Templates

Seeded on first run:
- **Quick Start Game:** Reset → Mount disk → Run PRG
- **Disk Swap:** Remove current → Mount next disk
- **Memory Peek:** Pause → Read memory → Resume

### Part 3: SID/MOD Jukebox

#### Data Model

```typescript
interface Playlist {
  id: string
  name: string
  tracks: Track[]
  createdAt: string
  updatedAt: string
}

interface Track {
  path: string
  type: 'sid' | 'mod'
  title: string
  songnr?: number       // for multi-tune SID files
}

interface PlaybackState {
  deviceId: string
  status: 'playing' | 'stopped'
  currentTrack?: Track
  playlistId?: string
  position: number
}
```

Playlists persisted to `data/playlists.json`. Playback state in-memory only.

#### API Endpoints

```
# Playlists
GET    /api/playlists                        → list
POST   /api/playlists                        → create
GET    /api/playlists/:id                    → get
PUT    /api/playlists/:id                    → update
DELETE /api/playlists/:id                    → delete

# Playback
POST   /api/devices/:deviceId/playback/play  → play track or start playlist
POST   /api/devices/:deviceId/playback/next  → next track
POST   /api/devices/:deviceId/playback/prev  → previous
POST   /api/devices/:deviceId/playback/stop  → stop (machine reset)
GET    /api/devices/:deviceId/playback       → current state
```

Play routes to `PUT /v1/runners:sidplay` or `PUT /v1/runners:modplay`. Stop uses `PUT /v1/machine:reset`.

#### UI

- **Music browser**: filtered file browser showing only `.sid`/`.mod` files
- **Playlist manager** (`/playlists`): CRUD, drag-to-reorder, SID sub-song selector
- **Now-playing bar**: persistent bottom bar with track name, next/prev/stop controls

### File Structure

```
src/server/
├── lib/
│   ├── collection-store.ts        # Disk flip collections persistence
│   ├── macro-store.ts             # Macro definitions persistence
│   ├── macro-engine.ts            # Macro execution engine
│   ├── playlist-store.ts          # Playlist persistence
│   └── playback-state.ts          # In-memory playback tracking
├── routes/
│   ├── collections.ts             # Disk flip CRUD + flip action
│   ├── macros.ts                  # Macro CRUD + execute/cancel
│   └── playlists.ts               # Playlist CRUD + playback controls

src/client/
├── routes/
│   ├── collections/
│   │   └── index.tsx              # Collection manager page
│   ├── macros/
│   │   └── index.tsx              # Macro manager page
│   └── playlists/
│       └── index.tsx              # Playlist manager page
├── components/
│   ├── device/
│   │   ├── flip-widget.tsx        # Compact disk flip panel
│   │   └── now-playing-bar.tsx    # Bottom playback bar
│   └── macro/
│       ├── macro-editor.tsx       # Step editor
│       └── execution-progress.tsx # Real-time execution display
```

## Acceptance Criteria

### Disk Flip
- [x] CRUD operations for disk flip collections
- [x] Flip action mounts correct disk on correct drive
- [x] Next/prev wraps around the disk list
- [x] Collections persist across restarts
- [x] UI collection manager with reorder controls
- [x] Flip widget on device dashboard

### Macros
- [ ] CRUD for macros
- [ ] Execute a macro with sequential step execution
- [ ] Each step maps to correct C64U API call
- [ ] SSE events for execution progress
- [ ] Cancellation stops a running macro
- [ ] Pre-execution validation
- [ ] Built-in templates seeded on first run

### Jukebox
- [ ] CRUD for playlists
- [ ] Play SID/MOD file on device
- [ ] Playlist next/prev navigation
- [ ] Playback state tracked server-side
- [ ] SSE events on playback changes
- [ ] Now-playing bar UI with controls
- [ ] SID sub-song selection

## Tasks

- [x] Implement disk flip collections CRUD API with JSON persistence
  - [x] Create `DiskFlipCollection` and `DiskEntry` TypeScript types
  - [x] Implement `CollectionStore`: load/save `data/collections.json`
  - [x] CRUD endpoints: `GET/POST /api/collections`, `GET/PUT/DELETE /api/collections/:id`
- [x] Implement flip action endpoint
  - [x] `POST /api/collections/:id/flip` — mount next (default), specific slot (`?slot=N`), or previous (`?direction=prev`)
  - [x] Track current position per collection per device in memory
  - [x] Call `PUT /v1/drives/<drive>:mount?image=<path>` on target device via proxy
  - [x] Return mounted disk info and position; wrap around at boundaries
- [x] Build collection manager UI and flip widget
  - [x] Collection manager page at `/collections`: list, create/edit/delete, reorder disks
  - [x] File browser integration for selecting disk images
  - [x] Drive assignment (A/B) per disk entry
  - [x] Flip widget component: compact panel on device dashboard with current disk, next/prev/slot buttons
- [x] Implement macro CRUD API with JSON persistence
  - [x] Create `Macro`, `MacroStep`, `MacroExecution` TypeScript types
  - [x] Implement `MacroStore`: load/save `data/macros.json`
  - [x] CRUD endpoints: `GET/POST /api/macros`, `GET/PUT/DELETE /api/macros/:id`
  - [x] Seed built-in templates on first run (Quick Start Game, Disk Swap, Memory Peek)
- [x] Implement macro execution engine
  - [x] `POST /api/macros/:id/execute` — accept `{ deviceId }`, validate, execute sequentially
  - [x] Map each `MacroStep.action` to corresponding C64U API call via proxy
  - [x] Handle `delay` steps, track execution state (running/completed/failed)
  - [x] On failure: stop, record error and failing step
  - [x] `POST /api/macros/executions/:execId/cancel` — abort after current step
  - [x] `GET /api/macros/executions` and `GET /api/macros/executions/:execId` — status queries
- [ ] Implement macro SSE events and build macro UI
  - [ ] Emit `macro:step`, `macro:complete`, `macro:failed` SSE events during execution
  - [ ] Macro manager page at `/macros`: list, create/edit/delete, step editor
  - [ ] File browser integration for selecting files in mount/run steps
  - [ ] Execute button with device selector, real-time progress display
- [x] Implement playlist CRUD API with JSON persistence (PR #14)
  - [x] Create `Playlist`, `Track`, `PlaybackState` TypeScript types
  - [x] Implement `PlaylistStore`: load/save `data/playlists.json`
  - [x] CRUD endpoints: `GET/POST /api/playlists`, `GET/PUT/DELETE /api/playlists/:id`
- [x] Implement playback control API (PR #14)
  - [x] `POST /api/devices/:deviceId/playback/play` — play single track or start playlist
  - [x] Route to `PUT /v1/runners:sidplay` or `PUT /v1/runners:modplay` based on type, pass `songnr`
  - [x] `POST .../playback/next`, `.../playback/prev` — advance playlist position
  - [x] `POST .../playback/stop` — reset machine via `PUT /v1/machine:reset`
  - [x] `GET .../playback` — return current playback state
  - [x] Track playback state per device in memory; emit `playback` SSE events
- [x] Build jukebox UI: music browser, playlist manager, now-playing bar
  - [x] Music browser: filtered file browser showing only `.sid`/`.mod` files, quick-play on click
  - [x] Playlist manager page at `/playlists`: CRUD, drag-to-reorder, SID sub-song selector
  - [x] Now-playing bar: persistent bottom bar with track name, next/prev/stop, playlist progress
