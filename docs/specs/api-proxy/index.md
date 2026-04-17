# API Proxy

## Overview

The API Proxy is a transparent forwarding layer that routes all C64 Ultimate (C64U) REST API calls from the web application to physical devices on the local network. It solves browser CORS restrictions, injects device authentication, and exposes typed Hono RPC routes so the React client receives fully-inferred TypeScript types without manual duplication.

Every request matching `/api/devices/:deviceId/v1/*` is resolved against the device registry, forwarded to the target device's HTTP endpoint, and returned to the caller with CORS headers applied.

## Background

C64 Ultimate devices expose an HTTP REST API on port 80 (configurable). This API does not set CORS headers, which prevents any browser-hosted UI from calling it directly unless served from the device itself. The web application runs on a separate origin (the Hono + Vite server), so a server-side proxy is required.

The proxy also centralises authentication: devices MAY require an `X-Password` header. Rather than exposing passwords to the browser, the proxy reads stored credentials from the device registry and injects them automatically.

See `docs/c64.md` for the complete native C64U API reference.

Related specifications:
- [Device Management](../device-management/) -- device registration, health checking, and the `DeviceStore`
- [Architecture](../architecture/) -- overall system design, Hono + Vite monolith, and module layout

## Requirements

### REQ-1: Transparent Forwarding

The proxy MUST forward any HTTP method and path under `/v1/*` to the target device without modifying request semantics.

#### Scenario: Successful JSON proxy

```
GIVEN a device "8D927F" is registered and online at 192.168.1.42:80
WHEN the client sends GET /api/devices/8D927F/v1/info
THEN the proxy sends GET http://192.168.1.42:80/v1/info to the device
AND returns the device's JSON response with the original status code
AND the response includes CORS headers
```

#### Scenario: Forwarding with query parameters

```
GIVEN a device "8D927F" is registered and online
WHEN the client sends GET /api/devices/8D927F/v1/machine:readmem?address=0400&length=1000
THEN the proxy forwards GET http://{ip}:{port}/v1/machine:readmem?address=0400&length=1000
AND returns the binary response body unmodified
```

#### Scenario: Forwarding PUT/POST requests

```
GIVEN a device "8D927F" is registered and online
WHEN the client sends PUT /api/devices/8D927F/v1/machine:reset
THEN the proxy forwards PUT http://{ip}:{port}/v1/machine:reset
AND returns the device's response
```

### REQ-2: Device Resolution

The proxy MUST resolve the target device from the `DeviceStore` by `:deviceId` before forwarding.

#### Scenario: Device not found

```
GIVEN no device with ID "FFFFFF" exists in the registry
WHEN the client sends GET /api/devices/FFFFFF/v1/info
THEN the proxy returns HTTP 404
AND the body is { "errors": ["Device not found"], "proxy_error": true }
```

#### Scenario: Device offline

```
GIVEN device "8D927F" is registered but its online status is false
WHEN the client sends GET /api/devices/8D927F/v1/info
THEN the proxy returns HTTP 503
AND the body is { "errors": ["Device is offline"], "proxy_error": true }
```

### REQ-3: Authentication Injection

The proxy MUST inject the `X-Password` header when the device has a stored password.

#### Scenario: Password injected

```
GIVEN device "8D927F" has password "secret123" stored in the registry
WHEN the client sends GET /api/devices/8D927F/v1/info
THEN the proxy sets the header X-Password: secret123 on the forwarded request
AND the client's original request need not include X-Password
```

#### Scenario: No password configured

```
GIVEN device "8D927F" has no password set
WHEN the client sends GET /api/devices/8D927F/v1/info
THEN the proxy forwards the request without an X-Password header
```

#### Scenario: Device rejects password

```
GIVEN device "8D927F" has a stored password that the device does not accept
WHEN the proxy forwards a request and receives HTTP 403 from the device
THEN the proxy returns HTTP 403
AND the body is { "errors": ["Authentication failed -- check device password"], "proxy_error": true }
```

