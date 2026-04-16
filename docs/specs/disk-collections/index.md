# Disk Collections

## Overview

Disk Collections (internally "Disk Flip Collections") provide a way to group, order, and hot-swap multiple disk images for C64 games that span several floppy disks. A user creates a named collection of disk entries, assigns each entry a slot number and target drive, and then uses a compact flip widget during gameplay to mount the next, previous, or a specific disk on a connected Ultimate device -- all without leaving the browser.

## Background

Many classic C64 titles (Maniac Mansion, Ultima IV, Bard's Tale II, etc.) shipped on two to six floppy disks. During gameplay the program prompts the user to "INSERT DISK 2" -- on original hardware, this means physically swapping a floppy. The Ultimate series of FPGA devices emulate the 1541 drive and can mount `.d64` / `.g64` / `.d71` images at runtime through a REST API (`PUT /v1/drives/{drive}:mount`). Disk Collections automate the swap: users pre-configure the disk order once, then flip through them with a single click.

The feature consists of three layers:

1. **Server-side persistence** -- `CollectionStore` backed by `data/collections.json`.
2. **REST API** -- CRUD for collections plus a `flip` action that mounts a specific disk image on a target device.
3. **Client UI** -- a Collection Manager page for authoring and a Flip Widget embedded in the device dashboard for in-session use.

## Requirements

### R1 -- Collection CRUD

Users MUST be able to create, read, update, and delete disk flip collections.

**Scenario: Create a collection**

> GIVEN the user is on the Collection Manager page
> WHEN the user clicks "+ NEW COLLECTION", enters a name, adds one or more disk entries (each with label, path, and drive), and clicks "SAVE"
> THEN the system SHALL persist the collection with a generated UUID, timestamps, and 0-based slot indices, and the new collection SHALL appear in the list view.

**Scenario: Update a collection**

> GIVEN a collection "ULTIMA IV" exists with 4 disks
> WHEN the user clicks "EDIT", reorders disk 3 above disk 2, changes a label, and clicks "SAVE"
> THEN the system SHALL re-index slots to reflect the new order, update `updatedAt`, and persist changes.

**Scenario: Delete a collection**

> GIVEN a collection "MANIAC MANSION" exists
> WHEN the user clicks "DEL" for that collection
> THEN the system SHALL remove it from the store, clean up any in-memory flip positions for that collection, and return `{ ok: true }`.

**Scenario: Reject invalid input**

> GIVEN the user submits a collection with an empty name or a disk entry with a missing path
> WHEN the server validates the payload
> THEN the server SHALL return HTTP 400 with a descriptive error message.

### R2 -- Disk Entry Model

Each disk entry MUST contain:

| Field   | Type              | Required | Description                                      |
| ------- | ----------------- | -------- | ------------------------------------------------ |
| `slot`  | `number`          | yes      | 0-based position, auto-assigned on persist       |
| `label` | `string`          | yes      | Human-readable label, e.g. "DISK 1 - SIDE A"    |
| `path`  | `string`          | yes      | Absolute path on device filesystem               |
| `drive` | `"a"` \| `"b"`   | yes      | Target drive on the Ultimate device              |
| `type`  | `string`          | no       | File extension (inferred, informational only)    |

Disk entries MUST be validated on create and update. `drive` MUST be `"a"` or `"b"`. `path` MUST be a non-empty string. `label` MUST be a string.

### R3 -- Flip Action

Users MUST be able to mount a specific disk from a collection onto a device.

**Scenario: Flip to next disk (wrap-around)**

> GIVEN a collection with 3 disks and the current position for device "abc" is slot 2 (the last)
> WHEN the user triggers a "next" flip
> THEN the system SHALL wrap to slot 0, mount the disk at slot 0 on the device, update the in-memory position, and return `{ disk, position: 0, total: 3 }`.

**Scenario: Flip to previous disk (wrap-around)**

> GIVEN a collection with 3 disks and the current position for device "abc" is slot 0
> WHEN the user triggers a "prev" flip
> THEN the system SHALL wrap to slot 2 (last), mount it, and return `{ disk, position: 2, total: 3 }`.

**Scenario: Flip to specific slot**

> GIVEN a collection with 5 disks
> WHEN the user requests `slot=3`
> THEN the system SHALL mount the disk at index 3, regardless of the current position, and return `{ disk, position: 3, total: 5 }`.

**Scenario: Invalid slot**

> GIVEN a collection with 3 disks
> WHEN the user requests `slot=5`
> THEN the server SHALL return HTTP 400 with `"Invalid slot: must be 0-2"`.

**Scenario: Device offline**

> GIVEN the target device is offline
> WHEN the user triggers a flip
> THEN the server SHALL return HTTP 503 with `"Device is offline"`.

**Scenario: Mount failure**

> GIVEN the device is online but the mount API call fails or times out
> WHEN the server attempts the mount
> THEN the server SHALL return HTTP 502 with a `"Mount failed: ..."` error and SHALL NOT update the stored position.

### R4 -- Per-Device Position Tracking

The system MUST track the current flip position independently per collection per device. Position tracking is in-memory (not persisted). On server restart, positions MUST reset to 0. If a collection's disk list is modified (shortened) between flips, the stored position MUST be clamped to the valid range.

### R5 -- Collection Manager UI

The Collection Manager page (`/collections`) MUST provide:

- A list view showing each collection's name, disk count, and EDIT / DEL action buttons.
- A create/edit form with:
  - Text inputs for collection name and optional description.
  - A device selector dropdown (online devices only) that enables the file browser.
  - A disk entry table with columns: `#`, `LABEL`, `PATH`, `DRV`, `ACTIONS`.
  - Per-disk actions: BROWSE (file browser), UP/DOWN (reorder), X (remove).
  - An inline file browser that opens below the selected disk row and populates the path on selection.
  - "+ ADD DISK" button to append a new empty entry.
  - SAVE and CANCEL buttons. SAVE MUST validate that name is non-empty and all disk paths are non-empty.

### R6 -- Flip Widget UI

The Flip Widget (`FlipWidget` component) MUST be embeddable in the device dashboard and provide:

- A collection selector dropdown listing all collections with disk counts.
- A current-disk display panel showing: position indicator (`DISK N/TOTAL`), label, drive letter, and filename.
- PREV and NEXT navigation buttons (disabled while a flip is in progress).
- Direct slot buttons (numbered 1..N) when the collection has 8 or fewer disks. The current slot button MUST use reverse video styling.
- A MOUNTING spinner (PETSCII block cursor) displayed during in-flight flip requests.
- An empty state: `"NO COLLECTIONS AVAILABLE"` when no collections exist; `"COLLECTION HAS NO DISKS"` when the selected collection is empty.

## Design

### Architecture

```
┌──────────────────────────────────────────────────────┐
│ Browser                                              │
│                                                      │
│  CollectionsPage ──────► useCollections()             │
│  (CRUD manager)          useCreateCollection()       │
│                          useUpdateCollection()       │
│                          useDeleteCollection()       │
│                                                      │
│  FlipWidget ───────────► useFlipDisk()               │
│  (device dashboard)      useCollections()            │
│                                                      │
│  All hooks use hc (Hono RPC client) ────────────┐    │
└─────────────────────────────────────────────────┼────┘
                                                  │
                                            HTTP/JSON
                                                  │
┌─────────────────────────────────────────────────┼────┐
│ Hono Server                                     │    │
│                                                 ▼    │
│  /api/collections/*  ───► CollectionStore            │
│                             (data/collections.json)  │
│                                                      │
│  /api/collections/:id/flip                           │
│     ├─ flipPositions (Map, in-memory)                │
│     └─ mountDisk() ──► PUT /v1/drives/{d}:mount ──┐  │
│                                                   │  │
└───────────────────────────────────────────────────┼──┘
                                                    │
                                              HTTP (LAN)
                                                    │
                                              ┌─────▼────┐
                                              │ Ultimate  │
                                              │  Device   │
                                              └──────────┘
```

### Data Models

Defined in `src/shared/types.ts`:

```typescript
interface DiskEntry {
  slot: number;          // 0-based position in collection
  label: string;         // "Disk 1 - Side A"
  path: string;          // "/USB0/Games/ManiacMansion/disk1.d64"
  drive: "a" | "b";     // target drive on the device
  type?: string;         // file extension, informational
}

interface DiskFlipCollection {
  id: string;            // crypto.randomUUID()
  name: string;          // "Maniac Mansion"
  description?: string;
  disks: DiskEntry[];
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
}

interface FlipResult {
  disk: DiskEntry;       // the mounted disk
  position: number;      // current slot index
  total: number;         // total disks in collection
}
```

### API Surface

All endpoints are under `/api` and return JSON.

#### Collection CRUD

| Method   | Path                        | Body / Query                          | Success  | Error Codes      |
| -------- | --------------------------- | ------------------------------------- | -------- | ---------------- |
| `GET`    | `/api/collections`          | --                                    | 200, `DiskFlipCollection[]` | -- |
| `POST`   | `/api/collections`          | `{ name, description?, disks[] }`     | 201, `DiskFlipCollection`   | 400 |
| `GET`    | `/api/collections/:id`      | --                                    | 200, `DiskFlipCollection`   | 404 |
| `PUT`    | `/api/collections/:id`      | `{ name?, description?, disks?[] }`   | 200, `DiskFlipCollection`   | 400, 404 |
| `DELETE` | `/api/collections/:id`      | --                                    | 200, `{ ok: true }`         | 404 |

#### Flip Action

| Method | Path                             | Query Parameters                                   | Success               | Error Codes          |
| ------ | -------------------------------- | -------------------------------------------------- | --------------------- | -------------------- |
| `POST` | `/api/collections/:id/flip`      | `deviceId` (required), `slot` OR `direction`        | 200, `FlipResult`     | 400, 404, 502, 503   |

Query parameter resolution:

1. If `slot` is present: mount the disk at that exact index. Invalid index returns 400.
2. If `direction=prev`: decrement position with wrap-around.
3. Otherwise (no `slot`, no `direction`, or `direction=next`): increment position with wrap-around.

The server calls `PUT http://{device.ip}:{device.port}/v1/drives/{drive}:mount?image={path}` on the target device with a 5-second timeout. If the device has a password, the server sends it via the `X-Password` header.

### UI Components

#### `CollectionsPage` (`src/client/routes/collections/index.tsx`)

- Route: `/collections` (TanStack Router file-based route).
- Three modes: `list`, `create`, `edit` -- toggled via React state.
- Uses `C64Box`, `C64Button`, `C64Input`, `C64Select` design-system components.
- Integrates `C64FileBrowser` inline for each disk entry.
- Disk reordering via UP/DOWN buttons (swap-based, not drag-and-drop).

#### `FlipWidget` (`src/client/components/device/flip-widget.tsx`)

- Receives `deviceId` as prop.
- Maintains local state for selected collection ID and current slot.
- On successful flip, updates local slot from the `FlipResult.position` response.
- Direct slot buttons render only when `totalDisks <= 8`.
- All text is uppercase per C64 aesthetic.

### Business Logic

#### Slot Indexing

Slots are 0-based. On create and update, the `validateDisks()` function re-indexes incoming disk entries sequentially (`slot = i`), discarding any client-supplied slot values.

#### Wrap-Around Navigation

```
next: position >= total - 1 ? 0 : position + 1
prev: position <= 0 ? total - 1 : position - 1
```

#### Position Clamping

If disks are removed from a collection between flips, the raw stored position may exceed the new length. Both server and client clamp: `Math.min(storedPosition, disks.length - 1)`.

#### Mount Flow

1. Validate collection exists, has disks, device exists and is online.
2. Resolve target slot from query parameters.
3. Call `mountDisk()` -- HTTP PUT to device with 5s abort timeout.
4. On device error (HTTP non-2xx or `errors[]` in JSON body): return 502, do NOT update position.
5. On success: update `flipPositions` map, return `FlipResult`.

#### Deletion Cleanup

When a collection is deleted, its entry in the `flipPositions` map is also removed to prevent unbounded memory growth.

### Client Hooks (`src/client/hooks/use-collections.ts`)

| Hook                      | Type     | Query Key            | Description                          |
| ------------------------- | -------- | -------------------- | ------------------------------------ |
| `useCollections()`        | query    | `["collections"]`    | Fetch all collections                |
| `useCollection(id)`       | query    | `["collections", id]`| Fetch single collection              |
| `useCreateCollection()`   | mutation | invalidates `["collections"]` | POST new collection          |
| `useUpdateCollection()`   | mutation | invalidates `["collections"]` | PUT partial update           |
| `useDeleteCollection()`   | mutation | invalidates `["collections"]` | DELETE collection            |
| `useFlipDisk()`           | mutation | invalidates `["collections"]` | POST flip action             |

All mutations invalidate the `["collections"]` query key on success to keep the list view fresh.

## Constraints

1. **Flip positions are ephemeral.** They are stored in an in-memory `Map` and are lost on server restart. This is by design -- the cost of persisting per-device positions outweighs the benefit, since the user can always flip to a specific slot.
2. **No auto-detect of "INSERT DISK" prompts.** The Ultimate device API does not expose C64 screen memory or program state. Disk flipping is always user-initiated.
3. **Single-drive mount only.** Each disk entry targets exactly one drive (`"a"` or `"b"`). Mounting to both drives simultaneously requires two separate disk entries.
4. **No drag-and-drop reordering.** Disk order is changed via UP/DOWN swap buttons. This avoids drag-and-drop library dependencies and works well with the keyboard-centric C64 aesthetic.
5. **5-second mount timeout.** If the device does not respond within 5 seconds, the flip is treated as failed. This prevents the UI from hanging on unreachable devices.
6. **Direct slot buttons capped at 8.** Collections with more than 8 disks show only PREV/NEXT navigation to avoid UI overflow.
7. **No validation of disk image existence.** The server does not verify that the path exists on the device filesystem before attempting to mount. Invalid paths will fail at mount time with a 502 error.

## Open Questions

1. **Should flip positions be persisted?** Currently in-memory only. If users frequently restart the server mid-game, persisting to `data/flip-positions.json` could improve UX. Counter-argument: positions are cheap to re-establish via direct slot selection.
2. **Bulk import from directory?** A future enhancement could scan a device directory and auto-generate a collection from sequentially named disk images (e.g., `disk1.d64`, `disk2.d64`).
3. **Collection sharing / export?** Collections are server-local. An export/import (JSON) feature could allow sharing setups between instances.
4. **Keyboard shortcuts for flipping?** The Flip Widget could bind `[` and `]` (or similar) for prev/next during gameplay, reducing mouse dependency.

## References

- [File Browser spec](../file-browser/) -- file browser component reused for disk path selection
- [Device Management spec](../device-management/) -- device store and online/offline state
- [Spec 0006: Workflows & Media](../archive/0006-workflows-and-media.md) -- original feature definition (disk flip, macros, jukebox)
- [Ultimate II+ REST API](https://1541u-documentation.readthedocs.io/) -- `PUT /v1/drives/{drive}:mount` endpoint
- Source: `src/shared/types.ts` -- `DiskEntry`, `DiskFlipCollection`, `FlipResult`
- Source: `src/server/lib/collection-store.ts` -- `CollectionStore` class
- Source: `src/server/routes/collections.ts` -- API routes and flip logic
- Source: `src/client/routes/collections/index.tsx` -- Collection Manager UI
- Source: `src/client/components/device/flip-widget.tsx` -- Flip Widget UI
- Source: `src/client/hooks/use-collections.ts` -- TanStack Query hooks

## Changelog

| Date       | Change                | Author |
| ---------- | --------------------- | ------ |
| 2026-04-16 | Initial spec created  | --     |
