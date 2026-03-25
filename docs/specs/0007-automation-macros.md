# 0007 — Automation / Macros

## Overview

Define and execute scripted sequences of C64U API actions. A macro is a named, ordered list of steps like "mount disk, run program, set border color" that executes with a single trigger.

## Background

The C64U API supports many discrete operations (mount, run, reset, write memory, configure) but there's no way to chain them. Common workflows like "reset machine, mount game disk, run program" require multiple manual steps. Macros automate these sequences.

## Goals

- Define macros as ordered sequences of API actions
- Execute macros against a specific device
- Parameterizable steps (e.g., device ID, file path as variables)
- Delay/wait between steps (some operations need the device to settle)
- Execution status reporting (running, step N of M, success, failure)
- SSE events for macro execution progress
- Built-in macro templates for common workflows

## Non-Goals

- Conditional logic / branching (no if/else — macros are linear sequences)
- Scheduled execution (cron-like — future feature)
- Cross-device macros (one device per execution)
- Visual macro editor (text/JSON definition is sufficient for now)

## Technical Design

### Data Model

```typescript
interface Macro {
  id: string
  name: string
  description?: string
  steps: MacroStep[]
  createdAt: string
  updatedAt: string
}

type MacroStep =
  | { action: 'reset' }
  | { action: 'reboot' }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'mount', drive: 'a' | 'b', image: string, mode?: string }
  | { action: 'remove', drive: 'a' | 'b' }
  | { action: 'run_prg', file: string }
  | { action: 'load_prg', file: string }
  | { action: 'run_crt', file: string }
  | { action: 'sidplay', file: string, songnr?: number }
  | { action: 'modplay', file: string }
  | { action: 'writemem', address: string, data: string }
  | { action: 'set_config', category: string, item: string, value: string }
  | { action: 'delay', ms: number }

interface MacroExecution {
  id: string
  macroId: string
  deviceId: string
  status: 'running' | 'completed' | 'failed'
  currentStep: number
  totalSteps: number
  error?: string
  startedAt: string
  completedAt?: string
}
```

Persisted to `data/macros.json`.

### API Endpoints

```
GET    /api/macros                             → list all macros
POST   /api/macros                             → create macro
GET    /api/macros/:id                         → get macro
PUT    /api/macros/:id                         → update macro
DELETE /api/macros/:id                         → delete macro
POST   /api/macros/:id/execute                 → execute macro on a device { deviceId }
GET    /api/macros/executions                  → list running/recent executions
GET    /api/macros/executions/:execId          → get execution status
POST   /api/macros/executions/:execId/cancel   → cancel running execution
```

### Execution Engine

1. Validate all steps before starting (check device online, files exist for mount/run steps)
2. Execute steps sequentially
3. Map each `action` to the corresponding C64U API call via the proxy
4. After each step: update execution status, emit SSE event
5. On failure: stop execution, record error, emit failure event
6. `delay` steps use `await Bun.sleep(ms)`

### SSE Events

```
event: macro:step
data: { "executionId": "...", "step": 2, "total": 5, "action": "mount" }

event: macro:complete
data: { "executionId": "...", "macroId": "..." }

event: macro:failed
data: { "executionId": "...", "step": 3, "error": "Device timeout" }
```

### Built-in Templates

Provide starter macros:
- **Quick Start Game:** Reset → Mount disk → Run PRG
- **Disk Swap:** Remove current → Mount next disk
- **Memory Peek:** Pause → Read memory range → Resume

## Acceptance Criteria

- [ ] CRUD operations for macros via API
- [ ] Execute a macro with sequential step execution
- [ ] Each step maps to the correct C64U API call
- [ ] Delay steps pause execution for the specified duration
- [ ] Execution status updates via SSE in real-time
- [ ] Cancellation stops a running macro
- [ ] Pre-execution validation catches missing files / offline device
- [ ] Built-in templates are available on first run

## Tasks

- [ ] Implement macro CRUD API with JSON persistence
  - [ ] Create `Macro`, `MacroStep`, and `MacroExecution` TypeScript types
  - [ ] Implement `MacroStore`: load/save `data/macros.json`
  - [ ] `GET /api/macros` — list all macros
  - [ ] `POST /api/macros` — create macro with name and step list
  - [ ] `GET /api/macros/:id`, `PUT /api/macros/:id`, `DELETE /api/macros/:id`
  - [ ] Seed built-in templates on first run (Quick Start Game, Disk Swap, Memory Peek)
- [ ] Implement macro execution engine
  - [ ] `POST /api/macros/:id/execute` — accept `{ deviceId }`, start execution
  - [ ] Pre-execution validation: check device online, validate file paths for mount/run steps
  - [ ] Sequential step execution: map each `MacroStep.action` to the corresponding C64U API call via proxy
  - [ ] Handle `delay` steps with `await Bun.sleep(ms)`
  - [ ] Track execution state: `running`, `completed`, `failed` with current step progress
  - [ ] On failure: stop execution, record error and failing step
- [ ] Implement execution management and cancellation
  - [ ] `GET /api/macros/executions` — list running and recent executions
  - [ ] `GET /api/macros/executions/:execId` — get execution status
  - [ ] `POST /api/macros/executions/:execId/cancel` — cancel a running execution (abort after current step)
- [ ] Implement SSE events for macro execution progress
  - [ ] Emit `macro:step` after each step completes (step number, action, total)
  - [ ] Emit `macro:complete` on success
  - [ ] Emit `macro:failed` on failure (step number, error message)
- [ ] Build macro management UI
  - [ ] Macro list page with name, step count, last-run date
  - [ ] Macro editor: add/remove/reorder steps, configure step parameters
  - [ ] File browser integration for selecting files in mount/run steps
  - [ ] Execute button with device selector
  - [ ] Execution progress display: step-by-step status, current step highlight, error display
