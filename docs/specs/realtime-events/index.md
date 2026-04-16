# Realtime Events

## Overview

Server-sent events (SSE) streaming infrastructure that delivers real-time device state, macro execution progress, and playback updates to the browser. The system combines server-side polling with an in-memory state cache and observer-pattern event bus to push only meaningful changes to connected clients, eliminating the need for manual UI refresh.

## Background

The Ultimate 64 / Ultimate II+ REST API is stateless with no push mechanism. Without server-side polling, the client MUST manually refresh to see drive mounts, device info changes, or connectivity status. This spec introduces a polling-and-push architecture: the server polls each device at fixed intervals, diffs the responses against a per-device cache, and fans out changes over SSE streams consumed by the React frontend. The client hook writes SSE payloads directly into the TanStack Query cache, making all downstream components reactive to hardware state without any refetch overhead.

Three independent event channels (device lifecycle, macro execution, playback control) converge at the SSE endpoints so the client receives a unified stream per device.

## Requirements

### R1 -- Device State Polling

The server MUST poll each online device for drive status and device info at independent intervals.

**Scenario: Drives polled on schedule**

> GIVEN a device is online
> WHEN 5 seconds have elapsed since the last drives poll
> THEN the server MUST fetch `GET /v1/drives` from the device
> AND compare the response to the cached drives state via deep-equality (JSON serialization)
> AND emit a `state:drives` event only if the response differs

**Scenario: Info polled on schedule**

> GIVEN a device is online
> WHEN 30 seconds have elapsed since the last info poll
> THEN the server MUST fetch `GET /v1/info` from the device
> AND compare the response to the cached info state via deep-equality
> AND emit a `state:info` event only if the response differs

**Scenario: Polling starts automatically for online devices**

> GIVEN the server starts up
> WHEN the DevicePoller is initialized
> THEN it MUST begin polling all devices currently marked online in the DeviceStore

**Scenario: Polling reacts to device lifecycle events**

> GIVEN the DevicePoller is running
> WHEN a `device:online` event is emitted
> THEN the poller MUST start polling that device immediately (delay 0 for first poll)
>
> WHEN a `device:offline` event is emitted
> THEN the poller MUST stop polling that device and emit a `state:offline` event

### R2 -- Exponential Backoff

The server MUST apply exponential backoff when a device poll fails.

**Scenario: Poll failure increases backoff**

> GIVEN a device poll returns an error
> WHEN the backoff multiplier is currently N
> THEN the multiplier MUST be set to min(N * 2, MAX_BACKOFF_MS / max(DRIVES_INTERVAL, INFO_INTERVAL))
> AND subsequent poll intervals MUST be multiplied by the new multiplier

**Scenario: Poll success resets backoff**

> GIVEN a device poll succeeds
> WHEN the backoff multiplier is greater than 1
> THEN the multiplier MUST be reset to 1

**Scenario: Backoff cap**

> GIVEN repeated poll failures
> WHEN the computed interval would exceed 5 minutes (300,000 ms)
> THEN the interval MUST NOT exceed 5 minutes

### R3 -- In-Memory State Cache

The server MUST maintain an in-memory cache of last-known state per device.

**Scenario: Cache populated on successful poll**

> GIVEN a successful poll for drives or info
> WHEN the response differs from the cached value
> THEN the cache MUST be updated with the new value

**Scenario: Cache serves initial SSE state**

> GIVEN a client connects to the per-device SSE endpoint
> WHEN cached drives and/or info exist for that device
> THEN the server MUST send those cached values as the first SSE events

**Scenario: Cache cleared on device removal**

> GIVEN a device is removed from the store
> WHEN the poller detects the device no longer exists during a poll attempt
> THEN the cache entry MUST be deleted and polling MUST stop for that device

### R4 -- SSE Streaming Endpoints

The server MUST expose two SSE endpoints.

**Scenario: Global device stream**

> GIVEN a client opens `GET /api/events/devices`
> WHEN the connection is established
> THEN the server MUST send the current device list as `device:online` or `device:offline` events (initial snapshot)
> AND the server MUST forward all subsequent device, state, macro, and playback events
> AND events MUST include monotonically increasing `id` fields

**Scenario: Per-device stream**

> GIVEN a client opens `GET /api/events/devices/:deviceId`
> WHEN the device exists in the store
> THEN the server MUST send cached drives and info as initial `drives` and `info` events
> AND the server MUST forward only events matching that deviceId
> AND state event names MUST be remapped (e.g., `state:drives` to `drives`, `state:info` to `info`)
>
> WHEN the device does not exist
> THEN the server MUST return 404

