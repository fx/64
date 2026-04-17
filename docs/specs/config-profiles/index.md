# Config Profiles

## Overview

Config Profiles allow users to capture a C64 Ultimate device's full configuration as a named snapshot, apply saved profiles to any compatible device, compare profiles side-by-side, and import/export profiles as JSON files. This enables homelab users to switch between known-good configurations quickly — for example, toggling between PAL and NTSC video modes, swapping drive types, or changing SID chip emulation settings — without manually reconfiguring each item through the device menus.

**Status:** NOT YET IMPLEMENTED. All sections describe desired behavior.

## Background

C64 Ultimate devices (Ultimate 64, Ultimate II+, Ultimate II+L) expose a comprehensive configuration system through their REST API. Each device organises settings into named categories (e.g., "Drive A Settings", "Audio Mixer", "SID Sockets Configuration") containing individual items with typed values. A device may have 15-20 categories with hundreds of individual config items across all categories.

Today, there is no way to save a known-good configuration state, restore it after experimentation, or transfer settings between devices. Users who own multiple devices or who frequently reconfigure a single device must manually track which settings they changed and how to revert them.

The Config Profiles feature adds a server-side profile store that captures the full config tree from a device, persists it as a named profile, and can push it back to any device. A diff engine enables comparing two profiles or a profile against a device's live configuration before applying changes.

### C64U Config API Surface

The following device endpoints are relevant (see `docs/c64.md` for full reference):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/configs` | GET | List all configuration categories |
| `/v1/configs/<category>` | GET | Get all items and current values in a category |
| `/v1/configs/<category>/<item>?value=<v>` | PUT | Set a single config item |
| `/v1/configs` | POST | Bulk-set multiple config items (JSON body) |
| `/v1/configs:save_to_flash` | PUT | Persist current config to non-volatile memory |
| `/v1/configs:load_from_flash` | PUT | Restore config from non-volatile memory |
| `/v1/configs:reset_to_default` | PUT | Reset to factory defaults (in-memory only) |

Related specifications:
- [Device Management](../device-management/) — device registry, health checking, and the `DeviceStore`
- [API Proxy](../api-proxy/) — proxy layer that forwards requests to C64U devices and injects authentication
- [Architecture](../architecture/) — overall system design, Hono + Vite monolith, and module layout

## Requirements

### REQ-1: Profile CRUD

The system MUST support creating, reading, updating, and deleting configuration profiles.

**Scenario: Create a profile manually**

```
GIVEN a user has a JSON configuration map they want to store
WHEN they submit POST /api/profiles with { name, description?, deviceProduct?, config }
THEN the system SHALL generate a unique ID for the profile
  AND the system SHALL set createdAt and updatedAt to the current ISO timestamp
  AND the system SHALL persist the profile to data/profiles.json
  AND the system SHALL return the profile with HTTP 201
```

**Scenario: List all profiles**

```
GIVEN three profiles are stored
WHEN a client requests GET /api/profiles
THEN the system SHALL return all three profile records with HTTP 200
```

**Scenario: Get a single profile**

```
GIVEN a profile with id "prof-001" exists
WHEN a client requests GET /api/profiles/prof-001
THEN the system SHALL return the full profile record with HTTP 200
```

**Scenario: Get a nonexistent profile**

```
GIVEN no profile with id "missing" exists
WHEN a client requests GET /api/profiles/missing
THEN the system SHALL return HTTP 404 with error "Profile not found"
```

**Scenario: Update a profile**

```
GIVEN a profile with id "prof-001" exists
WHEN a client sends PUT /api/profiles/prof-001 with { name: "Updated Name" }
THEN the system SHALL merge the provided fields into the existing profile
  AND the system SHALL update the updatedAt timestamp
  AND the system SHALL persist the change
  AND the system SHALL return the updated profile with HTTP 200
```

**Scenario: Delete a profile**

```
GIVEN a profile with id "prof-001" exists
WHEN a client sends DELETE /api/profiles/prof-001
THEN the system SHALL remove the profile from the store
  AND the system SHALL persist the change
  AND the system SHALL return { ok: true } with HTTP 200
