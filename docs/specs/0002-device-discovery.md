# 0002 — Device Discovery & Management

## Overview

Auto-discover C64 Ultimate devices on the local network, register them in the proxy, and continuously health-check them. This is the multi-device foundation — every subsequent feature routes through a device ID.

## Background

C64U devices expose an HTTP API on their LAN IP but have no built-in discovery protocol. The device's `/v1/info` endpoint returns hostname, product type, firmware version, and a unique ID. The `/v1/version` endpoint is the lightest health-check.

## Goals

- Discover C64U devices on the LAN automatically (network scan)
- Manual device registration by IP address
- Persistent device registry (server-side, survives restarts)
- Periodic health-checking with online/offline status
- SSE event when device status changes
- API to list, add, remove, and get details for devices

## Non-Goals

- mDNS/Bonjour discovery (C64U firmware doesn't advertise mDNS)
- Device authentication management (just stores the password if provided)
- Any UI — that's part of the individual feature UIs

## Technical Design

### Device Registry

In-memory store backed by a JSON file on disk (no database needed for a LAN tool):

```typescript
interface Device {
  id: string           // unique_id from /v1/info (hex string)
  name: string         // user-assigned name, defaults to hostname
  ip: string           // current IP address
  port: number         // HTTP port (default 80)
  password?: string    // X-Password header value if device has auth
  product: string      // "Ultimate 64", "Ultimate II+", etc.
  firmware: string     // firmware version
  fpga: string         // FPGA version
  online: boolean      // last health-check result
  lastSeen: string     // ISO timestamp of last successful contact
}
```

Persisted to `data/devices.json`. Loaded on startup, written on change.

### Network Scanning

Scan a subnet (e.g., `192.168.1.0/24`) by attempting `GET /v1/version` on port 80 for each IP. Devices that respond with `{ "version": "0.1" }` are candidates — follow up with `GET /v1/info` for full identification.

- Scan runs in parallel with concurrency limit (e.g., 50 concurrent requests)
- Short timeout per probe (2 seconds)
- Returns only newly discovered devices (not already registered)
- Can be triggered manually via API or run on startup

### Health Checking

- Poll each registered device's `/v1/version` every 30 seconds (configurable)
- On failure: mark offline, emit SSE event
- On recovery: update device info via `/v1/info`, mark online, emit SSE event
- Exponential backoff for offline devices (30s → 60s → 120s → max 5min)

### API Endpoints

```
GET    /api/devices                     → list all devices
POST   /api/devices                     → register device manually { ip, port?, password?, name? }
GET    /api/devices/:id                 → get device details
PUT    /api/devices/:id                 → update device (name, password, ip)
DELETE /api/devices/:id                 → remove device from registry
POST   /api/devices/scan               → trigger network scan { subnet: "192.168.1.0/24" }
GET    /api/events/devices              → SSE stream of device status changes
```

### SSE Events

```
event: device:online
data: { "id": "8D927F", "ip": "192.168.1.42" }

event: device:offline
data: { "id": "8D927F", "ip": "192.168.1.42" }

event: device:discovered
data: { "id": "ABC123", "ip": "192.168.1.55", "product": "Ultimate 64" }
```

## Acceptance Criteria

- [x] `POST /api/devices` registers a device by IP and fetches its info
- [x] `GET /api/devices` lists all registered devices with online/offline status
- [x] `POST /api/devices/scan` discovers C64U devices on a subnet
- [x] Health-check loop detects offline/online transitions
- [x] SSE stream emits events on status changes
- [x] Device registry persists across server restarts
- [x] Duplicate registration (same unique_id) updates existing entry

## Tasks

- [x] Implement device registry with JSON file persistence
  - [x] Create `Device` TypeScript interface and validation
  - [x] Implement `DeviceStore` class: load from `data/devices.json` on startup, write on change
  - [x] CRUD operations: add, update, remove, get, list
  - [x] Deduplicate by `unique_id` (upsert on re-registration)
- [x] Implement manual device registration API
  - [x] `POST /api/devices` — accept `{ ip, port?, password?, name? }`, probe device with `GET /v1/version` + `GET /v1/info`, save to registry
  - [x] `GET /api/devices` — list all registered devices with online/offline status
  - [x] `GET /api/devices/:id` — get single device details
  - [x] `PUT /api/devices/:id` — update device (name, password, ip)
  - [x] `DELETE /api/devices/:id` — remove device from registry
- [x] Implement subnet network scanner
  - [x] `POST /api/devices/scan` — accept `{ subnet }`, scan IPs in parallel (concurrency-limited to 50)
  - [x] Probe each IP with `GET /v1/version` (2s timeout), follow up with `GET /v1/info` on success
  - [x] Return list of newly discovered devices (skip already-registered)
- [x] Implement health-check polling loop
  - [x] Background loop polling `GET /v1/version` for each registered device
  - [x] Configurable base interval (default 30s)
  - [x] On failure: mark offline, exponential backoff (30s → 60s → 120s → 5min cap)
  - [x] On recovery: refresh device info via `GET /v1/info`, mark online, reset backoff
- [x] Implement SSE stream for device status events
  - [x] `GET /api/events/devices` — SSE endpoint emitting `device:online`, `device:offline`, `device:discovered` events
  - [x] Emit events from health-check loop and scan results
  - [x] New connections receive current device list as initial events
