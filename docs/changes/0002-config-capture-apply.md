# 0002: Config Capture, Apply, and Diff

## Summary

Add endpoints to capture a device's current configuration as a profile, apply a saved profile to a device, and diff two profiles or a profile against a device's live config.

**Spec:** [Config Profiles](../specs/config-profiles/)
**Status:** draft
**Depends On:** 0001

## Motivation

- CRUD alone isn't useful without the ability to read config FROM a device and write it back
- Diff enables users to compare configurations before applying (what will change?)
- These are the core value-add operations that make profiles useful

## Requirements

### Capture

The system MUST be able to read all configuration from a device and save it as a named profile.

#### Scenario: Capture Device Config

- **GIVEN** a device is online
- **WHEN** a user POSTs to /api/profiles/capture with { deviceId, name }
- **THEN** the system fetches all config categories and items from the device
- **AND** saves the result as a new ConfigProfile

#### Scenario: Capture Offline Device

- **GIVEN** a device is offline
- **WHEN** a user attempts capture
- **THEN** the system returns 503 with an error message

### Apply

The system MUST be able to write a profile's configuration values to a device.

#### Scenario: Apply Profile

- **GIVEN** a saved profile and an online device
- **WHEN** a user POSTs to /api/profiles/:id/apply with { deviceId }
- **THEN** the system sets each config item on the device via PUT /v1/configs/{category}/{item}
- **AND** returns a summary of items applied

#### Scenario: Apply With Flash Save

- **GIVEN** a profile is being applied
- **WHEN** the request includes { deviceId, saveToFlash: true }
- **THEN** after applying all items, the system calls PUT /v1/configs:save_to_flash

### Diff

The system MUST compare two configurations and return the differences.

#### Scenario: Diff Two Profiles

- **GIVEN** two saved profiles
- **WHEN** a user GETs /api/profiles/:id/diff?against=:otherId
- **THEN** the system returns changes, leftOnly, rightOnly, and identical count

#### Scenario: Diff Profile vs Live Device

- **GIVEN** a saved profile and an online device
- **WHEN** a user GETs /api/profiles/:id/diff?deviceId=:deviceId
- **THEN** the system captures the device's current config and diffs against the profile

### Import/Export

The system SHOULD support JSON import and export of profiles.

#### Scenario: Export Profile

- **GIVEN** a saved profile
- **WHEN** a user GETs /api/profiles/:id/export
- **THEN** the system returns the profile as a downloadable JSON file

#### Scenario: Import Profile

- **GIVEN** a valid profile JSON file
- **WHEN** a user POSTs to /api/profiles/import
- **THEN** the system creates a new profile from the imported data

## Design

### Approach

Add new route handlers to the existing profiles route file:
- Capture: iterate GET /v1/configs → per-category GET /v1/configs/{cat} → assemble + save
- Apply: iterate profile config → per-item PUT /v1/configs/{cat}/{item} → optional save_to_flash
- Diff: load both configs → compare by category+item key → categorize as changed/leftOnly/rightOnly/identical
- Export: serialize profile as JSON with Content-Disposition
- Import: validate shape, create new profile

### Decisions

- **Decision**: Capture reads ALL categories, not a subset
  - **Why**: Profiles should be complete snapshots for reliable apply
  - **Alternatives considered**: Selective capture (rejected — complex UX, easy to miss items)

- **Decision**: Apply is NOT atomic (items set one-by-one)
  - **Why**: C64U API only supports per-item writes, no bulk/transaction API
  - **Alternatives considered**: None available given hardware constraints

### Non-Goals

- Selective apply (apply only changed items) — future enhancement
- Profile versioning/history
- UI (change 0003)

## Tasks

- [ ] Add ConfigDiff type to src/shared/types.ts
- [ ] Implement capture endpoint: POST /api/profiles/capture
  - [ ] Fetch config categories from device
  - [ ] Fetch items for each category
  - [ ] Assemble and save as new profile
- [ ] Implement apply endpoint: POST /api/profiles/:id/apply
  - [ ] Load profile, resolve device
  - [ ] Set each config item via proxy
  - [ ] Optional save_to_flash call
- [ ] Implement diff endpoint: GET /api/profiles/:id/diff
  - [ ] Support ?against=:otherId (profile vs profile)
  - [ ] Support ?deviceId=:id (profile vs live device)
- [ ] Implement export: GET /api/profiles/:id/export
- [ ] Implement import: POST /api/profiles/import
- [ ] Write tests for capture, apply, diff, import, export

## Open Questions

- [ ] Should apply skip read-only config items silently or report them as errors?
- [ ] Should diff ignore items that exist in one config but not the other (different firmware versions)?

## References

- Spec: [Config Profiles](../specs/config-profiles/)
- C64U Config API: `docs/c64.md` (Configuration section)
- Depends on: [0001-config-profile-crud](./0001-config-profile-crud.md)
