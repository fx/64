# 0008 — Developer Tools: Memory Browser & Stream Viewer

## Overview

Advanced developer-facing tools: (1) a hex viewer/editor with 6502 disassembler, memory snapshots, and symbol table support for the C64's 64KB address space, and (2) a video/audio stream viewer that receives the U64's real-time output in the browser.

## Goals

### Memory Tools
- Hex viewer with configurable columns (8/16/32 bytes per row) and virtual scrolling
- Inline hex editing with write-back to device via DMA
- 6502 disassembly view with instruction highlighting and symbol labels
- Memory snapshots: capture full 64KB, diff between snapshots
- Screen memory viewer ($0400-$07FF + color RAM) rendered with PETSCII font
- Symbol table import (VICE `.lbl`, KickAssembler `.sym` files)
- Address bookmarks

### Stream Viewer (U64 Only)
- Start/stop video and audio streams from the UI
- Receive U64 UDP streams on the proxy server
- Display video in browser in near-real-time (< 500ms latency target)
- Play audio in browser synchronized with video
- Stream controls and quality indicators

## Non-Goals

- Live continuous memory streaming (too heavy for DMA polling)
- Breakpoint/step debugging
- Sprite/graphics mode editor
- Memory search/scan
- Stream recording to files
- Stream forwarding to Twitch/external services
- Debug stream visualization (port 11002)
- UII+ stream support (U64 hardware feature only)

## Technical Design

### Part 1: Memory Tools

#### Memory Read Strategy

- Small reads (hex viewer paging): `GET /v1/machine:readmem?address=XXXX&length=N` without pausing
- Full 64KB snapshot: pause CPU → read all → resume CPU

```
PUT  /v1/machine:pause
GET  /v1/machine:readmem?address=0000&length=65536
PUT  /v1/machine:resume
```

#### Data Models

```typescript
interface MemorySnapshot {
  id: string
  name: string
  deviceId: string
  data: Uint8Array       // 65536 bytes
  timestamp: string
}

interface MemoryDiff {
  changes: Array<{
    address: number
    length: number
    left: number[]
    right: number[]
  }>
  totalChanged: number
}

interface SymbolTable {
  symbols: Map<number, string>  // address → label
}
```

Snapshots stored as binary files in `data/snapshots/`. Index in `data/snapshots.json`.

#### API Endpoints

```
# Memory access (proxied)
GET    /api/devices/:deviceId/memory?address=0000&length=256
PUT    /api/devices/:deviceId/memory                         → { address, data }

# Snapshots
POST   /api/devices/:deviceId/snapshots                      → capture { name }
GET    /api/devices/:deviceId/snapshots                      → list
GET    /api/devices/:deviceId/snapshots/:id/data             → download binary
DELETE /api/devices/:deviceId/snapshots/:id                  → delete
GET    /api/devices/:deviceId/snapshots/:id/diff?against=:id → diff

# Symbols
POST   /api/devices/:deviceId/symbols                        → upload .lbl/.sym
GET    /api/devices/:deviceId/symbols                        → get loaded
DELETE /api/devices/:deviceId/symbols                        → clear
```

#### Symbol Parsers

VICE format: `al C:0800 .start`
KickAssembler format: `.label start=$0800`

#### 6502 Disassembler (Client-Side)

All official opcodes + common undocumented (LAX, SAX, DCP, ISC). Output:
```
$0800  A9 00     LDA #$00        ; start
$0802  8D 20 D0  STA $D020       ; border_color
```

Click address to navigate. Synchronized scroll with hex viewer.

#### UI Components

- **Hex viewer**: virtual-scrolled 64KB grid (address, hex bytes, ASCII), editable
- **Disassembly panel**: synchronized with hex viewer
- **Screen viewer**: 40x25 PETSCII grid from $0400-$07FF + color RAM
- **Snapshot manager**: list with capture/diff/delete
- **Symbol sidebar**: labels with addresses, click to navigate
- **Diff overlay**: highlight changed bytes red/green in hex viewer

### Part 2: Stream Viewer

#### Architecture

The U64 streams video (UDP 11000), audio (UDP 11001), and debug (UDP 11002) to a target IP.

**Key challenge:** Stream format is undocumented. This requires a research spike:
1. Capture raw UDP packets
2. Analyze format (raw pixels? compressed? standard codec?)
3. Choose browser delivery: WebRTC, MSE, or WebSocket+canvas

**Recommended approach for C64's low resolution (320x200):** WebSocket binary relay with client-side canvas rendering. Simple, no codec dependencies, feasible at this resolution.

#### API Endpoints

```
POST   /api/devices/:deviceId/streams/video/start
POST   /api/devices/:deviceId/streams/video/stop
POST   /api/devices/:deviceId/streams/audio/start
POST   /api/devices/:deviceId/streams/audio/stop
GET    /api/devices/:deviceId/streams/status
```

Start tells the U64 to stream to the proxy's IP. Proxy receives UDP, relays to browser.

#### UI

- **Stream panel** on device dashboard: video canvas area, audio toggle
- **Controls**: start/stop, latency indicator, packet rate stats
- **Picture-in-picture**: pop out to floating window

### File Structure

```
src/server/
├── lib/
│   ├── snapshot-store.ts          # Snapshot binary storage + index
│   ├── symbol-parser.ts           # VICE .lbl + KickAssembler .sym parsers
│   └── stream-relay.ts            # UDP receiver + WebSocket relay
├── routes/
│   ├── memory.ts                  # Memory read/write + snapshots + symbols
│   └── streams.ts                 # Stream start/stop/status

src/client/
├── routes/
│   └── devices/
│       ├── $deviceId/
│       │   ├── memory.tsx         # Memory tools page
│       │   └── stream.tsx         # Stream viewer page
├── components/
│   ├── memory/
│   │   ├── hex-viewer.tsx         # Virtual-scrolled hex grid
│   │   ├── disassembler.tsx       # 6502 disassembly panel
│   │   ├── screen-viewer.tsx      # PETSCII screen display
│   │   ├── snapshot-manager.tsx   # Snapshot list + actions
│   │   └── symbol-sidebar.tsx     # Symbol table display
│   └── stream/
│       └── stream-panel.tsx       # Video canvas + controls
├── lib/
│   ├── disasm-6502.ts             # 6502 opcode table + disassembler
│   └── stream-client.ts           # WebSocket receiver + canvas renderer
```

## Open Questions

1. What is the U64's video stream format? (Requires hardware testing)
2. What is the audio format? (PCM? Compressed? Sample rate?)
3. Should the stream viewer be a separate page or embedded in the dashboard?

## Acceptance Criteria

### Memory Tools
- [ ] Hex viewer displays device memory with virtual scrolling
- [ ] Inline editing writes changes back to device
- [ ] 6502 disassembler renders correct mnemonics for all official opcodes
- [ ] Full 64KB snapshot capture works (pause, read, resume)
- [ ] Diff between snapshots highlights changed regions
- [ ] VICE label file import populates symbol table
- [ ] Symbols display in hex viewer and disassembler
- [ ] Screen memory viewer renders PETSCII text in 40x25 grid

### Stream Viewer
- [ ] Start/stop video stream via API
- [ ] Proxy receives UDP video packets
- [ ] Video displays in browser with < 500ms latency
- [ ] Audio plays synchronized with video
- [ ] Stream status reported via SSE
- [ ] UI shows controls and quality indicators

## Tasks

- [ ] Implement memory read/write API endpoints
  - [ ] `GET /api/devices/:deviceId/memory?address=XXXX&length=N` — proxy to `GET /v1/machine:readmem`, return binary
  - [ ] `PUT /api/devices/:deviceId/memory` — accept `{ address, data }`, route to PUT (≤128 bytes) or POST (larger) writemem
- [ ] Implement memory snapshot API
  - [ ] `POST /api/devices/:deviceId/snapshots` — pause CPU, read full 64KB, resume, save to `data/snapshots/`
  - [ ] `GET /api/devices/:deviceId/snapshots` — list (metadata from `data/snapshots.json`)
  - [ ] `GET /api/devices/:deviceId/snapshots/:id/data` — download raw 64KB binary
  - [ ] `DELETE /api/devices/:deviceId/snapshots/:id` — delete file and index entry
  - [ ] `GET /api/devices/:deviceId/snapshots/:id/diff?against=:otherId` — byte-by-byte comparison, return changed ranges
- [ ] Implement symbol table API
  - [ ] `POST /api/devices/:deviceId/symbols` — upload and parse VICE `.lbl` or KickAssembler `.sym`
  - [ ] Parser: VICE format (`al C:XXXX .label`), KickAssembler format (`.label name=$XXXX`)
  - [ ] `GET /api/devices/:deviceId/symbols` — return loaded symbol table
  - [ ] `DELETE /api/devices/:deviceId/symbols` — clear
- [ ] Build hex viewer UI component
  - [ ] Virtual-scrolled grid for 64KB address space (address, hex bytes, ASCII columns)
  - [ ] Configurable column width (8/16/32 bytes per row)
  - [ ] Inline editing: click byte to edit, write back to device on confirm
  - [ ] Address navigation: jump-to-address input
  - [ ] Diff overlay: highlight changed bytes red/green when comparing against a snapshot
- [ ] Build 6502 disassembler (client-side)
  - [ ] Opcode table: all official 6502 opcodes + common undocumented (LAX, SAX, DCP, ISC)
  - [ ] Render: address, hex bytes, mnemonic, operand with symbol labels
  - [ ] Click address operand to navigate
  - [ ] Synchronized scroll with hex viewer
- [ ] Build screen memory viewer and snapshot manager UI
  - [ ] Screen viewer: read $0400-$07FF + color RAM, render 40x25 PETSCII grid with C64 font
  - [ ] Snapshot manager: list with name, timestamp, capture/diff/delete actions
  - [ ] Symbol sidebar: labels with addresses, click to navigate in hex viewer
  - [ ] Address bookmarks: save/load named addresses
- [ ] Implement stream control API endpoints
  - [ ] `POST /api/devices/:deviceId/streams/video/start` — tell U64 to stream to proxy IP
  - [ ] `POST /api/devices/:deviceId/streams/video/stop`, `.../audio/start`, `.../audio/stop`
  - [ ] `GET /api/devices/:deviceId/streams/status` — which streams are active
  - [ ] Emit SSE events on stream start/stop
- [ ] Research spike: capture and analyze U64 stream format
  - [ ] Set up UDP listener to capture raw video/audio packets from U64
  - [ ] Analyze packet headers, payload format, encoding
  - [ ] Document findings: resolution, framerate, pixel format, audio sample rate
  - [ ] Decide on browser delivery method (WebSocket+canvas recommended for 320x200)
- [ ] Implement UDP receiver and browser bridge
  - [ ] UDP socket listener on proxy for video (11000) and audio (11001)
  - [ ] Decode packets per research findings
  - [ ] WebSocket binary relay to browser (or chosen delivery method)
  - [ ] Handle lifecycle: start receiver on stream start, clean up on stop
- [ ] Build stream viewer UI
  - [ ] Video canvas area on device dashboard or dedicated page
  - [ ] Audio toggle (mute/unmute)
  - [ ] Start/stop buttons for video and audio
  - [ ] Latency indicator and packet rate stats
  - [ ] Picture-in-picture support
