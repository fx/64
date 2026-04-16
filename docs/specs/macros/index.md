# Macros

## Overview

Macros provide scripted automation for the C64 Ultimate device. A macro is an ordered sequence of steps -- device resets, disk mounts, program loads, memory writes, configuration changes, timed delays, and local-file uploads -- that execute against a target device in order. The system returns an execution handle immediately (HTTP 202) and runs steps asynchronously, streaming progress to the UI via Server-Sent Events.

Three built-in templates ship with the system to cover the most common workflows. Users MAY create, edit, and delete custom macros. Built-in macros MUST NOT be deletable.

## Background

Operating a C64 Ultimate device often involves repetitive multi-step sequences: reset the machine, wait for BASIC, mount a disk, then run a program. Manually issuing each command through the device API is tedious and error-prone. Macros encode these sequences as reusable, one-click automations.

The feature builds on the existing device proxy layer (all device HTTP calls route through the server), the SSE event bus used for real-time device state, and the local file library (`data/library/`) introduced for upload-based workflows.

### Related Specs

- [Device Management](../device-management/) -- device registry, health checks, proxy
- [File Browser](../file-browser/) -- device filesystem browsing, file selection
- [Realtime Events](../realtime-events/) -- SSE transport for device and macro events

## Requirements

### REQ-1: Macro CRUD

Users MUST be able to create, read, update, and delete macros.

**GIVEN** the user is on the Macro Manager page
**WHEN** they click "+ NEW MACRO" and fill in a name, at least one step, and optionally a description
**THEN** the system SHALL persist the macro to `data/macros.json` and display it in the macro list.

**GIVEN** a custom macro exists
**WHEN** the user clicks "EDIT", modifies fields, and clicks "SAVE"
**THEN** the system SHALL update the macro and set a new `updatedAt` timestamp.

**GIVEN** a custom macro exists
**WHEN** the user clicks "DEL"
**THEN** the system SHALL remove it from the store. The API SHALL return 200 with `{ ok: true }`.

**GIVEN** a built-in macro exists
**WHEN** the user attempts to delete it
**THEN** the system SHALL reject the request with HTTP 403 and the message "Cannot delete built-in macro".

### REQ-2: Step Types

The system MUST support the following 16 step actions:

| Action | Parameters | Device API Call |
|---|---|---|
| `reset` | -- | `PUT /v1/machine:reset` |
| `reboot` | -- | `PUT /v1/machine:reboot` |
| `pause` | -- | `PUT /v1/machine:pause` |
| `resume` | -- | `PUT /v1/machine:resume` |
| `mount` | `drive` ("a"\|"b"), `image` (path), `mode?` | `PUT /v1/drives/{drive}:mount?image={image}&mode={mode}` |
| `remove` | `drive` ("a"\|"b") | `PUT /v1/drives/{drive}:remove` |
| `run_prg` | `file` (path) | `PUT /v1/runners:run_prg?file={file}` |
| `load_prg` | `file` (path) | `PUT /v1/runners:load_prg?file={file}` |
| `run_crt` | `file` (path) | `PUT /v1/runners:run_crt?file={file}` |
| `sidplay` | `file` (path), `songnr?` | `PUT /v1/runners:sidplay?file={file}&songnr={songnr}` |
| `modplay` | `file` (path) | `PUT /v1/runners:modplay?file={file}` |
| `writemem` | `address` (hex), `data` (hex) | `PUT /v1/machine:writemem?address={address}&data={data}` |
| `set_config` | `category`, `item`, `value` | `PUT /v1/configs/{category}/{item}?value={value}` |
| `delay` | `ms` (milliseconds) | Local sleep (no device call) |
| `upload_mount` | `localFile`, `drive` ("a"\|"b"), `mode?` | Read from `data/library/{localFile}`, `POST /v1/drives/{drive}:mount` with binary body |
| `upload_and_run` | `localFile`, `drive` ("a"\|"b"), `mode?` | Upload + mount, then auto-run (PRG: `POST /v1/runners:run_prg`; disk image: keyboard injection sequence) |

**GIVEN** a macro contains an `upload_and_run` step with a `.prg` file
**WHEN** the step executes
**THEN** the engine SHALL upload the file via `POST /v1/runners:run_prg` with the binary body (DMA load + auto-run).

