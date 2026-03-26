import { Hono } from "hono";
import type { MacroStore } from "../lib/macro-store.ts";
import type { MacroEngine } from "../lib/macro-engine.ts";
import type { DeviceStore } from "../lib/device-store.ts";

async function parseJSON<T>(c: {
  req: { json: () => Promise<T> };
}): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function createMacroRoutes(
  macroStore: MacroStore,
  engine: MacroEngine,
  deviceStore: DeviceStore,
) {
  const macros = new Hono()

    // ── Execution routes (must come before :id routes) ───
    .get("/macros/executions", (c) => {
      return c.json(engine.listExecutions());
    })

    .get("/macros/executions/:execId", (c) => {
      const exec = engine.getExecution(c.req.param("execId"));
      if (!exec) return c.json({ error: "Execution not found" }, 404);
      return c.json(exec);
    })

    .post("/macros/executions/:execId/cancel", (c) => {
      const cancelled = engine.cancel(c.req.param("execId"));
      if (!cancelled)
        return c.json({ error: "Execution not found or not running" }, 404);
      return c.json({ ok: true });
    })

    // ── CRUD routes ──────────────────────────────────────

    .get("/macros", (c) => {
      return c.json(macroStore.list());
    })

    .post("/macros", async (c) => {
      const body = await parseJSON<{
        name?: string;
        description?: string;
        steps?: unknown[];
      }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);
      if (!body.name || typeof body.name !== "string")
        return c.json({ error: "name is required" }, 400);
      if (!Array.isArray(body.steps) || body.steps.length === 0)
        return c.json({ error: "steps must be a non-empty array" }, 400);

      const macro = macroStore.create({
        name: body.name,
        description: body.description,
        steps: body.steps as any,
      });
      return c.json(macro, 201);
    })

    .get("/macros/:id", (c) => {
      const macro = macroStore.get(c.req.param("id"));
      if (!macro) return c.json({ error: "Macro not found" }, 404);
      return c.json(macro);
    })

    .put("/macros/:id", async (c) => {
      const body = await parseJSON<{
        name?: string;
        description?: string;
        steps?: unknown[];
      }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);
      if (
        body.steps !== undefined &&
        (!Array.isArray(body.steps) || body.steps.length === 0)
      )
        return c.json({ error: "steps must be a non-empty array" }, 400);

      const macro = macroStore.update(c.req.param("id"), body as any);
      if (!macro) return c.json({ error: "Macro not found" }, 404);
      return c.json(macro);
    })

    .delete("/macros/:id", (c) => {
      const result = macroStore.remove(c.req.param("id"));
      if (result === "not_found")
        return c.json({ error: "Macro not found" }, 404);
      if (result === "built_in")
        return c.json({ error: "Cannot delete built-in macro" }, 403);
      return c.json({ ok: true });
    })

    // ── Execute macro ────────────────────────────────────

    .post("/macros/:id/execute", async (c) => {
      const macro = macroStore.get(c.req.param("id"));
      if (!macro) return c.json({ error: "Macro not found" }, 404);

      const body = await parseJSON<{ deviceId?: string }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);
      if (!body.deviceId)
        return c.json({ error: "deviceId is required" }, 400);

      const device = deviceStore.get(body.deviceId);
      if (!device) return c.json({ error: "Device not found" }, 404);
      if (!device.online)
        return c.json({ error: "Device is offline" }, 503);

      const execution = await engine.execute(macro, device);
      return c.json(execution, 202);
    });

  return macros;
}
