# Documentation

## Specs

| Spec | Description | Status |
|------|-------------|--------|
| [API Proxy](specs/api-proxy/) | Transparent /v1/* proxy with CORS, auth injection, and typed routes | active |
| [Architecture](specs/architecture/) | Tech stack, project structure, build/dev/prod workflow, conventions | active |
| [C64 Design System](specs/c64-design-system/) | VIC-II palette, C64 Pro Mono font, PETSCII, Tailwind, UI components | active |
| [Config Profiles](specs/config-profiles/) | Capture, apply, and diff device configuration profiles | active |
| [Developer Tools](specs/developer-tools/) | Memory browser, 6502 disassembler, snapshots, U64 stream viewer | active |
| [Device Management](specs/device-management/) | Device discovery, registration, scanning, health-check, persistence | active |
| [Disk Collections](specs/disk-collections/) | Multi-disk flip collections with position tracking | active |
| [File Browser](specs/file-browser/) | FTP-backed file browser with upload, download, delete, and type detection | active |
| [Jukebox](specs/jukebox/) | SID/MOD playlists, playback control, and now-playing bar | active |
| [Macros](specs/macros/) | Automation macros with step engine, execution, and SSE progress | active |
| [Realtime Events](specs/realtime-events/) | SSE streaming, device polling, state caching, and event bus | active |

## Changes

| # | Change | Spec | Status | Depends On |
|---|--------|------|--------|------------|
| 0001 | [Config Profile CRUD](changes/0001-config-profile-crud.md) | [Config Profiles](specs/config-profiles/) | draft | — |
| 0002 | [Config Capture, Apply, and Diff](changes/0002-config-capture-apply.md) | [Config Profiles](specs/config-profiles/) | draft | 0001 |
| 0003 | [Config Profile UI](changes/0003-config-profile-ui.md) | [Config Profiles](specs/config-profiles/) | draft | 0001, 0002 |
| 0004 | [Memory Read/Write API](changes/0004-memory-read-write-api.md) | [Developer Tools](specs/developer-tools/) | draft | — |
| 0005 | [Hex Viewer and 6502 Disassembler](changes/0005-hex-viewer-disassembler.md) | [Developer Tools](specs/developer-tools/) | draft | 0004 |
| 0006 | [Memory Snapshots](changes/0006-memory-snapshots.md) | [Developer Tools](specs/developer-tools/) | draft | 0004, 0005 |
| 0007 | [U64 Stream Viewer](changes/0007-u64-stream-viewer.md) | [Developer Tools](specs/developer-tools/) | draft | — |
| 0008 | [Per-Endpoint Poller Backoff](changes/0008-poller-per-endpoint-backoff.md) | [Realtime Events](specs/realtime-events/) | draft | — |
