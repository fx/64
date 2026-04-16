# Developer Tools

## Overview

Developer Tools provides a suite of 6502 programming and debugging utilities for C64 Ultimate devices, accessed entirely through the web interface. The feature comprises four subsystems: (1) a memory browser with hex viewer/editor for the full 64KB address space, (2) a client-side 6502 disassembler with instruction highlighting and symbol support, (3) a memory snapshot system for capturing, persisting, and diffing full memory dumps, and (4) a U64-only stream viewer for real-time video and audio output in the browser.

All memory inspection and disassembly run client-side to minimize server load. The server is responsible for proxying memory reads/writes to devices, persisting snapshot data, and (for streams) relaying UDP packets to the browser via WebSocket.

> **Status: NOT YET IMPLEMENTED.** This specification describes desired behavior. No code exists for any section described below.

## Background

The C64 Ultimate devices expose DMA-based memory access through their HTTP API. `GET /v1/machine:readmem` returns raw binary data from any address in the 64KB address space, and `PUT /v1/machine:writemem` (URL-encoded, up to 128 bytes) or `POST /v1/machine:writemem` (binary body, arbitrary size) write data via DMA. The CPU can be paused (`PUT /v1/machine:pause`) and resumed (`PUT /v1/machine:resume`) to guarantee memory consistency during bulk reads.

The Ultimate 64 (U64) additionally supports real-time data streaming over UDP: video on port 11000, audio on port 11001, and debug on port 11002. Stream control is via `PUT /v1/streams/<stream>:start?ip=<target>` and `PUT /v1/streams/<stream>:stop`. The stream packet format is undocumented and requires a research spike before implementation.

The 6502 processor (specifically the 6510 variant in the C64) has 151 official opcodes across 13 addressing modes, plus a set of commonly used undocumented opcodes. A disassembler for this instruction set is straightforward to implement entirely in the browser.

Prior art:

- **VICE monitor** -- the reference C64 emulator includes a memory viewer and disassembler
- **C64 Debugger** -- standalone tool with real-time memory visualization
- **Archived spec 0008** -- the original feature outline that this living spec replaces

Related specifications:

- [Device Management](../device-management/) -- device registry and health checking
- [API Proxy](../api-proxy/) -- transparent forwarding layer to C64U device APIs
- [Realtime Events](../realtime-events/) -- SSE transport for push notifications
- [C64 Design System](../c64-design-system/) -- visual design rules for all UI

## Requirements

### REQ-1: Memory Read

The system MUST allow reading arbitrary ranges of C64 memory from a registered, online device.

#### Scenario: Small memory read (hex viewer paging)

```
GIVEN a device "8D927F" is registered and online
  AND the user navigates to the memory browser for that device
WHEN the hex viewer requests 256 bytes starting at address $0400
THEN the server SHALL proxy GET /v1/machine:readmem?address=0400&length=256 to the device
  AND the server SHALL return the raw binary response to the client
  AND the hex viewer SHALL render 16 rows of 16 bytes each
```

#### Scenario: Memory read with device offline

```
GIVEN a device "8D927F" is registered but offline
WHEN the client requests a memory read
THEN the server SHALL return HTTP 503 with error "Device is offline"
  AND the hex viewer SHALL display an error message
```

#### Scenario: Memory read at address boundary

```
GIVEN the user requests a read starting at address $FFF0 with length 256
WHEN the request is forwarded to the device
THEN the device MAY return fewer bytes than requested (address space wraps at $FFFF)
  AND the hex viewer SHALL render only the bytes actually returned
```

### REQ-2: Memory Write

The system MUST allow writing bytes to C64 memory on a registered, online device.

#### Scenario: Small write via hex editor

```
GIVEN the hex viewer is displaying memory for device "8D927F"
WHEN the user clicks a byte at address $D020 and changes it from $0E to $06
THEN the client SHALL send PUT /api/devices/8D927F/memory with { address: "D020", data: "06" }
  AND the server SHALL proxy PUT /v1/machine:writemem?address=D020&data=06 to the device
  AND the hex viewer SHALL update the displayed byte to $06
```

#### Scenario: Write exceeding 128-byte PUT limit

```
GIVEN the user pastes or programmatically writes 256 bytes starting at $C000
WHEN the write request is submitted
THEN the server SHALL use POST /v1/machine:writemem?address=C000 with a binary body
  AND the server SHALL NOT use the PUT method (which is limited to 128 bytes)
```

#### Scenario: Write rejected for offline device

```
GIVEN a device is registered but offline
WHEN a memory write is attempted
THEN the server SHALL return HTTP 503
  AND the hex viewer SHALL display an error and NOT update the local display
```

### REQ-3: Full Memory Snapshot

The system MUST support capturing the entire 64KB address space as a named snapshot.

#### Scenario: Capture snapshot

