import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { Device, Macro, MacroExecution, MacroStep } from "@shared/types.ts";
import { emitMacroEvent } from "./macro-events.ts";

const STEP_TIMEOUT_MS = 10000;
const MAX_RETAINED_EXECUTIONS = 100;

export class MacroEngine {
  private executions: Map<string, MacroExecution> = new Map();
  private abortFlags: Map<string, boolean> = new Map();

  listExecutions(): MacroExecution[] {
    return Array.from(this.executions.values());
  }

  getExecution(id: string): MacroExecution | undefined {
    return this.executions.get(id);
  }

  cancel(execId: string): boolean {
    const exec = this.executions.get(execId);
    if (!exec || exec.status !== "running") return false;
    this.abortFlags.set(execId, true);
    return true;
  }

  async execute(macro: Macro, device: Device): Promise<MacroExecution> {
    const execId = crypto.randomUUID();
    const execution: MacroExecution = {
      id: execId,
      macroId: macro.id,
      deviceId: device.id,
      status: "running",
      currentStep: 0,
      totalSteps: macro.steps.length,
      startedAt: new Date().toISOString(),
    };
    this.executions.set(execId, execution);
    this.abortFlags.set(execId, false);

    // Evict oldest completed executions to bound memory
    this.evictOldExecutions();

    // Run steps asynchronously — caller gets execution ID immediately
    this.runSteps(execId, macro, device).catch(() => {});
    return execution;
  }

  private async runSteps(
    execId: string,
    macro: Macro,
    device: Device,
  ): Promise<void> {
    const execution = this.executions.get(execId)!;

    for (let i = 0; i < macro.steps.length; i++) {
      if (this.abortFlags.get(execId)) {
        execution.status = "cancelled";
        execution.completedAt = new Date().toISOString();
        this.abortFlags.delete(execId);
        emitMacroEvent({
          type: "macro:failed",
          executionId: execId,
          macroId: macro.id,
          deviceId: device.id,
          data: { currentStep: i, totalSteps: macro.steps.length, error: "Cancelled" },
        });
        return;
      }

      execution.currentStep = i;
      const step = macro.steps[i]!;

      try {
        await this.executeStep(step, device, execId);

        // Re-check abort flag after step completes (e.g. delay cancelled mid-sleep)
        if (this.abortFlags.get(execId)) {
          execution.status = "cancelled";
          execution.completedAt = new Date().toISOString();
          this.abortFlags.delete(execId);
          emitMacroEvent({
            type: "macro:failed",
            executionId: execId,
            macroId: macro.id,
            deviceId: device.id,
            data: { currentStep: i, totalSteps: macro.steps.length, error: "Cancelled" },
          });
          return;
        }

        emitMacroEvent({
          type: "macro:step",
          executionId: execId,
          macroId: macro.id,
          deviceId: device.id,
          data: { currentStep: i, totalSteps: macro.steps.length, step },
        });
      } catch (err) {
        execution.status = "failed";
        execution.error =
          err instanceof Error ? err.message : String(err);
        execution.completedAt = new Date().toISOString();
        this.abortFlags.delete(execId);
        emitMacroEvent({
          type: "macro:failed",
          executionId: execId,
          macroId: macro.id,
          deviceId: device.id,
          data: { currentStep: i, totalSteps: macro.steps.length, error: execution.error },
        });
        return;
      }
    }

    execution.status = "completed";
    execution.currentStep = macro.steps.length;
    execution.completedAt = new Date().toISOString();
    this.abortFlags.delete(execId);
    emitMacroEvent({
      type: "macro:complete",
      executionId: execId,
      macroId: macro.id,
      deviceId: device.id,
      data: { currentStep: macro.steps.length, totalSteps: macro.steps.length },
    });
  }

