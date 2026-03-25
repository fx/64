# 0012 — Multi-User & Remote Access

## Overview

Add authentication, authorization, and secure remote access to the proxy server. Enables multiple users to access C64U devices over the internet (not just LAN) with proper access control and audit logging.

## Background

The native C64U API has only a single shared password (`X-Password` header). The proxy currently has no auth — anyone on the network can control devices. For remote access and multi-user scenarios, we need proper identity management.

## Goals

- User authentication (login with username/password or OAuth)
- Role-based access control (admin, operator, viewer)
- Session management with secure tokens
- Audit log of all actions (who did what, when, to which device)
- Secure remote access (HTTPS, rate limiting)
- Per-device access control (which users can access which devices)

## Non-Goals

- LDAP/Active Directory integration
- Multi-tenancy (separate organizations)
- API key management for programmatic access (future)

## Technical Design

### Roles

| Role | Permissions |
| --- | --- |
| **admin** | Full access: manage users, manage devices, all device operations |
| **operator** | Device operations: run programs, mount disks, macros, config changes |
| **viewer** | Read-only: view device status, browse files, view config (no mutations) |

### User Model

```typescript
interface User {
  id: string
  username: string
  passwordHash: string     // bcrypt
  role: 'admin' | 'operator' | 'viewer'
  allowedDevices: string[] // device IDs, empty = all (for admin)
  createdAt: string
  lastLogin?: string
}
```

Persisted to `data/users.json`. First-run creates a default admin account.

### Authentication Flow

1. `POST /api/auth/login` with `{ username, password }` → returns JWT token
2. All subsequent requests include `Authorization: Bearer <token>`
3. Token expires after configurable duration (default 24h)
4. `POST /api/auth/refresh` for token renewal
5. `POST /api/auth/logout` to invalidate token

### Middleware

Hono middleware chain:
1. **Auth middleware:** Validate JWT on all `/api/*` routes (except `/api/auth/*`)
2. **Role middleware:** Check role permissions per route
3. **Device access middleware:** Check user has access to the target device
4. **Audit middleware:** Log every mutating request

### Audit Log

```typescript
interface AuditEntry {
  id: string
  timestamp: string
  userId: string
  username: string
  action: string           // "mount_disk", "reset_machine", "apply_profile", etc.
  deviceId?: string
  details: Record<string, unknown>  // action-specific data
  ip: string
}
```

Stored in `data/audit.log` (append-only JSONL). Rotated by size (10MB per file).

### API Endpoints

```
# Auth
POST   /api/auth/login                         → login
POST   /api/auth/refresh                       → refresh token
POST   /api/auth/logout                        → logout

# User management (admin only)
GET    /api/users                               → list users
POST   /api/users                               → create user
PUT    /api/users/:id                           → update user
DELETE /api/users/:id                           → delete user

# Audit (admin only)
GET    /api/audit                               → query audit log { from?, to?, userId?, deviceId? }
```

### HTTPS

For remote access, the proxy should support TLS:
- Self-signed certificate generation for LAN use
- Let's Encrypt / custom certificate for internet exposure
- HTTP → HTTPS redirect when TLS is enabled

### Rate Limiting

- Login endpoint: 5 attempts per minute per IP
- API endpoints: 100 requests per minute per user
- Implemented via Hono middleware

## Acceptance Criteria

- [ ] User registration and login with JWT tokens
- [ ] Role-based access control enforced on all routes
- [ ] Per-device access control limits which devices a user can access
- [ ] Audit log records all mutating actions
- [ ] Token expiry and refresh works
- [ ] Default admin account created on first run
- [ ] Rate limiting on login endpoint prevents brute force
- [ ] HTTPS mode with self-signed certificate works

## Tasks

- [ ] Implement user model and storage
  - [ ] Create `User` TypeScript type with id, username, passwordHash, role, allowedDevices
  - [ ] Implement `UserStore`: load/save `data/users.json`
  - [ ] Password hashing with bcrypt
  - [ ] First-run initialization: create default admin account with generated password (log to console)
- [ ] Implement JWT authentication endpoints
  - [ ] `POST /api/auth/login` — validate credentials, return JWT token
  - [ ] `POST /api/auth/refresh` — validate existing token, return new token
  - [ ] `POST /api/auth/logout` — invalidate token (add to blocklist)
  - [ ] Configurable token expiry (default 24h)
- [ ] Implement auth and authorization middleware
  - [ ] Auth middleware: validate JWT on all `/api/*` routes except `/api/auth/*`
  - [ ] Role middleware: map routes to required roles (admin, operator, viewer)
  - [ ] Device access middleware: check `allowedDevices` for routes with `:deviceId`
  - [ ] Skip auth entirely when no users are configured (opt-in security)
- [ ] Implement user management API (admin only)
  - [ ] `GET /api/users` — list users (exclude passwordHash)
  - [ ] `POST /api/users` — create user with role and device access
  - [ ] `PUT /api/users/:id` — update user (role, password, allowedDevices)
  - [ ] `DELETE /api/users/:id` — delete user (prevent deleting last admin)
- [ ] Implement audit logging
  - [ ] Audit middleware: log every mutating request (POST, PUT, DELETE) to `data/audit.log` (JSONL)
  - [ ] Log fields: timestamp, userId, username, action, deviceId, details, IP
  - [ ] `GET /api/audit` — query audit log with filters (from, to, userId, deviceId)
  - [ ] Log file rotation by size (10MB per file)
- [ ] Implement rate limiting and HTTPS support
  - [ ] Rate limit login endpoint: 5 attempts/minute per IP
  - [ ] Rate limit API endpoints: 100 requests/minute per user
  - [ ] Implement via Hono middleware
  - [ ] HTTPS mode: self-signed certificate generation for LAN use
  - [ ] Support custom certificate path for production/internet exposure
  - [ ] HTTP → HTTPS redirect when TLS is enabled
- [ ] Build auth UI
  - [ ] Login page with username/password form
  - [ ] User management page (admin only): list, create, edit, delete users
  - [ ] Role and device access assignment in user edit form
  - [ ] Audit log viewer with filtering (admin only)
