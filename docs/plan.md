# C64 Ultimate Web Interface — Plan

Analysis of the existing [c64u-control-panel](https://github.com/EdyJ/c64u-control-panel) and design notes for our proxy API and modernized web interface.

---

## Technology Stack

### Runtime & Server

| Layer | Technology | Version | Role |
| ----- | ---------- | ------- | ---- |
| Runtime | **Bun** | latest | JavaScript/TypeScript runtime |
| Server | **Hono** | 4.x | API routes, proxy passthrough, SSE streams |
| Dev server | **@hono/vite-dev-server** | 0.25.x | Replaces Vite's dev server with Hono (same port, same process) |
| Build | **@hono/vite-build** | 1.10.x | Compiles Hono server for Bun production target |
| Bundler | **Vite** | 8.x | Dev server, HMR, production builds |

### Frontend

| Layer | Technology | Version | Role |
| ----- | ---------- | ------- | ---- |
| UI framework | **React** | 19.x | SPA frontend |
| Component primitives | **@base-ui/react** | 1.x | Unstyled accessible components (replaces Radix) |
| Component library | **shadcn/ui v4** | 4.x | Copy-paste components using Base UI base |
| Styling | **Tailwind CSS** | 4.x | Utility-first CSS |
| SPA routing | **TanStack Router** | 1.x | Client-side file-based routing (not TanStack Start) |
| Data fetching | **TanStack Query** | 5.x | Server state, caching, SSE stream management |
| API client | **Hono RPC** (`hc`) | — | End-to-end type-safe API calls from React to Hono |

### Architecture Pattern

Single-project Hono + Vite SPA. Hono serves both the API and the static React build from a single process on a single port.

```
┌─────────────────────────────────────────────────┐
│                   Hono Server                    │
│                                                  │
│  /api/devices/:id/v1/*  → proxy to C64U device  │
│  /api/events            → SSE stream            │
│  /api/...               → proxy API routes      │
│  /*                     → React SPA (static)    │
└─────────────────────────────────────────────────┘
```

**Dev:** Single `vite` command. `@hono/vite-dev-server` replaces Vite's server with Hono — React gets full HMR, API routes work on the same port, `streamSSE()` works natively (no proxy in the way).

**Prod:** `vite build --mode client && vite build` → single `bun dist/index.js` serving everything.

### Key Dependencies

```
# Server
hono
@hono/vite-dev-server
@hono/vite-build

# Frontend
react, react-dom
@base-ui/react
@tanstack/react-router
@tanstack/router-vite-plugin
@tanstack/react-query
tailwindcss

# Utilities
basic-ftp              # FTP file browsing on C64U devices
```

### Design Decisions

- **shadcn/ui v4 with Base UI base** — Using the `base` foundation (not `radix`). Base UI (`@base-ui/react`) provides unstyled, accessible primitives. shadcn v4 offers multiple styles for the Base UI base (lyra, nova, maia). Some components may not yet have Base UI equivalents (Toast, Drawer) — fall back to custom implementations where needed.

- **Hono RPC for type safety** — The `hc` client infers types directly from Hono route definitions. No code generation, no separate schema files. Shared types naturally within the same project.

- **SSE over WebSocket** — Server-Sent Events for device state push. Simpler than WebSocket for server-to-client unidirectional updates. Hono's `streamSSE()` works without issues in both dev (through `@hono/vite-dev-server`) and production. WebSocket has known dev-mode conflicts with Vite's HMR WebSocket.

- **TanStack Router (client-only)** — Full-stack SSR is unnecessary for a LAN tool. Client-side file-based routing with type-safe route params. No TanStack Start dependency.

- **FTP risk on Bun** — `basic-ftp` has a reported Bun compatibility issue (oven-sh/bun#10947). If it fails, Hono can run on Node.js with zero code changes as a fallback.

---

## Control Panel Analysis

The c64u-control-panel by Angel "Edy" Garcia is the most complete existing web UI for the C64 Ultimate API. Key observations:

### Architecture

- **Vanilla HTML/CSS/JS + jQuery** — no framework, no build step
- Designed to run **directly on the C64U device** (copied to `/Flash/html`)
- Single `api-client.js` handles all REST calls with a global busy-state mutex
- Each tool is a separate HTML page (config_tool, drives_tool, disk_flip, streams_tool, memory_tool)
- Dark theme with CSS custom properties, Material Symbols icons

### Features Implemented

| Tool              | Capabilities                                                          |
| ----------------- | --------------------------------------------------------------------- |
| Control Panel     | System info, machine control (reset/reboot/pause/poweroff), media players (SID/MOD), program runners (PRG/CRT), file utilities (info, create D64) |
| Configuration     | Browse all 17 categories, search/filter, edit values, save/load/reset flash |
| Floppy Drives     | Mount images (path or upload), set mode, load ROM, reset/remove/on/off |
| Disk Flip         | Quick-mount presets for multi-disk games, saved configurations in localStorage |
| Data Streams      | Start/stop video/audio/debug streams with IP/port config              |
| Memory Browser    | Hex viewer/editor, 6502 disassembler with edit, screen memory viewer  |

### Limitations & Improvement Opportunities

1. **No state synchronization** — The UI doesn't poll or subscribe to device state changes. After mounting a disk externally, the UI is stale until manually refreshed.

2. **Single-device only** — No concept of managing multiple C64U devices on a network.

3. **No file browser** — Files must be specified by path. There's no browsing of the device's filesystem (the API's file info endpoint is unfinished, but FTP access exists).

4. **No persistent server-side state** — Everything runs client-side. Disk flip configs, stream settings, and preferences are in localStorage. No shareable state, no mobile sync.

5. **No CORS / cross-origin support** — The C64U HTTP server doesn't set CORS headers, so the UI must be served from the device itself.

6. **jQuery dependency** — Uses jQuery 3.7.1 loaded from CDN, which requires internet access on the device's network. Could break if CDN is unavailable.

7. **No keyboard shortcut discovery** — The memory browser has extensive keyboard shortcuts documented in separate markdown files but no in-app help overlay.

8. **No batch operations** — Can't queue up multiple disk mounts, program loads, or config changes as a workflow.

9. **No automation / scripting** — No way to define macros or scripts (e.g., "mount disk A, run PRG, set border color").

10. **No WebSocket / real-time** — The native API is pure REST with no push mechanism.

---

## Proxy API Design Notes

### Should We Build a Proxy?

**Yes.** A proxy/wrapper API sitting between the web UI and the C64U device solves several real problems:

#### Problems Solved by a Proxy

| Problem                          | Proxy Solution                                                      |
| -------------------------------- | ------------------------------------------------------------------- |
| **CORS restrictions**            | Proxy serves both the UI and API from the same origin               |
| **No state sync**                | Proxy can poll the device and push updates to clients via SSE      |
| **Single-device limitation**     | Proxy can manage multiple C64U devices, route requests by device ID |
| **No file browser**              | Proxy can use FTP to browse device filesystem and expose it as REST |
| **No persistent state**          | Proxy stores configs, presets, playlists, and history server-side   |
| **No authentication beyond password** | Proxy can add proper auth (sessions, tokens, RBAC)          |
| **No batch/automation**          | Proxy can implement workflow engine, macros, scripted sequences     |
| **No real-time updates**         | Proxy bridges REST polling into SSE push                            |
| **CDN dependency for jQuery**    | Modern UI served from proxy, no external dependencies needed        |

#### Proposed Proxy Architecture

```
┌──────────────┐      SSE/REST           ┌─────────────┐      REST/FTP       ┌─────────────┐
│   Browser    │ ◄──────────────────────► │   Hono      │ ◄────────────────► │  C64U #1    │
│ (React SPA)  │                          │   Proxy     │                     │  (device)   │
└──────────────┘                          │             │      REST/FTP       ┌─────────────┐
                                          │             │ ◄────────────────► │  C64U #2    │
                                          └─────────────┘                     │  (device)   │
                                                                              └─────────────┘
```

### Recommended First Use-Cases

Based on what the control panel already does well and where the biggest gaps are:

#### Phase 1 — Core Proxy + Modernized UI

1. **Device discovery & management** — Auto-discover C64U devices on the network (mDNS/scan), register them, health-check them.

2. **Transparent API proxy** — Forward all `/v1/*` calls to the target device, adding CORS headers. This immediately unblocks running the UI from anywhere.

3. **Real-time device state** — Poll device info, drive status, and config periodically. Push changes to the browser via SSE. Show live status indicators.

4. **File browser via FTP** — The C64U exposes an FTP server. The proxy can connect via FTP and expose a REST file browsing API. This enables a proper file picker for mounting disks, running programs, etc.

#### Phase 2 — Enhanced Workflows

5. **Disk flip collections** — Server-side storage of multi-disk game configurations, shareable between devices/browsers.

6. **Automation / macros** — Define sequences: "Mount game disk 1, run PRG, wait for keypress, mount disk 2". Execute via a single button.

7. **SID/MOD jukebox** — Browse device's music collection, build playlists, queue playback.

8. **Configuration profiles** — Save/restore named device configuration snapshots. Compare configs between devices.

#### Phase 3 — Advanced Features

9. **Memory tools** — Keep the hex viewer/disassembler but add: memory snapshots, diff between snapshots, symbol tables, VICE label file import.

10. **Stream viewer** — Receive and display the U64's video/audio streams directly in the browser (requires UDP relay or WebRTC bridge).

11. **Multi-user / remote access** — Proper auth, remote access over the internet via the proxy, audit logging.

### API Design Principles

For the proxy's own API layer:

- **Superset, not replacement** — Every native C64U endpoint should be accessible through the proxy transparently (`/api/devices/:id/v1/*`)
- **Typed responses** — Add TypeScript-friendly response schemas with proper types (the native API is loosely typed)
- **Idempotent discovery** — Device registration should be idempotent and self-healing
- **Event-driven** — SSE channel per device for real-time state changes
- **Backward compatible** — If someone points the control panel directly at the proxy, it should work without modification (transparent passthrough mode)
