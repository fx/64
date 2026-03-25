# 0006 — Disk Flip Collections

## Overview

Server-side storage and management of multi-disk game configurations. A "disk flip collection" defines the ordered set of disk images for a multi-disk game and enables one-click swapping between disks during gameplay.

## Background

The existing c64u-control-panel has a "Disk Flip" tool that saves presets to localStorage. This works but is browser-local — not shareable between devices or browsers. Multi-disk games (e.g., Maniac Mansion, Ultima IV) require swapping disks at specific points, which is tedious via manual mount commands.

## Goals

- Create, edit, delete disk flip collections (named presets)
- Ordered list of disk images per collection, assigned to drives (A/B)
- One-click "next disk" / "previous disk" / "go to disk N" actions
- Collections stored server-side (JSON file), accessible from any browser
- Associate collections with specific devices (or make them device-agnostic)
- UI for managing collections and flipping disks during gameplay

## Non-Goals

- Auto-detection of "insert disk 2" prompts (would require screen analysis)
- Multi-device synchronized disk flipping
- Importing from c64u-control-panel's localStorage format (manual recreation is fine)

## Technical Design

### Data Model

```typescript
interface DiskFlipCollection {
  id: string              // UUID
  name: string            // "Maniac Mansion", "Ultima IV"
  description?: string
  disks: DiskEntry[]
  createdAt: string       // ISO timestamp
  updatedAt: string
}

interface DiskEntry {
  slot: number            // 0-based index
  label: string           // "Disk 1 - Side A"
  path: string            // "/USB0/Games/ManiacMansion/disk1.d64"
  drive: 'a' | 'b'       // target drive
  type?: string           // d64, d71, d81 (inferred from extension)
}
```

Persisted to `data/collections.json`.

### API Endpoints

```
GET    /api/collections                        → list all collections
POST   /api/collections                        → create collection
GET    /api/collections/:id                    → get collection
PUT    /api/collections/:id                    → update collection
DELETE /api/collections/:id                    → delete collection
POST   /api/collections/:id/flip               → mount next disk in sequence
POST   /api/collections/:id/flip?slot=2        → mount specific disk by slot
POST   /api/collections/:id/flip?direction=prev → mount previous disk
```

### Flip Action

The flip endpoint:
1. Determines the target disk entry (next, previous, or specific slot)
2. Calls `PUT /v1/drives/<drive>:mount?image=<path>` on the target device via the proxy
3. Returns the mounted disk info and current position in the sequence

Tracks current position per collection per device in memory (not persisted — resets on server restart).

### UI

- **Collection manager page:** CRUD for collections, drag-to-reorder disks, file browser integration for selecting disk images
- **Flip widget:** Compact overlay/panel during gameplay showing current disk, next/prev buttons, disk list. Accessible from the main dashboard.

## Acceptance Criteria

- [ ] CRUD operations for disk flip collections via API
- [ ] Flip action mounts the correct disk image on the correct drive
- [ ] Sequential next/prev navigation through disk list wraps around
- [ ] Collections persist server-side across restarts
- [ ] UI allows creating a collection by browsing files and adding them
- [ ] UI flip widget shows current position and allows one-click navigation

## Tasks

- [ ] Implement disk flip collections CRUD API with JSON persistence
  - [ ] Create `DiskFlipCollection` and `DiskEntry` TypeScript types
  - [ ] Implement `CollectionStore`: load/save `data/collections.json`
  - [ ] `GET /api/collections` — list all collections
  - [ ] `POST /api/collections` — create collection with name, description, and disk entries
  - [ ] `GET /api/collections/:id` — get single collection
  - [ ] `PUT /api/collections/:id` — update collection (rename, reorder disks, add/remove disks)
  - [ ] `DELETE /api/collections/:id` — delete collection
- [ ] Implement flip action endpoint
  - [ ] `POST /api/collections/:id/flip` — mount next disk (default), specific slot (`?slot=N`), or previous (`?direction=prev`)
  - [ ] Track current position per collection per device in memory
  - [ ] Call `PUT /v1/drives/<drive>:mount?image=<path>` on the target device via proxy
  - [ ] Return mounted disk info and current position; wrap around at list boundaries
- [ ] Build collection manager UI page
  - [ ] Collection list with name, disk count, last-used date
  - [ ] Create/edit form: name, description, ordered disk list
  - [ ] Drag-to-reorder disks within a collection
  - [ ] File browser integration for selecting disk images (from spec 0005)
  - [ ] Drive assignment (A/B) per disk entry
- [ ] Build flip widget UI component
  - [ ] Compact panel showing current collection, current disk position, total disks
  - [ ] Next/previous buttons and direct slot selection
  - [ ] Visual indicator of current disk in the sequence
  - [ ] Accessible from the main device dashboard
