# C64 Ultimate Web Interface — Project Tracker

## Overview

Modern web interface and proxy API for Commodore 64 Ultimate devices. Hono + Vite + React SPA.

## Specs

Tasks are tracked in each spec file. Work in order — later specs depend on earlier ones.

### Phase 1 — Foundation (Complete)

- [x] [0001 — Project Scaffolding](specs/0001-project-scaffolding.md) (PR #1)
- [x] [0002 — Device Discovery](specs/0002-device-discovery.md) (PR #2)
- [x] [0003 — API Proxy](specs/0003-api-proxy.md) (PR #3)
- [x] Restructure specs (12→8), fix dev server (Bun import, SPA routing, network host) (PR #4)

### Phase 2 — Functional UI

- [x] [0004 — Device UI: Setup, Dashboard & Disk Upload](specs/0004-device-ui.md) (PRs #5, #6, #7, #8)
- [x] [0005 — Real-Time State & File Browser](specs/0005-realtime-and-file-browser.md) (PRs #9, #10, #11)

### Backlog

- [ ] DevicePoller: track backoff independently per endpoint (drives/info) instead of shared per-device backoff (from PR #10 review)

### Phase 3 — Workflows & Media

- [ ] [0006 — Workflows & Media](specs/0006-workflows-and-media.md) — Disk flip collections, automation macros, SID/MOD jukebox

### Phase 4 — Admin & Advanced

- [ ] [0007 — Settings & Admin](specs/0007-settings-and-admin.md) — Config profiles, auth, RBAC, audit logging, HTTPS
- [ ] [0008 — Developer Tools](specs/0008-developer-tools.md) — Memory browser, 6502 disassembler, snapshots, U64 stream viewer