**GIVEN** a macro contains an `upload_and_run` step with a disk image (`.d64`, `.d71`, `.d81`, `.g64`, `.g71`)
**WHEN** the step executes
**THEN** the engine SHALL: (1) upload and mount the image, (2) reset the machine, (3) wait 2.5s for BASIC boot, (4) inject `LOAD"*",8,1` via keyboard buffer at `$0277`, (5) poll screen RAM at `$0400` (1000 bytes) for the PETSCII sequence "READY." until found or 60s timeout, (6) inject `RUN` via keyboard buffer.

**GIVEN** a macro contains an `upload_mount` step with a `.prg` file
**WHEN** the step executes
**THEN** the engine SHALL upload the file via `POST /v1/runners:load_prg` (DMA load only, no auto-run).

### REQ-3: Asynchronous Execution

**GIVEN** the user selects a target device and clicks "RUN" on a macro
**WHEN** the execution starts
**THEN** the API SHALL return HTTP 202 with a `MacroExecution` object immediately. Steps SHALL run asynchronously in the background.

**GIVEN** a macro is executing
**WHEN** the user clicks "CANCEL"
**THEN** the engine SHALL set an abort flag, the current step SHALL complete or abort at the next check point, and the execution status SHALL transition to `"cancelled"`.

**GIVEN** a step fails (HTTP error or timeout)
**WHEN** the engine detects the failure
**THEN** the execution SHALL stop, the status SHALL transition to `"failed"`, and the `error` field SHALL contain the failure message.

**GIVEN** all steps complete successfully
**WHEN** the last step finishes
**THEN** the execution status SHALL transition to `"completed"` and `completedAt` SHALL be set.

### REQ-4: Real-Time Progress via SSE

**GIVEN** a macro is executing against a device
**WHEN** each step completes
**THEN** the server SHALL emit a `macro:step` SSE event containing `executionId`, `macroId`, `deviceId`, `currentStep`, `totalSteps`, and the completed `step`.

**GIVEN** a macro execution completes
**WHEN** all steps finish
**THEN** the server SHALL emit a `macro:complete` SSE event.

**GIVEN** a macro execution fails or is cancelled
**WHEN** the failure occurs
**THEN** the server SHALL emit a `macro:failed` SSE event with the `error` message.

**GIVEN** the client is connected via SSE
**WHEN** any macro event arrives
**THEN** the client SHALL invalidate the `macroExecutions` query cache to trigger a UI refresh.

### REQ-5: Built-in Templates

The system SHALL seed three built-in templates on first load if none exist:

1. **Quick Start Game**: `reset` -> `delay(2000ms)` -> `mount(drive a, placeholder image)` -> `run_prg(placeholder file)`
2. **Disk Swap**: `remove(drive a)` -> `delay(500ms)` -> `mount(drive a, placeholder image)`
3. **Memory Peek**: `pause` -> `writemem($0400, 0x01)` -> `resume`

**GIVEN** the macro store is empty (no built-in macros exist)
**WHEN** the store initializes
**THEN** the three templates SHALL be created with `builtIn: true`.

**GIVEN** built-in macros already exist
**WHEN** the store initializes
**THEN** no duplicate templates SHALL be created.

### REQ-6: Execution Retention

**GIVEN** the engine has accumulated more than 100 executions
**WHEN** a new execution starts
**THEN** the engine SHALL evict the oldest completed (non-running) executions until the count is at or below 100.

### REQ-7: Step Timeout

**GIVEN** a step issues an HTTP request to the device
**WHEN** the request does not respond within 10 seconds
**THEN** the request SHALL be aborted and the step SHALL fail with a timeout error.

### REQ-8: Path Traversal Prevention

**GIVEN** an `upload_mount` or `upload_and_run` step specifies a `localFile`
**WHEN** the filename contains path separators or `..`
**THEN** the engine SHALL reject the step with an error. Only bare filenames within `data/library/` are permitted.

## Design

### Architecture

