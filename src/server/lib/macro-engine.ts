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

  /** Map a macro step to the corresponding C64U HTTP request */
  mapStepToRequest(
    step: Exclude<MacroStep, { action: "delay" }>,
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
