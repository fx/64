# 0010 — Memory Tools

## Overview

Enhanced hex viewer/editor, 6502 disassembler, and memory snapshot tools for the C64's 64KB address space. Builds on the C64U's `readmem`/`writemem` DMA endpoints to provide a modern, browser-based memory inspection and debugging experience.

## Background

The existing c64u-control-panel has a capable memory browser with hex editing, a 6502 disassembler, and a screen memory viewer. We keep the core functionality but add: memory snapshots, diff between snapshots, and symbol table support.

The C64U API provides:
- `GET /v1/machine:readmem?address=XXXX&length=N` — read up to 64KB via DMA
- `PUT /v1/machine:writemem?address=XXXX&data=XXXX` — write up to 128 bytes via hex in URL
- `POST /v1/machine:writemem?address=XXXX` — write larger blocks via binary POST
- `PUT /v1/machine:pause` / `PUT /v1/machine:resume` — freeze CPU for consistent reads

## Goals

- Hex viewer with configurable columns (8/16/32 bytes per row)
- Inline hex editing with write-back to device
- 6502 disassembly view with instruction highlighting
- Memory snapshots: capture full 64KB, compare snapshots
- Diff view: highlight bytes that changed between two snapshots
- Screen memory viewer (text mode: $0400-$07FF + color RAM)
- Symbol table import (VICE label files `.lbl`, KickAssembler `.sym`)
- Address bookmarks

## Non-Goals