### REQ-4: Timeout

The proxy MUST enforce a timeout on device requests.

#### Scenario: Device does not respond

```
GIVEN device "8D927F" is registered and online
WHEN the proxy forwards a request and the device does not respond within 5000ms
THEN the proxy aborts the request
AND returns HTTP 504
AND the body is { "errors": ["Device did not respond"], "proxy_error": true }
```

### REQ-5: Network Error Handling

The proxy MUST return a structured error when the device is unreachable.

#### Scenario: Connection refused

```
GIVEN device "8D927F" is registered and online but the device's HTTP server is down
WHEN the proxy attempts to connect and receives a network error
THEN the proxy returns HTTP 502
AND the body is { "errors": ["Cannot reach device at {ip}"], "proxy_error": true }
```

### REQ-6: CORS

The proxy MUST add CORS headers to all `/api/*` responses so the browser permits cross-origin requests.

#### Scenario: Preflight request

```
GIVEN any path under /api/*
WHEN the browser sends an OPTIONS preflight request
THEN the proxy returns HTTP 204 with CORS headers
AND Access-Control-Allow-Origin is "*"
AND Access-Control-Allow-Methods includes GET, PUT, POST, DELETE, OPTIONS
AND Access-Control-Allow-Headers includes Content-Type and X-Password
```

### REQ-7: Typed Routes for Hono RPC

The proxy MUST export typed route definitions so that the Hono RPC client (`hc<AppType>`) can infer response types without manual type annotations on the client.

#### Scenario: Type-safe client call

```
GIVEN the server exports AppType which includes the proxy routes
WHEN the client calls api.devices[':deviceId'].v1.info.$get({ param: { deviceId } })
THEN the response is typed as C64UInfoResponse at compile time
```

### REQ-8: Binary Passthrough

The proxy MUST pass through binary request and response bodies without modification.

#### Scenario: Binary response (memory read)

```
GIVEN device "8D927F" is online
WHEN the client sends GET /api/devices/8D927F/v1/machine:readmem?address=0400&length=1000
THEN the proxy returns the raw binary response from the device
AND the content-type is preserved (application/octet-stream)
AND no JSON wrapping is applied
```

#### Scenario: Binary upload (PRG file)

```
GIVEN device "8D927F" is online
WHEN the client sends POST /api/devices/8D927F/v1/runners:run_prg with a binary body
THEN the proxy forwards the binary body to the device unchanged
```

## Design

### Architecture

```
Browser (React SPA)
    |
    | GET /api/devices/:deviceId/v1/info
    v
Hono Server (/api/*)
    |
    |-- CORS middleware (adds headers to all /api/* responses)
    |-- Proxy routes (src/server/routes/proxy.ts)
    |       |
    |       |-- Resolve device from DeviceStore
    |       |-- Build target URL: http://{ip}:{port}/v1/{path}
    |       |-- Inject X-Password header if configured
    |       |-- Forward via hono/proxy with AbortController (5s timeout)
    |       |-- Map errors to ProxyErrorResponse envelope
    |       v
    |   Device HTTP API (e.g. http://192.168.1.42:80/v1/info)
    v
Response returned to browser with CORS headers
```

The proxy is mounted as a Hono route group under `/api` alongside other application routes (devices, events, collections, etc.). All routes share the CORS middleware applied via `app.use("/api/*", cors)`.

### Data Models

#### ProxyErrorResponse

All proxy-originated errors use a consistent envelope distinguishable from device-originated errors by the `proxy_error: true` field.

```typescript
interface ProxyErrorResponse {
  errors: string[];
  proxy_error: true;
}
```

#### C64U Response Types (`src/shared/c64u-types.ts`)