```

**Scenario: Delete a nonexistent profile**

```
GIVEN no profile with id "missing" exists
WHEN a client sends DELETE /api/profiles/missing
THEN the system SHALL return HTTP 404 with error "Profile not found"
```

### REQ-2: Capture Configuration from Device

The system MUST allow capturing a device's full live configuration into a new named profile.

**Scenario: Successful capture**

```
GIVEN a device "8D927F" is registered and online
WHEN a client sends POST /api/profiles/capture with { deviceId: "8D927F", name: "My PAL Setup" }
THEN the system SHALL fetch GET /v1/configs from the device to obtain the category list
  AND for each category, the system SHALL fetch GET /v1/configs/<category> to obtain item values
  AND the system SHALL assemble the config map as { categoryName: { itemName: value, ... }, ... }
  AND the system SHALL set deviceProduct from the device's registered product field
  AND the system SHALL persist the new profile with a generated ID
  AND the system SHALL return the profile with HTTP 201
```

**Scenario: Capture from offline device**

```
GIVEN a device "8D927F" is registered but offline
WHEN a client sends POST /api/profiles/capture with { deviceId: "8D927F", name: "Snapshot" }
THEN the system SHALL return HTTP 502 with error "Device is offline"
```

**Scenario: Capture from unknown device**

```
GIVEN no device with id "UNKNOWN" is registered
WHEN a client sends POST /api/profiles/capture with { deviceId: "UNKNOWN", name: "Snapshot" }
THEN the system SHALL return HTTP 404 with error "Device not found"
```

**Scenario: Capture with missing name**

```
GIVEN a valid device is registered and online
WHEN a client sends POST /api/profiles/capture with { deviceId: "8D927F" } (no name)
THEN the system SHALL return HTTP 400 with error "Profile name is required"
```

### REQ-3: Apply Profile to Device

The system MUST allow applying a stored profile's configuration to a target device.

**Scenario: Successful apply**

```
GIVEN a profile "prof-001" exists with config data
  AND a device "8D927F" is registered and online
WHEN a client sends POST /api/profiles/prof-001/apply with { deviceId: "8D927F" }
THEN the system SHALL send POST /v1/configs to the device with the profile's config map as the JSON body
  AND the system SHALL return HTTP 200 with a summary of applied categories
```

**Scenario: Apply with save to flash**

```
GIVEN a profile "prof-001" exists
  AND a device "8D927F" is registered and online
WHEN a client sends POST /api/profiles/prof-001/apply with { deviceId: "8D927F", saveToFlash: true }
THEN the system SHALL send POST /v1/configs to the device with the profile's config map
  AND the system SHALL then send PUT /v1/configs:save_to_flash to persist changes on the device
  AND the system SHALL return HTTP 200 with a summary indicating flash save was performed
```

**Scenario: Apply to offline device**

```
GIVEN a profile "prof-001" exists
  AND device "8D927F" is registered but offline
WHEN a client sends POST /api/profiles/prof-001/apply with { deviceId: "8D927F" }
THEN the system SHALL return HTTP 502 with error "Device is offline"
```

**Scenario: Apply nonexistent profile**

```
GIVEN no profile with id "missing" exists
WHEN a client sends POST /api/profiles/missing/apply with { deviceId: "8D927F" }
THEN the system SHALL return HTTP 404 with error "Profile not found"
```

**Scenario: Apply to unknown device**

```
GIVEN a profile "prof-001" exists
  AND no device with id "UNKNOWN" is registered
WHEN a client sends POST /api/profiles/prof-001/apply with { deviceId: "UNKNOWN" }
THEN the system SHALL return HTTP 404 with error "Device not found"
```

### REQ-4: Diff Profiles

The system MUST support comparing two profiles or comparing a profile against a device's live configuration.

**Scenario: Diff two profiles**

```
GIVEN profile "prof-001" has config { "Drive A Settings": { "Drive Type": "1541", "Drive Bus ID": 8 } }
  AND profile "prof-002" has config { "Drive A Settings": { "Drive Type": "1581", "Drive Bus ID": 8 } }
WHEN a client requests GET /api/profiles/prof-001/diff?against=prof-002
THEN the system SHALL return a ConfigDiff with:
  - changes: [{ category: "Drive A Settings", item: "Drive Type", left: "1541", right: "1581" }]
  - leftOnly: []
  - rightOnly: []
  - identical: 1
