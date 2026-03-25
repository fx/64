# 0003 — Transparent API Proxy

## Overview

Forward all C64U REST API calls through the proxy to a target device. The proxy adds CORS headers, routes by device ID, handles authentication, and provides typed response wrappers. This unblocks running the web UI from any origin.

## Background

The C64U HTTP server does not set CORS headers, so a web UI must be served from the device itself (port 80) or use a proxy. Our Hono server acts as that proxy — the React SPA and API live on the same origin.

See `docs/c64.md` for the complete native API reference.

## Goals

- Transparent passthrough of all `/v1/*` endpoints for any registered device
- CORS headers on all responses (same-origin in practice, but enables external tools too)
- Automatic injection of `X-Password` header from the device registry
- Typed Hono routes that expose the C64U API structure for Hono RPC inference
- Binary request/response passthrough (disk images, memory dumps, ROMs)
- Meaningful error wrapping (device offline, timeout, auth failure)

## Non-Goals

- Response caching (device state is volatile — caching would be stale)
- Request queuing or rate limiting (C64U devices handle one request at a time, but we don't enforce this at the proxy level yet)
- Modifying the C64U API semantics

## Technical Design

### Route Pattern

```
/api/devices/:deviceId/v1/*
```

Maps to `http://<device-ip>/v1/*` on the target device.

Examples:
```
GET  /api/devices/8D927F/v1/info         → GET  http://192.168.1.42/v1/info
PUT  /api/devices/8D927F/v1/machine:reset → PUT  http://192.168.1.42/v1/machine:reset
POST /api/devices/8D927F/v1/runners:run_prg → POST http://192.168.1.42/v1/runners:run_prg
```

### Proxy Implementation

Uses Hono's built-in `proxy()` helper:

1. Look up device by `:deviceId` in the registry
2. Return `404` if device not found, `503` if device is offline
3. Construct target URL: `http://<device-ip>:<port>/v1/<rest-of-path>`
4. Forward the request with:
   - All original headers
   - `X-Password` injected from device registry (if configured)
   - Binary body passed through for POST requests
5. Return the device's response with CORS headers added

### Error Responses

The proxy wraps device errors in a consistent envelope:

```json
{
  "errors": ["Device 8D927F is offline"],
  "proxy_error": true
}
```

| Scenario | HTTP Status | Error |
| --- | --- | --- |
| Device not in registry | 404 | "Device not found" |
| Device offline | 503 | "Device is offline" |
| Device returned 403 | 403 | "Authentication failed — check device password" |
| Device timeout (5s) | 504 | "Device did not respond" |
| Device network error | 502 | "Cannot reach device at <ip>" |

### CORS Headers

Applied to all `/api/*` responses:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PUT, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Password
```

### Typed Routes

Each C64U API group gets a typed Hono route chain so that Hono RPC can infer types in the client:

```typescript
// Typed response for /v1/info
const infoRoute = app.get('/api/devices/:deviceId/v1/info', async (c) => {
  // ... proxy logic
  return c.json(data as DeviceInfo)
})
```

This enables the React client to do:
```typescript
const client = hc<typeof app>('/')
const info = await client.api.devices[':deviceId'].v1.info.$get({ param: { deviceId: '8D927F' } })
// info is typed as DeviceInfo
```

### Binary Passthrough

For endpoints that accept or return binary data (`application/octet-stream`):
- POST bodies (disk images, PRG files, ROMs) are forwarded as-is
- Binary responses (memory reads) are returned with correct content-type
- No JSON wrapping for binary responses

## Acceptance Criteria

- [ ] `GET /api/devices/:id/v1/info` proxies to the device and returns typed JSON
- [ ] `PUT /api/devices/:id/v1/machine:reset` forwards PUT commands
- [ ] `POST /api/devices/:id/v1/runners:run_prg` forwards binary uploads
- [ ] `GET /api/devices/:id/v1/machine:readmem` returns binary response
- [ ] CORS headers present on all responses
- [ ] `X-Password` automatically injected for authenticated devices
- [ ] Proper error responses for offline/missing/timeout/auth-failure scenarios
- [ ] Hono RPC client infers types for at least info, drives, and machine endpoints

## Tasks

- [ ] Implement transparent proxy route with CORS and auth injection
  - [ ] Create catch-all route `ALL /api/devices/:deviceId/v1/*`
  - [ ] Look up device in registry, return 404/503 for missing/offline
  - [ ] Construct target URL from device IP/port and request path
  - [ ] Inject `X-Password` header from device registry
  - [ ] Forward request using Hono's `proxy()` helper (headers, method, body)
  - [ ] Add CORS headers to all `/api/*` responses (middleware)
  - [ ] Handle OPTIONS preflight requests
- [ ] Implement error wrapping for proxy failures
  - [ ] Map device errors to consistent JSON envelope with `proxy_error: true`
  - [ ] Handle: 404 (not found), 503 (offline), 403 (auth), 504 (timeout), 502 (network error)
  - [ ] Set 5-second timeout on proxy requests to devices
- [ ] Implement typed Hono routes for key C64U API groups
  - [ ] Typed routes for `/v1/info` and `/v1/version` (About)
  - [ ] Typed routes for `/v1/runners:*` (Runners)
  - [ ] Typed routes for `/v1/configs*` (Configuration)
  - [ ] Typed routes for `/v1/machine:*` (Machine)
  - [ ] Typed routes for `/v1/drives*` (Floppy Drives)
  - [ ] Typed routes for `/v1/streams*` (Data Streams)
  - [ ] Typed routes for `/v1/files*` (File Manipulation)
  - [ ] Create shared TypeScript types in `src/shared/` for all response shapes
- [ ] Implement binary request/response passthrough
  - [ ] Forward POST binary bodies (disk images, PRG, ROM uploads) as-is
  - [ ] Return binary responses (`application/octet-stream`) without JSON wrapping
  - [ ] Verify `readmem` returns raw binary and `writemem` POST accepts binary body
- [ ] Verify Hono RPC client type inference end-to-end
  - [ ] `hc` client infers correct types for info, drives, machine endpoints
  - [ ] Add example usage in `src/client/lib/api.ts`
