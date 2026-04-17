# File Browser

## Overview

FTP-backed file browsing for Commodore 64 Ultimate devices, providing directory navigation, file upload/download/delete, extension-based file type detection with context-aware actions, and server-side directory listing cache. The file browser integrates with disk mounting, program execution, and music playback workflows.

## Background

C64 Ultimate devices expose an FTP server for filesystem access. The device's REST file API is incomplete, but the FTP interface is fully functional and supports listing, upload, download, and delete operations. This feature wraps FTP access behind a REST API, adds file type intelligence, and provides a C64-themed UI component for browsing and managing files on the device.

The server maintains an FTP connection pool to avoid per-request connection overhead, and caches directory listings with a short TTL to reduce FTP round-trips during rapid navigation.

Related specs: [Device Management](../device-management/), [API Proxy](../api-proxy/), [Disk Collections](../disk-collections/), [Macros](../macros/).

## Requirements

### REQ-1: Directory Listing

The system MUST list the contents of any directory on a device's filesystem via FTP.

**Scenario: Browse root directory**

```
GIVEN a device "MYDEVICE" is online
WHEN a user requests the file listing for path "/"
THEN the system SHALL return a JSON response containing:
  - the normalized path ("/")
  - a null parent (root has no parent)
  - an entries array with each item's name, type ("file" or "directory"), size (files only), modified date, and fileType key (known files only)
  - an empty errors array
```

**Scenario: Browse nested directory**

```
GIVEN a device "MYDEVICE" is online
AND the directory "/USB0/Games/" exists on the device
WHEN a user requests the file listing for path "/USB0/Games/"
THEN the system SHALL return entries for that directory
AND the parent field SHALL be "/USB0/"
```

**Scenario: Device is offline**

```
GIVEN a device "MYDEVICE" is registered but offline
WHEN a user requests a file listing
THEN the system SHALL return HTTP 503 with error "Device is offline"
```

**Scenario: Device not found**

```
GIVEN no device with ID "UNKNOWN" exists
WHEN a user requests a file listing for device "UNKNOWN"
THEN the system SHALL return HTTP 404 with error "Device not found"
```

### REQ-2: Directory Listing Cache

The system MUST cache directory listings server-side with a 10-second TTL to reduce FTP round-trips.

**Scenario: Cache hit within TTL**

```
GIVEN a user listed directory "/USB0/" 5 seconds ago
WHEN the user lists "/USB0/" again without refresh
THEN the system SHALL return the cached listing without contacting the device
```

**Scenario: Cache expired**

```
GIVEN a user listed directory "/USB0/" 15 seconds ago
WHEN the user lists "/USB0/" again
THEN the system SHALL fetch a fresh listing from the device via FTP
AND cache the new result
```

**Scenario: Force refresh**

```
GIVEN a cached listing exists for "/USB0/"
WHEN a user requests "/USB0/" with refresh=true
THEN the system SHALL bypass the cache and fetch from FTP
AND update the cache with the fresh result
```

**Scenario: Cache invalidation on mutation**

```
GIVEN a cached listing exists for "/USB0/"
WHEN a user uploads a file to "/USB0/" or deletes a file from "/USB0/"
THEN the system SHALL invalidate the cache entry for "/USB0/"
```

### REQ-3: File Metadata

The system MUST provide detailed metadata for individual files.

**Scenario: Known file type metadata**

```
GIVEN a file "game.d64" exists in "/USB0/" on device "MYDEVICE"
WHEN a user requests file info for path "/USB0/game.d64"
THEN the system SHALL return:
  - name: "game.d64"
  - path: "/USB0/game.d64"
  - type: "file"
  - size: (actual file size)
  - modified: (ISO 8601 timestamp)
  - fileType: "d64"
  - category: "disk-1541"
  - actions: ["mount", "download", "delete"]
```

**Scenario: Unknown file type metadata**

```
GIVEN a file "readme.txt" exists in "/USB0/"
WHEN a user requests file info for "/USB0/readme.txt"
THEN the system SHALL return:
  - category: "generic"
  - actions: ["download", "delete"]
  - fileType: undefined
```

### REQ-4: File Type Detection

The system MUST classify files by extension into categories with context-specific actions.