```

**Scenario: Diff with items only in one profile**

```
GIVEN profile "prof-001" has config { "Drive A Settings": { "Drive": "Enabled" }, "Tape Settings": { "Tape": "Enabled" } }
  AND profile "prof-002" has config { "Drive A Settings": { "Drive": "Enabled" }, "Network settings": { "DHCP": "Enabled" } }
WHEN a client requests GET /api/profiles/prof-001/diff?against=prof-002
THEN the system SHALL return a ConfigDiff with:
  - changes: []
  - leftOnly: [{ category: "Tape Settings", item: "Tape", value: "Enabled" }]
  - rightOnly: [{ category: "Network settings", item: "DHCP", value: "Enabled" }]
  - identical: 1
```

**Scenario: Diff profile against live device**

```
GIVEN profile "prof-001" exists with config data
  AND device "8D927F" is registered and online
WHEN a client requests GET /api/profiles/prof-001/diff?deviceId=8D927F
THEN the system SHALL capture the device's current config (same flow as REQ-2)
  AND the system SHALL compare the profile config against the captured config
  AND the system SHALL return a ConfigDiff showing all differences
```

**Scenario: Diff with nonexistent profile**

```
GIVEN no profile with id "missing" exists
WHEN a client requests GET /api/profiles/missing/diff?against=prof-002
THEN the system SHALL return HTTP 404 with error "Profile not found"
```

**Scenario: Diff with nonexistent comparison target**

```
GIVEN profile "prof-001" exists
  AND no profile with id "missing" exists
WHEN a client requests GET /api/profiles/prof-001/diff?against=missing
THEN the system SHALL return HTTP 404 with error "Comparison profile not found"
```

**Scenario: Diff against offline device**

```
GIVEN profile "prof-001" exists
  AND device "8D927F" is registered but offline
WHEN a client requests GET /api/profiles/prof-001/diff?deviceId=8D927F
THEN the system SHALL return HTTP 502 with error "Device is offline"
```

**Scenario: Diff with no comparison parameter**

```
GIVEN profile "prof-001" exists
WHEN a client requests GET /api/profiles/prof-001/diff (no against or deviceId)
THEN the system SHALL return HTTP 400 with error "Provide 'against' or 'deviceId' query parameter"
```

### REQ-5: Export and Import

The system MUST support exporting profiles as JSON files and importing profiles from JSON files.

**Scenario: Export a profile**

```
GIVEN a profile "prof-001" exists
WHEN a client requests GET /api/profiles/prof-001/export
THEN the system SHALL return the full profile as a JSON file download
  AND the Content-Type SHALL be application/json
  AND the Content-Disposition header SHALL suggest a filename based on the profile name
```

**Scenario: Export a nonexistent profile**

```
GIVEN no profile with id "missing" exists
WHEN a client requests GET /api/profiles/missing/export
THEN the system SHALL return HTTP 404 with error "Profile not found"
```

**Scenario: Import a valid profile**

```
GIVEN a user uploads a JSON file containing a valid ConfigProfile structure
WHEN a client sends POST /api/profiles/import with the JSON file
THEN the system SHALL validate the JSON structure (name and config fields required)
  AND the system SHALL generate a new ID (ignoring any id in the uploaded file)
  AND the system SHALL set createdAt and updatedAt to the current timestamp
  AND the system SHALL persist the imported profile
  AND the system SHALL return the new profile with HTTP 201
```

**Scenario: Import invalid JSON**

```
GIVEN a user uploads a file that is not valid JSON
WHEN a client sends POST /api/profiles/import
THEN the system SHALL return HTTP 400 with error "Invalid JSON"
```

**Scenario: Import JSON missing required fields**

```
GIVEN a user uploads valid JSON that lacks the "name" or "config" field
WHEN a client sends POST /api/profiles/import
THEN the system SHALL return HTTP 400 with error indicating the missing field
```

### REQ-6: Persistence

The system MUST persist profiles across server restarts.

**Scenario: Persistence across restart**

```
GIVEN five profiles are stored in data/profiles.json
WHEN the server process restarts
THEN the ProfileStore SHALL load all five profiles from disk on construction
  AND all profile data SHALL be intact and accessible via the API
```

**Scenario: Missing persistence file**

```
GIVEN data/profiles.json does not exist
WHEN the server starts
THEN the ProfileStore SHALL initialise with an empty profile list
  AND the system SHALL create data/profiles.json on the first write operation
