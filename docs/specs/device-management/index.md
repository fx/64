# Device Management

## Overview

Device Management is the foundational subsystem for discovering, registering, monitoring, and persisting C64 Ultimate devices on the local network. Every other feature (macros, playlists, disk collections, file browsing) routes through a device ID established here. The system provides manual registration by IP, automated subnet scanning, continuous health-checking with exponential backoff, a persistent device registry, and a pub/sub event bus for status transitions.

## Background

C64 Ultimate devices (Ultimate 64, Ultimate II+, and variants) expose an HTTP API on their LAN IP address. There is no built-in discovery protocol such as mDNS or Bonjour; the only way to locate a device is to probe its IP directly. Two lightweight endpoints serve as the identification surface:

- **`GET /v1/version`** — returns `{ "version": "0.1", "errors": [] }`. Used as the health-check probe because it is the cheapest round-trip.
- **`GET /v1/info`** — returns hostname, product type, firmware version, FPGA version, and a persistent `unique_id` (hex string) that uniquely identifies the hardware across IP changes and reboots.

Devices MAY require authentication via an `X-Password` HTTP header. If enabled, unauthenticated requests return HTTP 403.

## Requirements

### REQ-1: Manual Device Registration

The system MUST allow a user to register a device by providing its IP address, with optional name, port, and password.

**Scenario: Successful registration**

```
GIVEN a C64 Ultimate device is powered on at 192.168.1.42
  AND the IP is within an RFC 1918 private range
WHEN the user submits a registration request with ip="192.168.1.42"
THEN the system SHALL probe GET /v1/version on the device
  AND the system SHALL fetch GET /v1/info to obtain the unique_id, product, firmware, and FPGA version
  AND the system SHALL persist the device with online=true and lastSeen set to the current ISO timestamp
  AND the system SHALL emit a "device:discovered" event
  AND the system SHALL return the device record (without password) with HTTP 201
```

**Scenario: Registration with authentication**

```
GIVEN a C64 Ultimate device requires a password
WHEN the user submits a registration with ip and password
THEN the system SHALL include the password as the X-Password header on all probes
  AND the device SHALL be stored with the password for future requests
```

**Scenario: Registration rejected — non-private IP**

```
GIVEN the user provides ip="8.8.8.8" (not RFC 1918)
WHEN the registration request is submitted
THEN the system SHALL reject it with HTTP 400 and error "Only private network IPs are allowed"
```

**Scenario: Registration rejected — device unreachable**

```
GIVEN the target IP does not respond within the timeout window
WHEN the registration request is submitted
THEN the system SHALL return HTTP 504 with a timeout error message
```

**Scenario: Registration rejected — authentication failure**

```
GIVEN the device requires a password and no password (or wrong password) is provided
WHEN the registration request is submitted
THEN the system SHALL return HTTP 403 with an authentication error message
```

**Scenario: Re-registration of known device**

```
GIVEN a device with unique_id "8D927F" is already registered at 192.168.1.42
WHEN the user registers the same device at a new IP 192.168.1.50
THEN the system SHALL upsert the existing record (same id), updating the IP
  AND the system SHALL NOT create a duplicate entry
```

### REQ-2: Device CRUD Operations

The system MUST support full lifecycle management of registered devices.

**Scenario: List all devices**

```
GIVEN three devices are registered
WHEN a client requests GET /api/devices
THEN the system SHALL return all three device records with passwords stripped
```

**Scenario: Get single device**

```
GIVEN a device with id "ABC123" is registered
WHEN a client requests GET /api/devices/ABC123
THEN the system SHALL return that device record (without password)
```

**Scenario: Get nonexistent device**

```
GIVEN no device with id "MISSING" exists
WHEN a client requests GET /api/devices/MISSING
THEN the system SHALL return HTTP 404 with error "Device not found"
```

**Scenario: Update device fields**

```
GIVEN a device with id "ABC123" is registered
WHEN a client sends PUT /api/devices/ABC123 with { "name": "MY C64" }
THEN the system SHALL update the name field and persist the change
  AND the system SHALL return the updated device (without password)
```

**Scenario: Delete device**