| Type | Description |
|------|-------------|
| `C64UBaseResponse` | Base interface: `{ errors: string[] }` |
| `C64UInfoResponse` | Device identity (product, firmware, hostname, unique_id) |
| `C64UVersionResponse` | API version string |
| `C64UConfigCategoriesResponse` | List of configuration categories |
| `C64UConfigValuesResponse` | Key-value pairs within a category |
| `C64UConfigDetailResponse` | Detailed config item (current, min, max, format, default) |
| `C64UDriveInfo` | Single floppy drive state (enabled, bus_id, type, image) |
| `C64UDrivesResponse` | Array of drives |
| `C64UDebugRegResponse` | Debug register value |
| `C64UActionResponse` | Generic action result (reset, reboot, pause, resume) |
| `C64URunnerResponse` | Runner execution result |
| `C64UStreamResponse` | Data stream result |
| `C64UFileInfoResponse` | File metadata |
| `C64UFileCreateResponse` | File creation result |

#### Device (from `DeviceStore`)

The proxy reads the following `Device` fields for each request:

| Field | Usage |
|-------|-------|
| `id` | Match against `:deviceId` route parameter |
| `ip` | Target URL host |
| `port` | Target URL port |
| `password` | Injected as `X-Password` header (if set) |
| `online` | Gate: return 503 if `false` |

### API Surface

#### Typed Routes (Hono RPC inference)

These routes have explicit response type annotations enabling compile-time type safety via `hc<AppType>`:

| Method | Path | Response Type |
|--------|------|---------------|
| `GET` | `/api/devices/:deviceId/v1/info` | `C64UInfoResponse` |
| `GET` | `/api/devices/:deviceId/v1/version` | `C64UVersionResponse` |
| `GET` | `/api/devices/:deviceId/v1/configs` | `C64UConfigCategoriesResponse` |
| `GET` | `/api/devices/:deviceId/v1/drives` | `C64UDrivesResponse` |
| `GET` | `/api/devices/:deviceId/v1/machine:readmem` | Binary (passthrough) |
| `GET` | `/api/devices/:deviceId/v1/machine:debugreg` | `C64UDebugRegResponse` |
| `PUT` | `/api/devices/:deviceId/v1/machine:debugreg` | `C64UDebugRegResponse` |

#### Catch-All Route

| Method | Path | Response Type |
|--------|------|---------------|
| `ALL` | `/api/devices/:deviceId/v1/*` | `C64UActionResponse` (JSON) or passthrough (binary) |

The catch-all handles all C64U endpoints not covered by typed routes: runners, machine actions, config sub-paths, drive commands, streams, and files. JSON responses are cast to `C64UActionResponse`; non-JSON responses are returned as-is.

#### Error Responses

All proxy errors use the `ProxyErrorResponse` envelope:

| HTTP Status | Condition | Error Message |
|-------------|-----------|---------------|
| 404 | Device ID not in registry | `"Device not found"` |
| 503 | Device registered but offline | `"Device is offline"` |
| 403 | Device returned HTTP 403 | `"Authentication failed -- check device password"` |
| 502 | Network error (connection refused, DNS failure) | `"Cannot reach device at {ip}"` |
| 504 | Request exceeded 5000ms timeout | `"Device did not respond"` |

### Business Logic

#### Request Forwarding Pipeline

1. **Resolve device** -- Look up `:deviceId` in `DeviceStore`. Return 404 if absent, 503 if `online === false`.
2. **Build target URL** -- `http://{device.ip}:{device.port}/v1/{path}{queryString}`. The `/v1/...` portion and query string are extracted from the original URL by stripping the `/api/devices/:deviceId` prefix.
3. **Prepare headers** -- Copy all original request headers. Delete the `host` header (prevents virtual-host misrouting). Inject `X-Password` from `device.password` if set.
4. **Forward request** -- Use Hono's `proxy()` helper with the original `Request` object, modified headers, and an `AbortController` signal.
5. **Enforce timeout** -- An `AbortController` is armed with a 5000ms `setTimeout`. If the timer fires, the request is aborted and a 504 is returned.
6. **Handle device response**:
   - If the device returns HTTP 403, intercept and return a 403 `ProxyErrorResponse`.
   - If the content-type is `application/json`, parse and re-serialize through `c.json()` for typed routes (enables Hono RPC type inference).
   - Otherwise, return the raw `Response` (binary passthrough).