```

## Design

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Hono Server                           │
│                                                              │
│  ┌─────────────────┐   ┌──────────────┐                     │
│  │  Profile Routes  │──▶│ ProfileStore │──▶ data/profiles.json│
│  │  /api/profiles   │   │ (in-memory   │                     │
│  └──────┬──────────┘   │  + persist)  │                     │
│         │              └──────────────┘                     │
│         │                                                    │
│  ┌──────▼──────────┐   ┌──────────────┐                     │
│  │  Profile Diff    │   │ Device Store │                     │
│  │  Engine          │   │ (lookup for  │                     │
│  └─────────────────┘   │  capture/    │                     │
│                         │  apply)     │                     │
│  ┌─────────────────┐   └──────┬───────┘                     │
│  │  C64 Client      │◀────────┘                              │
│  │  (config fetch/  │                                        │
│  │   config write)  │                                        │
│  └─────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
```

**Module responsibilities:**

| Module | File (proposed) | Role |
|--------|-----------------|------|
| Profile Routes | `src/server/routes/profiles.ts` | HTTP API — CRUD, capture, apply, diff, export, import |
| ProfileStore | `src/server/lib/profile-store.ts` | In-memory Map + JSON file persistence (same pattern as DeviceStore) |
| Profile Diff | `src/server/lib/profile-diff.ts` | Pure-function diff engine comparing two config maps |
| C64 Client | `src/server/lib/c64-client.ts` | Existing module — fetches config categories and items from devices |
| Device Store | `src/server/lib/device-store.ts` | Existing module — device lookup for capture/apply operations |
| Shared Types | `src/shared/types.ts` | ConfigProfile, ConfigDiff, and related interfaces |

### Data Models

#### ConfigProfile

```typescript
interface ConfigProfile {
  id: string              // Generated unique ID (e.g., nanoid)
  name: string            // User-assigned name, REQUIRED
  description?: string    // Optional free-text description
  deviceProduct?: string  // Device model captured from: "Ultimate 64", "Ultimate II+", etc.
  config: Record<string, Record<string, string | number>>
                          // category name → { item name → current value }
  createdAt: string       // ISO 8601 timestamp
  updatedAt: string       // ISO 8601 timestamp
}
```

The `config` field mirrors the structure returned by `GET /v1/configs/<category>` on the device, flattened into a single map keyed by category name. Example:

```json
{
  "Drive A Settings": {
    "Drive": "Enabled",
    "Drive Type": "1541",
    "Drive Bus ID": 8
  },
  "Audio Mixer": {
    "Volume Left": 8,
    "Volume Right": 8
  }
}
```

#### ConfigDiff

```typescript
interface ConfigDiff {
  changes: Array<{
    category: string
    item: string
    left: string | number
    right: string | number
  }>
  leftOnly: Array<{
    category: string
    item: string
    value: string | number
  }>
  rightOnly: Array<{
    category: string
    item: string
    value: string | number
  }>
  identical: number       // Count of items with identical values on both sides
}
```

- `changes` — items present in both profiles but with different values
- `leftOnly` — items present only in the left (source) profile
- `rightOnly` — items present only in the right (comparison) profile
- `identical` — count of items with matching values (not enumerated for brevity)

#### CreateProfileRequest

```typescript
interface CreateProfileRequest {
  name: string
  description?: string
  deviceProduct?: string
  config: Record<string, Record<string, string | number>>
}
```

#### CaptureProfileRequest

```typescript
interface CaptureProfileRequest {
  deviceId: string
  name: string
  description?: string
}
```

#### ApplyProfileRequest

```typescript
interface ApplyProfileRequest {
  deviceId: string
  saveToFlash?: boolean   // Default: false
}
```

#### ApplyProfileResponse

```typescript
interface ApplyProfileResponse {
  applied: boolean
  categoriesApplied: string[]
  savedToFlash: boolean
}
```

### API Surface

All endpoints are under `/api/profiles`. NOT YET IMPLEMENTED.

#### `GET /api/profiles`

List all stored profiles.

- **Response:** `200` — `ConfigProfile[]`

#### `POST /api/profiles`

Create a new profile from a provided config map.

