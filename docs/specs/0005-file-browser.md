# 0005 — File Browser via FTP

## Overview

Browse the C64U device's filesystem through a REST API backed by FTP. The C64U exposes an FTP server for file access, but has no REST file-browsing endpoint. The proxy bridges FTP into a clean REST API, enabling a proper file picker in the UI for mounting disks, running programs, and managing files.

## Background

The C64U API's `/v1/files/<path>:info` endpoint is documented as **unfinished** in the official firmware docs. The device does expose a full FTP server (anonymous access or same password as HTTP). FTP supports directory listing, upload, download, and delete.

## Goals

- Browse device filesystem via REST (directory listing, file metadata)
- Navigate directories with breadcrumb-friendly paths
- File type detection (D64, G64, D71, D81, PRG, CRT, SID, MOD, ROM)
- Upload files to the device
- Download files from the device
- Delete files on the device
- Cached directory listings (short TTL) to avoid hammering FTP
- UI: tree/list file browser component with file type icons

## Non-Goals

- File editing/modification (just CRUD)
- Recursive search (would be too slow over FTP)
- Thumbnail previews
- File transfer between devices

## Technical Design

### FTP Connection Management

One FTP connection pool per device. Uses `basic-ftp` library.

```typescript
interface FtpPool {
  getConnection(deviceId: string): Promise<Client>
  releaseConnection(deviceId: string, client: Client): void
}
```

- Pool size: 1-2 connections per device (FTP servers on embedded devices are resource-constrained)
- Idle timeout: 60 seconds
- Auto-reconnect on connection drop
- **Bun fallback:** If `basic-ftp` fails on Bun (known issue oven-sh/bun#10947), document the Node.js fallback

### API Endpoints

```
GET    /api/devices/:deviceId/files?path=/USB0/Games/     → list directory
GET    /api/devices/:deviceId/files/info?path=/USB0/game.d64 → file metadata
GET    /api/devices/:deviceId/files/download?path=/USB0/game.d64 → download file
POST   /api/devices/:deviceId/files/upload?path=/USB0/Games/ → upload file(s)
DELETE /api/devices/:deviceId/files?path=/USB0/old.d64     → delete file
```

### Directory Listing Response

```json
{
  "path": "/USB0/Games/",
  "parent": "/USB0/",
  "entries": [
    {
      "name": "Maniac Mansion",
      "type": "directory",
      "modified": "2024-03-15T10:30:00Z"
    },
    {
      "name": "game.d64",
      "type": "file",
      "size": 174848,
      "modified": "2024-03-15T10:30:00Z",
      "fileType": "d64"
    }
  ],
  "errors": []
}
```

### File Type Detection

Map extensions to categories for icons and context-aware actions:

| Extension | Category | Actions |
| --- | --- | --- |
| `.d64`, `.g64` | Disk (1541) | Mount to drive, create |
| `.d71`, `.g71` | Disk (1571) | Mount to drive |
| `.d81` | Disk (1581) | Mount to drive |
| `.dnp` | Disk (CMD) | Mount to drive |
| `.prg` | Program | Run, Load |
| `.crt` | Cartridge | Run |
| `.sid` | SID Music | Play |
| `.mod` | MOD Music | Play |
| `.rom`, `.bin` | ROM | Load to drive |
| Other | Generic | Download, Delete |

### Caching

Directory listings are cached server-side with a 10-second TTL. Cache is invalidated on:
- Upload to the same directory
- Delete in the same directory
- Manual refresh request (`?refresh=true`)

### UI Component

A file browser panel reusable across features:
- Breadcrumb navigation
- List view with file type icons, size, date
- Click-to-navigate directories
- Context menu per file (actions based on file type)
- Drag-and-drop upload
- Path input for direct navigation

## Acceptance Criteria

- [ ] `GET /api/devices/:id/files?path=/` lists root directory via FTP
- [ ] Directory navigation works (nested directories, parent traversal)
- [ ] File type detection returns correct `fileType` for known extensions
- [ ] File upload via `POST` with multipart body succeeds
- [ ] File download returns binary stream with correct content-type
- [ ] File deletion works
- [ ] Directory listings are cached with 10s TTL
- [ ] FTP connection pool reuses connections
- [ ] UI file browser component renders with breadcrumbs and file type icons

## Tasks

- [ ] Implement FTP connection pool and basic-ftp integration
  - [ ] Create `FtpPool` class: per-device connection pool (1-2 connections)
  - [ ] Connection lifecycle: create, reuse, idle timeout (60s), auto-reconnect
  - [ ] Use device registry for FTP host/password (same credentials as HTTP API)
  - [ ] Test `basic-ftp` compatibility with Bun; document Node.js fallback if needed
- [ ] Implement file browsing API endpoints
  - [ ] `GET /api/devices/:deviceId/files?path=<dir>` — list directory via FTP, return entries with name, type, size, modified date
  - [ ] `GET /api/devices/:deviceId/files/info?path=<file>` — single file metadata
  - [ ] File type detection: map extensions (d64, g64, d71, d81, prg, crt, sid, mod, rom, bin) to categories
  - [ ] Compute `parent` path for breadcrumb navigation
  - [ ] Cache directory listings server-side with 10s TTL, invalidate on upload/delete, support `?refresh=true`
- [ ] Implement file upload, download, and delete endpoints
  - [ ] `POST /api/devices/:deviceId/files/upload?path=<dir>` — multipart file upload via FTP
  - [ ] `GET /api/devices/:deviceId/files/download?path=<file>` — download file as binary stream
  - [ ] `DELETE /api/devices/:deviceId/files?path=<file>` — delete file via FTP
  - [ ] Invalidate directory cache on upload and delete
- [ ] Build file browser UI component
  - [ ] List view with columns: icon (by file type), name, size, modified date
  - [ ] Breadcrumb navigation bar with clickable path segments
  - [ ] Click directory to navigate, click file to select
  - [ ] Path input field for direct navigation
  - [ ] Context menu per file with type-aware actions (Mount, Run, Play, Download, Delete)
  - [ ] Drag-and-drop upload zone
  - [ ] Loading and error states
