# 0005: Hex Viewer and 6502 Disassembler

## Summary

Add a client-side hex viewer with editable bytes and a synchronized 6502 disassembler panel, providing a memory browser UI for the device dashboard.

**Spec:** [Developer Tools](../specs/developer-tools/)
**Status:** implemented
**Depends On:** 0004

## Motivation

- Developers working with C64 software need to inspect and modify memory
- A hex viewer is the standard tool for this workflow
- Integrated disassembly makes it easier to understand what code is doing
- All rendering is client-side to minimize server load

## Requirements

### Hex Viewer

The system MUST display memory as a hex editor grid.

#### Scenario: View Memory

- **GIVEN** a user navigates to the memory browser for a device
- **WHEN** the page loads
- **THEN** they see a hex grid with Address | Hex (16 bytes/row) | ASCII columns

#### Scenario: Edit Byte

- **GIVEN** the hex viewer is showing memory
- **WHEN** a user clicks a hex byte and types a new value
- **THEN** the byte is written to the device via the memory write API
- **AND** the display updates to show the new value

### 6502 Disassembler

The system MUST disassemble memory into 6502 instructions alongside the hex view.

#### Scenario: Disassemble

- **GIVEN** memory data is loaded in the hex viewer
- **WHEN** the user enables the disassembly panel
- **THEN** the right panel shows disassembled 6502 instructions
- **AND** scrolling is synchronized between hex and disassembly views

### Screen Viewer

The system SHOULD display a PETSCII screen preview from screen RAM.

#### Scenario: View Screen RAM

- **GIVEN** memory from $0400-$07E7 is loaded
- **WHEN** the user opens the screen viewer
- **THEN** a 40x25 grid renders the screen characters using C64 Pro Mono PETSCII glyphs

## Design

### Approach

1. Create `src/client/components/dev/hex-viewer.tsx` — virtual-scrolled hex grid
2. Create `src/client/lib/disassembler.ts` — pure function: bytes → instructions
3. Create `src/client/components/dev/disassembly-panel.tsx` — instruction list
4. Create `src/client/components/dev/screen-viewer.tsx` — PETSCII render
5. Create route `src/client/routes/devices/$deviceId/memory.tsx`
6. Add TanStack Query hooks for memory read/write

### Decisions

- **Decision**: Virtual scrolling for 64KB hex grid (not all in DOM)
  - **Why**: 4096 rows would be too expensive to render at once
  - **Alternatives considered**: Paginated view (rejected — breaks scroll flow)

- **Decision**: Client-side disassembly (no server endpoint)
  - **Why**: Disassembly is a pure function on already-fetched data; no need for server round-trip
  - **Alternatives considered**: Server-side (rejected — unnecessary complexity)

- **Decision**: Support all 151 official 6510 opcodes + common undocumented
  - **Why**: Real C64 software uses undocumented opcodes frequently
  - **Alternatives considered**: Official only (rejected — would show unknown for common code)

### Non-Goals

- Breakpoints or stepping (would require debug protocol)
- Memory watch/auto-refresh
- Assembler (write assembly → bytes)

## Tasks

- [x] Create 6502 disassembler in src/client/lib/disassembler.ts
  - [x] Opcode table (151 official + ~20 common undocumented)
  - [x] Addressing mode decoding
  - [x] Instruction formatting with hex addresses
- [x] Create hex viewer component
  - [x] Virtual-scrolled grid (address + 16 hex bytes + ASCII)
  - [x] Click-to-edit bytes
  - [x] Address navigation (jump to address input)
  - [x] Highlight on hover/selection
- [x] Create disassembly panel component
  - [x] Synchronized scroll with hex viewer
  - [x] Instruction highlighting by category (load/store, branch, etc.)
- [x] Create screen viewer component
  - [x] 40x25 PETSCII grid from $0400 data
  - [x] Color RAM support (if available)
- [x] Create memory browser route and hooks
  - [x] useMemoryRead(deviceId, address, length)
  - [x] useMemoryWrite(deviceId) mutation
- [x] Write tests for disassembler (opcode coverage)

## Open Questions

- [ ] Should the hex viewer auto-refresh on a timer, or only refresh on demand?

## References

- Spec: [Developer Tools](../specs/developer-tools/)
- Depends on: [0004-memory-read-write-api](./0004-memory-read-write-api.md)
- 6502 opcode reference: https://www.masswerk.at/6502/6502_instruction_set.html