- **Request body:** `CreateProfileRequest`
- **Response:**
  - `201` — created `ConfigProfile`
  - `400` — missing `name` or `config` field

#### `GET /api/profiles/:id`

Get a single profile by ID.

- **Response:**
  - `200` — `ConfigProfile`
  - `404` — `{ error: "Profile not found" }`

#### `PUT /api/profiles/:id`

Update mutable profile fields (name, description, deviceProduct, config).

- **Request body:** Partial `ConfigProfile` (any subset of mutable fields)
- **Response:**
  - `200` — updated `ConfigProfile`
  - `404` — `{ error: "Profile not found" }`

#### `DELETE /api/profiles/:id`

Delete a profile.

- **Response:**
  - `200` — `{ ok: true }`
  - `404` — `{ error: "Profile not found" }`

#### `POST /api/profiles/capture`

Capture a device's live configuration into a new profile.

- **Request body:** `CaptureProfileRequest`
- **Response:**
  - `201` — created `ConfigProfile` with full config from device
  - `400` — missing `deviceId` or `name`
  - `404` — device not found in registry
  - `502` — device is offline or unreachable

#### `POST /api/profiles/:id/apply`

Apply a profile's configuration to a target device.

- **Request body:** `ApplyProfileRequest`
- **Response:**
  - `200` — `ApplyProfileResponse`
  - `404` — profile or device not found
  - `502` — device is offline or unreachable

#### `GET /api/profiles/:id/diff`

Compare a profile against another profile or a live device.

- **Query parameters** (exactly one REQUIRED):
  - `against` — ID of another profile to compare against
  - `deviceId` — ID of a registered device to compare live config against
- **Response:**
  - `200` — `ConfigDiff`
  - `400` — neither `against` nor `deviceId` provided
  - `404` — source profile, comparison profile, or device not found
  - `502` — device is offline (when using `deviceId`)

#### `GET /api/profiles/:id/export`

Download a profile as a JSON file.

- **Response:**
  - `200` — JSON file with `Content-Disposition: attachment; filename="<profile-name>.json"`
  - `404` — profile not found

#### `POST /api/profiles/import`

Upload a JSON file to create a new profile.

- **Request body:** JSON file (the `ConfigProfile` structure; `id`, `createdAt`, `updatedAt` are ignored/regenerated)
- **Response:**
  - `201` — created `ConfigProfile`
  - `400` — invalid JSON or missing required fields (`name`, `config`)

### UI Components

NOT YET IMPLEMENTED. All UI follows the C64 aesthetic described in `CLAUDE.md`.

#### Profile Manager Page (`/profiles`)

The primary page for managing config profiles. Accessible from main navigation.

| Component | Purpose |
|-----------|---------|
| **Profile List** | Table showing all profiles: NAME, DESCRIPTION, DEVICE TYPE, CREATED, ACTIONS |
| **Create/Capture Section** | Two actions: CREATE (manual JSON) and CAPTURE (select device, enter name) |
| **Action Buttons** | Per-profile: APPLY, DIFF, EXPORT, DELETE |
| **Import Button** | Global action to upload a JSON file |

#### Capture Dialog

Triggered by the CAPTURE button. Steps:

1. Select a device from a dropdown of registered online devices
2. Enter a profile name (required) and optional description
3. Confirm — shows a PETSCII spinner while fetching config from device
4. On success: navigates to the new profile or shows confirmation

#### Apply Dialog

Triggered by the APPLY button on a profile row. Steps:

1. Select a target device from a dropdown of registered online devices
2. System fetches a live diff (profile vs device) and shows it in the diff viewer
3. User reviews changes and optionally checks "SAVE TO FLASH"
4. Confirm — applies config and shows result summary

#### Diff Viewer

A side-by-side comparison view showing config differences. Used both standalone (compare two profiles) and as part of the apply confirmation flow.

| Section | Display |
|---------|---------|
| **Changed items** | Two columns: LEFT value and RIGHT value, with the changed value highlighted in reverse video |
| **Left-only items** | Items present only in the left profile, displayed in a distinct color |
| **Right-only items** | Items present only in the right profile, displayed in a distinct color |
| **Summary bar** | "X CHANGED, Y LEFT ONLY, Z RIGHT ONLY, N IDENTICAL" |

Items are grouped by category. Each category header is a PETSCII box-drawn section divider.

#### React Hooks (proposed: `src/client/hooks/use-profiles.ts`)

| Hook | Purpose |
|------|---------|
| `useProfiles()` | TanStack Query — query key `["profiles"]`, calls `GET /api/profiles` |
| `useProfile(id)` | TanStack Query — query key `["profiles", id]`, calls `GET /api/profiles/:id` |
| `useCaptureProfile()` | Mutation — calls `POST /api/profiles/capture`, invalidates `["profiles"]` |
| `useApplyProfile()` | Mutation — calls `POST /api/profiles/:id/apply` |
| `useProfileDiff(id, params)` | TanStack Query — calls `GET /api/profiles/:id/diff` with query params |
| `useCreateProfile()` | Mutation — calls `POST /api/profiles`, invalidates `["profiles"]` |
| `useUpdateProfile()` | Mutation — calls `PUT /api/profiles/:id`, invalidates `["profiles"]` |
| `useDeleteProfile()` | Mutation — calls `DELETE /api/profiles/:id`, invalidates `["profiles"]` |
| `useImportProfile()` | Mutation — calls `POST /api/profiles/import`, invalidates `["profiles"]` |

### Business Logic

#### Capture Flow

1. Look up device in DeviceStore by `deviceId`. Return 404 if not found.
2. Check device is online. Return 502 if offline.
3. Fetch `GET /v1/configs` from device (via API proxy or direct c64Fetch). Parse the `categories` array.
4. For each category name, fetch `GET /v1/configs/<category>`. Parse the response to extract `{ itemName: value }` pairs.
5. Assemble the full config map: `{ categoryName: { itemName: value, ... }, ... }`.
6. Create a new `ConfigProfile` with generated ID, the provided name and description, `deviceProduct` from the device's registered product field, and the assembled config map.
7. Persist to ProfileStore.
8. Return the new profile.

**Error handling:** If any individual category fetch fails, the capture SHOULD still succeed with the categories that were fetched. The response MAY include a `warnings` array listing categories that could not be read.

#### Apply Flow

1. Look up profile in ProfileStore by `:id`. Return 404 if not found.
2. Look up device in DeviceStore by `deviceId`. Return 404 if not found.
3. Check device is online. Return 502 if offline.
4. Send `POST /v1/configs` to the device with the profile's `config` map as the JSON body. This performs a bulk config write.
5. If `saveToFlash` is true, send `PUT /v1/configs:save_to_flash` to persist changes in non-volatile memory on the device.
6. Return `ApplyProfileResponse` with the list of applied categories and flash-save status.

**Error handling:** If the bulk config write returns errors (non-empty `errors` array in response), the system SHOULD return HTTP 502 with the device's error messages. If `save_to_flash` fails after a successful config write, the response SHOULD indicate partial success.

#### Diff Algorithm

The diff engine is a pure function: `computeDiff(left: ConfigMap, right: ConfigMap): ConfigDiff`.

1. Collect all unique `(category, item)` pairs across both config maps.
2. For each pair:
   - Present in both with **different** values → add to `changes`
   - Present in both with **same** value → increment `identical` counter
   - Present only in left → add to `leftOnly`
   - Present only in right → add to `rightOnly`
3. Return the assembled `ConfigDiff`.

Comparison uses strict equality (`===`). Numeric values are compared as numbers; string values are compared as strings.

#### Persistence Strategy

- **Storage format:** JSON array of `ConfigProfile` objects in `data/profiles.json`.
- **Load:** On `ProfileStore` construction; silently starts empty if file is missing or corrupt.
- **Write:** Synchronous `writeFileSync` on every mutation (create, update, delete).
- **Pattern:** Same implementation pattern as `DeviceStore`, `MacroStore`, `PlaylistStore`, and `CollectionStore`.

#### ID Generation

Profile IDs SHOULD be generated using `nanoid` or a similar compact unique ID generator, consistent with the ID generation pattern used in other stores in the codebase.

### File Structure (Proposed)

