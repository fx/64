# 0004 — Real-Time Device State

## Overview

Poll C64U devices periodically for their current state (info, drives, config) and push changes to connected browsers via Server-Sent Events. The UI always shows live status without manual refresh.

## Background

The C64U API is pure REST — no push mechanism. The existing c64u-control-panel has no state synchronization; the UI goes stale if the device state changes externally (e.g., mounting a disk from the device menu). Our proxy bridges this gap by polling and pushing diffs.

## Goals

- Server-side polling loop per registered device
- SSE stream per device delivering state change events to browsers
- Diff-based updates: only send what changed
- Configurable poll interval (default 5 seconds for drives, 30 seconds for config)
- TanStack Query integration on the client for automatic cache invalidation on SSE events

## Non-Goals

- Sub-second latency (polling at 5s is fine for this use case)
- Full config change tracking (config has 17 categories — poll the most relevant ones)
- Historical state / time-series data

## Technical Design

### Polled State

| State Group | Endpoint | Poll Interval | Size |
| --- | --- | --- | --- |
| Device info | `GET /v1/info` | 30s | Small |
| Drive status | `GET /v1/drives` | 5s | Small |
| Active config (subset) | `GET /v1/configs/<category>` | 60s | Medium |

### Polling Loop

Per device, a background loop:
1. Fetch current state from the device via the proxy
2. Compare with the last known state (deep equality)
3. If changed: update internal cache, emit SSE event with the diff
4. If device goes offline: emit offline event, pause polling with backoff

The loop runs as a Bun async task, not blocking the main event loop.

### SSE Endpoint

```
GET /api/events/devices/:deviceId
```

Delivers a stream of typed events:

```
event: drives
data: { "a": { "image_file": "game.d64", "image_path": "/USB0/Games/game.d64" }, "b": { "enabled": false } }

event: info
data: { "firmware_version": "3.12", "hostname": "Terakura" }

event: config
data: { "Drive A Settings": { "Drive": "Enabled", "Drive Type": "1581" } }

event: offline
data: {}

event: online
data: {}
```

Also support a global stream for all devices:

```
GET /api/events/devices
```

Events include a `deviceId` field:
```
event: drives
data: { "deviceId": "8D927F", "a": { ... } }
```

### Client Integration

TanStack Query hooks that subscribe to the SSE stream and invalidate/update query cache:

```typescript
// useDeviceState('8D927F') → subscribes to SSE, returns live state
// Internally uses TanStack Query's queryClient.setQueryData() on SSE events
```

When the SSE stream delivers a `drives` event, the query cache for `['devices', deviceId, 'drives']` is updated directly — no refetch needed.

### State Cache

Server maintains an in-memory cache of the last known state per device. New SSE clients immediately receive the current state as their first event (no waiting for the next poll cycle).

## Acceptance Criteria

- [ ] Polling loop runs for each online device at configured intervals
- [ ] SSE stream delivers drive status changes within one poll cycle
- [ ] New SSE connections receive current state immediately
- [ ] Offline/online transitions emit events
- [ ] Only changed state is emitted (diff-based)
- [ ] Global SSE stream aggregates events from all devices
- [ ] Client TanStack Query cache updates on SSE events without refetching

## Tasks

- [ ] Implement server-side polling loop and state cache
  - [ ] Create `DevicePoller` class: per-device background loop
  - [ ] Poll `/v1/drives` every 5s, `/v1/info` every 30s, selected config categories every 60s
  - [ ] In-memory state cache per device with last-known values
  - [ ] Deep-equality comparison: only flag changes when values differ
  - [ ] Handle device going offline: pause polling with backoff, emit offline event
  - [ ] Start/stop polling when devices are added/removed from registry
- [ ] Implement SSE endpoints for device state events
  - [ ] `GET /api/events/devices/:deviceId` — per-device SSE stream
  - [ ] `GET /api/events/devices` — global stream with `deviceId` field on each event
  - [ ] Event types: `drives`, `info`, `config`, `offline`, `online`
  - [ ] Send current cached state as initial events for new SSE connections
  - [ ] Only emit changed state (diff-based, not full dump on every poll)
- [ ] Implement client-side TanStack Query SSE integration
  - [ ] Create `useDeviceSSE(deviceId)` hook that opens EventSource connection
  - [ ] On SSE events, update TanStack Query cache via `queryClient.setQueryData()`
  - [ ] Map event types to query keys: `drives` → `['devices', id, 'drives']`, etc.
  - [ ] Handle SSE reconnection on disconnect
  - [ ] Create `useDeviceState(deviceId)` convenience hook wrapping SSE + query