```
GIVEN a device with id "ABC123" is registered
WHEN a client sends DELETE /api/devices/ABC123
THEN the system SHALL remove the device from the store and persist the change
  AND the system SHALL return { "ok": true }
```

### REQ-3: Subnet Scanning

The system MUST support automated discovery of C64 Ultimate devices across a /24 subnet.

**Scenario: Successful subnet scan**

```
GIVEN two C64 Ultimate devices exist on subnet 192.168.1.0/24
  AND one device is already registered and one is new
WHEN a client sends POST /api/devices/scan with { "subnet": "192.168.1.0/24" }
THEN the system SHALL probe IPs 192.168.1.1 through 192.168.1.254 concurrently
  AND the system SHALL emit "device:discovered" for the new device
  AND the system SHALL emit "device:online" for the already-registered device
  AND the system SHALL upsert both devices into the store
  AND the system SHALL return the list of all discovered devices (passwords stripped)
```

**Scenario: Invalid subnet format**

```
GIVEN a client submits subnet "192.168.1.0/16"
WHEN the scan request is processed
THEN the system SHALL reject it with HTTP 400 and error "Only /24 subnets are supported"
```

### REQ-4: Health Checking

The system MUST continuously monitor registered devices and track online/offline state transitions.

**Scenario: Device goes offline**

```
GIVEN a device is registered and currently online
  AND the health checker's base interval (30s) has elapsed
WHEN the health probe (GET /v1/version) fails
THEN the system SHALL mark the device offline
  AND the system SHALL emit a "device:offline" event
  AND the system SHALL double the backoff multiplier for that device (capped at 5 minutes)
  AND the system SHALL persist the state change
```

**Scenario: Device comes back online**

```
GIVEN a device is registered and currently offline
WHEN the health probe succeeds
THEN the system SHALL mark the device online with the current timestamp
  AND the system SHALL fetch GET /v1/info to refresh product, firmware, and FPGA version
  AND the system SHALL emit a "device:online" event
  AND the system SHALL reset the backoff multiplier to 1
  AND the system SHALL persist the state change
```

**Scenario: Exponential backoff**

```
GIVEN a device has failed 3 consecutive health checks (backoff multiplier = 8)
WHEN the health checker evaluates whether to probe this device
THEN the system SHALL wait at least 30s * 8 = 240s since the last attempt before probing again
  AND the backoff interval SHALL NOT exceed 300s (5 minutes)
```

**Scenario: Health checker startup**

```
GIVEN the server starts with registered devices in data/devices.json
WHEN startHealthChecker(store) is called
THEN the first health check loop SHALL begin after a 5-second initial delay
  AND subsequent loops SHALL run every 30 seconds (base interval)
```

### REQ-5: Persistence

The system MUST persist device state across server restarts.

**Scenario: Persistence across restart**

```
GIVEN three devices are registered and stored in data/devices.json
WHEN the server process restarts
THEN the DeviceStore SHALL load all three devices from disk on construction
  AND their last-known online/offline state SHALL be preserved
```

**Scenario: Selective persistence on state transitions**

```
GIVEN a device is currently online
WHEN a health check succeeds (device remains online)
THEN the system SHALL NOT write to disk (no-op for same-state transitions)
  AND the system SHALL only persist when transitioning from online to offline or vice versa
```

### REQ-6: Device Events

The system MUST provide a pub/sub mechanism for device state changes.

**Scenario: Event subscription and delivery**

```
GIVEN a listener is subscribed via onDeviceEvent(callback)
WHEN a device transitions from offline to online
THEN the callback SHALL be invoked with { type: "device:online", data: { id, ip } }
```

**Scenario: Event unsubscription**

```
GIVEN a listener is subscribed and holds the returned unsubscribe function
WHEN the unsubscribe function is called
THEN the listener SHALL no longer receive device events
```

### REQ-7: Password Security

The system MUST NOT expose device passwords through the API.

**Scenario: Password stripping on API responses**

```
GIVEN a device is registered with password "secret123"
WHEN any GET endpoint returns this device
THEN the response SHALL omit the password field entirely
```

