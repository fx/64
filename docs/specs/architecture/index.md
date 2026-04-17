# Architecture

## Overview

This specification describes the project-level architecture of the C64 Ultimate Web Interface: a single-process Hono + Vite 8 + React 19 SPA monolith that manages Commodore 64 Ultimate devices over a local network. One Bun process serves both API routes (under `/api/*`) and the React SPA, with full HMR in development and a single `bun dist/index.js` in production.

This document covers technology choices, directory layout, build and deployment workflow, runtime topology, and project conventions. It does NOT cover feature-level behavior; those are specified in their respective feature specs (see [References](#references)).

## Background

The C64 Ultimate product family (Ultimate 64, Ultimate II+, Ultimate II+L) exposes an HTTP/FTP interface for file management, drive control, and system queries. This web interface acts as a **centralized management console** for one or more Ultimate devices on a LAN, providing a browser-based UI styled as an authentic Commodore 64 experience.

The monolith architecture was chosen to minimize operational complexity: a single process, a single port, and zero external service dependencies. All state persists to local JSON files, and real-time updates flow via Server-Sent Events.

## Requirements

### REQ-1: Single-Process Monolith

The application MUST run as a single Bun process that serves both the API and the SPA.

```
GIVEN the production build has completed
WHEN a user runs `bun dist/index.js`
THEN the server starts on a single port serving API routes under /api/* and the SPA for all other paths
```

### REQ-2: Development Parity

Development and production MUST use the same routing topology and port. The dev server MUST provide HMR for client code and live-reload for server code.

```
GIVEN a developer runs `bun run dev`
WHEN they modify a React component in src/client/
THEN the browser reflects the change via HMR without a full page reload

GIVEN a developer runs `bun run dev`
WHEN they modify a Hono route in src/server/
THEN the server reloads and subsequent API requests use the updated handler
```

### REQ-3: Type-Safe API Communication

The client MUST use Hono RPC (`hc`) for API calls. Route types MUST be inferred from server definitions; manual type duplication MUST NOT occur.

```
GIVEN a Hono route defines a response shape
WHEN the client calls that route via the hc client
THEN TypeScript enforces the correct request parameters and response type at compile time
```

### REQ-4: JSON File Persistence

All application state MUST persist to JSON files in the `data/` directory. No external database is required.

```
GIVEN a device is registered via POST /api/devices
WHEN the server process restarts
THEN the device is still present in the device list (loaded from data/devices.json)
```

### REQ-5: C64 Design System Compliance

All UI rendering MUST conform to the C64 design system: C64 Pro Mono font, 16 VIC-II colors, PETSCII box-drawing borders, no border-radius, no gradients, no transparency.

```
GIVEN a UI component is rendered
WHEN inspected in the browser
THEN it uses only C64 Pro Mono font, VIC-II color palette variables, and sharp rectangular edges
```

### REQ-6: Background Health Monitoring

The server MUST run background health checks against registered devices and emit SSE events on status transitions.

```
GIVEN a registered device goes offline
WHEN the health checker detects the failure
THEN a device:offline SSE event is emitted and the device is marked offline in the store

GIVEN an offline device comes back online
WHEN the health checker detects connectivity
THEN a device:online SSE event is emitted and the device is marked online with updated lastSeen
```

### REQ-7: Build Reproducibility

The build process MUST produce deterministic output. Running `bun run build` MUST produce a `dist/` directory containing the server bundle (`dist/index.js`) and client assets (`dist/static/`).

```
GIVEN the source code is unchanged
WHEN `bun run build` is executed twice
THEN both runs produce functionally equivalent output in dist/
```

### REQ-8: Test Coverage

All code changes MUST include tests. The project MUST use `bun:test` as the sole test runner.

```
GIVEN a developer submits a PR
WHEN the test suite runs via `bun test`
THEN all tests pass and coverage meets the >=90% target for lines and functions
```

## Design

### Architecture

```
                    +-----------------------+
                    |       Browser         |
                    |  React 19 SPA         |
                    |  TanStack Router      |
                    |  TanStack Query v5    |
                    |  Hono RPC (hc)        |
                    +-----------+-----------+
                                |
                         HTTP / SSE
                                |
                    +-----------v-----------+
                    |     Bun Process       |
                    |  +-----------------+  |
                    |  |   Hono Server   |  |
                    |  |  /api/* routes  |  |
                    |  +--------+--------+  |
                    |           |            |
                    |  +--------v--------+  |
                    |  |     Stores      |  |
                    |  | DeviceStore     |  |
                    |  | MacroStore      |  |
                    |  | PlaylistStore   |  |
                    |  | CollectionStore |  |
                    |  +--------+--------+  |
                    |           |            |
                    |  +--------v--------+  |
                    |  |  data/*.json    |  |
                    |  +-----------------+  |
                    |                       |
                    |  +-----------------+  |
                    |  | Background      |  |
                    |  | HealthChecker   |  |
                    |  | DevicePoller    |  |
                    |  | MacroEngine     |  |
                    |  | PlaybackState   |  |
                    |  +-----------------+  |
                    +-----------+-----------+
                                |
                          HTTP / FTP
                                |
                    +-----------v-----------+
                    |  C64 Ultimate Devices |
                    |  (LAN, port 80)       |
                    +-----------------------+
```

The server process initializes in this order (see `src/server/index.ts`):

1. **Stores** are created: `DeviceStore`, `CollectionStore`, `MacroStore`, `PlaylistStore`. Each loads its JSON file on construction.
2. **Engines** are created: `MacroEngine`, `PlaybackStateManager`. These coordinate complex operations across stores and device communication.
3. **DevicePoller** is created, receiving the `DeviceStore`.
4. **Routes** are registered on the Hono app under `/api`: health, devices, events, upload-mount, files, collections, macros, playlists, proxy, library.
5. **CORS middleware** is applied to all `/api/*` requests.
6. **Background tasks** start: `startHealthChecker` (30s base interval with exponential backoff) and `poller.start()` (drives 5s, info 30s).
7. In **production** (`globalThis.Bun` detected): static file serving from `dist/` and SPA fallback are registered.

### Directory Structure

```
/
+-- src/
|   +-- server/                  # Hono server
|   |   +-- index.ts             # App entry, store/engine init, route registration
|   |   +-- routes/              # Route handlers (one file per domain)
|   |   |   +-- health.ts        # GET /api/health
|   |   |   +-- devices.ts       # Device CRUD + scan
|   |   |   +-- events.ts        # SSE endpoints (devices, state, macros, playback)
|   |   |   +-- upload-mount.ts  # Upload and mount operations
|   |   |   +-- files.ts         # File browser (FTP)
|   |   |   +-- collections.ts   # Disk collection management
|   |   |   +-- macros.ts        # Macro CRUD + execution
|   |   |   +-- playlists.ts     # Playlist CRUD + playback
|   |   |   +-- proxy.ts         # Transparent proxy to device HTTP API
|   |   |   +-- library.ts       # Local file library
|   |   +-- lib/                 # Business logic, stores, engines
|   |   |   +-- device-store.ts      # Device persistence (data/devices.json)
|   |   |   +-- collection-store.ts  # Collection persistence (data/collections.json)
|   |   |   +-- macro-store.ts       # Macro persistence (data/macros.json)
|   |   |   +-- playlist-store.ts    # Playlist persistence (data/playlists.json)
|   |   |   +-- macro-engine.ts      # Macro step execution engine
|   |   |   +-- playback-state.ts    # Jukebox playback state machine
|   |   |   +-- device-poller.ts     # Per-device drive/info polling with backoff
|   |   |   +-- health-checker.ts    # Background health check loop
|   |   |   +-- c64-client.ts        # HTTP client for C64 Ultimate device API
|   |   |   +-- ftp-pool.ts          # FTP connection pooling for file operations
|   |   |   +-- scanner.ts           # Subnet scanning for device discovery
|   |   |   +-- device-events.ts     # In-process event bus (device events)
|   |   |   +-- macro-events.ts      # In-process event bus (macro events)
|   |   |   +-- playback-events.ts   # In-process event bus (playback events)
|   |   |   +-- file-type.ts         # File extension classification
|   |   +-- middleware/
|   |       +-- cors.ts           # CORS headers (Allow-Origin: *)
|   +-- client/                   # React SPA
|   |   +-- main.tsx              # React entry point
|   |   +-- router.tsx            # TanStack Router configuration
|   |   +-- routeTree.gen.ts      # Auto-generated route tree (do not edit)
|   |   +-- routes/               # File-based route definitions
|   |   |   +-- __root.tsx        # Root layout
|   |   |   +-- index.tsx         # Home/dashboard
|   |   |   +-- devices/          # Device management pages
|   |   |   +-- collections/      # Collection pages
|   |   |   +-- macros/           # Macro pages
|   |   |   +-- playlists/        # Playlist/jukebox pages
|   |   +-- components/           # React components
|   |   |   +-- ui/               # Generic UI primitives (C64 styled)
|   |   |   +-- device/           # Device-specific components
|   |   |   +-- macro/            # Macro-specific components
|   |   +-- hooks/                # TanStack Query hooks
|   |   |   +-- use-devices.ts        # Device list queries
|   |   |   +-- use-device-info.ts    # Single device info
|   |   |   +-- use-device-actions.ts # Device mutations
|   |   |   +-- use-device-sse.ts     # SSE subscription hook
|   |   |   +-- use-file-browser.ts   # FTP file listing
|   |   |   +-- use-collections.ts    # Collection queries/mutations
|   |   |   +-- use-macros.ts         # Macro queries/mutations
|   |   |   +-- use-playback.ts       # Playback state queries
|   |   |   +-- use-local-games.ts    # Local library queries
|   |   +-- lib/                  # Client utilities
|   |   |   +-- api.ts            # Hono RPC client (hc<AppType>)
|   |   |   +-- query.ts          # TanStack Query client instance
|   |   |   +-- petscii.ts        # PETSCII rendering helpers
|   |   +-- styles/               # CSS
|   |       +-- app.css           # Tailwind import + app-level styles
|   |       +-- c64-palette.css   # 16 VIC-II color CSS variables
|   |       +-- c64-base.css      # Base element styles (font, body, focus)
|   |       +-- c64-components.css # Component-level C64 styles
|   +-- shared/                   # Types shared between server and client
|       +-- types.ts              # Device, DeviceRegistration, events, etc.
|       +-- c64u-types.ts         # C64 Ultimate device API response types
+-- tests/                        # bun:test test files
+-- data/                         # JSON persistence (gitignored except structure)
|   +-- devices.json
|   +-- macros.json
|   +-- playlists.json
|   +-- collections.json
|   +-- library/                  # Uploaded local library files
+-- public/
|   +-- fonts/                    # C64 Pro Mono font files (DO NOT rename/modify)
|   +-- favicon.ico
+-- docs/                         # Specifications and project docs
+-- dist/                         # Build output (gitignored)
|   +-- index.js                  # Server bundle
|   +-- static/                   # Client bundle (HTML, JS, CSS, assets)
+-- vite.config.ts                # Vite 8 build configuration
+-- tsconfig.json                 # TypeScript 6 strict config
+-- package.json                  # Scripts, dependencies
+-- index.html                    # SPA entry HTML
```

### Tech Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Runtime | Bun | latest | JavaScript/TypeScript runtime, package manager, test runner |
| Server framework | Hono | ^4.12 | Lightweight HTTP framework with RPC type inference |
| Client framework | React | ^19.2 | UI rendering |
| Client routing | TanStack Router | ^1.168 | File-based client-side routing |
| Client data | TanStack Query | ^5.95 | Server state management, caching, mutations |
| Styling | Tailwind CSS | ^4.2 | Utility-first CSS with C64 theme |
| UI primitives | Base UI (@base-ui-components/react) | ^1.0.0-rc | Unstyled accessible components |
| Build tool | Vite | ^8.0 | Dev server, HMR, production bundling |
| Dev integration | @hono/vite-dev-server | ^0.25 | Hono middleware inside Vite dev server |
| Production build | @hono/vite-build/bun | ^1.10 | Server bundle output for Bun |
| FTP | basic-ftp | ^5.2 | File operations on C64 Ultimate devices |
| Language | TypeScript | ^6.0 | Strict mode, path aliases |

### Data Models

This spec does not define feature-level data models. Each store persists a JSON array to disk:

| Store | File | Shape |
|-------|------|-------|
| `DeviceStore` | `data/devices.json` | `Device[]` |
| `MacroStore` | `data/macros.json` | `Macro[]` |
| `PlaylistStore` | `data/playlists.json` | `Playlist[]` |
| `CollectionStore` | `data/collections.json` | `Collection[]` |

All stores follow the same pattern:
- Constructor accepts an optional `dataPath` (defaults to `data/<name>.json`).
- `mkdirSync` ensures the `data/` directory exists.
- `load()` reads and parses the JSON file on construction; tolerates missing/corrupt files.
- `persist()` writes the full array back to disk on every mutation.
- In-memory state is a `Map<string, T>` keyed by entity ID.

### API Surface

All API routes are mounted under `/api` via `app.basePath("/api")`. CORS middleware (`Access-Control-Allow-Origin: *`) is applied to all `/api/*` requests.

| Route module | Prefix | Key endpoints |
|-------------|--------|---------------|
| `health` | `/api/health` | `GET` — liveness check |
| `devices` | `/api/devices` | CRUD, scan, registration |
| `events` | `/api/events/*` | SSE streams (devices, state, macros, playback) |
| `upload-mount` | `/api/devices/:deviceId/*` | Upload files and mount disk images |
| `files` | `/api/devices/:deviceId/files/*` | FTP-based file browser |
| `collections` | `/api/collections` | Disk collection CRUD |
| `macros` | `/api/macros` | Macro CRUD + execution |
| `playlists` | `/api/playlists` | Playlist CRUD + playback control |
| `proxy` | `/api/devices/:deviceId/v1/*` | Transparent proxy to device HTTP API |
| `library` | `/api/library` | Local file library management |

The `AppType` is exported from `src/server/index.ts` for Hono RPC type inference. The client imports it as:

```typescript
import { hc } from "hono/client";
import type { AppType } from "../../server/index.ts";
export const api = hc<AppType>("/").api;
```

### Business Logic

#### Server Initialization

The server uses a **constructor-injection** pattern: stores are instantiated first, then passed into route factory functions (`createDeviceRoutes(store)`, etc.) and engines. This avoids global mutable state and enables test isolation.

#### Background Tasks

Two background loops run for the lifetime of the process:

1. **HealthChecker** (`startHealthChecker`): Runs every 30 seconds (base interval). Probes each device via `GET /v1/version`. Uses exponential backoff (up to 5 minutes) for offline devices. Emits `device:online`/`device:offline` SSE events on state transitions.

2. **DevicePoller** (`DevicePoller.start`): Polls online devices for drive state (every 5s) and device info (every 30s). Caches results and emits `device:state` SSE events on change. Uses exponential backoff for unreachable devices.

#### Event System

Three in-process event buses exist, all following the same listener-set pattern:

- `device-events.ts` — `emitDeviceEvent` / `onDeviceEvent`
- `macro-events.ts` — `emitMacroEvent` / `onMacroEvent`
- `playback-events.ts` — `emitPlaybackEvent` / `onPlaybackEvent`

SSE route handlers subscribe to these buses and stream events to connected clients.

#### Client Data Flow

```
User Action
    |
    v
TanStack Query hook (useDevices, useMacros, etc.)
    |
    v
Hono RPC client (api.devices.$get(), etc.)
    |
    v
fetch() to /api/*
    |
    v
Hono route handler
    |
    v
Store / Engine / Device proxy
```

Query defaults: `staleTime: 60s`, `retry: 1`. SSE hooks invalidate relevant queries on real-time events to keep the UI current.

### Build and Dev Workflow

#### Development (`bun run dev`)

Vite 8 starts a dev server on `0.0.0.0` (all interfaces) with:
- `@hono/vite-dev-server` routing `/api/*` to `src/server/index.ts`
- Vite handling all other requests (SPA, assets, HMR websocket)
- `@tailwindcss/vite` for JIT CSS
- `TanStackRouterVite` for file-based route generation

The `exclude` regex `/^(?!\/api(?:\/|$)).*/` ensures only `/api` and `/api/*` reach Hono; everything else stays with Vite.

#### Production Build (`bun run build`)

Two sequential Vite builds:

1. **Client build** (`vite build --mode client`):
   - Input: `index.html`
   - Output: `dist/static/` (HTML, JS bundles, CSS, assets)
   - Plugins: Tailwind, TanStack Router

2. **Server build** (`vite build`):
   - Entry: `src/server/index.ts`
   - Output: `dist/index.js` (single Bun-targeted bundle)
   - Plugin: `@hono/vite-build/bun`

#### Production Runtime (`bun dist/index.js`)

When `globalThis.Bun` is detected, the server registers:
- `serveStatic` for `/static/*` (client assets from `dist/`)
- `serveStatic` for `/fonts/*` (C64 Pro Mono from `public/`)
- `serveStatic` for `/favicon.ico`
- SPA fallback: any non-API, non-static path serves `dist/static/index.html`

#### Testing (`bun test`)

- Runner: `bun:test` exclusively
- Test location: `tests/` directory, named `<module>.test.ts`
- Coverage: `bun test --coverage`, target >= 90% lines and functions
- Patterns:
  - Hono routes: construct app with `new Hono().basePath("/api").route("/", routes)`, test via `app.request()`
  - Stores: use temp files via `join(tmpdir(), 'test-' + Date.now() + '.json')`, clean up in `afterEach`
  - HTTP mocking: mock `globalThis.fetch`, restore in `afterEach`
  - Test data: `makeDevice(overrides)` factory pattern

## Constraints

### C-1: No External Services

The application MUST NOT depend on any external database, message queue, or cloud service. All state MUST be local to the server process and its `data/` directory. This ensures the application runs on any machine with Bun installed, including headless Raspberry Pi deployments.

### C-2: Single Port

The server MUST serve everything (API, SPA, static assets, SSE) on a single port. No secondary processes or ports are permitted.

### C-3: Font License

The C64 Pro Mono font files in `public/fonts/` MUST NOT be renamed, modified, or repackaged. They are included under a specific license. All CSS MUST reference the existing filenames.

### C-4: CORS Policy

The API MUST serve `Access-Control-Allow-Origin: *` to support cross-origin access from development tools and alternative frontends. The `X-Password` header MUST be listed in `Access-Control-Allow-Headers` for device authentication pass-through.

### C-5: No Client-Side Persistence

The client SHOULD NOT persist state to `localStorage`, `IndexedDB`, or cookies. All authoritative state lives on the server. TanStack Query's in-memory cache is the only client-side state layer.

### C-6: Bun-Only Runtime

The server is built for and tested on Bun. Node.js compatibility is NOT a goal. Production detection uses `globalThis.Bun`.

### C-7: TypeScript Strict Mode

All code MUST compile under TypeScript 6 strict mode with `noUncheckedIndexedAccess`, `noImplicitOverride`, and `noFallthroughCasesInSwitch` enabled.

### C-8: Vite Dev Server Host Binding

The dev server MUST bind to `0.0.0.0` with `allowedHosts: true` to support remote development environments (Coder workspaces, SSH tunnels).

## Open Questions

1. **Persistence scaling** — JSON file persistence works for the current device count (single-digit to low tens). If the data model grows significantly (e.g., large macro histories, extensive library metadata), SHOULD we migrate to SQLite?

2. **Authentication** — The application currently has no authentication layer. If deployed on a shared network, SHOULD we add API key or session-based auth?

3. **Multi-instance coordination** — If two instances of the server run against the same `data/` directory, file-level write contention will occur. SHOULD we add file locking or explicitly document single-instance-only deployment?

4. **SSE reconnection** — The client reconnects SSE streams on disconnect, but there is no event replay or sequence numbering. SHOULD we add a replay buffer for missed events?

## References

| Spec | Scope |
|------|-------|
| [c64-design-system](../c64-design-system/) | C64 visual design: fonts, colors, PETSCII, component styling |
| [device-management](../device-management/) | Device CRUD, discovery, scanning, health checking |
| [api-proxy](../api-proxy/) | Transparent proxy to C64 Ultimate device HTTP API |
| [realtime-events](../realtime-events/) | SSE event streams, device/macro/playback events |
| [file-browser](../file-browser/) | FTP-based file browsing and operations |
| [disk-collections](../disk-collections/) | Disk image collection management |
| [macros](../macros/) | Macro definition, step execution, upload-and-run |
| [jukebox](../jukebox/) | Playlist management and SID/music playback |
| [config-profiles](../config-profiles/) | Device configuration profiles |
| [developer-tools](../developer-tools/) | Dev tooling, debugging, diagnostics |

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | -- |