| Extension(s)    | Category     | Actions                           |
| --------------- | ------------ | --------------------------------- |
| `.d64`, `.g64`  | `disk-1541`  | mount, download, delete           |
| `.d71`, `.g71`  | `disk-1571`  | mount, download, delete           |
| `.d81`          | `disk-1581`  | mount, download, delete           |
| `.prg`          | `program`    | run, load, download, delete       |
| `.crt`          | `cartridge`  | run, download, delete             |
| `.sid`          | `sid-music`  | play, download, delete            |
| `.mod`          | `mod-music`  | play, download, delete            |
| `.rom`, `.bin`  | `rom`        | load, download, delete            |
| (other/none)    | `generic`    | download, delete                  |

**Scenario: Extension matching is case-insensitive**

```
GIVEN a file named "GAME.D64"
WHEN the system detects its file type
THEN the category SHALL be "disk-1541"
```

### REQ-5: File Download

The system MUST support downloading files from the device as binary streams.

**Scenario: Successful download**

```
GIVEN a file "/USB0/game.d64" exists on device "MYDEVICE"
WHEN a user requests to download that file
THEN the system SHALL return the file contents with:
  - Content-Type: application/octet-stream
  - Content-Disposition: attachment; filename="game.d64"
  - Content-Length: (actual byte count)
```

**Scenario: Filename sanitization**

```
GIVEN a file has a name containing control characters or path separators
WHEN the system generates the Content-Disposition header
THEN those characters SHALL be replaced with underscores
```

### REQ-6: File Upload

The system MUST support uploading files to a target directory on the device via multipart form data.

**Scenario: Successful upload**

```
GIVEN device "MYDEVICE" is online
WHEN a user uploads a file "game.d64" to path "/USB0/"
THEN the system SHALL write the file to "/USB0/game.d64" via FTP
AND return { uploaded: ["game.d64"], errors: [] }
AND invalidate the directory cache for "/USB0/"
```

**Scenario: Invalid filename rejected**

```
GIVEN a user attempts to upload a file with name containing:
  - path separators (/ or \)
  - control characters (0x00-0x1F, 0x7F)
  - ".." sequences
  - empty name, ".", or ".."
WHEN the upload is processed
THEN the system SHALL reject that file with an error
AND continue processing remaining files in the batch
```

**Scenario: Multiple file upload**

```
GIVEN a user uploads 3 files in a single request
AND 2 succeed and 1 has an invalid filename
THEN the response SHALL list the 2 successful uploads in "uploaded"
AND the 1 failure in "errors"
```

### REQ-7: File Deletion

The system MUST support deleting files from the device.

**Scenario: Successful deletion**

```
GIVEN a file "/USB0/old.prg" exists on device "MYDEVICE"
WHEN a user requests deletion of that file
THEN the system SHALL delete it via FTP
AND return { ok: true }
AND invalidate the directory cache for "/USB0/"
```

### REQ-8: Path Validation

The system MUST validate all user-supplied paths.

```
GIVEN a user-supplied path
WHEN the system validates it
THEN the system SHALL reject paths that:
  - do not start with "/"
  - contain ".." segments
  - contain backslashes
  - contain control characters (0x00-0x1F, 0x7F)
AND return HTTP 400 with a descriptive error message
```

### REQ-9: File Browser UI

The system MUST provide a C64-themed file browser component.

**Scenario: Directory navigation**

```
GIVEN the file browser is open at path "/USB0/"
WHEN a user clicks a directory entry "Games"
THEN the browser SHALL navigate to "/USB0/Games/"
AND update the breadcrumb and path input
```

**Scenario: File selection**

```
GIVEN the file browser displays files in "/USB0/"
WHEN a user clicks a disk image file "game.d64"
THEN the browser SHALL call the onSelectDisk callback with path "/USB0/game.d64"
```

**Scenario: Context actions**

```
GIVEN the file browser displays a file "song.sid"
WHEN a user right-clicks the file
THEN the browser SHALL show context actions: PLAY, DOWNLOAD, DELETE
```

**Scenario: Drag-and-drop upload**

```
GIVEN the file browser is open at "/USB0/"
WHEN a user drops a file onto the upload zone
THEN the browser SHALL upload the file to "/USB0/" via the upload API
AND show a success or error toast
```

**Scenario: Sort order**

```
GIVEN a directory contains both files and subdirectories
WHEN the file browser displays the listing
THEN directories SHALL appear first, sorted alphabetically
AND files SHALL appear after, sorted alphabetically
```