## Design

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Hono Server                      │
│                                                     │
│  ┌──────────────┐   ┌──────────────┐                │
│  │ Device Routes │──▶│ DeviceStore  │──▶ devices.json│
│  │ /api/devices  │   │ (in-memory   │                │
│  └──────┬───────┘   │  + persist)  │                │
│         │           └──────┬───────┘                │
│         │                  │                        │
│  ┌──────▼───────┐   ┌──────▼───────┐                │
│  │   Scanner     │   │HealthChecker │                │
│  │ (subnet scan) │   │ (30s loop)   │                │
│  └──────┬───────┘   └──────┬───────┘                │
│         │                  │                        │
│         ▼                  ▼                        │
│  ┌─────────────────────────────────┐                │
│  │        C64 Client               │                │
│  │  c64Fetch / probeVersion /      │                │
│  │  fetchDeviceInfo / fetchDrives  │                │
│  └──────────────┬──────────────────┘                │
│                 │                                   │
│  ┌──────────────▼──────────────────┐                │
│  │       Device Events (pub/sub)   │                │
│  │  emitDeviceEvent / onDeviceEvent│                │
│  └─────────────────────────────────┘                │
└─────────────────────────────────────────────────────┘
```

**Module responsibilities:**

| Module | File | Role |
|--------|------|------|
| Device Routes | `src/server/routes/devices.ts` | HTTP API — CRUD, registration, scan trigger |
| DeviceStore | `src/server/lib/device-store.ts` | In-memory Map + JSON file persistence |
| Scanner | `src/server/lib/scanner.ts` | Subnet probe with concurrency control |
| Health Checker | `src/server/lib/health-checker.ts` | Background polling loop with backoff |
| C64 Client | `src/server/lib/c64-client.ts` | Low-level HTTP transport to C64U devices |
| Device Events | `src/server/lib/device-events.ts` | Synchronous pub/sub event bus |
| Shared Types | `src/shared/types.ts` | Device, DeviceEvent, and related interfaces |

### Data Models

#### Device

```typescript
interface Device {
  id: string;           // unique_id from /v1/info (hex string, primary key)
  name: string;         // user-assigned name, defaults to hostname from /v1/info
  ip: string;           // current IPv4 address
  port: number;         // HTTP port, default 80
  password?: string;    // X-Password header value (stored server-side, never returned via API)
  product: string;      // hardware model: "Ultimate 64", "Ultimate II+", etc.
  firmware: string;     // firmware version string
  fpga: string;         // FPGA version string
  online: boolean;      // last health-check result
  lastSeen: string;     // ISO 8601 timestamp of last successful probe
}
```

#### DeviceRegistration (request body for POST /api/devices)

```typescript
interface DeviceRegistration {
  ip: string;           // REQUIRED — must be RFC 1918 private IP
  port?: number;        // default 80
  password?: string;    // for auth-enabled devices
  name?: string;        // user-assigned; falls back to hostname from /v1/info
}
```

#### DeviceUpdate (request body for PUT /api/devices/:id)

```typescript
interface DeviceUpdate {
  name?: string;
  password?: string;
  ip?: string;          // must be RFC 1918 if provided
  port?: number;
}
```

#### DeviceEvent

```typescript
type DeviceEventType = "device:online" | "device:offline" | "device:discovered";

interface DeviceEvent {
  type: DeviceEventType;
  data: {
    id: string;
    ip: string;
    product?: string;   // included only on "device:discovered"
  };
}
```

#### C64 Device API Response Types

```typescript
interface C64VersionResponse {
  version: string;
  errors: string[];
}