**Scenario: Connection cleanup**

> GIVEN a client disconnects (SSE abort signal)
> WHEN the abort handler fires
> THEN ALL event listener subscriptions for that connection MUST be removed

### R5 -- Event Bus (Observer Pattern)

The system MUST implement three independent pub/sub channels.

**Scenario: Device events**

> GIVEN a device comes online, goes offline, or is discovered
> WHEN `emitDeviceEvent()` is called
> THEN all registered listeners via `onDeviceEvent()` MUST be invoked synchronously
> AND the emitter MUST return void (fire-and-forget)

**Scenario: Macro events**

> GIVEN a macro step executes, completes, or fails
> WHEN `emitMacroEvent()` is called
> THEN all registered listeners via `onMacroEvent()` MUST be invoked

**Scenario: Playback events**

> GIVEN playback starts, stops, or advances
> WHEN `emitPlaybackEvent()` is called
> THEN all registered listeners via `onPlaybackEvent()` MUST be invoked

**Scenario: Unsubscribe**

> GIVEN a listener is registered on any channel
> WHEN the returned unsubscribe function is called
> THEN that listener MUST be removed from the `Set<Listener>` and MUST NOT be called on subsequent emissions

### R6 -- Client SSE Hook

The client MUST consume the per-device SSE stream and update the TanStack Query cache.

**Scenario: Cache updated on drives event**

> GIVEN `useDeviceSSE(deviceId)` is active
> WHEN a `drives` SSE event is received
> THEN `queryClient.setQueryData(["devices", deviceId, "drives"], data)` MUST be called

**Scenario: Cache updated on info event**

> GIVEN `useDeviceSSE(deviceId)` is active
> WHEN an `info` SSE event is received
> THEN `queryClient.setQueryData(["devices", deviceId, "info"], data)` MUST be called

**Scenario: Playback events update cache**

> GIVEN `useDeviceSSE(deviceId)` is active
> WHEN any of `playback:play`, `playback:stop`, `playback:next`, `playback:prev` events are received
> THEN `queryClient.setQueryData(["devices", deviceId, "playback"], data)` MUST be called

**Scenario: Online/offline invalidates queries**

> GIVEN `useDeviceSSE(deviceId)` is active
> WHEN an `online` or `offline` event is received
> THEN `queryClient.invalidateQueries({ queryKey: ["devices", deviceId] })` MUST be called

**Scenario: Macro events invalidate execution cache**

> GIVEN `useDeviceSSE(deviceId)` is active
> WHEN any of `macro:step`, `macro:complete`, `macro:failed` events are received
> THEN `queryClient.invalidateQueries({ queryKey: ["macroExecutions"] })` MUST be called

**Scenario: Auto-reconnect with backoff**

> GIVEN the EventSource connection drops
> WHEN an `onerror` fires
> THEN the client MUST close the current EventSource
> AND reconnect after `reconnectDelay` milliseconds
> AND double the delay on each failure (min 1s, max 30s)
> AND reset the delay to 1s on successful `onopen`

**Scenario: Cleanup on unmount**

> GIVEN the component using `useDeviceSSE` unmounts
> WHEN the effect cleanup runs
> THEN the EventSource MUST be closed
> AND any pending reconnect timer MUST be cleared

## Design

### Architecture

```
+------------------+       poll        +-------------------+
|  Ultimate 64     | <---------------- |   DevicePoller    |
|  (REST API)      |   /v1/drives      | - drives: 5s      |
|                  |   /v1/info        | - info: 30s       |
+------------------+                   | - backoff: exp    |
                                       | - cache: Map<>    |
                                       +--------+----------+
                                                |
                                          state:drives
                                          state:info
                                          state:online
                                          state:offline
                                                |
                           +--------------------v---------------------+
                           |             SSE Endpoints                |
                           |  GET /api/events/devices                 |
                           |  GET /api/events/devices/:deviceId       |
                           +----+---+---+-----------------------------+
                                |   |   |
               +----------------+   |   +------------------+
               v                    v                      v
        DeviceEvents          MacroEvents          PlaybackEvents
        (Set<Listener>)       (Set<Listener>)      (Set<Listener>)
        - device:online       - macro:step         - playback:play
        - device:offline      - macro:complete     - playback:stop
        - device:discovered   - macro:failed       - playback:next
                                                   - playback:prev
                                                |
                                      SSE (text/event-stream)
                                                |
                                                v
                                       +--------+----------+
                                       |   useDeviceSSE    |
                                       |   (EventSource)   |
                                       | - setQueryData    |
                                       | - invalidate      |
                                       | - auto-reconnect  |
                                       +-------------------+
```

