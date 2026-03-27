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

    // For upload_and_run: reset, inject LOAD"*",8,1 via keyboard buffer,
    // wait for loading to finish, then inject RUN.
    //
    // The C64 keyboard buffer is at $0277 (10 bytes max), length at $C6.
    // LOAD"*",8,1 + CR = 13 bytes — too long for the 10-byte buffer.
    //
    // Trick: use BASIC keyword abbreviation. The C64 accepts the first letter
    // plus the SHIFTED second letter as a keyword shortcut:
    //   L + SHIFT-O = LOAD (PETSCII: $4C $CF)
    // This gives us: lO"*",8,1 + CR = exactly 10 bytes!
    //
    // PETSCII bytes: $4C $CF $22 $2A $22 $2C $38 $2C $31 $0D
    // RUN + CR: $52 $55 $4E $0D = 4 bytes
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

      // Helper: stuff PETSCII bytes into keyboard buffer ($0277) and set length ($C6)
      const stuffKeyboard = async (petsciiBytes: number[]) => {
        const hex = petsciiBytes.map(b => b.toString(16).padStart(2, '0')).join('');
        const len = petsciiBytes.length.toString(16).padStart(2, '0');
        await dmaFetch(`/v1/machine:writemem?address=0277&data=${hex}`);
        await dmaFetch(`/v1/machine:writemem?address=C6&data=${len}`);
      };

      // 1. Reset the machine
      await dmaFetch("/v1/machine:reset");

      // 2. Wait for BASIC to boot
      await new Promise((r) => setTimeout(r, 2500));

      // 3. Stuff LOAD"*",8,1 + CR into keyboard buffer (abbreviated form, 10 bytes)
      //    L=$4C, SHIFT-O=$CF, "=$22, *=$2A, ,=$2C, 8=$38, 1=$31, CR=$0D
      await stuffKeyboard([0x4C, 0xCF, 0x22, 0x2A, 0x22, 0x2C, 0x38, 0x2C, 0x31, 0x0D]);

      // 4. Wait for LOAD to complete
      //    1541 loading typically takes 10-30 seconds depending on file size.
      await new Promise((r) => setTimeout(r, 20000));

      // 5. Stuff RUN + CR into keyboard buffer (4 bytes)
      //    R=$52, U=$55, N=$4E, CR=$0D
      await stuffKeyboard([0x52, 0x55, 0x4E, 0x0D]);
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
