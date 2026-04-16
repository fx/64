# 0007 — Settings & Admin: Configuration Profiles, Auth, and Remote Access

## Overview

Two admin-facing features: (1) configuration profiles for saving/restoring/comparing device settings, and (2) multi-user authentication with role-based access control, audit logging, and HTTPS for remote access.

## Goals

### Configuration Profiles
- Capture a device's full configuration as a named snapshot
- Restore profiles to devices (bulk config write)
- Compare two profiles or a profile vs live device config (diff view)
- Export/import profiles as JSON files
- UI: profile list, capture, apply with diff preview

### Auth & Remote Access
- User authentication (username/password → JWT)
- Role-based access control: admin, operator, viewer
- Per-device access control (which users can access which devices)
- Session management with token expiry and refresh
- Audit log of all mutating actions
- Rate limiting on auth endpoints
- HTTPS mode with self-signed or custom certificates

## Non-Goals

- Partial configuration profiles (always full capture)
- Cross-device-type profile compatibility checking
- LDAP/OAuth/SSO integration
- Multi-tenancy
- API key management

## Technical Design

### Part 1: Configuration Profiles

#### Data Model

```typescript
interface ConfigProfile {
  id: string
  name: string
  description?: string
  deviceProduct?: string
  config: Record<string, Record<string, string | number>>  // category → item → value
  createdAt: string
  updatedAt: string
}
```

Persisted to `data/profiles.json`.

#### API Endpoints

```
GET    /api/profiles                           → list
POST   /api/profiles                           → create (manual JSON)
GET    /api/profiles/:id                       → get
PUT    /api/profiles/:id                       → update
DELETE /api/profiles/:id                       → delete
POST   /api/profiles/capture                   → capture from device { deviceId, name }
POST   /api/profiles/:id/apply                 → apply to device { deviceId, saveToFlash? }
GET    /api/profiles/:id/diff?against=:otherId → diff two profiles
GET    /api/profiles/:id/diff?deviceId=:id     → diff vs live device
GET    /api/profiles/:id/export                → download as JSON
POST   /api/profiles/import                    → upload JSON
```

#### Capture Flow

1. `GET /v1/configs` → list all categories
2. For each category: `GET /v1/configs/<category>/*` → item details
3. Assemble into profile, save with metadata

#### Apply Flow

1. Load profile → `POST /v1/configs` (bulk set)
2. Optionally `PUT /v1/configs:save_to_flash`
3. Return change report

#### Diff

```json
{
  "changes": [
    { "category": "Drive A Settings", "item": "Drive Type", "left": "1541", "right": "1581" }
  ],
  "leftOnly": [],
  "rightOnly": [],
  "identical": 45
}
```

#### UI

- **Profile list page** (`/profiles`): cards with name, description, device type, date
- **Capture**: button on device dashboard → "Save current config as profile"
- **Apply**: confirmation dialog showing diff preview
- **Diff viewer**: side-by-side with category grouping, changed items highlighted

### Part 2: Auth & Remote Access

#### User Model

```typescript
interface User {
  id: string
  username: string
  passwordHash: string     // bcrypt
  role: 'admin' | 'operator' | 'viewer'
  allowedDevices: string[] // device IDs, empty = all
  createdAt: string
  lastLogin?: string
}
```

Persisted to `data/users.json`. First run creates default admin.

#### Roles

| Role | Permissions |
| --- | --- |
| admin | Full: manage users, manage devices, all operations |
| operator | Device operations: run, mount, macros, config |
| viewer | Read-only: view status, browse files, view config |

#### Auth Flow

1. `POST /api/auth/login` → JWT token
2. All requests: `Authorization: Bearer <token>`
3. `POST /api/auth/refresh` → new token
4. `POST /api/auth/logout` → invalidate
5. Token expiry: 24h default, configurable

#### Middleware Chain

1. **Auth**: validate JWT on `/api/*` (except `/api/auth/*`)
2. **Role**: check permissions per route
3. **Device access**: check `allowedDevices` for `:deviceId` routes
4. **Audit**: log every POST/PUT/DELETE

Skip auth entirely when no users configured (opt-in security).

#### Audit Log

```typescript
interface AuditEntry {
  id: string
  timestamp: string
  userId: string
  username: string
  action: string
  deviceId?: string
  details: Record<string, unknown>
  ip: string
}
```

Append-only JSONL at `data/audit.log`. Rotate by size (10MB).

#### API Endpoints

```
# Auth
POST   /api/auth/login        → login
POST   /api/auth/refresh       → refresh token
POST   /api/auth/logout        → logout

# Users (admin only)
GET    /api/users              → list (no passwordHash)
POST   /api/users              → create
PUT    /api/users/:id          → update
DELETE /api/users/:id          → delete

# Audit (admin only)
GET    /api/audit              → query { from?, to?, userId?, deviceId? }
```

#### Rate Limiting

- Login: 5 attempts/minute/IP
- API: 100 requests/minute/user

#### HTTPS

- Self-signed cert generation for LAN
- Custom cert path for internet exposure
- HTTP → HTTPS redirect when TLS enabled

### File Structure

