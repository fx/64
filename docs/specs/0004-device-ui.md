# 0004 — Device UI: Setup, Dashboard & Disk Upload

## Overview

The first functional UI for the C64 Ultimate proxy. Lets a user register a device by IP, see its live status (firmware, drives, online indicator), and upload .d64 disk images from their local machine to mount on the device. All backend APIs already exist (specs 0001-0003) — this spec is purely frontend + the minimal "upload and mount" endpoint.

## Background

Specs 0001-0003 built the server: Hono with device registry, health-checking, SSE events, and a transparent proxy to C64U devices. The React SPA currently shows only a static "COMMODORE 64 BASIC V2" welcome screen. There is no way to interact with actual devices yet. This spec bridges that gap with the minimum viable UI.

## Goals

- **Device setup page** — form to register a C64U device by IP address
- **Device list** — show all registered devices with online/offline status
- **Device dashboard** — detailed view of a single device: info, firmware, drive status, machine controls
- **Upload & mount** — drag-drop or file picker to upload a .d64/.d71/.d81/.g64 from the user's local machine and mount it on a drive
- **Machine controls** — reset, reboot, pause/resume buttons
- **SPA routing** — TanStack Router pages: `/` (device list), `/devices/:id` (dashboard)

## Non-Goals

- Real-time SSE polling (spec 0005 — this spec uses on-demand fetch + manual refresh)
- File browser for device filesystem (spec 0005)
- Disk flip collections, macros, playlists (spec 0006)
- Configuration editor (spec 0007)
- Network subnet scanning UI (the API exists, but manual IP entry is sufficient for now)

## Technical Design

### New Routes

| Path | Component | Description |
| --- | --- | --- |
| `/` | `DeviceListPage` | List registered devices, add new device form |
| `/devices/$deviceId` | `DeviceDashboardPage` | Device info, drives, controls, upload |

### Device List Page (`/`)

Replaces the current welcome screen. Shows:

1. **Header:** "C64 ULTIMATE CONTROL" in a PETSCII box
2. **Device list:** Table/list of registered devices showing:
   - Name (or hostname)
   - IP address
   - Product type (Ultimate 64, UII+, etc.)
   - Online/offline indicator (green/red block character)
   - "OPEN" button to navigate to dashboard
   - "DELETE" button to remove device
3. **Add device form:** IP address input field + optional name + optional password + "REGISTER" button
4. **Refresh button:** Re-fetches device list

All styled with C64 aesthetic: PETSCII borders, inverse-video buttons, uppercase labels, C64 color palette.

### Device Dashboard Page (`/devices/$deviceId`)

Shows detailed status for a single device:

#### Info Panel
- Product name, firmware version, FPGA version, hostname
- Online/offline status with last-seen timestamp
- Device unique ID

#### Drive Status Panel
- Drive A and Drive B status
- For each drive: enabled/disabled, type (1541/1571/1581), bus ID
- Currently mounted image (filename + path) or "NO DISK"
- "REMOVE DISK" button per drive

#### Machine Controls Panel
- "RESET" button → `PUT /v1/machine:reset`
- "REBOOT" button → `PUT /v1/machine:reboot`
- "PAUSE" / "RESUME" toggle → `PUT /v1/machine:pause` / `PUT /v1/machine:resume`
- "POWER OFF" button (with confirmation) → `PUT /v1/machine:poweroff`
- "MENU" button → `PUT /v1/machine:menu_button`

#### Upload & Mount Panel
- Drive selector: A or B
- Mount mode selector: readwrite / readonly / unlinked
- File drop zone / file picker button — accepts `.d64`, `.d71`, `.d81`, `.g64`, `.g71`
- On file selected: immediately uploads to `POST /api/devices/:id/v1/drives/<drive>:mount` with the binary body
- Shows success/error feedback
- Also: text input for mounting by path on device (for files already on the device)

### API Usage