7. **Handle errors** -- `AbortError` maps to 504. All other errors map to 502. The `clearTimeout` runs in a `finally` block.

#### CORS Middleware Pipeline

1. If the request method is `OPTIONS`, return HTTP 204 with CORS headers immediately (preflight).
2. Otherwise, call `next()` to run the downstream handler.
3. After the handler completes, append CORS headers to the response.

CORS headers applied:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Password
```

#### AppType Export

The server's `index.ts` chains all route groups (including proxy routes) onto a single Hono app with `.basePath("/api")` and exports `AppType = typeof apiRoutes`. The client imports this type and constructs a type-safe RPC client:

```typescript
import { hc } from "hono/client";
import type { AppType } from "../../server/index.ts";

export const api = hc<AppType>("/").api;

// Usage:
const res = await api.devices[":deviceId"].v1.info.$get({
  param: { deviceId: "8D927F" },
});
// res is typed -- .json() returns C64UInfoResponse
```

## Constraints

1. **No response caching.** Device state is volatile (drives mount/unmount, memory changes, machine resets). Caching at the proxy layer would return stale data. Clients MAY implement their own cache-invalidation strategies.
2. **No request queuing or rate limiting.** C64U devices process one request at a time, but the proxy does not enforce serialisation. Concurrent requests to the same device MAY produce undefined behaviour on the device side.
3. **No modification of C64U API semantics.** The proxy MUST NOT alter request paths, query parameters, request bodies, or response bodies (except for re-serialising JSON through `c.json()` for type inference). It is a transparent passthrough.
4. **Timeout is fixed at 5000ms.** This value is a compile-time constant (`PROXY_TIMEOUT_MS`). It is NOT configurable at runtime.
5. **Wildcard CORS origin.** `Access-Control-Allow-Origin: *` is acceptable because device passwords are never exposed to the browser; they are injected server-side. If credential-based CORS is required in the future, the origin policy MUST be tightened.
6. **Host header removal.** The `host` header from the original request is deleted before forwarding to prevent virtual-host misrouting on the device. All other headers are forwarded as-is.

## Open Questions

1. **Should the proxy support response caching for stable endpoints?** Endpoints like `/v1/version` rarely change. A short TTL cache could reduce latency and device load, but adds complexity and staleness risk.
2. **Should the timeout be configurable per-device?** Some operations (firmware upload, large disk image transfer) may legitimately exceed 5 seconds. A per-device or per-endpoint timeout override could prevent false 504s.
3. **Should the proxy implement request serialisation?** C64U devices are single-threaded. Concurrent requests may cause unpredictable behaviour. A per-device request queue would ensure serial execution but add latency.
4. **Should the catch-all route type be narrowed?** The catch-all currently types all JSON responses as `C64UActionResponse`. Adding more typed routes (e.g., for `/v1/configs/:category`, `/v1/runners:*`) would improve client-side type safety.

## References

- `src/server/routes/proxy.ts` -- Proxy route implementation
- `src/server/middleware/cors.ts` -- CORS middleware
- `src/shared/c64u-types.ts` -- C64U API response type definitions
- `src/shared/types.ts` -- `Device` interface and related types
- `src/client/lib/api.ts` -- Hono RPC client setup and usage examples
- `src/server/index.ts` -- Server entry point and `AppType` export
- `src/server/lib/device-store.ts` -- `DeviceStore` implementation
- `docs/c64.md` -- Native C64U REST API reference
- [Hono Proxy Helper](https://hono.dev/docs/helpers/proxy) -- `hono/proxy` documentation
- [Hono RPC](https://hono.dev/docs/guides/rpc) -- Hono RPC client (`hc`) documentation

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | -- |