### REQ-10: Library File Listing

The system MUST provide a local library listing for server-side files used by macros.

**Scenario: List library files**

```
GIVEN the server has files in the data/library/ directory
WHEN a client requests the library listing
THEN the system SHALL return files matching supported extensions (.d64, .d71, .d81, .g64, .g71, .prg, .crt, .sid, .mod)
AND each entry SHALL include name, size, modified date, and type
AND entries SHALL be sorted alphabetically (case-insensitive)
```

### REQ-11: Upload and Mount

The system MUST support uploading a disk image from the browser and mounting it directly on a device drive.

**Scenario: Upload and mount a disk image**

```
GIVEN device "MYDEVICE" is online
WHEN a user uploads a .d64 file with drive="a" and mode="readwrite"
THEN the system SHALL POST the file body to the device's /v1/drives/a:mount endpoint
AND include the image type derived from the file extension
AND use a 15-second timeout
```

**Scenario: Invalid drive or mode**

```
GIVEN a user submits an upload-mount request with drive="c"
THEN the system SHALL return HTTP 400 with error "drive must be 'a' or 'b'"
```

## Design

### Architecture

```
Browser (React SPA)
  │
  ├── C64FileBrowser component
  │     ├── useFileListing() ─── GET  /api/devices/:id/files
  │     ├── useFileUpload()  ─── POST /api/devices/:id/files/upload
  │     ├── useFileDelete()  ─── DELETE /api/devices/:id/files
  │     └── downloadFile()   ─── GET  /api/devices/:id/files/download (anchor click)
  │
Hono Server
  │
  ├── src/server/routes/files.ts ────── File CRUD endpoints
  │     └── FtpPool ─────────────────── Connection pooling (basic-ftp)
  │           └── FTP ───────────────── Device filesystem
  │
  ├── src/server/routes/library.ts ──── Local library listing
  │     └── data/library/ ───────────── Server-side file storage
  │
  └── src/server/routes/upload-mount.ts ── Upload + mount to device drive
        └── HTTP POST ───────────────── Device /v1/drives/:drive:mount
```

### Data Models

#### DirectoryEntry

```typescript
interface DirectoryEntry {
  name: string;                    // filename or directory name
  type: "file" | "directory";      // entry type
  size?: number;                   // byte size (files only)
  modified?: string;               // ISO 8601 timestamp
  fileType?: string;               // extension key for known types (e.g., "d64", "prg")
}
```

#### DirectoryListing

```typescript
interface DirectoryListing {
  path: string;                    // normalized directory path (trailing /)
  parent: string | null;           // parent path for navigation, null at root
  entries: DirectoryEntry[];       // directory contents
  errors: string[];                // non-fatal errors during listing
}
```

#### FileTypeInfo

```typescript
type FileCategory =
  | "disk-1541" | "disk-1571" | "disk-1581"
  | "program" | "cartridge"
  | "sid-music" | "mod-music"
  | "rom" | "generic";

type FileAction = "mount" | "run" | "load" | "play" | "download" | "delete";

interface FileTypeInfo {
  category: FileCategory;
  actions: FileAction[];
}
```

#### CachedListing

```typescript
interface CachedListing {
  data: DirectoryListing;
  expiresAt: number;               // Date.now() + CACHE_TTL_MS
}
```

### API Surface

#### List Directory

```
GET /api/devices/:deviceId/files?path=<dir>&refresh=true
```

| Parameter  | Type   | Required | Description                              |
| ---------- | ------ | -------- | ---------------------------------------- |
| path       | query  | No       | Directory path (default: "/")            |
| refresh    | query  | No       | "true" to bypass cache                   |
| deviceId   | path   | Yes      | Device identifier                        |

**Response 200:**
```json
{
  "path": "/USB0/",
  "parent": "/",
  "entries": [
    { "name": "Games", "type": "directory", "modified": "2024-03-15T10:30:00Z" },
    { "name": "game.d64", "type": "file", "size": 174848, "modified": "2024-03-15T10:30:00Z", "fileType": "d64" }
  ],
  "errors": []
}
```

**Error responses:** 404 (device not found), 502 (FTP error), 503 (device offline).

#### File Metadata

```
GET /api/devices/:deviceId/files/info?path=<file>
```

| Parameter | Type  | Required | Description          |
| --------- | ----- | -------- | -------------------- |
| path      | query | Yes      | Absolute file path   |

