# 0004: Memory Read/Write API

## Summary

Add server-side API endpoints for reading and writing C64 memory through the device proxy, with support for ranged reads and hex-encoded writes.

**Spec:** [Developer Tools](../specs/developer-tools/)
**Status:** draft
**Depends On:** —

## Motivation

- The proxy already forwards raw /v1/machine:readmem and :writemem, but there's no convenient API layer
- Need structured endpoints that handle address parsing, chunked reads for large ranges, and proper error responses
- Foundation for hex viewer, snapshots, and disassembler features

## Requirements

### Memory Read

The system MUST provide an endpoint to read a range of device memory.

#### Scenario: Read Memory Range

- **GIVEN** a device is online
- **WHEN** a user GETs /api/devices/:deviceId/memory?address=0400&length=1000
- **THEN** the system returns the binary data from address $0400, 1000 bytes

#### Scenario: Read Full 64KB

- **GIVEN** a device is online
- **WHEN** a user GETs /api/devices/:deviceId/memory?address=0000&length=65536
- **THEN** the system pauses the CPU, reads in chunks, resumes the CPU
- **AND** returns the complete 64KB binary blob

### Memory Write

The system MUST provide an endpoint to write bytes to device memory.

#### Scenario: Write Memory

- **GIVEN** a device is online
- **WHEN** a user PUTs /api/devices/:deviceId/memory with { address: "0400", data: "48454C4C4F" }
- **THEN** the system writes those bytes to the device at address $0400

## Design

### Approach

1. Create `src/server/routes/memory.ts` with read/write endpoints
2. For large reads (>256 bytes), chunk into multiple readmem calls
3. For full 64KB capture: pause → chunked read → resume
4. Return binary for reads, JSON status for writes

### Decisions

- **Decision**: Chunk size of 256 bytes for memory reads
  - **Why**: C64U readmem has a practical limit per request; 256 is safe and fast
  - **Alternatives considered**: 1024 (may exceed device buffer), 64 (too many requests)

- **Decision**: Auto-pause/resume for reads >4KB
  - **Why**: Large reads without pause will have inconsistent data as the CPU modifies memory
  - **Alternatives considered**: Always pause (intrusive for small reads), never pause (inconsistent data)

### Non-Goals

- Hex viewer UI (change 0005)
- Memory snapshots (change 0006)
- Disassembly (change 0005)

## Tasks

- [ ] Create memory routes in src/server/routes/memory.ts
  - [ ] GET /api/devices/:deviceId/memory?address=XXXX&length=N
  - [ ] PUT /api/devices/:deviceId/memory (body: { address, data })
  - [ ] Chunked read logic for large ranges
  - [ ] Auto-pause/resume for reads >4KB
- [ ] Register route in src/server/index.ts
- [ ] Write tests in tests/memory-routes.test.ts

## Open Questions

- [ ] What's the actual max read size per C64U readmem call? Need to test with hardware.

## References

- Spec: [Developer Tools](../specs/developer-tools/)
- C64U API: GET /v1/machine:readmem?address=XXXX&length=N, PUT /v1/machine:writemem