All existing APIs — no new backend endpoints needed except one:

**New endpoint for upload-and-mount:**
```
POST /api/devices/:deviceId/upload-mount
```
- Accepts multipart form: file binary + drive (a/b) + mode (readwrite/readonly/unlinked)
- Forwards the file to `POST /v1/drives/<drive>:mount` on the device with correct content-type
- Returns the mount result

**Existing APIs used:**
- `GET /api/devices` — list devices
- `POST /api/devices` — register device
- `DELETE /api/devices/:id` — remove device
- `GET /api/devices/:id/v1/info` — device info
- `GET /api/devices/:id/v1/drives` — drive status
- `PUT /api/devices/:id/v1/machine:reset` — reset
- `PUT /api/devices/:id/v1/machine:reboot` — reboot
- `PUT /api/devices/:id/v1/machine:pause` — pause
- `PUT /api/devices/:id/v1/machine:resume` — resume
- `PUT /api/devices/:id/v1/machine:poweroff` — power off
- `PUT /api/devices/:id/v1/machine:menu_button` — menu
- `PUT /api/devices/:id/v1/drives/<drive>:mount?image=<path>` — mount by path
- `PUT /api/devices/:id/v1/drives/<drive>:remove` — remove disk

### TanStack Query Hooks

```typescript
// Device list
useQuery({ queryKey: ['devices'], queryFn: () => api.devices.$get() })

// Single device info
useQuery({ queryKey: ['devices', id, 'info'], queryFn: () => api.devices[':deviceId'].v1.info.$get(...) })

// Drive status
useQuery({ queryKey: ['devices', id, 'drives'], queryFn: () => api.devices[':deviceId'].v1.drives.$get(...) })
```

Mutations for register, delete, reset, mount, etc. use `useMutation` with `queryClient.invalidateQueries` on success.

### C64 UI Components Needed

All components follow CLAUDE.md design rules (PETSCII borders, inverse buttons, C64 palette, no border-radius).

| Component | Description |
| --- | --- |
| `C64Input` | Text input with C64 styling (underscore cursor, inverse on focus) |
| `C64Button` | Inverse-video button (extends existing `.c64-button` class) |
| `C64Select` | Dropdown/selector with C64 styling |
| `C64Table` | Data table with PETSCII borders |
| `C64StatusBadge` | Online (green block) / Offline (red block) indicator |
| `C64FileDropZone` | Drag-and-drop area with PETSCII border, file type validation |
| `C64Toast` | Success/error notification bar (bottom of screen, auto-dismiss) |

### File Structure

```
src/client/
├── routes/
│   ├── index.tsx                    # Device list page (replaces welcome screen)
│   └── devices/
│       └── $deviceId.tsx            # Device dashboard page
├── components/
│   ├── ui/
│   │   ├── c64-box.tsx              # (existing) PETSCII bordered panel
│   │   ├── c64-input.tsx            # Text input
│   │   ├── c64-button.tsx           # Inverse-video button
│   │   ├── c64-select.tsx           # Dropdown selector
│   │   ├── c64-table.tsx            # Data table
│   │   ├── c64-status-badge.tsx     # Online/offline indicator
│   │   ├── c64-file-drop-zone.tsx   # Drag-and-drop file upload
│   │   └── c64-toast.tsx            # Notification bar
│   └── device/
│       ├── device-list.tsx          # Device list with add form
│       ├── device-info-panel.tsx    # Device info display
│       ├── drive-status-panel.tsx   # Drive A/B status
│       ├── machine-controls.tsx     # Reset/reboot/pause buttons
│       └── upload-mount-panel.tsx   # File upload + mount
├── hooks/
│   ├── use-devices.ts              # TanStack Query hooks for device CRUD
│   ├── use-device-info.ts          # Fetch device info + drives
│   └── use-device-actions.ts       # Mutations for machine controls + mount
```

## Acceptance Criteria

