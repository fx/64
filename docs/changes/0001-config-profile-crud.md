# 0001: Config Profile CRUD

## Summary

Add a ProfileStore and CRUD API endpoints for managing named configuration profiles. This lays the data foundation for capture/apply/diff functionality.

**Spec:** [Config Profiles](../specs/config-profiles/)
**Status:** complete
**Depends On:** —

## Motivation

- Users want to save and manage named configuration profiles for their C64U devices
- No profile storage exists yet — this change creates the persistence layer and REST API
- Follows the same JSON store + Hono route pattern as devices, macros, playlists, and collections

## Requirements

### Profile Storage

The system MUST persist profiles to `data/profiles.json` using the same JSON store pattern as other entities.

#### Scenario: Create Profile

- **GIVEN** no profiles exist
- **WHEN** a user POSTs a new profile with name, description, and config data
- **THEN** the profile is persisted with a generated ID and timestamps

#### Scenario: List Profiles

- **GIVEN** profiles exist
- **WHEN** a user GETs /api/profiles
- **THEN** all profiles are returned with id, name, description, deviceProduct, createdAt, updatedAt

### Profile Data Model

The system MUST store profiles with this shape:

```typescript
interface ConfigProfile {
  id: string
  name: string
  description?: string
  deviceProduct?: string
  config: Record<string, Record<string, string | number>>
  createdAt: string
  updatedAt: string
}
```

## Design

### Approach

1. Create `ProfileStore` class in `src/server/lib/profile-store.ts` following `CollectionStore` pattern
2. Create `src/server/routes/profiles.ts` with CRUD endpoints
3. Add types to `src/shared/types.ts`
4. Register route in `src/server/index.ts`

### Decisions

- **Decision**: Use same JSON file persistence as other stores
  - **Why**: Consistent with existing architecture, no new dependencies
  - **Alternatives considered**: SQLite (rejected — overkill for homelab)

### Non-Goals

- Capture from device (change 0002)
- Apply to device (change 0002)
- Diff functionality (change 0002)
- UI (change 0003)

## Tasks

- [x] Add ConfigProfile type to src/shared/types.ts (PR #21)
- [x] Create ProfileStore in src/server/lib/profile-store.ts (PR #21)
- [x] Create profile routes in src/server/routes/profiles.ts (PR #21)
  - [x] GET /api/profiles — list all
  - [x] POST /api/profiles — create
  - [x] GET /api/profiles/:id — get single
  - [x] PUT /api/profiles/:id — update
  - [x] DELETE /api/profiles/:id — delete
- [x] Register route in src/server/index.ts (PR #21)
- [x] Write tests in tests/profile-store.test.ts (PR #21)
- [x] Write tests in tests/profile-routes.test.ts (PR #21)

## Open Questions

None.

## References

- Spec: [Config Profiles](../specs/config-profiles/)
- Pattern: `src/server/lib/collection-store.ts`, `src/server/routes/collections.ts`
