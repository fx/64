# 0009 — Configuration Profiles

## Overview

Save, restore, and compare named snapshots of a C64U device's complete configuration. A profile captures all 17+ configuration categories so you can switch between setups (e.g., "PAL gaming", "NTSC demo scene", "SID testing") with one click.

## Background

The C64U has extensive configuration (audio mixer, SID sockets, drive settings, network, UI, etc.) accessible via `GET /v1/configs` and `PUT /v1/configs`. The device has built-in save/load/reset to flash, but only one saved configuration. Profiles add unlimited named snapshots stored on the proxy.

## Goals

- Capture a device's full configuration as a named profile
- Restore a profile to a device (bulk config write)
- Compare two profiles (diff view)
- Compare a profile against a device's current config
- Export/import profiles as JSON files
- Pre-built profiles for common setups

## Non-Goals

- Partial profiles (always capture the full config)
- Profile scheduling (apply profile at specific times)
- Cross-device type compatibility (a U64 profile may not apply to a UII+)

## Technical Design

### Data Model

```typescript
interface ConfigProfile {
  id: string
  name: string
  description?: string
  deviceProduct?: string      // "Ultimate 64" — for compatibility hints
  config: Record<string, Record<string, string | number>>  // category → item → value
  createdAt: string
  updatedAt: string
}
```

The `config` field matches the structure returned by `GET /v1/configs/<category>/<item>` across all categories.

Persisted to `data/profiles.json`.

### API Endpoints

```
GET    /api/profiles                           → list all profiles
POST   /api/profiles                           → create profile (manual JSON)
GET    /api/profiles/:id                       → get profile
PUT    /api/profiles/:id                       → update profile
DELETE /api/profiles/:id                       → delete profile
POST   /api/profiles/capture                   → capture current config from device { deviceId, name }
POST   /api/profiles/:id/apply                 → apply profile to device { deviceId }
GET    /api/profiles/:id/diff?against=:otherId → diff two profiles
GET    /api/profiles/:id/diff?deviceId=:id     → diff profile against device's current config
GET    /api/profiles/:id/export                → export as downloadable JSON
POST   /api/profiles/import                    → import from JSON upload
```

### Capture Flow

1. Fetch all categories: `GET /v1/configs`
2. For each category, fetch all items with details: `GET /v1/configs/<category>/*`
3. Assemble into the profile config structure
4. Save with user-provided name

### Apply Flow

1. Load profile config
2. Use `POST /v1/configs` to bulk-set all values (the native API supports bulk config writes)
3. Optionally save to flash: `PUT /v1/configs:save_to_flash`
4. Return a report of what changed

### Diff

Compare two config objects key-by-key:

```json
{
  "changes": [
    {
      "category": "Drive A Settings",
      "item": "Drive Type",
      "left": "1541",
      "right": "1581"
    }
  ],
  "leftOnly": [],
  "rightOnly": [],
  "identical": 45
}
```

### UI

- **Profile list:** Cards with name, description, device type, date
- **Capture button:** On device dashboard, "Save current config as profile"
- **Apply button:** Confirmation dialog showing what will change (diff preview)
- **Diff viewer:** Side-by-side or unified diff view with category grouping

## Acceptance Criteria

- [ ] Capture a device's full config into a named profile
- [ ] Apply a profile to a device via bulk config write
- [ ] Diff two profiles shows per-item changes
- [ ] Diff a profile against a live device's config
- [ ] Export profile as JSON file download
- [ ] Import profile from uploaded JSON
- [ ] Profiles persist server-side across restarts
- [ ] UI shows diff preview before applying

## Tasks

- [ ] Implement config profile CRUD API with JSON persistence
  - [ ] Create `ConfigProfile` TypeScript type
  - [ ] Implement `ProfileStore`: load/save `data/profiles.json`
  - [ ] `GET /api/profiles`, `POST /api/profiles`, `GET /api/profiles/:id`, `PUT /api/profiles/:id`, `DELETE /api/profiles/:id`
- [ ] Implement config capture from device
  - [ ] `POST /api/profiles/capture` — accept `{ deviceId, name, description? }`
  - [ ] Fetch all categories via `GET /v1/configs`, then fetch each category's items via `GET /v1/configs/<category>/*`
  - [ ] Assemble into profile config structure, save with metadata (device product, timestamp)
- [ ] Implement config apply to device
  - [ ] `POST /api/profiles/:id/apply` — accept `{ deviceId, saveToFlash? }`
  - [ ] Use `POST /v1/configs` to bulk-set all values from the profile
  - [ ] Optionally call `PUT /v1/configs:save_to_flash` if `saveToFlash` is true
  - [ ] Return a change report (what was different before vs after)
- [ ] Implement profile diff API
  - [ ] `GET /api/profiles/:id/diff?against=:otherId` — compare two profiles item-by-item
  - [ ] `GET /api/profiles/:id/diff?deviceId=:id` — compare profile against device's live config
  - [ ] Return structured diff: changes (category, item, left, right), leftOnly, rightOnly, identical count
- [ ] Implement profile export and import
  - [ ] `GET /api/profiles/:id/export` — return profile as downloadable JSON file
  - [ ] `POST /api/profiles/import` — accept uploaded JSON file, validate structure, save as new profile
- [ ] Build profile management UI
  - [ ] Profile list with name, description, device product, date
  - [ ] Capture button on device dashboard: "Save current config as profile"
  - [ ] Apply button with confirmation dialog showing diff preview (what will change)
  - [ ] Diff viewer: side-by-side or grouped view with changed/added/removed items highlighted
  - [ ] Export/import buttons
