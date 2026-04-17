# 0006: Memory Snapshots

## Summary

Add the ability to capture full 64KB memory snapshots, persist them to disk, and compare snapshots with a visual diff overlay in the hex viewer.

**Spec:** [Developer Tools](../specs/developer-tools/)
**Status:** draft
**Depends On:** 0004, 0005

## Motivation

- Developers need to compare memory state at different points in time
- Snapshots enable "before/after" analysis of program behavior
- Visual diff in the hex viewer makes changes immediately apparent

## Requirements

### Snapshot Capture

The system MUST capture and persist full 64KB memory snapshots.

#### Scenario: Take Snapshot

- **GIVEN** a device is online
- **WHEN** a user clicks SNAPSHOT and provides a name
- **THEN** the system pauses the CPU, reads all 64KB, resumes, and saves to disk

### Snapshot Comparison

The system MUST compare two snapshots and highlight differences.

#### Scenario: Diff Snapshots

- **GIVEN** two snapshots exist for a device
- **WHEN** a user selects "compare" between them
- **THEN** the hex viewer shows changed bytes highlighted (red/green)
- **AND** a summary shows total bytes changed

## Design

### Approach

1. Server: snapshot API endpoints + persistence (data/snapshots/ for binary, data/snapshots.json for index)
2. Client: snapshot manager UI + diff overlay in hex viewer

### Decisions

- **Decision**: Store binary snapshots as raw files in data/snapshots/
  - **Why**: 64KB per snapshot is too large for JSON; raw binary is space-efficient
  - **Alternatives considered**: Base64 in JSON (rejected — 33% size overhead)

### Non-Goals

- Periodic/automatic snapshots
- Snapshot annotations or bookmarks within a snapshot

## Tasks

- [ ] Create snapshot API endpoints
  - [ ] POST /api/devices/:deviceId/snapshots — capture (name in body)
  - [ ] GET /api/devices/:deviceId/snapshots — list
  - [ ] GET /api/devices/:deviceId/snapshots/:id/data — download binary
  - [ ] DELETE /api/devices/:deviceId/snapshots/:id
  - [ ] GET /api/devices/:deviceId/snapshots/:id/diff?against=:otherId
- [ ] Create snapshot persistence (data/snapshots/ + data/snapshots.json index)
- [ ] Add diff overlay to hex viewer component
  - [ ] Red highlight for bytes that differ
  - [ ] Summary bar: "N bytes changed (X%)"
- [ ] Create snapshot manager UI panel
  - [ ] List snapshots (name, date, size)
  - [ ] Take snapshot button
  - [ ] Compare selector
  - [ ] Delete button
- [ ] Write tests for snapshot API and diff logic

## Open Questions

- [ ] Should snapshots include CPU register state (PC, SP, A, X, Y, flags)?

## References

- Spec: [Developer Tools](../specs/developer-tools/)
- Depends on: [0004-memory-read-write-api](./0004-memory-read-write-api.md), [0005-hex-viewer-disassembler](./0005-hex-viewer-disassembler.md)