```
src/server/
├── lib/
│   ├── profile-store.ts          # ProfileStore: in-memory Map + JSON persistence
│   └── profile-diff.ts           # computeDiff() pure function
├── routes/
│   └── profiles.ts               # All /api/profiles/* route handlers

src/client/
├── routes/
│   └── profiles/
│       └── index.tsx             # Profile manager page
├── components/
│   └── profile/
│       ├── profile-list.tsx      # Profile table with actions
│       ├── capture-dialog.tsx    # Device selection + name input
│       ├── apply-dialog.tsx      # Target device + diff preview + confirm
│       └── diff-viewer.tsx       # Side-by-side config comparison
├── hooks/
│   └── use-profiles.ts           # TanStack Query hooks for profile API

src/shared/
└── types.ts                      # ConfigProfile, ConfigDiff, request/response types
```

## Constraints

1. **Full capture only.** Profiles MUST capture the entire configuration tree. Partial captures (specific categories only) are NOT supported in the initial implementation.
2. **No cross-device validation.** The system SHALL NOT validate that a profile captured from an "Ultimate 64" is compatible with an "Ultimate II+" before applying. Config items that do not exist on the target device will be silently ignored by the device's bulk config endpoint.
3. **Config structure varies.** Different device products and firmware versions expose different categories and items. Profiles captured on one firmware version MAY contain items that do not exist on a device running a different version.
4. **Read-only items.** Some config items reported by `GET /v1/configs/<category>` may be read-only on the device. Attempting to set them via `POST /v1/configs` will result in a device-level error for that item. The system SHOULD NOT pre-filter read-only items during capture (they are informational).
5. **save_to_flash is user-controlled.** The system MUST NOT automatically save to flash after applying a profile. The `saveToFlash` flag MUST default to `false` and MUST require explicit user opt-in.
6. **No authentication.** This is a homelab tool. There are no multi-user or access-control considerations for profiles. Any user can create, modify, delete, apply, or export any profile.
7. **Single JSON file persistence.** Profiles are stored in a single `data/profiles.json` file. No external database is required.
8. **Config values are opaque.** The system stores config values as `string | number` without interpreting their meaning. It does not validate value ranges or option constraints — that is the device's responsibility.
9. **Network timeouts.** Config capture fetches multiple categories sequentially. Each category fetch SHOULD use the same timeout as other C64 client operations (2-5 seconds). A device with many categories may take 10-30 seconds to fully capture.
10. **Import trust.** Imported JSON files are not cryptographically verified. The system validates structural correctness (required fields, correct types) but does not verify that config values are valid for any particular device.

## Open Questions

1. **Partial capture on error.** If one category fetch fails during capture (e.g., transient network error), should the system save a partial profile with a warning, or fail the entire capture? The current spec recommends partial capture with warnings.
2. **Apply conflict resolution.** When applying a profile, if certain items fail to set on the device (e.g., read-only items, items that no longer exist), should the response enumerate each failed item or only report a bulk success/failure?
3. **Profile versioning.** Should the system track a version number on profiles to detect when a profile was captured from a different firmware version than the target device? This could be useful for warning users about potential incompatibilities.
4. **Category filtering in UI.** Should the diff viewer allow filtering by category to reduce noise when comparing profiles with many categories?
5. **Automatic profile naming.** When capturing, should the system suggest a default name based on the device name and timestamp (e.g., "Ultimate 64 - 2026-04-16 14:30")?
6. **Profile templates.** Should the system support creating "template" profiles that only contain a subset of categories, allowing users to create focused profiles (e.g., "Audio Settings Only")?
7. **Bulk apply results.** The C64U `POST /v1/configs` endpoint returns a response — does it enumerate per-item success/failure, or only report aggregate errors? This affects how detailed the apply response can be.

## References

- [Device Management](../device-management/) — device registry, DeviceStore, and health checking
- [API Proxy](../api-proxy/) — proxy layer between this server and C64U device HTTP APIs
- [Architecture](../architecture/) — overall system architecture and module boundaries
- [Archived spec: 0007 — Settings & Admin](../archive/0007-settings-and-admin.md) — original implementation spec containing config profiles and auth (config profiles portion extracted into this living spec)
- [C64 Ultimate REST API Reference](../../c64.md) — full device API documentation, especially the Configuration section
- C64U Config API: `GET /v1/configs`, `GET /v1/configs/<category>`, `PUT /v1/configs/<category>/<item>`, `POST /v1/configs`, `PUT /v1/configs:save_to_flash`

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | — |
