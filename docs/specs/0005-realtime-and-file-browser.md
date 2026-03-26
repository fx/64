# 0005 — Real-Time Device State & File Browser

## Overview

Two tightly related features that enhance the device dashboard from spec 0004: (1) real-time state polling via SSE so the UI stays live without manual refresh, and (2) an FTP-backed file browser for navigating the device's filesystem and selecting files to mount, run, or play.

## Background

The C64U API is pure REST with no push mechanism. Spec 0004 uses on-demand fetch with manual refresh. This spec adds server-side polling that pushes state changes to the browser via SSE, plus an FTP-based file browser since the device's REST file API is unfinished but FTP works.

## Goals

### Real-Time State
- Server-side polling loop per device (drives every 5s, info every 30s)
- SSE stream per device delivering diff-based state change events
- TanStack Query integration: SSE events update the query cache directly
- Server-side state cache so new SSE clients get immediate state
- Global SSE stream for the device list page (online/offline changes)

### File Browser
- Browse device filesystem via REST API backed by FTP
- Directory listing with file type detection (D64, PRG, CRT, SID, MOD, ROM)
- Upload files to device, download from device, delete files
- Cached directory listings (10s TTL)
- Reusable file browser UI component with breadcrumbs, type icons, context actions
- Integration with spec 0004's upload-and-mount panel (browse → select → mount)

## Non-Goals

- Sub-second latency for state updates
- Full config change tracking (17 categories — too noisy)
- Recursive file search on device
- File editing/modification
- Historical state or time-series data

## Technical Design

### Part 1: Real-Time State

#### Polled State

| State Group | Endpoint | Interval |
| --- | --- | --- |
| Drive status | `GET /v1/drives` | 5s |
| Device info | `GET /v1/info` | 30s |

#### Server: DevicePoller

```typescript
class DevicePoller {
  // Per-device polling loop
  startPolling(deviceId: string): void
  stopPolling(deviceId: string): void
  getCache(deviceId: string): DeviceStateCache | undefined
}
```

- Background async loop per online device
- Deep-equality comparison on each poll: only emit SSE event when state changes
- In-memory state cache per device
- Handle device going offline: pause polling with backoff, emit offline event
- Start/stop when devices are added/removed from registry

#### SSE Endpoints

```
GET /api/events/devices/:deviceId    → per-device state stream
GET /api/events/devices              → global stream (existing, enhanced)
```

Per-device events:
```
event: drives
data: { "a": { "image_file": "game.d64" }, "b": { "enabled": false } }

event: info
data: { "firmware_version": "3.12", "hostname": "MyC64" }

event: offline
data: {}

event: online
data: {}
```

New SSE connections receive the current cached state as initial events.

#### Client: SSE + TanStack Query Integration

```typescript
// Hook: subscribes to SSE, updates query cache
function useDeviceSSE(deviceId: string) {
  // Opens EventSource to /api/events/devices/:deviceId
  // On 'drives' event → queryClient.setQueryData(['devices', id, 'drives'], data)
  // On 'info' event → queryClient.setQueryData(['devices', id, 'info'], data)
  // Auto-reconnect on disconnect
}
```

### Part 2: File Browser

#### FTP Connection Pool

```typescript
class FtpPool {
  getConnection(deviceId: string): Promise<Client>
  releaseConnection(deviceId: string, client: Client): void
}
```

- Uses `basic-ftp` library (test Bun compat; document Node.js fallback)
- 1-2 connections per device, 60s idle timeout, auto-reconnect

#### API Endpoints

```
GET    /api/devices/:deviceId/files?path=/USB0/     → list directory
GET    /api/devices/:deviceId/files/info?path=<file> → file metadata
GET    /api/devices/:deviceId/files/download?path=<file> → download binary
POST   /api/devices/:deviceId/files/upload?path=<dir>    → upload file(s)
DELETE /api/devices/:deviceId/files?path=<file>           → delete file
```

#### Directory Listing Response

```json
{
  "path": "/USB0/Games/",
  "parent": "/USB0/",
  "entries": [
    { "name": "Maniac Mansion", "type": "directory", "modified": "2024-03-15T10:30:00Z" },
    { "name": "game.d64", "type": "file", "size": 174848, "modified": "2024-03-15T10:30:00Z", "fileType": "d64" }
  ],
  "errors": []
}
```

#### File Type Detection

| Extension | Category | Context Actions |
| --- | --- | --- |
| `.d64`, `.g64` | Disk (1541) | Mount, Download, Delete |
| `.d71`, `.g71` | Disk (1571) | Mount, Download, Delete |
| `.d81` | Disk (1581) | Mount, Download, Delete |
| `.prg` | Program | Run, Load, Download, Delete |
| `.crt` | Cartridge | Run, Download, Delete |
| `.sid` | SID Music | Play, Download, Delete |
| `.mod` | MOD Music | Play, Download, Delete |
| `.rom`, `.bin` | ROM | Load to drive, Download, Delete |
| Other | Generic | Download, Delete |

#### Caching

Directory listings cached server-side with 10s TTL. Invalidated on upload/delete to same directory. Manual refresh via `?refresh=true`.

#### UI: File Browser Component

