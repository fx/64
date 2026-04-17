# 0003: Config Profile UI

## Summary

Add a profile manager page with UI for listing, capturing, applying, diffing, and importing/exporting configuration profiles.

**Spec:** [Config Profiles](../specs/config-profiles/)
**Status:** complete
**Depends On:** 0001, 0002

## Motivation

- The CRUD and capture/apply/diff APIs need a user-facing interface
- Users need to visually compare configs before applying
- Follows the same page-per-feature pattern as macros, playlists, and collections

## Requirements

### Profile Manager Page

The system MUST provide a profile manager page at `/profiles`.

#### Scenario: List Profiles

- **GIVEN** profiles exist
- **WHEN** a user navigates to /profiles
- **THEN** they see a table of profiles with name, description, device product, and action buttons

#### Scenario: Capture Config

- **GIVEN** a user is on the profile manager page
- **WHEN** they select a device and click CAPTURE
- **THEN** the system captures the device's current config and creates a new profile

### Diff Viewer

The system MUST provide a visual diff when comparing configurations.

#### Scenario: View Diff

- **GIVEN** a user selects two profiles to compare
- **WHEN** the diff loads
- **THEN** changed items are highlighted, with left/right values shown
- **AND** added/removed items are clearly indicated

### Apply Confirmation

The system MUST show a confirmation before applying a profile to a device.

#### Scenario: Apply With Preview

- **GIVEN** a user clicks APPLY on a profile
- **WHEN** they select a target device
- **THEN** the system shows a diff (profile vs device current config)
- **AND** requires confirmation before applying

## Design

### Approach

1. Create route at `src/client/routes/profiles/index.tsx`
2. Create TanStack Query hooks in `src/client/hooks/use-profiles.ts`
3. Build diff viewer component
4. Add navigation link on home page
5. Follow C64 design system (PETSCII borders, inverse-video buttons, 16 colors)

### Decisions

- **Decision**: Diff viewer uses side-by-side layout with colored highlights
  - **Why**: Easiest to scan visually, similar to how collections show disk lists
  - **Alternatives considered**: Inline unified diff (rejected — harder to read for key-value configs)

### Non-Goals

- Config item editing within the diff viewer
- Partial/selective apply from the diff view
- Profile sharing between instances

## Tasks

- [x] Create TanStack Query hooks in src/client/hooks/use-profiles.ts (PR #25)
  - [x] useProfiles(), useProfile(id), CRUD mutations
  - [x] useCaptureProfile(), useApplyProfile()
  - [x] useProfileDiff(id, against/deviceId)
  - [x] useExportProfile(), useImportProfile()
- [x] Create profile manager route at src/client/routes/profiles/index.tsx (PR #25)
  - [x] Profile list table
  - [x] Capture form (device selector + name input)
  - [x] Apply flow (device selector + diff preview + confirm)
  - [x] Delete with confirmation
- [x] Create diff viewer component (PR #25)
  - [x] Category-grouped item comparison
  - [x] Changed/added/removed highlighting using C64 colors
  - [x] Identical count summary
- [x] Add /profiles link to home page navigation (PR #25)
- [x] Import/export buttons (file input + download) (PR #25)
- [x] Update TanStack Router route tree (PR #25)

## Open Questions

- [x] Should the diff viewer group by category with collapsible sections, or show a flat list?
  - **Decision**: Group by category with static sections (not collapsible). Simple and scannable.

## References

- Spec: [Config Profiles](../specs/config-profiles/)
- Depends on: [0001-config-profile-crud](./0001-config-profile-crud.md), [0002-config-capture-apply](./0002-config-capture-apply.md)
- Pattern: `src/client/routes/collections/index.tsx`