**Response 200:**
```json
{
  "name": "game.d64",
  "path": "/USB0/game.d64",
  "type": "file",
  "size": 174848,
  "modified": "2024-03-15T10:30:00Z",
  "fileType": "d64",
  "category": "disk-1541",
  "actions": ["mount", "download", "delete"]
}
```

**Error responses:** 400 (missing/invalid path), 404 (device or file not found), 502 (FTP error), 503 (device offline).

#### Download File

```
GET /api/devices/:deviceId/files/download?path=<file>
```

**Response 200:** Binary body with `Content-Type: application/octet-stream`, `Content-Disposition: attachment; filename="<sanitized>"`, `Content-Length`.

**Error responses:** 400 (missing/invalid path), 404 (device not found), 502 (FTP error), 503 (device offline).

#### Upload File(s)

```
POST /api/devices/:deviceId/files/upload?path=<dir>
Content-Type: multipart/form-data
```

| Field | Type | Required | Description              |
| ----- | ---- | -------- | ------------------------ |
| file  | File | Yes      | One or more file parts   |
| path  | query | No      | Target directory (default: "/") |

**Response 200:**
```json
{
  "uploaded": ["game.d64"],
  "errors": ["bad\x00file.prg: invalid file name"]
}
```

**Error responses:** 400 (no files), 404 (device not found), 502 (FTP error), 503 (device offline).

#### Delete File

```
DELETE /api/devices/:deviceId/files?path=<file>
```

**Response 200:**
```json
{ "ok": true }
```

**Error responses:** 400 (missing/invalid path), 404 (device not found), 502 (FTP error), 503 (device offline).

#### List Library

```
GET /api/library
```

**Response 200:**
```json
{
  "files": [
    { "name": "game.d64", "size": 174848, "modified": "2024-03-15T10:30:00Z", "type": "d64" }
  ]
}
```

Filters to supported extensions: `.d64`, `.d71`, `.d81`, `.g64`, `.g71`, `.prg`, `.crt`, `.sid`, `.mod`.

#### Upload and Mount

```
POST /api/devices/:deviceId/upload-mount
Content-Type: multipart/form-data
```

| Field | Type   | Required | Description                               |
| ----- | ------ | -------- | ----------------------------------------- |
| file  | File   | Yes      | Disk image file                           |
| drive | string | Yes      | Target drive: "a" or "b"                  |
| mode  | string | No       | Mount mode: "readwrite" (default), "readonly", "unlinked" |

Derives image type from file extension. Proxies the file to the device's `/v1/drives/{drive}:mount` endpoint. 15-second timeout.

**Error responses:** 400 (missing file, invalid drive/mode), 404 (device not found), 502 (device unreachable), 503 (device offline), 504 (device timeout).

### UI Components

#### C64FileBrowser

**Props:**

```typescript
interface C64FileBrowserProps {
  deviceId: string;
  initialPath?: string;           // default: "/"
  onSelectDisk?: (path: string) => void;
  onSelectFile?: (path: string) => void;
  onPlayMusic?: (path: string, fileType: string) => void;
  onClose?: () => void;
}
```

**Layout (top to bottom):**

1. **Close button** (if `onClose` provided) -- top-right "X CLOSE"
2. **Breadcrumb** -- clickable path segments via `C64Breadcrumb`
3. **Path input** -- text input with "GO" button for direct navigation
4. **Upload zone** -- drag-and-drop area, also clickable; shows "UPLOADING..." when active
5. **Directory listing** -- header row (NAME, SIZE, DATE) + sorted entries
6. **Status indicators** -- PETSCII block spinner for loading, red text for errors, "DELETING..." overlay

**PETSCII type icons:**

| Category               | Icon |
| ---------------------- | ---- |
| directory              | folder glyph (U+EE71) |
| disk-1541/1571/1581    | `D`  |
| program                | `P`  |
| cartridge              | `C`  |
| sid-music              | `S`  |
| mod-music              | `M`  |
| rom                    | `R`  |
| generic                | block |

**Display formatting:**
- Size: `<1024` = `{n}B`, `<1MB` = `{n}K`, else `{n.n}M`
- Date: `YY-MM-DD`
- Names: displayed uppercase