interface C64DeviceInfo {
  product: string;
  firmware_version: string;
  fpga_version: string;
  core_version: string;
  hostname: string;
  unique_id: string;
  errors: string[];
}
```

### API Surface

#### `GET /api/devices`

List all registered devices. Passwords MUST be stripped from the response.

- **Response:** `200` — `Device[]` (without `password` field)

#### `POST /api/devices`

Register a device by IP. Probes `/v1/version` and `/v1/info` to validate reachability and obtain identity.

- **Request body:** `DeviceRegistration`
- **Response:**
  - `201` — registered device (without `password`)
  - `400` — invalid JSON, missing `ip`, or non-RFC 1918 IP
  - `403` — device requires authentication
  - `502` — device unreachable (connection refused, host unreachable)
  - `504` — device probe timed out

#### `GET /api/devices/:id`

Get a single device by its unique ID.

- **Response:**
  - `200` — device (without `password`)
  - `404` — `{ "error": "Device not found" }`

#### `PUT /api/devices/:id`

Update mutable device fields (name, password, ip, port).

- **Request body:** `DeviceUpdate`
- **Response:**
  - `200` — updated device (without `password`)
  - `400` — non-RFC 1918 IP in update
  - `404` — device not found

#### `DELETE /api/devices/:id`

Remove a device from the registry.

- **Response:**
  - `200` — `{ "ok": true }`
  - `404` — device not found

#### `POST /api/devices/scan`

Trigger a subnet scan. Only `/24` CIDR notation is supported.

- **Request body:** `{ "subnet": "192.168.1.0/24" }`
- **Response:**
  - `200` — `{ "discovered": Device[] }` (passwords stripped)
  - `400` — missing subnet or unsupported CIDR prefix length

### UI Components

The device management UI lives at the root route (`/`) in `src/client/routes/index.tsx`.

| Component | Purpose |
|-----------|---------|
| **Device List Page** | Main view at `/` showing all registered devices in a table |
| **Register Device Form** | IP, name (optional), password (optional) input fields with REGISTER button |
| **Device Table** | Columns: NAME, IP, STATUS (online/offline badge), ACTIONS (OPEN, DEL) |
| **OPEN button** | Navigates to `/devices/$deviceId` dashboard |
| **DEL button** | Deletes device with confirmation toast |
| **REFRESH button** | Re-fetches device list |
| **Navigation links** | MACROS, PLAYLISTS, DISK COLLECTIONS |

**React hooks** (`src/client/hooks/use-devices.ts`):

- `useDevices()` — TanStack Query hook, query key `["devices"]`, calls `GET /api/devices`
- `useRegisterDevice()` — mutation calling `POST /api/devices`, invalidates `["devices"]` on success
- `useDeleteDevice()` — mutation calling `DELETE /api/devices/:id`, invalidates `["devices"]` on success

### Business Logic

#### IP Validation

Only RFC 1918 private addresses are accepted for registration and update:

- `10.0.0.0/8` — `10.x.x.x`
- `172.16.0.0/12` — `172.16.x.x` through `172.31.x.x`
- `192.168.0.0/16` — `192.168.x.x`

The validation function `isPrivateIP()` rejects any IP outside these ranges with HTTP 400.

#### Registration Flow

1. Validate IP is RFC 1918 private.
2. Probe `GET /v1/version` on `ip:port` (default port 80, 2s timeout).
3. On probe failure: return 403 (auth), 504 (timeout), or 502 (unreachable).
4. Fetch `GET /v1/info` on `ip:port` (5s timeout).
5. Upsert device into DeviceStore keyed by `unique_id`.
6. Emit `device:discovered` event.
7. Return device (password stripped) with HTTP 201.

#### Subnet Scan Flow

1. Parse CIDR `/24` notation — extract the 3-octet prefix.
2. Generate IPs `.1` through `.254` (254 candidates).
3. Launch up to 50 concurrent workers, each pulling the next IP from a shared index.
4. For each IP: probe `/v1/version` (2s timeout), then fetch `/v1/info` on success.
5. Upsert into DeviceStore. Emit `device:discovered` if new, `device:online` if already known.
6. Preserve existing `name` and `password` for already-registered devices.
7. Return all discovered devices.

#### Health Check Flow

1. On server start: `startHealthChecker(store)` schedules the first run after 5s.
2. Every 30s (base interval): iterate all registered devices.
3. For each device, compute effective interval = `BASE_INTERVAL_MS * backoff_multiplier`.
4. Skip the device if less than `effective_interval` has elapsed since the last probe.
5. Probe `GET /v1/version` with the device's stored password.
6. **On success:** `markOnline(id, now)`, reset backoff to 1. If device was offline, also fetch `/v1/info` to refresh metadata and emit `device:online`.
7. **On failure:** `markOffline(id)`, double backoff multiplier (capped so interval does not exceed 5 minutes). If device was online, emit `device:offline`.

#### Persistence Strategy

- **Storage format:** JSON array of Device objects in `data/devices.json`.
- **Load:** on DeviceStore construction; silently starts empty if file is missing or corrupt.
- **Write:** synchronous `writeFileSync` on every mutation that changes stored data.
- **Optimization:** `markOnline()` and `markOffline()` only write to disk on state transitions (online-to-offline or offline-to-online), not on every health-check tick.

#### C64 Client Transport

`c64Fetch<T>(ip, port, path, password?, timeoutMs=2000)` handles all communication with C64U devices:

- Adds `X-Password` header when password is provided.
- Uses `AbortController` with configurable timeout.
- Maps network errors to human-readable reasons:
  - `ECONNREFUSED` — "Connection refused ... is the device powered on?"
  - `EHOSTUNREACH` / `ENETUNREACH` — "... is unreachable — check network connection"
  - `ENOTFOUND` — "Cannot resolve ... — check the address"
  - `AbortError` — "... did not respond (timeout after Xms)"
  - HTTP 403 — "Authentication failed — check device password"
- Returns discriminated union: `{ ok: true, data: T } | { ok: false, reason: string }`.
- If the device response includes a non-empty `errors` array, treats it as a failure.

#### Event Bus

The device event system (`src/server/lib/device-events.ts`) is a synchronous, in-process pub/sub:

- `emitDeviceEvent(event)` — iterates all listeners in the `Set<Listener>` and invokes them synchronously.
- `onDeviceEvent(listener)` — adds a listener, returns an unsubscribe function that removes it from the set.
- Downstream consumers (e.g., SSE endpoints) subscribe via `onDeviceEvent` to push status changes to clients.

## Constraints

1. **Network scope:** Only RFC 1918 private IPs SHALL be accepted. Public IP registration MUST be rejected.
2. **Subnet scan size:** Only `/24` CIDR blocks (254 hosts) are supported. Larger scans MUST be rejected to avoid excessive network traffic.
3. **Concurrency:** Subnet scans MUST NOT exceed 50 concurrent probes to avoid overwhelming the local network or host.
4. **Timeouts:** Version probes MUST time out after 2 seconds. Info fetches MUST time out after 5 seconds.
5. **Health-check backoff:** The backoff multiplier MUST double on each failure and MUST NOT produce an interval exceeding 5 minutes (300 seconds).
6. **Password security:** Device passwords MUST be stored server-side only. The `toPublicDevice()` function MUST strip the `password` field from all API responses.
7. **Persistence format:** The device store uses a single JSON file (`data/devices.json`). No external database is required. Disk writes SHOULD only occur on state transitions to minimize I/O.
8. **No mDNS:** C64 Ultimate firmware does not advertise via mDNS/Bonjour. Discovery relies exclusively on HTTP probing.
9. **Single-process:** The health checker, scanner, and event bus all run in-process. There is no inter-process communication or message queue.

## Open Questions

1. **DHCP IP drift:** If a device's IP changes (e.g., DHCP lease renewal), the system currently has no mechanism to re-discover it automatically. Should periodic background rescans be supported?
2. **Concurrent scan requests:** Multiple simultaneous scan requests are not throttled. Should the system enforce at most one active scan at a time?
3. **Device removal during health check:** If a device is deleted while a health check is in-flight, the health checker gracefully exits (device not found in store). Should there be explicit cancellation of in-flight probes?
4. **Large networks:** Should subnet scanning support CIDR blocks larger than `/24` (e.g., `/16`) with pagination or streaming results?
5. **Offline device timeout:** Should devices that have been offline beyond a configurable threshold be automatically removed from the registry?

## References

- [Architecture Spec](../architecture/) — overall system architecture and module boundaries
- [API Proxy Spec](../api-proxy/) — proxy layer between this server and C64U device HTTP APIs
- [Realtime Events Spec](../realtime-events/) — SSE transport that consumes device events for client push
- [Archived spec: 0002 — Device Discovery & Management](../archive/0002-device-discovery.md) — original implementation spec (completed)
- C64 Ultimate HTTP API: `/v1/version`, `/v1/info`, `/v1/drives` endpoints on device LAN IP
- [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) — Address Allocation for Private Internets

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | — |
