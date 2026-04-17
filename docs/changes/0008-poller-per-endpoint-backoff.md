# 0008: Per-Endpoint Poller Backoff

## Summary

Fix DevicePoller to track exponential backoff independently per polling endpoint (drives vs info) instead of sharing a single backoff multiplier per device. Currently, a failure in one endpoint (e.g., drives) increases the backoff for all endpoints, causing unnecessary slowdown.

**Spec:** [Realtime Events](../specs/realtime-events/)
**Status:** complete
**Depends On:** —

## Motivation

- The DevicePoller polls two endpoints per device: drives (5s base) and info (30s base)
- Both share the same backoff multiplier per device
- If drives polling fails, info polling also slows down (and vice versa)
- These endpoints can fail independently (e.g., drives endpoint may be slow while info works fine)
- Independent backoff would improve state freshness when only one endpoint has issues

## Requirements

### Independent Backoff Tracking

The DevicePoller MUST maintain separate backoff state for each polling endpoint per device.

#### Scenario: Drives Fails While Info Succeeds

- **GIVEN** a device is online and both drives and info are being polled
- **WHEN** the drives endpoint starts returning errors
- **THEN** only the drives polling interval increases via backoff
- **AND** the info polling interval remains at its base rate (30s)

#### Scenario: Backoff Reset Per Endpoint

- **GIVEN** a device's drives endpoint has backed off to 60s
- **WHEN** the drives endpoint starts succeeding again
- **THEN** the drives polling interval resets to its base rate (5s)
- **AND** the info polling interval is unaffected

## Design

### Approach

Refactor the backoff tracking in `src/server/lib/device-poller.ts` from a single per-device multiplier to per-device-per-endpoint multipliers.

Current structure (single multiplier):
```typescript
// Per device
{ timers: { drives, info }, backoff: number }
```

New structure (per-endpoint multiplier):
```typescript
// Per device
{ timers: { drives, info }, backoff: { drives: number, info: number } }
```

### Decisions

- **Decision**: Keep the same max backoff cap (5 minutes) per endpoint
  - **Why**: Consistent behavior, prevents any single endpoint from polling too aggressively on persistent failure
  - **Alternatives considered**: Different caps per endpoint type (rejected — unnecessary complexity)

### Non-Goals

- Changing the base polling intervals (5s drives, 30s info)
- Adding new polling endpoints
- Persisting backoff state across restarts

## Tasks

- [x] Refactor DevicePoller backoff from per-device to per-device-per-endpoint (PR #20)
  - [x] Update internal state type to track separate backoff multipliers
  - [x] Update `scheduleDrives()` to use drives-specific backoff
  - [x] Update `scheduleInfo()` to use info-specific backoff
  - [x] Reset only the relevant endpoint's backoff on success
- [x] Update tests in `tests/device-poller.test.ts` (PR #20)
  - [x] Test: drives failure doesn't affect info interval
  - [x] Test: info failure doesn't affect drives interval
  - [x] Test: backoff reset is per-endpoint

## Open Questions

None.

## References

- Spec: [Realtime Events](../specs/realtime-events/)
- Source: `src/server/lib/device-poller.ts`
- Tests: `tests/device-poller.test.ts`