Reusable `C64FileBrowser` component:
- Breadcrumb navigation (clickable path segments)
- List view: icon (by file type), name, size, date
- Click directory → navigate; click file → select
- Path input for direct navigation
- Context menu per file (actions based on file type)
- Drag-and-drop upload zone
- Loading/error states with PETSCII spinner

Integrates with the device dashboard (spec 0004): "BROWSE" button opens the file browser, selecting a disk image populates the mount path.

### File Structure

```
src/server/
├── lib/
│   ├── device-poller.ts           # Per-device state polling loop
│   ├── ftp-pool.ts                # FTP connection pool
│   └── file-type.ts               # Extension → category mapping
├── routes/
│   └── files.ts                   # File browser API endpoints
src/client/
├── hooks/
│   ├── use-device-sse.ts          # SSE subscription + query cache updates
│   └── use-file-browser.ts        # File listing, upload, download hooks
├── components/
│   ├── device/
│   │   └── file-browser.tsx        # File browser panel
│   └── ui/
│       └── c64-breadcrumb.tsx      # Breadcrumb navigation
```

## Acceptance Criteria

### Real-Time State
- [ ] Polling loop runs for each online device at configured intervals
- [ ] SSE stream delivers drive status changes within one poll cycle
- [ ] New SSE connections receive current state immediately
- [ ] Offline/online transitions emit events
- [ ] Only changed state is emitted (diff-based)
- [ ] Client TanStack Query cache updates on SSE events without refetching
- [ ] Device dashboard auto-updates when drives change (no manual refresh)

### File Browser
- [ ] `GET /api/devices/:id/files?path=/` lists root directory via FTP
- [ ] Directory navigation works (nested dirs, parent traversal)
- [ ] File type detection returns correct category for known extensions
- [ ] File upload via POST with multipart body succeeds
- [ ] File download returns binary stream
- [ ] File deletion works
- [ ] Directory listings cached with 10s TTL
- [ ] UI file browser renders with breadcrumbs and file type icons
- [ ] Selecting a disk image in the file browser populates the mount panel

## Tasks

- [ ] Implement server-side DevicePoller and state cache
  - [ ] Create `DevicePoller` class with per-device background polling loops
  - [ ] Poll `/v1/drives` every 5s and `/v1/info` every 30s per online device
  - [ ] In-memory state cache per device with last-known values
  - [ ] Deep-equality comparison: only flag changes when values differ
  - [ ] Handle device going offline: pause polling with backoff, emit offline event
  - [ ] Start/stop polling when devices are added/removed from registry
- [ ] Implement per-device SSE state stream
  - [ ] `GET /api/events/devices/:deviceId` — SSE endpoint with event types: `drives`, `info`, `offline`, `online`
  - [ ] Enhance existing `GET /api/events/devices` global stream with state change events
  - [ ] Send current cached state as initial events for new SSE connections
  - [ ] Only emit changed state (diff-based)
- [ ] Implement client-side SSE + TanStack Query integration
  - [ ] `useDeviceSSE(deviceId)` hook: opens EventSource, updates query cache via `queryClient.setQueryData()`
  - [ ] Map SSE events to query keys: `drives` → `['devices', id, 'drives']`, `info` → `['devices', id, 'info']`
  - [ ] Auto-reconnect on disconnect with exponential backoff
  - [ ] Integrate into device dashboard from spec 0004 (auto-update without manual refresh)
- [x] Implement FTP connection pool and `basic-ftp` integration
  - [x] Create `FtpPool` class: per-device pool (1-2 connections), 60s idle timeout, auto-reconnect
  - [x] Use device registry for FTP host/password (same credentials as HTTP API)
  - [x] Test `basic-ftp` on Bun; document Node.js fallback if needed
- [x] Implement file browser API endpoints
  - [x] `GET /api/devices/:deviceId/files?path=<dir>` — list directory via FTP with name, type, size, modified, fileType
  - [x] `GET /api/devices/:deviceId/files/info?path=<file>` — single file metadata
  - [x] File type detection: map extensions (d64, g64, d71, d81, prg, crt, sid, mod, rom, bin) to categories
  - [x] Compute `parent` path for breadcrumb navigation
  - [x] Cache directory listings server-side with 10s TTL, invalidate on upload/delete, support `?refresh=true`
- [x] Implement file upload, download, and delete endpoints
  - [x] `POST /api/devices/:deviceId/files/upload?path=<dir>` — multipart upload via FTP
  - [x] `GET /api/devices/:deviceId/files/download?path=<file>` — download as binary stream
  - [x] `DELETE /api/devices/:deviceId/files?path=<file>` — delete via FTP
  - [x] Invalidate directory cache on upload and delete
- [x] Build file browser UI component
  - [x] `C64FileBrowser` component with breadcrumb navigation (clickable path segments)
  - [x] List view: icon (by file type), name, size, date
  - [x] Click directory to navigate, click file to select
  - [x] Path input for direct navigation
  - [x] Context menu per file: type-aware actions (Mount, Run, Play, Download, Delete)
  - [x] Drag-and-drop upload zone
  - [x] Loading/error states with PETSCII spinner
  - [x] Integration: "BROWSE" button on device dashboard opens file browser, selecting a disk populates the mount panel