  private async executeStep(
    step: MacroStep,
    device: Device,
    execId: string,
  ): Promise<void> {
    if (step.action === "delay") {
      // Make delay abortable by checking abort flag periodically
      const interval = 100;
      let elapsed = 0;
      while (elapsed < step.ms) {
        if (this.abortFlags.get(execId)) return;
        const wait = Math.min(interval, step.ms - elapsed);
        await new Promise((resolve) => setTimeout(resolve, wait));
        elapsed += wait;
      }
      return;
    }

    if (step.action === "upload_mount" || step.action === "upload_and_run") {
      await this.executeUploadStep(step, device);
      return;
    }

    const { method, path } = this.mapStepToRequest(step);
    const url = `http://${device.ip}:${device.port}${path}`;
    const headers: Record<string, string> = {};
    if (device.password) headers["X-Password"] = device.password;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method,
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Step '${step.action}' failed: HTTP ${res.status}${text ? ` - ${text}` : ""}`,
        );
      }
      // Check C64U application-level errors (HTTP 200 but errors array)
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = await res.json().catch(() => null) as { errors?: string[] } | null;
        if (body?.errors?.length) {
          throw new Error(
            `Step '${step.action}' failed: ${body.errors.join("; ")}`,
          );
        }
      }
    } finally {
      clearTimeout(timer);
    }
  }

  /** Execute an upload_mount or upload_and_run step */
  private async executeUploadStep(
    step: Extract<MacroStep, { action: "upload_mount" | "upload_and_run" }>,
    device: Device,
  ): Promise<void> {
    const gamesDir = join(process.cwd(), "data", "games");

    // Sanitize localFile to prevent path traversal
    const safeName = basename(step.localFile);
    if (safeName !== step.localFile || step.localFile.includes("..")) {
      throw new Error(
        `Step '${step.action}' failed: invalid file name: ${step.localFile}`,
      );
    }
    const filePath = join(gamesDir, safeName);

    let fileData: Buffer;
    try {
      fileData = readFileSync(filePath);
    } catch {
      throw new Error(
        `Step '${step.action}' failed: file not found: ${step.localFile}`,
      );
    }

    // Derive image type from extension
    const lastDot = step.localFile.lastIndexOf(".");
    const imageType = lastDot !== -1 ? step.localFile.slice(lastDot + 1).toLowerCase() : "";

    const VALID_MODES = new Set(["readwrite", "readonly", "unlinked"]);
    const mode = step.mode && VALID_MODES.has(step.mode) ? step.mode : "readwrite";
    let mountUrl = `http://${device.ip}:${device.port}/v1/drives/${step.drive}:mount?mode=${encodeURIComponent(mode)}`;
    if (imageType) {
      mountUrl += `&type=${encodeURIComponent(imageType)}`;
    }

    const headers: Record<string, string> = {
      "content-type": "application/octet-stream",
    };
    if (device.password) headers["X-Password"] = device.password;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), STEP_TIMEOUT_MS);

    try {
      const res = await fetch(mountUrl, {
        method: "POST",
        headers,
        body: fileData,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Step '${step.action}' failed: HTTP ${res.status}${text ? ` - ${text}` : ""}`,
        );
      }
      // Check C64U application-level errors (HTTP 200 but errors array)
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await res.json().catch(() => null) as { errors?: string[] } | null;
        if (body?.errors?.length) {
          throw new Error(
            `Step '${step.action}' failed: ${body.errors.join("; ")}`,
          );
        }
      }
    } finally {
      clearTimeout(timer);
    }

    // For upload_and_run: reset the machine, wait for BASIC to boot,
    // then inject LOAD"*",8,1 + RUN into the keyboard buffer via DMA writemem.
    //
    // The C64 keyboard buffer is at $0277 (10 bytes max), length at $C6.
    // LOAD"*",8,1\r is 13 chars — too long for the 10-byte buffer.
    // Trick: write the text to screen RAM at $0400 line 3 (after BASIC prompt),
    // position the cursor there, then stuff two CRs into the keyboard buffer
    // so the C64 reads both lines from screen and executes them.
    if (step.action === "upload_and_run") {
      const baseUrl = `http://${device.ip}:${device.port}`;
      const hdrs: Record<string, string> = {};
      if (device.password) hdrs["X-Password"] = device.password;

      const dmaFetch = async (path: string, method = "PUT") => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), STEP_TIMEOUT_MS);
        try {
          const r = await fetch(`${baseUrl}${path}`, { method, headers: hdrs, signal: ctrl.signal });
          if (!r.ok) {
            const text = await r.text().catch(() => "");
            throw new Error(`${step.action} failed: HTTP ${r.status}${text ? ` - ${text}` : ""}`);
          }
        } finally { clearTimeout(t); }
      };

      // 1. Reset the machine
      await dmaFetch("/v1/machine:reset");

      // 2. Wait for BASIC to boot (~2 seconds)
      await new Promise((r) => setTimeout(r, 2500));

      // 3. Write "LOAD" + chr$(34) + "*" + chr$(34) + ",8,1" to screen line 5 ($0400 + 5*40 = $04C8)
      //    and "RUN" to screen line 6 ($04F0)
      //    Screen codes: L=12 O=15 A=1 D=4 "=34→screen code 34 is not right...
      //    Actually for screen codes: letters are at screen code = PETSCII - 64 for uppercase
      //    L=76-64=12, O=79-64=15, A=65-64=1, D=68-64=4
      //    "*" = 42-32=10... no. Screen codes for special chars:
      //    " = screen code 34 (same as PETSCII for punctuation 32-63)
      //    * = screen code 42 (same range), , = 44, 8 = 56-48=8...
      //    Numbers 0-9: screen code = PETSCII - 48 + 48 = same (48-57 → 48-57)...
      //    Actually for $20-$3F range, screen code = PETSCII code. So " * , 8 1 are same.
      //    For $40-$5F (uppercase letters), screen code = PETSCII - 64.
      //    L=12, O=15, A=1, D=4, R=18, U=21, N=14
      //    LOAD"*",8,1 → screen codes: 12,15,1,4, 34,42,34, 44,56,44,49
      //    RUN → screen codes: 18,21,14
      const loadLine = [12,15,1,4, 34,42,34, 44,56,44,49]; // LOAD"*",8,1
      const runLine = [18,21,14]; // RUN
      const loadHex = loadLine.map(b => b.toString(16).padStart(2, '0')).join('');
      const runHex = runLine.map(b => b.toString(16).padStart(2, '0')).join('');

      // Write LOAD"*",8,1 at screen line 5 ($04C8)
      await dmaFetch(`/v1/machine:writemem?address=04C8&data=${loadHex}`);
      // Write RUN at screen line 6 ($04F0)
      await dmaFetch(`/v1/machine:writemem?address=04F0&data=${runHex}`);

      // 4. Position cursor at line 5 col 0 and stuff 2x RETURN into keyboard buffer
      //    Cursor row is at $D6, cursor column at $D3 (these are zero page locations)
      //    $D6 = cursor row = 5, $D3 = cursor column = 0
      await dmaFetch(`/v1/machine:writemem?address=D6&data=05`);
      await dmaFetch(`/v1/machine:writemem?address=D3&data=00`);

      // Put 2x CR (PETSCII 13 = 0x0D) in keyboard buffer at $0277, set length at $C6 = 2
      await dmaFetch(`/v1/machine:writemem?address=0277&data=0D0D`);
      await dmaFetch(`/v1/machine:writemem?address=C6&data=02`);
    }
  }

  /** Map a macro step to the corresponding C64U HTTP request */
  mapStepToRequest(
    step: Exclude<MacroStep, { action: "delay" } | { action: "upload_mount" } | { action: "upload_and_run" }>,
  ): { method: string; path: string } {
    switch (step.action) {
      case "reset":
        return { method: "PUT", path: "/v1/machine:reset" };
      case "reboot":
        return { method: "PUT", path: "/v1/machine:reboot" };
      case "pause":
        return { method: "PUT", path: "/v1/machine:pause" };
      case "resume":
        return { method: "PUT", path: "/v1/machine:resume" };
      case "mount": {
        const params = new URLSearchParams({ image: step.image });
        if (step.mode) params.set("mode", step.mode);
        return {
          method: "PUT",
          path: `/v1/drives/${step.drive}:mount?${params}`,
        };
      }
      case "remove":
        return {
          method: "PUT",
          path: `/v1/drives/${step.drive}:remove`,
        };
      case "run_prg":
        return {
          method: "PUT",
          path: `/v1/runners:run_prg?file=${encodeURIComponent(step.file)}`,
        };
      case "load_prg":
        return {
          method: "PUT",
          path: `/v1/runners:load_prg?file=${encodeURIComponent(step.file)}`,
        };
      case "run_crt":
        return {
          method: "PUT",
          path: `/v1/runners:run_crt?file=${encodeURIComponent(step.file)}`,
        };
      case "sidplay": {
        const params = new URLSearchParams({ file: step.file });
        if (step.songnr !== undefined)
          params.set("songnr", String(step.songnr));
        return { method: "PUT", path: `/v1/runners:sidplay?${params}` };
      }
      case "modplay":
        return {
          method: "PUT",
          path: `/v1/runners:modplay?file=${encodeURIComponent(step.file)}`,
        };
      case "writemem": {
        const params = new URLSearchParams({
          address: step.address,
          data: step.data,
        });
        return { method: "PUT", path: `/v1/machine:writemem?${params}` };
      }
      case "set_config":
        return {
          method: "PUT",
          path: `/v1/configs/${encodeURIComponent(step.category)}/${encodeURIComponent(step.item)}?value=${encodeURIComponent(step.value)}`,
        };
      default:
        throw new Error(
          `Unknown action: ${(step as { action: string }).action}`,
        );
    }
  }

  private evictOldExecutions(): void {
    if (this.executions.size <= MAX_RETAINED_EXECUTIONS) return;
    const completed = Array.from(this.executions.values())
      .filter((e) => e.status !== "running")
      .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
    while (
      this.executions.size > MAX_RETAINED_EXECUTIONS &&
      completed.length > 0
    ) {
      const oldest = completed.shift()!;
      this.executions.delete(oldest.id);
    }
  }
}