- Live memory streaming (would require continuous DMA polling, too heavy)
- Breakpoint/step debugging (C64U doesn't expose CPU debug beyond DMA)
- Sprite editor or graphics mode visualization (future)
- Memory search/scan (possible but complex — future)

## Technical Design

### Memory Read Strategy

Reading the full 64KB address space:
1. Pause the CPU: `PUT /v1/machine:pause`
2. Read in chunks: `GET /v1/machine:readmem?address=0000&length=65536` (or multiple smaller reads if the device has a size limit)
3. Resume the CPU: `PUT /v1/machine:resume`

For small reads (hex viewer paging), read only the visible range without pausing.

### Snapshots

```typescript
interface MemorySnapshot {
  id: string
  name: string
  deviceId: string
  data: Uint8Array       // 65536 bytes
  timestamp: string
}
```

Stored as binary files in `data/snapshots/`. Index in `data/snapshots.json`.

### Diff

Compare two snapshots byte-by-byte. Return ranges of changed bytes:

```typescript
interface MemoryDiff {
  changes: Array<{
    address: number       // start address
    length: number        // number of changed bytes
    left: number[]        // bytes in snapshot A
    right: number[]       // bytes in snapshot B
  }>
  totalChanged: number
}
```

### API Endpoints

```
# Direct memory access (proxied to device)
GET    /api/devices/:deviceId/memory?address=0000&length=256   → read memory
PUT    /api/devices/:deviceId/memory                            → write memory { address, data }

# Snapshots
POST   /api/devices/:deviceId/snapshots                        → capture snapshot { name }
GET    /api/devices/:deviceId/snapshots                        → list snapshots
GET    /api/devices/:deviceId/snapshots/:id                    → get snapshot metadata
GET    /api/devices/:deviceId/snapshots/:id/data               → download raw binary
DELETE /api/devices/:deviceId/snapshots/:id                    → delete snapshot
GET    /api/devices/:deviceId/snapshots/:id/diff?against=:otherId → diff two snapshots

# Symbols
POST   /api/devices/:deviceId/symbols                          → upload label/symbol file
GET    /api/devices/:deviceId/symbols                          → get loaded symbols
DELETE /api/devices/:deviceId/symbols                          → clear symbols
```

### Symbol Tables

Parse VICE label files (`.lbl`):
```
al C:0800 .start
al C:0810 .mainloop
al C:D020 .border_color
```

And KickAssembler symbol files (`.sym`):
```
.label start=$0800
.label mainloop=$0810
```

Symbols are displayed in the hex viewer and disassembler next to their addresses.

### 6502 Disassembler

Client-side disassembly (JavaScript). Takes raw bytes and produces:

```
$0800  A9 00     LDA #$00        ; start
$0802  8D 20 D0  STA $D020       ; border_color
$0805  4C 05 08  JMP $0805
```

Features:
- All official 6502 opcodes + common undocumented opcodes
- Symbol labels rendered at target addresses
- Click address to navigate
- Highlight current instruction

### UI Components

- **Hex viewer:** Virtual-scrolled grid for the full 64KB space. Columns: address, hex bytes, ASCII. Editable.
- **Disassembly panel:** Synchronized with hex viewer (selecting bytes shows disassembly and vice versa)
- **Snapshot manager:** List of snapshots with capture/diff/delete actions
- **Diff overlay:** In hex viewer, highlight changed bytes in red/green
- **Screen viewer:** Render C64 text screen (PETSCII) using character ROM font
- **Symbol sidebar:** List of loaded symbols, click to navigate

## Acceptance Criteria

- [ ] Hex viewer displays memory from a device with virtual scrolling
- [ ] Inline editing writes changes back to device
- [ ] 6502 disassembler renders correct mnemonics for all official opcodes
- [ ] Full 64KB snapshot capture works (pause, read, resume)
- [ ] Diff between two snapshots highlights changed regions
- [ ] VICE label file import populates symbol table
- [ ] Symbols display in hex viewer and disassembler
- [ ] Screen memory viewer renders PETSCII text

## Tasks

- [ ] Implement memory read/write API endpoints
  - [ ] `GET /api/devices/:deviceId/memory?address=XXXX&length=N` — proxy to `GET /v1/machine:readmem`, return binary
  - [ ] `PUT /api/devices/:deviceId/memory` — accept `{ address, data }`, proxy to `PUT /v1/machine:writemem` (hex URL) or `POST /v1/machine:writemem` (binary body) based on size
- [ ] Implement memory snapshot API
  - [ ] `POST /api/devices/:deviceId/snapshots` — pause CPU, read full 64KB, resume CPU, save binary to `data/snapshots/`
  - [ ] `GET /api/devices/:deviceId/snapshots` — list snapshots (metadata from `data/snapshots.json`)
  - [ ] `GET /api/devices/:deviceId/snapshots/:id/data` — download raw 64KB binary
  - [ ] `DELETE /api/devices/:deviceId/snapshots/:id` — delete snapshot file and index entry
- [ ] Implement snapshot diff API
  - [ ] `GET /api/devices/:deviceId/snapshots/:id/diff?against=:otherId` — byte-by-byte comparison
  - [ ] Return changed ranges with addresses, lengths, and byte values from both sides
- [ ] Implement symbol table API
  - [ ] `POST /api/devices/:deviceId/symbols` — upload and parse VICE `.lbl` or KickAssembler `.sym` file
  - [ ] `GET /api/devices/:deviceId/symbols` — return loaded symbol table (address → label map)
  - [ ] `DELETE /api/devices/:deviceId/symbols` — clear symbols
  - [ ] Parser for VICE format (`al C:XXXX .label`) and KickAssembler format (`.label name=$XXXX`)
- [ ] Build hex viewer UI component
  - [ ] Virtual-scrolled grid for 64KB address space (address column, hex bytes, ASCII)
  - [ ] Configurable column width (8/16/32 bytes per row)
  - [ ] Inline editing: click a byte to edit, write changes back to device on confirm
  - [ ] Address navigation: jump to address input
  - [ ] Diff overlay: highlight changed bytes (red/green) when comparing against a snapshot
- [ ] Build 6502 disassembler (client-side)
  - [ ] Decode all official 6502 opcodes with correct addressing modes
  - [ ] Include common undocumented opcodes (LAX, SAX, DCP, ISC, etc.)
  - [ ] Render: address, hex bytes, mnemonic, operand with symbol labels where available
  - [ ] Click address operand to navigate to that address
  - [ ] Synchronized view with hex viewer (selecting bytes scrolls disassembly and vice versa)
- [ ] Build screen memory viewer
  - [ ] Read `$0400-$07FF` (screen RAM) and color RAM
  - [ ] Render PETSCII characters using C64 character ROM font
  - [ ] 40x25 grid display matching the C64 text screen
- [ ] Build snapshot manager and symbol sidebar UI
  - [ ] Snapshot list with name, timestamp, capture/diff/delete actions
  - [ ] Symbol sidebar: list of labels with addresses, click to navigate in hex viewer
  - [ ] Address bookmarks: save/load named addresses