### Data Models

#### DeviceStateCache

```typescript
// src/server/lib/device-poller.ts
interface DeviceStateCache {
  drives?: unknown;   // last-known /v1/drives response
  info?: unknown;     // last-known /v1/info response
  online: boolean;    // current connectivity status
}
```

Stored in a `Map<string, DeviceStateCache>` keyed by device ID.

#### DeviceStateEvent

```typescript
// src/shared/types.ts
type DeviceStateEventType = "state:drives" | "state:info" | "state:offline" | "state:online";

interface DeviceStateEvent {
  type: DeviceStateEventType;
  deviceId: string;
  data: unknown;
}
```

#### DeviceEvent (lifecycle)

```typescript
// src/shared/types.ts
type DeviceEventType = "device:online" | "device:offline" | "device:discovered";

interface DeviceEvent {
  type: DeviceEventType;
  data: {
    id: string;
    ip: string;
    product?: string;
  };
}
```

#### MacroEvent

```typescript
// src/shared/types.ts
type MacroEventType = "macro:step" | "macro:complete" | "macro:failed";

interface MacroEvent {
  type: MacroEventType;
  executionId: string;
  macroId: string;
  deviceId: string;
  data: {
    currentStep?: number;
    totalSteps?: number;
    step?: MacroStep;
    error?: string;
  };
}
```

#### PlaybackEvent

```typescript
// src/shared/types.ts
type PlaybackEventType = "playback:play" | "playback:stop" | "playback:next" | "playback:prev";

interface PlaybackEvent {
  type: PlaybackEventType;
  deviceId: string;
  data: PlaybackState;
}
```

### API Surface

#### `GET /api/events/devices`

Global SSE stream. Content-Type: `text/event-stream`.

**Initial snapshot:** One event per registered device.

```
event: device:online
data: {"id":"abc123","ip":"192.168.1.64","product":"Ultimate 64"}
id: 0

event: device:offline
data: {"id":"def456","ip":"192.168.1.65","product":"Ultimate II+"}
id: 1
```

**Ongoing events:** Device lifecycle, state changes (with `deviceId` wrapper), macro events, playback events -- all multiplexed on one stream.

```
event: state:drives
data: {"deviceId":"abc123","data":{...}}
id: 5

event: macro:step
data: {"executionId":"ex1","macroId":"m1","deviceId":"abc123","currentStep":2,"totalSteps":5}
id: 6
```

#### `GET /api/events/devices/:deviceId`

Per-device SSE stream. Returns 404 if device not found.

**Initial snapshot:** Cached drives and info (if available).

```
event: drives
data: {"a":{"image_file":"game.d64"},"b":{"enabled":false}}
id: 0

event: info
data: {"firmware_version":"3.12","hostname":"MyC64"}
id: 1
```

**Ongoing events:** State changes (remapped names), online/offline, playback, macros -- filtered to this device only.

| Server Event | SSE Event Name |
|---|---|
| `state:drives` | `drives` |
| `state:info` | `info` |
| `state:online` | `online` |
| `state:offline` | `offline` |
| `device:online` | `online` |
| `device:offline` | `offline` |
| `playback:*` | `playback:*` (unchanged) |
| `macro:*` | `macro:*` (unchanged) |

### UI Components

#### `useDeviceSSE` Hook

Location: `src/client/hooks/use-device-sse.ts`

Accepts a `deviceId` string. Opens an `EventSource` to `/api/events/devices/{deviceId}`. Registers listeners for all event types listed in R6. Manages reconnection lifecycle internally. No return value -- side-effect only hook.

**Query key mappings:**

| SSE Event | Query Key | Action |
|---|---|---|
| `drives` | `["devices", deviceId, "drives"]` | `setQueryData` |
| `info` | `["devices", deviceId, "info"]` | `setQueryData` |
| `playback:*` | `["devices", deviceId, "playback"]` | `setQueryData` |
| `online` / `offline` | `["devices", deviceId]` | `invalidateQueries` |
| `macro:*` | `["macroExecutions"]` | `invalidateQueries` |

### Business Logic

#### Polling Intervals and Backoff

| Parameter | Value |
|---|---|
| Drives poll interval (base) | 5,000 ms |
| Info poll interval (base) | 30,000 ms |
| Backoff multiplier (initial) | 1 |
| Backoff growth | 2x per failure |
| Max backoff | 300,000 ms (5 min) |
| Client reconnect (min) | 1,000 ms |
| Client reconnect (max) | 30,000 ms |
| Client reconnect growth | 2x per failure |

#### Deep-Equality Diffing

