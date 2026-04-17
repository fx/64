import { Hono } from "hono";
import type { ProfileStore } from "../lib/profile-store.ts";

async function parseJSON<T>(c: { req: { json: () => Promise<T> } }): Promise<T | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Validate that config is Record<string, Record<string, string | number>> */
function validateConfig(
  config: unknown,
): { config: Record<string, Record<string, string | number>>; error?: undefined } | { config?: undefined; error: string } {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { error: "config must be an object" };
  }
  const result: Record<string, Record<string, string | number>> = Object.create(null);
  for (const [category, items] of Object.entries(config as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(category)) continue;
    if (typeof items !== "object" || items === null || Array.isArray(items)) {
      return { error: `config.${category} must be an object` };
    }
    const entries: Record<string, string | number> = Object.create(null);
    for (const [key, value] of Object.entries(items as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) continue;
      if (typeof value !== "string" && typeof value !== "number") {
        return { error: `config.${category}.${key} must be a string or number` };
      }
      entries[key] = value;
    }
    result[category] = entries;
  }
  return { config: result };
}

export function createProfileRoutes(profileStore: ProfileStore) {
  const app = new Hono()

    // List all profiles
    .get("/profiles", (c) => {
      return c.json(profileStore.list());
    })

    // Create profile
    .post("/profiles", async (c) => {
      const body = await parseJSON<{
        name?: string;
        description?: string;
        deviceProduct?: string;
        config?: unknown;
      }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return c.json({ error: "name is required" }, 400);
      }

      if (body.description !== undefined && typeof body.description !== "string") {
        return c.json({ error: "description must be a string" }, 400);
      }

      if (body.deviceProduct !== undefined && typeof body.deviceProduct !== "string") {
        return c.json({ error: "deviceProduct must be a string" }, 400);
      }

      if (body.config === undefined) {
        return c.json({ error: "config is required" }, 400);
      }

      const validated = validateConfig(body.config);
      if (validated.error) return c.json({ error: validated.error }, 400);

      const profile = profileStore.create({
        name: body.name.trim(),
        description: body.description,
        deviceProduct: body.deviceProduct,
        config: validated.config,
      });
      return c.json(profile, 201);
    })

    // Get profile by ID
    .get("/profiles/:id", (c) => {
      const profile = profileStore.get(c.req.param("id"));
      if (!profile) return c.json({ error: "Profile not found" }, 404);
      return c.json(profile);
    })

    // Update profile
    .put("/profiles/:id", async (c) => {
      const id = c.req.param("id");
      const body = await parseJSON<{
        name?: string;
        description?: string;
        deviceProduct?: string;
        config?: unknown;
      }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (body.name !== undefined) {
        if (typeof body.name !== "string" || !body.name.trim()) {
          return c.json({ error: "name must be a non-empty string" }, 400);
        }
      }

      if (body.description !== undefined && typeof body.description !== "string") {
        return c.json({ error: "description must be a string" }, 400);
      }

      if (body.deviceProduct !== undefined && typeof body.deviceProduct !== "string") {
        return c.json({ error: "deviceProduct must be a string" }, 400);
      }

      let validatedConfig: Record<string, Record<string, string | number>> | undefined;
      if (body.config !== undefined) {
        const validated = validateConfig(body.config);
        if (validated.error) return c.json({ error: validated.error }, 400);
        validatedConfig = validated.config;
      }

      const fields: Parameters<typeof profileStore.update>[1] = {};
      if (body.name !== undefined) fields.name = body.name.trim();
      if (body.description !== undefined) fields.description = body.description;
      if (body.deviceProduct !== undefined) fields.deviceProduct = body.deviceProduct;
      if (validatedConfig !== undefined) fields.config = validatedConfig;

      const profile = profileStore.update(id, fields);
      if (!profile) return c.json({ error: "Profile not found" }, 404);
      return c.json(profile);
    })

    // Delete profile
    .delete("/profiles/:id", (c) => {
      const id = c.req.param("id");
      const removed = profileStore.remove(id);
      if (!removed) return c.json({ error: "Profile not found" }, 404);
      return c.json({ ok: true });
    });

  return app;
}