- [ ] `/` shows list of registered devices with online/offline status
- [ ] Add device form registers a new device by IP
- [ ] `/devices/:id` shows device info (product, firmware, hostname)
- [ ] Drive status panel shows drive A/B with mounted image or "NO DISK"
- [ ] Machine control buttons work (reset, reboot, pause, resume)
- [ ] File upload mounts a .d64 on the selected drive
- [ ] Mount-by-path input mounts a disk image from device filesystem
- [ ] Remove disk button unmounts from a drive
- [ ] All UI follows C64 aesthetic (PETSCII borders, inverse buttons, C64 palette)
- [ ] Error states display clearly (device offline, mount failed, etc.)

## Tasks

- [x] Build C64-styled UI primitive components
  - [x] `C64Input` — text input with underscore cursor, inverse on focus, C64 palette
  - [x] `C64Button` — inverse-video button component (extends existing `.c64-button`)
  - [x] `C64Select` — dropdown selector with C64 styling
  - [x] `C64Table` — data table with PETSCII borders
  - [x] `C64StatusBadge` — online (green block) / offline (red block) indicator
  - [x] `C64FileDropZone` — drag-and-drop area with PETSCII border, file type validation (.d64/.d71/.d81/.g64/.g71)
  - [x] `C64Toast` — success/error notification bar (bottom of screen, auto-dismiss)
- [x] Build device list page (replace current welcome screen at `/`)
  - [x] Device list showing name, IP, product type, online/offline badge, OPEN/DELETE buttons
  - [x] Add device form: IP input + optional name + optional password + REGISTER button
  - [x] Refresh button to re-fetch device list
  - [x] TanStack Query hooks: `useDevices()` for list, `useRegisterDevice()` mutation, `useDeleteDevice()` mutation
  - [x] Wire to existing APIs: `GET /api/devices`, `POST /api/devices`, `DELETE /api/devices/:id`
- [ ] Build device dashboard page at `/devices/$deviceId`
  - [ ] Create TanStack Router route `src/client/routes/devices/$deviceId.tsx`
  - [ ] Device info panel: product, firmware, FPGA, hostname, unique ID, online status, last seen
  - [ ] TanStack Query hooks: `useDeviceInfo(id)`, `useDriveStatus(id)`
  - [ ] Wire to: `GET /api/devices/:id/v1/info`, `GET /api/devices/:id/v1/drives`
- [ ] Build drive status panel on device dashboard
  - [ ] Show drive A and B: enabled/disabled, type, bus ID, mounted image or "NO DISK"
  - [ ] "REMOVE DISK" button per drive → `PUT /api/devices/:id/v1/drives/<drive>:remove`
- [ ] Build machine controls panel on device dashboard
  - [ ] RESET button → `PUT /v1/machine:reset`
  - [ ] REBOOT button → `PUT /v1/machine:reboot`
  - [ ] PAUSE / RESUME toggle → `PUT /v1/machine:pause` / `PUT /v1/machine:resume`
  - [ ] POWER OFF button (with confirmation dialog) → `PUT /v1/machine:poweroff`
  - [ ] MENU button → `PUT /v1/machine:menu_button`
  - [ ] `useDeviceActions(id)` hook with mutations for all machine controls
- [ ] Build upload-and-mount panel on device dashboard
  - [ ] Implement `POST /api/devices/:deviceId/upload-mount` server endpoint (multipart: file + drive + mode → forward to `POST /v1/drives/<drive>:mount`)
  - [ ] Drive selector (A/B) and mount mode selector (readwrite/readonly/unlinked)
  - [ ] File drop zone / file picker accepting `.d64`, `.d71`, `.d81`, `.g64`, `.g71`
  - [ ] On file selected: upload to server → mount on device → show success/error toast
  - [ ] Mount-by-path input: text field for path on device filesystem → `PUT /v1/drives/<drive>:mount?image=<path>`
  - [ ] Success/error feedback via C64Toast