The poller serializes the new response to JSON (`JSON.stringify`) and compares against the cached serialization. An event is emitted only when the strings differ. This avoids spurious updates from object-identity differences while keeping comparison simple and predictable.

#### Event Fan-Out

Each SSE connection subscribes to the relevant event bus channels. The SSE endpoint serializes events to `text/event-stream` format with monotonically increasing `id` fields (per-connection counter). On write failure (broken connection), the individual unsubscribe function is called to prevent further write attempts.

#### Connection Lifecycle

1. Client opens SSE endpoint.
2. Server sends initial snapshot (cached state or device list).
3. Server registers listeners on each event bus.
4. On each event, server writes SSE frame. On write error, unsubscribes that listener.
5. On client abort, server unsubscribes all listeners and resolves the stream promise.

### File Structure

```
src/server/
  lib/
    device-poller.ts       # DevicePoller class: polling, cache, backoff, diff
    device-events.ts       # Device lifecycle event bus (online/offline/discovered)
    macro-events.ts        # Macro execution event bus (step/complete/failed)
    playback-events.ts     # Playback event bus (play/stop/next/prev)
  routes/
    events.ts              # SSE endpoint factory: global + per-device streams
src/client/
  hooks/
    use-device-sse.ts      # EventSource hook with TanStack Query integration
src/shared/
  types.ts                 # Event type definitions shared between server and client
```

## Constraints

1. **No WebSockets.** The server MUST use SSE (`text/event-stream`) exclusively. SSE is sufficient for server-to-client push and avoids the complexity of bidirectional protocols.

2. **No persistent storage for state.** The state cache is in-memory only. It MUST be rebuilt from device polling on server restart. Historical state MUST NOT be stored.

3. **Single-process model.** The event bus uses module-level `Set<Listener>` singletons. This design does NOT support multi-process or clustered deployments. All SSE connections MUST be served by the same process.

4. **No SSE `Last-Event-ID` replay.** The `id` field is included for protocol compliance, but the server does NOT support resuming from a missed event ID. Clients MUST treat reconnection as a fresh connection (the server sends the current cached state as initial events, which is sufficient).

5. **JSON-only payloads.** All SSE `data` fields MUST be valid JSON. Clients MUST parse with `JSON.parse()`.

6. **Backoff is shared per device.** Drives and info polling share a single backoff multiplier per device. A failure in either endpoint increases the backoff for both. See Open Questions.

7. **Fire-and-forget emission.** Event bus emitters (`emitDeviceEvent`, `emitMacroEvent`, `emitPlaybackEvent`) are synchronous and do not wait for listeners. Listener errors MUST NOT propagate to the emitter.

## Open Questions

1. **Per-endpoint backoff.** The current DevicePoller tracks backoff per-device rather than per-endpoint. A drives poll failure increases the backoff multiplier for both drives and info polling. SHOULD the backoff be tracked independently per endpoint (e.g., separate multipliers for drives vs. info) so that a flaky drives endpoint does not degrade the info polling frequency?

2. **Event ordering guarantees.** The SSE `id` field is a per-connection counter. If a client reconnects, it receives a fresh snapshot but no replay of missed events. Is this acceptable for all use cases, or SHOULD certain critical events (e.g., `macro:failed`) be buffered for short-term replay?

3. **Connection limits.** There is currently no limit on concurrent SSE connections. SHOULD the server enforce a maximum (e.g., 10 per client IP, 50 global) to prevent resource exhaustion?

4. **Heartbeat / keep-alive.** The SSE endpoints do not send periodic keep-alive comments. Some proxies or load balancers MAY close idle connections. SHOULD the server send a `:keep-alive\n\n` comment every N seconds?

5. **Global stream playback events.** The global SSE stream (`GET /api/events/devices`) subscribes to device events, state events, and macro events but does NOT currently subscribe to playback events. SHOULD playback events be added to the global stream for completeness?

## References

- [Device Management spec](../device-management/) -- device registry, online/offline lifecycle
- [Macros spec](../macros/) -- macro execution that emits `macro:step`, `macro:complete`, `macro:failed`
- [Jukebox spec](../jukebox/) -- playback control that emits `playback:play`, `playback:stop`, `playback:next`, `playback:prev`
- [Archive: 0005 Real-Time & File Browser](../archive/0005-realtime-and-file-browser.md) -- original implementation spec
- [Hono SSE streaming](https://hono.dev/docs/helpers/streaming#critical-sse) -- `streamSSE()` helper
- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) -- EventSource API
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) -- key words for requirement levels

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-04-16 | Initial spec created | -- |