```
src/server/
├── lib/
│   ├── profile-store.ts          # Config profile persistence
│   ├── profile-diff.ts           # Config diff engine
│   ├── user-store.ts             # User persistence + bcrypt
│   ├── jwt.ts                    # JWT sign/verify/refresh
│   └── audit-log.ts              # Append-only JSONL logger
├── middleware/
│   ├── auth.ts                   # JWT validation middleware
│   ├── rbac.ts                   # Role-based access control
│   └── rate-limit.ts             # Rate limiting
├── routes/
│   ├── profiles.ts               # Profile CRUD + capture/apply/diff
│   ├── auth.ts                   # Login/logout/refresh
│   ├── users.ts                  # User management
│   └── audit.ts                  # Audit log queries

src/client/
├── routes/
│   ├── profiles/
│   │   └── index.tsx             # Profile manager page
│   ├── login.tsx                 # Login page
│   └── admin/
│       ├── users.tsx             # User management
│       └── audit.tsx             # Audit log viewer
├── components/
│   ├── profile/
│   │   ├── profile-list.tsx
│   │   └── diff-viewer.tsx       # Side-by-side config diff
│   └── auth/
│       ├── login-form.tsx
│       └── user-form.tsx
├── hooks/
│   ├── use-auth.ts               # Auth state, login/logout
│   └── use-profiles.ts           # Profile CRUD hooks
```

## Acceptance Criteria

### Config Profiles
- [ ] Capture full device config into named profile
- [ ] Apply profile to device via bulk config write
- [ ] Diff two profiles shows per-item changes
- [ ] Diff profile vs live device config
- [ ] Export/import profiles as JSON
- [ ] Profiles persist across restarts
- [ ] UI diff preview before applying

### Auth & Remote Access
- [ ] Login with username/password returns JWT
- [ ] RBAC enforced on all routes
- [ ] Per-device access control works
- [ ] Audit log records all mutations
- [ ] Token expiry and refresh work
- [ ] Default admin created on first run
- [ ] Rate limiting on login prevents brute force
- [ ] HTTPS with self-signed cert works

## Tasks

- [ ] Implement config profile CRUD API with JSON persistence
  - [ ] Create `ConfigProfile` TypeScript type
  - [ ] Implement `ProfileStore`: load/save `data/profiles.json`
  - [ ] CRUD endpoints: `GET/POST /api/profiles`, `GET/PUT/DELETE /api/profiles/:id`
- [ ] Implement config capture and apply
  - [ ] `POST /api/profiles/capture` — fetch all categories via `GET /v1/configs`, then items via `GET /v1/configs/<category>/*`, assemble and save
  - [ ] `POST /api/profiles/:id/apply` — bulk-set via `POST /v1/configs`, optionally `PUT /v1/configs:save_to_flash`, return change report
- [ ] Implement profile diff and export/import
  - [ ] `GET /api/profiles/:id/diff?against=:otherId` — compare two profiles item-by-item
  - [ ] `GET /api/profiles/:id/diff?deviceId=:id` — compare profile against live device config
  - [ ] `GET /api/profiles/:id/export` — download as JSON file
  - [ ] `POST /api/profiles/import` — upload JSON, validate, save as new profile
- [ ] Build profile management UI
  - [ ] Profile list page at `/profiles`: cards with name, description, device type, date
  - [ ] Capture button on device dashboard: "SAVE CONFIG AS PROFILE"
  - [ ] Apply button with confirmation dialog showing diff preview
  - [ ] Diff viewer: side-by-side with category grouping, changed items highlighted
  - [ ] Export/import buttons
- [ ] Implement user model, storage, and JWT authentication
  - [ ] Create `User` TypeScript type (id, username, passwordHash, role, allowedDevices)
  - [ ] Implement `UserStore`: load/save `data/users.json`, bcrypt hashing
  - [ ] First-run: create default admin account, log password to console
  - [ ] `POST /api/auth/login` — validate credentials, return JWT
  - [ ] `POST /api/auth/refresh` — renew token
  - [ ] `POST /api/auth/logout` — invalidate token
  - [ ] Configurable token expiry (default 24h)
- [ ] Implement auth and authorization middleware
  - [ ] Auth middleware: validate JWT on all `/api/*` except `/api/auth/*`
  - [ ] Role middleware: admin/operator/viewer permissions per route
  - [ ] Device access middleware: check `allowedDevices` for `:deviceId` routes
  - [ ] Skip auth when no users configured (opt-in security)
- [ ] Implement user management API and audit logging
  - [ ] `GET/POST /api/users`, `PUT/DELETE /api/users/:id` (admin only, exclude passwordHash)
  - [ ] Prevent deleting last admin
  - [ ] Audit middleware: log every POST/PUT/DELETE to `data/audit.log` (JSONL)
  - [ ] `GET /api/audit` — query with filters (from, to, userId, deviceId)
  - [ ] Log rotation by size (10MB)
- [ ] Implement rate limiting and HTTPS
  - [ ] Login: 5 attempts/minute/IP
  - [ ] API: 100 requests/minute/user
  - [ ] HTTPS: self-signed cert generation for LAN, custom cert path for production
  - [ ] HTTP → HTTPS redirect when TLS enabled
- [ ] Build auth and admin UI
  - [ ] Login page at `/login` with username/password form
  - [ ] User management page at `/admin/users`: list, create, edit, delete
  - [ ] Role and device access assignment in user edit form
  - [ ] Audit log viewer at `/admin/audit` with filtering