```
GIVEN a device "8D927F" is registered and online
WHEN the user clicks CAPTURE SNAPSHOT and provides the name "BEFORE PATCH"
THEN the server SHALL pause the CPU via PUT /v1/machine:pause
  AND the server SHALL read all 65536 bytes via GET /v1/machine:readmem?address=0000&length=10000 (in hex)
  AND the server SHALL resume the CPU via PUT /v1/machine:resume
  AND the server SHALL persist the binary data to data/snapshots/<id>.bin
  AND the server SHALL add an entry to data/snapshots.json with id, name, deviceId, and timestamp
  AND the server SHALL return the snapshot metadata with HTTP 201
```

#### Scenario: Capture snapshot fails mid-read

```
GIVEN a snapshot capture is in progress (CPU is paused, partial read completed)
WHEN a chunk read fails (device timeout or network error)
THEN the server SHALL resume the CPU via PUT /v1/machine:resume
  AND the server SHALL NOT persist a partial snapshot
  AND the server SHALL return HTTP 502 with an error describing the failure
```

#### Scenario: List snapshots

```
GIVEN three snapshots exist for device "8D927F"
WHEN the client requests GET /api/devices/8D927F/snapshots
THEN the server SHALL return all three snapshot metadata records (id, name, deviceId, timestamp)
  AND the records SHALL be sorted by timestamp descending (newest first)
```

#### Scenario: Download snapshot data

```
GIVEN a snapshot with id "snap-001" exists
WHEN the client requests GET /api/devices/8D927F/snapshots/snap-001/data
THEN the server SHALL return the raw 65536-byte binary file
  AND the content-type SHALL be application/octet-stream
```

#### Scenario: Delete snapshot

```
GIVEN a snapshot with id "snap-001" exists
WHEN the client sends DELETE /api/devices/8D927F/snapshots/snap-001
THEN the server SHALL remove the binary file from data/snapshots/
  AND the server SHALL remove the entry from data/snapshots.json
  AND the server SHALL return { "ok": true }
```

### REQ-4: Snapshot Diff

The system MUST support comparing two snapshots byte-by-byte and returning the differences.

#### Scenario: Diff two snapshots

```
GIVEN snapshots "snap-001" and "snap-002" exist for the same device
WHEN the client requests GET /api/devices/8D927F/snapshots/snap-001/diff?against=snap-002
THEN the server SHALL compare the two 64KB buffers byte-by-byte
  AND the server SHALL return a MemoryDiff object containing changed address ranges
  AND each change entry SHALL include the address, length, left bytes, and right bytes
  AND totalChanged SHALL reflect the total number of differing bytes
```

#### Scenario: Diff with nonexistent snapshot

```
GIVEN snapshot "snap-001" exists but "snap-999" does not
WHEN the client requests a diff of snap-001 against snap-999
THEN the server SHALL return HTTP 404 with error "Snapshot not found"
```

#### Scenario: Diff overlay in hex viewer

```
GIVEN a diff result is loaded in the UI
WHEN the hex viewer renders bytes
THEN bytes that differ SHALL be highlighted with a colored overlay
  AND bytes present only in the left snapshot SHALL use one color
  AND bytes present only in the right snapshot SHALL use another color
  AND unchanged bytes SHALL render without overlay
```

### REQ-5: Hex Viewer

The hex viewer MUST display the 64KB address space in a traditional three-column layout with virtual scrolling.

#### Scenario: Initial render

```
GIVEN the user opens the memory browser for a device
WHEN the hex viewer loads
THEN it SHALL display memory starting at address $0000
  AND each row SHALL show: 4-digit hex address | 16 hex bytes separated by spaces | 16 ASCII characters
  AND non-printable bytes (< $20 or > $7E) SHALL render as "." in the ASCII column
  AND only visible rows SHALL be in the DOM (virtual scrolling)
```

#### Scenario: Navigate to address

```
GIVEN the hex viewer is displayed
WHEN the user enters address "D000" in the jump-to-address input and presses ENTER
THEN the hex viewer SHALL scroll to display the row containing $D000
  AND the byte at $D000 SHALL be visually highlighted
```

#### Scenario: Inline editing

```
GIVEN the hex viewer is displayed
WHEN the user clicks on a hex byte in the hex column
THEN an inline editor SHALL appear allowing the user to type a new two-digit hex value
  AND pressing ENTER SHALL commit the write to the device
  AND pressing ESCAPE SHALL cancel the edit
```

#### Scenario: ASCII column editing

```
GIVEN the hex viewer is displayed
WHEN the user clicks on a character in the ASCII column
THEN an inline editor SHALL appear allowing the user to type a single printable ASCII character
  AND the corresponding hex byte SHALL update to match the ASCII value
```

### REQ-6: 6502 Disassembler

The disassembler MUST decode 6502 machine code into human-readable assembly mnemonics, running entirely client-side.

#### Scenario: Disassemble official opcodes

```
GIVEN memory at $0800 contains bytes A9 00 8D 20 D0
WHEN the disassembler renders this region
THEN it SHALL display:
  $0800  A9 00     LDA #$00
  $0802  8D 20 D0  STA $D020
```

#### Scenario: Disassemble undocumented opcodes

```
GIVEN memory contains byte $A7 (LAX zero-page, undocumented)
WHEN the disassembler renders this byte
THEN it SHALL display the mnemonic "LAX" with appropriate operand
  AND it SHALL visually indicate that this is an undocumented opcode
```

#### Scenario: Synchronized scroll with hex viewer

```
GIVEN both the hex viewer and disassembler panels are visible
WHEN the user scrolls the hex viewer to address $C000
THEN the disassembler panel SHALL scroll to show disassembly starting at or near $C000
  AND scrolling the disassembler SHALL likewise update the hex viewer position
```

#### Scenario: Symbol label display

```
GIVEN a symbol table is loaded with entry { $0800: "start" }
WHEN the disassembler renders address $0800
THEN the label "start" SHALL appear next to the address
  AND branch/jump targets referencing $0800 SHALL display "start" instead of the raw address
```

#### Scenario: Instruction category highlighting

```
GIVEN the disassembler is rendering instructions
WHEN displaying different instruction types
THEN load/store instructions (LDA, STA, LDX, etc.) SHALL use one color
  AND branch instructions (BEQ, BNE, JMP, JSR, etc.) SHALL use another color
  AND arithmetic/logic instructions (ADC, SBC, AND, ORA, etc.) SHALL use a third color
  AND the color scheme SHALL use only VIC-II palette colors
```

### REQ-7: Screen Memory Viewer

The system MUST provide a visual rendering of the C64 screen memory using the C64 Pro Mono font.

#### Scenario: Render screen memory

```
GIVEN the screen viewer panel is open for device "8D927F"
WHEN the panel loads or the user clicks REFRESH
THEN the system SHALL read 1000 bytes from $0400-$07E7 (screen RAM)
  AND the system SHALL read 1000 bytes from $D800-$DBE7 (color RAM)
  AND the viewer SHALL render a 40x25 grid of PETSCII characters
  AND each character SHALL use C64 Pro Mono font with the corresponding VIC-II color
  AND the background color SHALL come from the value at $D021
```

#### Scenario: Screen viewer auto-refresh

```
GIVEN the screen viewer is open
WHEN auto-refresh is enabled (toggle)
THEN the screen SHALL re-read and re-render every 1000ms
  AND the toggle SHALL be clearly labeled and default to OFF
```

### REQ-8: U64 Stream Viewer (Video)

The system MUST support viewing the U64's real-time video output in the browser. **This requirement is PROVISIONAL pending a research spike to determine the UDP packet format.**

#### Scenario: Start video stream

```
GIVEN device "8D927F" is an Ultimate 64 and is online
WHEN the user clicks START VIDEO
THEN the server SHALL determine its own LAN IP address
  AND the server SHALL send PUT /v1/streams/video:start?ip=<server-ip> to the device
  AND the server SHALL open a UDP listener on port 11000
  AND the server SHALL open a WebSocket endpoint for the client
  AND the server SHALL relay received UDP packets to the WebSocket
  AND the browser SHALL render video frames on an HTML canvas element
```

#### Scenario: Stop video stream

```
GIVEN a video stream is active for device "8D927F"
WHEN the user clicks STOP VIDEO
THEN the server SHALL send PUT /v1/streams/video:stop to the device
  AND the server SHALL close the UDP listener
  AND the server SHALL close the WebSocket connection
  AND the canvas SHALL display a "STREAM STOPPED" message
```

#### Scenario: Stream viewer on non-U64 device

```
GIVEN device "8D927F" is an Ultimate II+ (not a U64)
WHEN the user navigates to the stream viewer
THEN the UI SHALL display a message: "STREAM VIEWER IS ONLY AVAILABLE FOR ULTIMATE 64 DEVICES"
  AND the start/stop controls SHALL be disabled
```

#### Scenario: Video stream latency target

```
GIVEN a video stream is active
WHEN frames are being relayed from device to browser
THEN the end-to-end latency (device UDP send to canvas paint) SHOULD be under 500ms
```

### REQ-9: U64 Stream Viewer (Audio)

The system MUST support playing the U64's real-time audio output in the browser. **This requirement is PROVISIONAL pending a research spike to determine the UDP packet format.**

#### Scenario: Start audio stream

```
GIVEN device "8D927F" is an Ultimate 64 and is online
WHEN the user clicks START AUDIO
THEN the server SHALL send PUT /v1/streams/audio:start?ip=<server-ip> to the device
  AND the server SHALL open a UDP listener on port 11001
  AND the server SHALL relay audio data to the browser via WebSocket
  AND the browser SHALL play audio using the Web Audio API
```

#### Scenario: Audio mute/unmute

```
GIVEN an audio stream is active and playing
WHEN the user clicks MUTE
THEN audio playback SHALL stop immediately
  AND the UDP relay SHALL continue (so unmuting resumes without re-handshake)
WHEN the user clicks UNMUTE
THEN audio playback SHALL resume from the current stream position
```

### REQ-10: Stream Status

The system MUST report active stream status to connected clients.

#### Scenario: Stream status query

```
GIVEN a video stream is active and audio is stopped for device "8D927F"
WHEN the client requests GET /api/devices/8D927F/streams/status
THEN the server SHALL return { video: true, audio: false, debug: false }
```

#### Scenario: Stream status via SSE

```
GIVEN a client is subscribed to the SSE event stream
WHEN a video stream starts or stops
THEN an SSE event SHALL be emitted with type "stream:status" and the current stream state
```

## Design

### Architecture

```
Browser (React SPA)
    |
    |-- Memory Browser Page (/devices/:deviceId/memory)
    |       |
    |       |-- Hex Viewer          (virtual-scrolled, editable)
    |       |-- Disassembler Panel  (6502 decode, client-side)
    |       |-- Screen Viewer       (PETSCII render from $0400)
    |       |-- Snapshot Manager    (capture, list, diff, delete)
    |       |
    |       |-- GET/PUT /api/devices/:deviceId/memory
    |       |-- POST/GET/DELETE /api/devices/:deviceId/snapshots
    |
    |-- Stream Viewer Page (/devices/:deviceId/stream)  [U64 only]
            |
            |-- Video Canvas        (HTML5 canvas, 320x200 or 384x272)
            |-- Audio Player        (Web Audio API)
            |-- Stream Controls     (start/stop, mute, PiP)
            |
            |-- WebSocket           (binary relay from server)
            |-- POST /api/devices/:deviceId/streams/*/start|stop
            |
Hono Server (/api/*)
    |
    |-- Memory Routes    (src/server/routes/memory.ts)
    |       |-- Proxies readmem/writemem to device via C64 Client
    |       |-- Snapshot capture (pause -> read all -> resume -> persist)
    |       |-- Snapshot CRUD (data/snapshots.json + data/snapshots/*.bin)
    |       |-- Diff computation (byte-by-byte comparison)
    |
    |-- Stream Routes    (src/server/routes/streams.ts)
    |       |-- Start/stop commands forwarded to device
    |       |-- UDP listener management
    |       |-- WebSocket relay to browser
    |
    |-- Snapshot Store   (src/server/lib/snapshot-store.ts)
    |       |-- Binary file I/O (data/snapshots/)
    |       |-- JSON index (data/snapshots.json)
    |
    |-- Stream Relay     (src/server/lib/stream-relay.ts)
            |-- UDP socket receiver (ports 11000, 11001)
            |-- Packet decode (format TBD after research spike)
            |-- WebSocket binary sender
```

### Data Models

#### MemorySnapshot

```typescript
interface MemorySnapshot {
  id: string;            // unique identifier (nanoid or UUID)
  name: string;          // user-provided label, e.g. "BEFORE PATCH"
  deviceId: string;      // device unique_id this snapshot was taken from
  data: Uint8Array;      // exactly 65536 bytes (full 64KB address space)
  timestamp: string;     // ISO 8601 capture time
}
```

The `data` field is stored as a separate binary file (`data/snapshots/<id>.bin`). The index file (`data/snapshots.json`) stores all other fields.

#### MemorySnapshotMeta

```typescript
interface MemorySnapshotMeta {
  id: string;
  name: string;
  deviceId: string;
  timestamp: string;
}
```

The metadata-only view returned by list endpoints (the 64KB binary is not included).

#### MemoryDiff

```typescript
interface MemoryDiff {
  changes: Array<{
    address: number;     // start address of this changed range
    length: number;      // number of consecutive changed bytes
    left: number[];      // byte values from the left (base) snapshot
    right: number[];     // byte values from the right (comparison) snapshot
  }>;
  totalChanged: number;  // total count of differing bytes across all ranges
}
```

Adjacent changed bytes are coalesced into a single range entry. Unchanged regions are not included.

#### Disassembled Instruction (client-side)

```typescript
interface DisassembledInstruction {
  address: number;           // memory address of the opcode byte
  bytes: number[];           // 1-3 raw bytes (opcode + operands)
  mnemonic: string;          // e.g. "LDA", "STA", "BEQ"
  operand: string;           // formatted operand, e.g. "#$00", "$D020", "($FF),Y"
  label?: string;            // symbol name if address is in symbol table
  isUndocumented: boolean;   // true for unofficial opcodes
  category: InstructionCategory;
}

type InstructionCategory =
  | "load-store"     // LDA, LDX, LDY, STA, STX, STY
  | "transfer"       // TAX, TAY, TXA, TYA, TSX, TXS
  | "arithmetic"     // ADC, SBC, INC, DEC, INX, INY, DEX, DEY
  | "logic"          // AND, ORA, EOR, BIT
  | "shift"          // ASL, LSR, ROL, ROR
  | "branch"         // BCC, BCS, BEQ, BNE, BMI, BPL, BVC, BVS, JMP, JSR, RTS, RTI
  | "stack"          // PHA, PLA, PHP, PLP
  | "system"         // BRK, NOP, SEI, CLI, SED, CLD, SEC, CLC, CLV
  | "undocumented";  // LAX, SAX, DCP, ISC, SLO, RLA, SRE, RRA, etc.
```

#### StreamState

```typescript
interface StreamState {
  video: boolean;     // true if video stream is active
  audio: boolean;     // true if audio stream is active
  debug: boolean;     // true if debug stream is active
}
```

### API Surface

#### Memory Access

##### `GET /api/devices/:deviceId/memory`

Read a range of bytes from device memory.

| Parameter | Location | Required | Format | Description |
|-----------|----------|----------|--------|-------------|
| `deviceId` | path | Yes | string | Device unique ID |
| `address` | query | Yes | hex string | Start address (e.g. `0400`) |
| `length` | query | No | decimal | Bytes to read (default 256, max 65536) |

- **Response:** `200` -- `application/octet-stream` (raw binary)
- **Errors:**
  - `404` -- device not found
  - `503` -- device offline
  - `502` -- device unreachable
  - `504` -- device timeout

The server proxies to `GET /v1/machine:readmem?address={address}&length={length}` on the target device.

##### `PUT /api/devices/:deviceId/memory`

Write bytes to device memory.

**Request body:**

```typescript
{
  address: string;  // hex start address, e.g. "D020"
  data: string;     // hex-encoded byte string, e.g. "0E0601"
}
```

- **Response:** `200` -- `{ "ok": true }`
- **Errors:**
  - `400` -- invalid address or data format
  - `404` -- device not found
  - `503` -- device offline

**Routing logic:** If the decoded data length is 128 bytes or fewer, the server SHALL use `PUT /v1/machine:writemem?address={address}&data={data}`. If longer, the server SHALL use `POST /v1/machine:writemem?address={address}` with a binary body.

#### Snapshots

##### `POST /api/devices/:deviceId/snapshots`

Capture a full 64KB memory snapshot.

**Request body:**

```typescript
{
  name: string;  // user-provided label
}
```

- **Response:** `201` -- `MemorySnapshotMeta`
- **Errors:**
  - `400` -- missing name
  - `404` -- device not found
  - `503` -- device offline
  - `502` -- capture failed (read error after pause)

##### `GET /api/devices/:deviceId/snapshots`

List all snapshots for a device.

- **Response:** `200` -- `MemorySnapshotMeta[]` (sorted by timestamp descending)

##### `GET /api/devices/:deviceId/snapshots/:snapshotId/data`

Download the raw 64KB binary data for a snapshot.

- **Response:** `200` -- `application/octet-stream` (65536 bytes)
- **Errors:**
  - `404` -- snapshot not found

##### `DELETE /api/devices/:deviceId/snapshots/:snapshotId`

Delete a snapshot and its binary data.

- **Response:** `200` -- `{ "ok": true }`
- **Errors:**
  - `404` -- snapshot not found

##### `GET /api/devices/:deviceId/snapshots/:snapshotId/diff`

Compare two snapshots byte-by-byte.

| Parameter | Location | Required | Description |
|-----------|----------|----------|-------------|
| `snapshotId` | path | Yes | Base snapshot ID |
| `against` | query | Yes | Comparison snapshot ID |

- **Response:** `200` -- `MemoryDiff`
- **Errors:**
  - `404` -- either snapshot not found

#### Stream Control

##### `POST /api/devices/:deviceId/streams/video/start`

Start the U64 video stream. The server determines its own LAN IP, sends `PUT /v1/streams/video:start?ip={serverIp}` to the device, and opens a UDP listener on port 11000.

- **Response:** `200` -- `{ "ok": true }`
- **Errors:**
  - `404` -- device not found
  - `503` -- device offline
  - `400` -- device is not a U64 (product type check)

##### `POST /api/devices/:deviceId/streams/video/stop`

Stop the U64 video stream. Sends `PUT /v1/streams/video:stop` to the device and closes the UDP listener.

- **Response:** `200` -- `{ "ok": true }`

##### `POST /api/devices/:deviceId/streams/audio/start`

Start the U64 audio stream. Same pattern as video but on UDP port 11001.

- **Response:** `200` -- `{ "ok": true }`

##### `POST /api/devices/:deviceId/streams/audio/stop`

Stop the U64 audio stream.

- **Response:** `200` -- `{ "ok": true }`

##### `GET /api/devices/:deviceId/streams/status`

Query which streams are currently active for this device.

- **Response:** `200` -- `StreamState`

### UI Components

All components MUST follow the [C64 Design System](../c64-design-system/) -- C64 Pro Mono font, VIC-II palette only, no border-radius, no gradients, PETSCII box-drawing for borders.

#### Memory Browser Page

Route: `/devices/$deviceId/memory`

The page is a multi-panel layout with the hex viewer as the primary panel and supporting panels alongside.

| Panel | Position | Description |
|-------|----------|-------------|
| Hex Viewer | center | Virtual-scrolled 64KB grid (main content area) |
| Disassembler | right | Synchronized disassembly view |
| Screen Viewer | bottom-right | 40x25 PETSCII grid from screen RAM |
| Snapshot Manager | left sidebar | List of snapshots with actions |
| Address Bar | top | Jump-to-address input, current address display |

#### Hex Viewer (`hex-viewer.tsx`)

- **Layout:** Three columns -- address (4-digit hex), hex bytes (16 per row, space-separated), ASCII representation (16 chars).
- **Virtual scrolling:** Only visible rows are rendered in the DOM. The full 64KB space is 4096 rows at 16 bytes per row. A virtualized list component (e.g., custom implementation or lightweight library) handles scroll position.
- **Editable:** Clicking a hex byte opens an inline two-character hex input. Clicking an ASCII character opens a single-character input. Commits on ENTER, cancels on ESCAPE.
- **Diff overlay:** When a diff is active, changed bytes render with colored backgrounds using VIC-II palette colors (e.g., `--c64-2-red` for removed, `--c64-5-green` for added).
- **Cursor:** A blinking solid-block cursor (per C64 convention) indicates the currently selected byte.

#### Disassembler Panel (`disassembler.tsx`)

- **Output format:** Each line shows `$ADDR  XX [XX [XX]]  MNEMONIC OPERAND  ; label`
- **Color coding:** Instructions are colored by category using VIC-II palette colors.
- **Synchronized scroll:** Scrolling the hex viewer updates the disassembler to the same address region, and vice versa.
- **Click navigation:** Clicking an address operand in a JMP/JSR/branch instruction scrolls both panels to that target.
- **Undocumented opcodes:** Rendered with a distinct color and an asterisk marker.

#### Screen Viewer (`screen-viewer.tsx`)

- **Grid:** 40 columns x 25 rows, using C64 Pro Mono PETSCII glyphs.
- **Data source:** Screen RAM ($0400-$07E7) for character codes, Color RAM ($D800-$DBE7) for per-character foreground color.
- **Background:** Reads $D021 for the screen background color.
- **Refresh:** Manual REFRESH button and optional auto-refresh toggle (1-second interval).

#### Snapshot Manager (`snapshot-manager.tsx`)

- **List:** Snapshots displayed in a PETSCII-bordered list with name and timestamp.
- **Actions per snapshot:** DOWNLOAD (binary), DIFF (select two snapshots), DELETE (with confirmation).
- **Capture:** CAPTURE button opens a name input, triggers the snapshot API.
- **Diff mode:** Selecting two snapshots and clicking DIFF fetches the diff and activates the hex viewer overlay.

#### Stream Viewer Page

Route: `/devices/$deviceId/stream`

Available only when the device's `product` field indicates "Ultimate 64".

| Element | Description |
|---------|-------------|
| Video Canvas | HTML5 `<canvas>` element, 320x200 native resolution (or 384x272 with borders), scaled to fit |
| Audio Toggle | MUTE / UNMUTE button |
| Start/Stop | START VIDEO, STOP VIDEO, START AUDIO, STOP AUDIO buttons |
| Status Bar | Latency indicator, packet rate (packets/sec), stream uptime |
| Picture-in-Picture | PIP button to pop the video canvas into a floating OS-level window |

### Business Logic

#### Memory Read Pipeline

1. Validate `address` is a valid hex string (0000-FFFF) and `length` is a positive integer not exceeding 65536.
2. Resolve device from `DeviceStore`. Return 404 if absent, 503 if offline.
3. Proxy `GET /v1/machine:readmem?address={address}&length={length}` to the device.
4. Return the binary response to the client with `content-type: application/octet-stream`.

#### Memory Write Pipeline

1. Parse request body: validate `address` is hex (0000-FFFF), `data` is a valid hex string.
2. Resolve device from `DeviceStore`. Return 404 if absent, 503 if offline.
3. Decode `data` hex string to determine byte count.
4. If byte count is 128 or fewer: `PUT /v1/machine:writemem?address={address}&data={data}`.
5. If byte count exceeds 128: `POST /v1/machine:writemem?address={address}` with decoded binary body.
6. Return `{ "ok": true }` on success.

#### Snapshot Capture Pipeline

1. Validate request body contains a non-empty `name` string.
2. Resolve device from `DeviceStore`. Return 404 if absent, 503 if offline.
3. Send `PUT /v1/machine:pause` to halt the CPU.
4. Read the full 64KB in one request: `GET /v1/machine:readmem?address=0000&length=10000` (length is decimal 65536, but the C64U API expects hex address and decimal length -- verify against device behavior).
5. If the read fails, send `PUT /v1/machine:resume` and return an error. The CPU MUST always be resumed, even on failure.
6. Send `PUT /v1/machine:resume` to restart the CPU.
7. Generate a unique snapshot ID.
8. Write binary data to `data/snapshots/<id>.bin`.
9. Append metadata to `data/snapshots.json`.
10. Return `MemorySnapshotMeta` with HTTP 201.

#### Snapshot Diff Algorithm

1. Load both 64KB binary buffers from disk.
2. Walk byte-by-byte from address $0000 to $FFFF.
3. When a differing byte is found, start a new change range.
4. Continue extending the range while consecutive bytes differ.
5. When bytes match again (or end of address space), close the range and record it.
6. Return all ranges and a `totalChanged` count.

#### 6502 Disassembly (Client-Side)

The disassembler maintains a lookup table of all 256 possible opcode bytes. For each opcode:

| Field | Description |
|-------|-------------|
| `mnemonic` | 3-letter instruction name |
| `addressingMode` | One of: implied, accumulator, immediate, zeroPage, zeroPageX, zeroPageY, absolute, absoluteX, absoluteY, indirect, indexedIndirect, indirectIndexed, relative |
| `bytes` | Instruction length (1, 2, or 3) |
| `isUndocumented` | Whether this is an unofficial opcode |
| `category` | Instruction category for color coding |

**Addressing mode formatters:**

| Mode | Format | Example |
|------|--------|---------|
| Implied | (none) | `NOP` |
| Accumulator | `A` | `ASL A` |
| Immediate | `#$XX` | `LDA #$00` |
| Zero Page | `$XX` | `LDA $FF` |
| Zero Page,X | `$XX,X` | `LDA $FF,X` |
| Zero Page,Y | `$XX,Y` | `LDX $FF,Y` |
| Absolute | `$XXXX` | `STA $D020` |
| Absolute,X | `$XXXX,X` | `LDA $D000,X` |
| Absolute,Y | `$XXXX,Y` | `LDA $D000,Y` |
| Indirect | `($XXXX)` | `JMP ($FFFE)` |
| (Indirect,X) | `($XX,X)` | `LDA ($FF,X)` |
| (Indirect),Y | `($XX),Y` | `LDA ($FF),Y` |
| Relative | `$XXXX` (computed) | `BEQ $0810` |

For relative branches, the operand is displayed as the computed absolute target address, not the raw signed offset.

#### Stream Relay Pipeline

> **Note:** This pipeline is provisional. The UDP packet format is undocumented and MUST be determined through a research spike before implementation.

1. On `POST .../streams/video/start`:
   a. Determine the server's LAN IP address.
   b. Send `PUT /v1/streams/video:start?ip={serverIp}` to the device.
   c. Create a UDP socket listener bound to port 11000.
   d. Create a WebSocket endpoint at `/ws/devices/:deviceId/streams/video`.
   e. For each received UDP packet: decode (format TBD), relay binary data to connected WebSocket clients.
2. On `POST .../streams/video/stop`:
   a. Send `PUT /v1/streams/video:stop` to the device.
   b. Close the UDP socket.
   c. Close all connected WebSocket clients for this stream.
3. Audio follows the same pattern on port 11001 and WebSocket path `/ws/devices/:deviceId/streams/audio`.

#### Persistence

| Data | Location | Format |
|------|----------|--------|
| Snapshot index | `data/snapshots.json` | JSON array of `MemorySnapshotMeta` |
| Snapshot binary | `data/snapshots/<id>.bin` | Raw 65536-byte binary |
| Stream state | In-memory only | `Map<deviceId, StreamState>` |

The `data/snapshots/` directory MUST be created on first snapshot capture if it does not exist. The `data/snapshots.json` file MUST be initialized as an empty array `[]` if missing.

### File Structure

```
src/server/
  routes/
    memory.ts                  # Memory read/write + snapshot CRUD + diff
    streams.ts                 # Stream start/stop/status
  lib/
    snapshot-store.ts          # Binary file I/O + JSON index management
    stream-relay.ts            # UDP receiver + WebSocket relay

src/client/
  routes/
    devices/
      $deviceId/
        memory.tsx             # Memory browser page
        stream.tsx             # Stream viewer page (U64 only)
  components/
    memory/
      hex-viewer.tsx           # Virtual-scrolled hex grid with editing
      disassembler.tsx         # 6502 disassembly panel
      screen-viewer.tsx        # PETSCII screen display
      snapshot-manager.tsx     # Snapshot list + capture/diff/delete
    stream/
      stream-panel.tsx         # Video canvas + audio + controls
  lib/
    disasm-6502.ts             # 6502 opcode table + disassembler engine
    stream-client.ts           # WebSocket receiver + canvas/audio renderer
  hooks/
    use-memory.ts              # TanStack Query hooks for memory reads
    use-snapshots.ts           # TanStack Query hooks for snapshot CRUD
    use-streams.ts             # Stream control hooks
```

## Constraints

1. **Memory consistency.** Reading memory while the CPU is running MAY return inconsistent data. For casual browsing this is acceptable. For snapshots that MUST be consistent, the system SHALL pause the CPU before reading and resume afterward.
2. **Full dump latency.** Reading all 65536 bytes over HTTP takes a non-trivial amount of time (estimated 1-5 seconds depending on network and device firmware). The UI MUST indicate progress during snapshot capture and MUST NOT block user interaction.
3. **Write size limit.** The `PUT /v1/machine:writemem` endpoint accepts a maximum of 128 hex-encoded bytes in the URL. Larger writes MUST use the `POST` variant with a binary body. The server MUST handle this routing transparently.
4. **Address space boundary.** Writes MUST NOT wrap around the $FFFF address boundary. The server SHOULD reject writes where `address + length > $10000`.
5. **Stream format unknown.** The U64 UDP stream packet format is undocumented. A research spike MUST precede any stream viewer implementation. All stream-related requirements are PROVISIONAL until the format is characterized.
6. **U64-only streams.** Only Ultimate 64 devices support data streaming. The server MUST check the device's `product` field and reject stream start requests for non-U64 devices. The UI MUST hide or disable stream controls for non-U64 devices.
7. **Video/debug stream mutual exclusion.** Starting the video stream automatically stops the debug stream on the U64. The system SHOULD warn the user if this would interrupt an active debug stream.
8. **Client-side compute.** The 6502 disassembler and hex viewer rendering MUST run entirely in the browser. The server SHALL NOT perform disassembly or hex formatting.
9. **No authentication layer.** This is a homelab tool with direct device access on a trusted LAN. No user authentication is required for the developer tools API endpoints.
10. **C64 Design System compliance.** All UI components MUST follow the [C64 Design System](../c64-design-system/) specification: C64 Pro Mono font, VIC-II palette colors only, no border-radius, no gradients, PETSCII box-drawing for panel borders.
11. **Snapshot storage.** Snapshots are stored as flat binary files on the local filesystem. There is no external database. Each snapshot consumes exactly 64KB of disk space plus a small metadata entry in the JSON index.
12. **Single-process.** UDP listeners, WebSocket relay, and HTTP routes all run within the single Bun process. There is no separate streaming service.

## Open Questions

1. **U64 video stream format.** What is the UDP packet structure? Raw pixels? Compressed? Standard codec? Resolution: native 320x200 or with borders (384x272)? A research spike with packet capture is required.
2. **U64 audio stream format.** What is the sample rate, bit depth, and encoding? PCM? Compressed? Mono or stereo? Same research spike applies.
3. **Large read chunking.** Can the C64U API handle a single `readmem` request for all 65536 bytes, or must the read be chunked into smaller segments (e.g., 4096 or 8192 bytes per request)? This needs testing against real hardware.
4. **WebSocket vs. WebRTC for streams.** WebSocket binary relay is simple but adds a round-trip through the server. WebRTC could offer lower latency with peer-to-peer data channels. Is the complexity justified for a 320x200 resolution stream?
5. **Symbol table persistence.** Should uploaded symbol tables (VICE `.lbl`, KickAssembler `.sym`) be persisted across server restarts, or are they session-only? The archived spec included symbol support but this living spec defers it to keep the initial scope focused.
6. **Concurrent snapshot captures.** Should the system allow multiple snapshot captures in parallel (for different devices), or enforce one-at-a-time globally? Parallel captures for different devices seem safe; concurrent captures for the same device MUST be serialized.
7. **Stream viewer page vs. embedded panel.** Should the stream viewer be a dedicated page (`/devices/:deviceId/stream`) or an embedded panel on the device dashboard? A dedicated page allows more screen real estate; an embedded panel keeps everything in context.
8. **Memory search.** The archived spec listed memory search/scan as a non-goal. Should this be reconsidered? Pattern search (e.g., find all occurrences of a byte sequence) is a common debugging tool.

## References

- [Device Management Spec](../device-management/) -- device registry, store, health checking
- [API Proxy Spec](../api-proxy/) -- transparent forwarding to C64U APIs, typed routes
- [Realtime Events Spec](../realtime-events/) -- SSE event transport
- [C64 Design System Spec](../c64-design-system/) -- visual design rules and component library
- [Architecture Spec](../architecture/) -- system topology and conventions
- [Archived spec 0008](../archive/0008-developer-tools.md) -- original feature outline (superseded by this document)
- [C64U REST API Reference](../../c64.md) -- complete device API documentation
- [6502 Instruction Set](http://www.6502.org/tutorials/6502opcodes.html) -- official opcode reference
- [Ultimate 64 Streaming](https://1541u-documentation.readthedocs.io/en/latest/) -- upstream firmware documentation (stream details sparse)

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | -- |