**Interactions:**
- Click directory: navigate into it
- Click `..`: navigate to parent
- Click file: select it (triggers `onSelectDisk` for disk types, `onSelectFile` otherwise)
- Right-click file: toggle context action bar with type-specific actions
- Context actions rendered as C64Button components (DELETE uses "danger" variant)

#### Client-Side Hooks

| Hook / Function                          | Purpose                                      |
| ---------------------------------------- | -------------------------------------------- |
| `useFileListing(deviceId, path)`         | TanStack Query for directory listing GET      |
| `useFileUpload(deviceId)`                | Mutation for multipart POST; invalidates file queries on success |
| `useFileDelete(deviceId)`                | Mutation for DELETE; invalidates file queries on success |
| `downloadFile(deviceId, filePath)`       | Creates transient anchor element to trigger browser download |

### Business Logic

#### FTP Connection Pool

- **Max connections per device:** 2
- **Idle timeout:** 60 seconds -- idle connections are closed after this period
- **Credential refresh:** if host or password changes between acquire calls, stale connections are closed and replaced
- **Anonymous access:** FTP login uses `user: "anonymous"`, password from device registry (or empty)
- **Pool exhaustion:** throws `"FTP connection pool exhausted for device {id}"` if both connections are in use
- **Cleanup:** `closeDevice(id)` closes all connections for a device; `closeAll()` closes everything

#### Directory Listing Cache

- **Cache key format:** `${deviceId}:${normalizedPath}`
- **TTL:** 10 seconds (`CACHE_TTL_MS = 10_000`)
- **Invalidation triggers:** file upload (target directory), file delete (parent directory)
- **Manual bypass:** `?refresh=true` query parameter
- **Storage:** in-memory `Map<string, CachedListing>`

#### Path Normalization

- Directory paths are normalized to always start with `/` and end with `/`
- Parent path computation: strip trailing `/`, find last `/`, return prefix through that slash
- Root path `/` has `parent: null`

#### Filename Validation (Upload)

Rejected filenames:
- Empty string, `.`, or `..`
- Contains `/` or `\`
- Contains `..` substring
- Contains control characters (0x00-0x1F, 0x7F)

#### Sort Order

Client-side sorting of directory entries:
1. Directories before files
2. Alphabetical by name within each group (locale-aware)

## Constraints

- The FTP connection pool MUST NOT exceed 2 concurrent connections per device to avoid overwhelming the device's FTP server.
- Directory cache TTL MUST be short (10 seconds) because device filesystems can change externally.
- File downloads are buffered entirely in server memory before streaming to the client; very large files MAY cause memory pressure.
- The upload-mount endpoint uses a 15-second timeout; large disk images over slow networks MAY time out.
- The library route reads the local `data/library/` directory synchronously; it SHOULD NOT contain a large number of files.
- File type detection is extension-based only; the system does not inspect file contents.
- The `run` and `load` actions are defined in the type system but are NOT YET IMPLEMENTED in the UI action handler (they show an "info" toast).

## Open Questions

1. **Streaming downloads:** Should large file downloads be streamed rather than buffered in memory?
2. **Recursive delete:** Should directory deletion be supported, or only individual files?
3. **File rename:** Should a rename endpoint be added?
4. **Upload size limits:** Should the server enforce a maximum upload file size?
5. **Cache scope:** Should the cache be shared across devices, or should each device have an independent cache instance?
6. **FTP reconnection:** Should the pool implement automatic reconnection with retry on transient FTP errors, or leave that to the caller?

## References

- [basic-ftp library](https://github.com/patrickjuchli/basic-ftp) -- FTP client used by the connection pool
- [Archive spec 0005](../archive/0005-realtime-and-file-browser.md) -- original combined spec for real-time state and file browser
- Source: `src/server/lib/ftp-pool.ts` -- FTP connection pool implementation
- Source: `src/server/lib/file-type.ts` -- file type detection module
- Source: `src/server/routes/files.ts` -- file CRUD API routes
- Source: `src/server/routes/library.ts` -- local library listing route
- Source: `src/server/routes/upload-mount.ts` -- upload-and-mount route
- Source: `src/client/components/device/file-browser.tsx` -- file browser UI component
- Source: `src/client/hooks/use-file-browser.ts` -- client-side query/mutation hooks

## Changelog

| Date       | Change                | Author |
| ---------- | --------------------- | ------ |
| 2026-04-16 | Initial spec created  | --     |