```
                         ┌──────────────────────┐
                         │   Macro Manager UI   │
                         │  (React + TanStack)  │
                         └──────┬───────────────┘
                                │  HTTP + SSE
                                v
┌─────────────────────────────────────────────────────┐
│                    Hono Server                       │
│                                                      │
│  ┌─────────────┐   ┌──────────────┐   ┌───────────┐ │
│  │ MacroStore   │──>│ MacroEngine  │──>│ MacroEvents│ │
│  │ (CRUD+JSON)  │   │ (execution)  │   │ (SSE emit) │ │
│  └─────────────┘   └──────┬───────┘   └─────┬─────┘ │
│                           │                  │       │
│                    device HTTP calls   SSE broadcast  │
│                           │                  │       │
│                           v                  v       │
│                    ┌─────────────┐     SSE stream to  │
│                    │ C64U Device │     connected UIs   │
│                    └─────────────┘                    │
└─────────────────────────────────────────────────────┘
```

The system follows a three-layer pattern:

- **MacroStore** handles persistence (CRUD against `data/macros.json`) and built-in template seeding.
- **MacroEngine** manages asynchronous execution: it returns an execution handle immediately, runs steps sequentially in the background, and enforces timeouts, cancellation, and retention limits.
- **MacroEvents** provides pub/sub event emission consumed by the SSE transport to push real-time progress to connected clients.

### Data Models

All types are defined in `src/shared/types.ts`.

#### MacroStep (discriminated union)

```typescript
type MacroStep =
  | { action: "reset" }
  | { action: "reboot" }
  | { action: "pause" }
  | { action: "resume" }
  | { action: "mount"; drive: "a" | "b"; image: string; mode?: string }
  | { action: "remove"; drive: "a" | "b" }
  | { action: "run_prg"; file: string }
  | { action: "load_prg"; file: string }
  | { action: "run_crt"; file: string }
  | { action: "sidplay"; file: string; songnr?: number }
  | { action: "modplay"; file: string }
  | { action: "writemem"; address: string; data: string }
  | { action: "set_config"; category: string; item: string; value: string }
  | { action: "delay"; ms: number }
  | { action: "upload_mount"; localFile: string; drive: "a" | "b"; mode?: string }
  | { action: "upload_and_run"; localFile: string; drive: "a" | "b"; mode?: string }
```

The `action` field acts as the discriminant. Each variant carries only the parameters relevant to that action.

#### Macro

```typescript
interface Macro {
  id: string          // crypto.randomUUID()
  name: string
  description?: string
  steps: MacroStep[]
  builtIn?: boolean   // true for seeded templates
  createdAt: string   // ISO 8601
  updatedAt: string   // ISO 8601
}
```

#### MacroExecution

```typescript
interface MacroExecution {
  id: string
  macroId: string
  deviceId: string
  status: "running" | "completed" | "failed" | "cancelled"
  currentStep: number
  totalSteps: number
  error?: string
  startedAt: string
  completedAt?: string
}
```

#### MacroEvent (SSE payload)

```typescript
type MacroEventType = "macro:step" | "macro:complete" | "macro:failed"

interface MacroEvent {
  type: MacroEventType
  executionId: string
  macroId: string
  deviceId: string
  data: {
    currentStep?: number
    totalSteps?: number
    step?: MacroStep
    error?: string
  }
}
```

### API Surface

Base path: `/api`

#### Macro CRUD

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `GET` | `/macros` | -- | `Macro[]` | 200 |
| `POST` | `/macros` | `{ name, description?, steps }` | `Macro` | 201 |
| `GET` | `/macros/:id` | -- | `Macro` | 200 / 404 |
| `PUT` | `/macros/:id` | `{ name?, description?, steps? }` | `Macro` | 200 / 404 |
| `DELETE` | `/macros/:id` | -- | `{ ok: true }` | 200 / 403 / 404 |

Validation rules:
- `POST /macros`: `name` MUST be a non-empty string. `steps` MUST be a non-empty array.
- `PUT /macros/:id`: `steps`, if provided, MUST be a non-empty array.
- `DELETE /macros/:id`: returns 403 if `builtIn` is true, 404 if not found.

#### Execution Control

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `POST` | `/macros/:id/execute` | `{ deviceId }` | `MacroExecution` | 202 / 404 / 503 |
| `GET` | `/macros/executions` | -- | `MacroExecution[]` | 200 |
| `GET` | `/macros/executions/:execId` | -- | `MacroExecution` | 200 / 404 |
| `POST` | `/macros/executions/:execId/cancel` | -- | `{ ok: true }` | 200 / 404 |

- `POST /macros/:id/execute` validates that the macro exists, `deviceId` is provided, the device exists, and the device is online (503 if offline).
- `GET /macros/executions` returns at most 100 retained executions.
- `POST .../cancel` returns 404 if the execution does not exist or is not in `"running"` status.

### UI Components

#### Macro Manager Page (`/macros`)

Route: `src/client/routes/macros/index.tsx`

- **Device selector**: dropdown of online devices for execution targeting.
- **Macro list table**: columns for Name, Steps (count), Type (`BUILT-IN` badge or `CUSTOM` text), Actions (`RUN`, `EDIT`, `DEL`).
- **Create/Edit flow**: opens `MacroEditor` overlay. Returns to list on save or cancel.
- **Execution progress**: shows `ExecutionProgress` component when a macro is running.
- `DEL` button is disabled for built-in macros.
- `RUN` button is disabled when no online devices are available or an execution is pending.

#### MacroEditor (`src/client/components/macro/macro-editor.tsx`)

- Name and description text inputs.
- Ordered step list with per-step action selector (16 action types).
- Action-specific fields rendered by `StepFields`:
  - `mount`: drive selector, image path input with device file browser, optional mode.
  - `upload_mount` / `upload_and_run`: drive selector, local file input with `LocalFilePicker`, optional mode.
  - `run_prg`, `load_prg`, `run_crt`, `modplay`: file path input with device file browser.
  - `sidplay`: file path input with device file browser + optional song number.
  - `writemem`: hex address + hex data inputs.
  - `set_config`: category, item, value inputs.
  - `delay`: millisecond input.
  - `reset`, `reboot`, `pause`, `resume`: no additional fields.
- Step reordering (move up/down) and removal controls.
- Minimum one step enforced (remove button disabled when only one step remains).

#### LocalFilePicker (`src/client/components/macro/local-file-picker.tsx`)

- Fetches files from the local library via `GET /api/library`.
- Displays filename (uppercased) and size in KB.
- Click-to-select returns filename to the parent step editor.

#### ExecutionProgress (`src/client/components/macro/execution-progress.tsx`)

- PETSCII-style progress bar: filled blocks for completed steps, shaded blocks for remaining.
- Step counter: "STEP N OF M".
- Cancel button (visible only for running executions).
- Status badges with color coding: running (light green), completed (green), failed (red), cancelled (orange).
- Recent executions list: last 5 non-running executions sorted by start time descending.
- Progress updates driven by SSE event invalidation of the `macroExecutions` query cache (polling at 3s as fallback).

### Business Logic

#### MacroStore (`src/server/lib/macro-store.ts`)

- Persistence file: `data/macros.json`. Directory created on construction if absent.
- On construction: loads existing macros from disk, then seeds built-in templates if no `builtIn` macros exist.
- `create()`: assigns `crypto.randomUUID()` as `id`, sets `createdAt` and `updatedAt` to current ISO timestamp.
- `update()`: accepts partial fields (`name`, `description`, `steps`). Updates `updatedAt`. Returns `undefined` if macro not found.
- `remove()`: returns `"ok"` on success, `"not_found"` if ID missing, `"built_in"` if macro is a template.

#### MacroEngine (`src/server/lib/macro-engine.ts`)

- `execute(macro, device)`: creates a `MacroExecution` record, triggers asynchronous `runSteps()`, and returns the execution immediately.
- `runSteps()`: iterates steps sequentially. Before and after each step, checks the abort flag. On abort, sets status to `"cancelled"` and emits `macro:failed` with error "Cancelled".
- Step dispatch:
  - `delay`: abortable sleep with 100ms polling interval on the abort flag.
  - `upload_mount` / `upload_and_run`: delegated to `executeUploadStep()` which reads from `data/library/`, validates the filename (no path traversal), and dispatches based on file extension.
  - All other steps: mapped to an HTTP method + path via `mapStepToRequest()`, executed with a 10s `AbortController` timeout. The response is checked for both HTTP-level errors and C64U application-level errors (JSON `errors` array).
- `cancel(execId)`: sets abort flag. Returns `false` if execution not found or not running.
- `evictOldExecutions()`: when count exceeds 100, removes oldest completed executions by `startedAt`.

#### MacroEvents (`src/server/lib/macro-events.ts`)

- Simple pub/sub: `emitMacroEvent()` broadcasts to all registered listeners.
- `onMacroEvent()` registers a listener and returns an unsubscribe function.
- The SSE route subscribes via `onMacroEvent()` and forwards events to connected clients.

#### Client Hooks (`src/client/hooks/use-macros.ts`)

| Hook | Type | Description |
|------|------|-------------|
| `useMacros()` | Query | Fetches all macros from `GET /api/macros` |
| `useCreateMacro()` | Mutation | `POST /api/macros`, invalidates `macros` cache |
| `useUpdateMacro()` | Mutation | `PUT /api/macros/:id`, invalidates `macros` cache |
| `useDeleteMacro()` | Mutation | `DELETE /api/macros/:id`, invalidates `macros` cache |
| `useExecuteMacro()` | Mutation | `POST /api/macros/:id/execute`, invalidates `macroExecutions` cache |
| `useExecutions()` | Query | `GET /api/macros/executions`, polls every 3s |
| `useCancelExecution()` | Mutation | `POST /api/macros/executions/:execId/cancel`, invalidates `macroExecutions` cache |

SSE integration: `useDeviceSSE` listens for `macro:step`, `macro:complete`, and `macro:failed` events and invalidates the `macroExecutions` query key on receipt, providing near-instant UI updates.

## Constraints

1. Macros are linear sequences only. Conditional branching, loops, and variable substitution are out of scope.
2. Scheduled or cron-based macro execution is NOT supported.
3. The `delay` step is local to the server; it does NOT issue any device API call.
4. The step timeout of 10 seconds applies to individual device HTTP requests, not to `delay` steps or the overall macro duration.
5. The `upload_mount` and `upload_and_run` steps MUST only read files from `data/library/`. Path traversal attempts (e.g., `../etc/passwd`) MUST be rejected.
6. Supported file types for upload steps: `.prg` (program), `.d64`, `.d71`, `.d81`, `.g64`, `.g71` (disk images). Other extensions MUST be rejected.
7. Execution history is retained in-memory only (not persisted to disk). Server restarts clear all execution records.
8. Maximum 100 retained executions. Eviction targets oldest completed executions first; running executions are never evicted.
9. Built-in macros use placeholder file paths (e.g., `/USB0/game.d64`). Users SHOULD edit these paths before executing.
10. The keyboard injection sequence for `upload_and_run` with disk images uses BASIC keyword abbreviation (`L` + `SHIFT-O` = `LOAD`, encoded as `$4C $CF`) to fit `LOAD"*",8,1` + CR within the 10-byte keyboard buffer limit at `$0277`.

## Open Questions

1. **Macro duplication**: Should there be a "Clone" action to duplicate an existing macro (including built-ins) as a starting point for customization?
2. **Step validation**: Should the API validate step parameters more strictly (e.g., confirm that `address` is valid hex, `ms` is positive, `drive` is "a" or "b") at creation time, or rely on runtime failure?
3. **Concurrent execution**: Should the engine prevent running multiple macros simultaneously on the same device, or allow it?
4. **Execution persistence**: Should execution history be persisted to disk so it survives server restarts?
5. **Upload_and_run timeout**: The disk-image auto-run sequence can take up to 60s for the screen-RAM polling loop. Should this timeout be configurable?

## References

- [C64 Ultimate API Documentation](https://1541u-documentation.readthedocs.io/) -- device REST API
- `src/shared/types.ts` -- canonical type definitions
- `src/server/lib/macro-store.ts` -- persistence layer
- `src/server/lib/macro-engine.ts` -- execution engine
- `src/server/lib/macro-events.ts` -- SSE event emitter
- `src/server/routes/macros.ts` -- API route definitions
- `src/client/routes/macros/index.tsx` -- Macro Manager page
- `src/client/components/macro/macro-editor.tsx` -- step editor UI
- `src/client/components/macro/local-file-picker.tsx` -- library file browser
- `src/client/components/macro/execution-progress.tsx` -- progress display
- `src/client/hooks/use-macros.ts` -- React Query hooks
- `src/client/hooks/use-device-sse.ts` -- SSE integration for macro events
- `docs/specs/archive/0006-workflows-and-media.md` -- original combined spec

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-04-16 | Initial spec created | -- |
