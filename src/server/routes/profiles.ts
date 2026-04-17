import { Hono } from "hono";
import type { ProfileStore } from "../lib/profile-store.ts";
import type { DeviceStore } from "../lib/device-store.ts";
import type { Device, ConfigDiff } from "@shared/types.ts";

const DEVICE_TIMEOUT_MS = 5000;

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

/** Build headers for device requests, including auth if needed */
function deviceHeaders(device: Device): Record<string, string> {
  const headers: Record<string, string> = { "Accept": "application/json" };
  if (device.password) headers["X-Password"] = device.password;
  return headers;
}

/** Fetch JSON from a device endpoint with timeout */
async function deviceFetch<T>(device: Device, path: string): Promise<{ data: T } | { error: string; status: number }> {
  const url = `http://${device.ip}:${device.port}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: deviceHeaders(device), signal: controller.signal });
    if (!res.ok) return { error: `Device returned ${res.status}`, status: res.status };
    const data = (await res.json()) as T;
    return { data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "Device did not respond", status: 504 };
    }
    return { error: `Cannot reach device at ${device.ip}`, status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/** PUT JSON to a device endpoint */
async function devicePut(device: Device, path: string, body?: unknown): Promise<{ ok: true } | { error: string; status: number }> {
  const url = `http://${device.ip}:${device.port}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEVICE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { ...deviceHeaders(device), "Content-Type": "application/json" };
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) return { error: `Device returned ${res.status}`, status: res.status };
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { error: "Device did not respond", status: 504 };
    }
    return { error: `Cannot reach device at ${device.ip}`, status: 502 };
  } finally {
    clearTimeout(timer);
  }
}

/** Capture all config from a device: fetch categories, then fetch items for each */
async function captureDeviceConfig(device: Device): Promise<
  { config: Record<string, Record<string, string | number>>; error?: undefined } |
  { config?: undefined; error: string; status: number }
> {
  const catResult = await deviceFetch<{ categories: string[]; errors: string[] }>(device, "/v1/configs");
  if ("error" in catResult) return catResult;

  const categories = catResult.data.categories;
  const config: Record<string, Record<string, string | number>> = Object.create(null);

  for (const category of categories) {
    const itemResult = await deviceFetch<Record<string, unknown>>(device, `/v1/configs/${encodeURIComponent(category)}`);
    if ("error" in itemResult) return itemResult;

    // The response has the category name as a key with an object of items, plus "errors" array
    const raw = itemResult.data;
    const items: Record<string, string | number> = Object.create(null);
    for (const [key, val] of Object.entries(raw)) {
      if (key === "errors") continue;
      if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        // Category key maps to an object of items
        for (const [itemKey, itemVal] of Object.entries(val as Record<string, unknown>)) {
          if (typeof itemVal === "string" || typeof itemVal === "number") {
            items[itemKey] = itemVal;
          }
        }
      }
    }
    config[category] = items;
  }
  return { config };
}

/** Compute diff between two config objects */
function diffConfigs(
  left: Record<string, Record<string, string | number>>,
  right: Record<string, Record<string, string | number>>,
): ConfigDiff {
  const changes: ConfigDiff["changes"] = [];
  const leftOnly: ConfigDiff["leftOnly"] = [];
  const rightOnly: ConfigDiff["rightOnly"] = [];
  let identicalCount = 0;

  const allCategories = new Set([...Object.keys(left), ...Object.keys(right)]);

  for (const category of allCategories) {
    const leftItems = left[category] ?? {};
    const rightItems = right[category] ?? {};
    const allKeys = new Set([...Object.keys(leftItems), ...Object.keys(rightItems)]);

    for (const item of allKeys) {
      const inLeft = item in leftItems;
      const inRight = item in rightItems;

      if (inLeft && inRight) {
        if (leftItems[item] !== rightItems[item]) {
          changes.push({ category, item, left: leftItems[item], right: rightItems[item] });
        } else {
          identicalCount++;
        }
      } else if (inLeft) {
        leftOnly.push({ category, item, value: leftItems[item] });
      } else {
        rightOnly.push({ category, item, value: rightItems[item] });
      }
    }
  }

  return { changes, leftOnly, rightOnly, identicalCount };
}

export function createProfileRoutes(profileStore: ProfileStore, deviceStore: DeviceStore) {
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

    // Capture device config as a new profile
    .post("/profiles/capture", async (c) => {
      const body = await parseJSON<{ deviceId?: string; name?: string }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (!body.deviceId || typeof body.deviceId !== "string") {
        return c.json({ error: "deviceId is required" }, 400);
      }
      if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
        return c.json({ error: "name is required" }, 400);
      }

      const device = deviceStore.get(body.deviceId);
      if (!device) return c.json({ error: "Device not found" }, 404);
      if (!device.online) return c.json({ error: "Device is offline" }, 503);

      const result = await captureDeviceConfig(device);
      if ("error" in result) return c.json({ error: result.error }, result.status as 502);

      const profile = profileStore.create({
        name: body.name.trim(),
        deviceProduct: device.product,
        config: result.config,
      });
      return c.json(profile, 201);
    })

    // Import profile from JSON
    .post("/profiles/import", async (c) => {
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
    })

    // Apply profile to a device
    .post("/profiles/:id/apply", async (c) => {
      const id = c.req.param("id");
      const profile = profileStore.get(id);
      if (!profile) return c.json({ error: "Profile not found" }, 404);

      const body = await parseJSON<{ deviceId?: string; saveToFlash?: boolean }>(c);
      if (!body) return c.json({ error: "Invalid JSON" }, 400);

      if (!body.deviceId || typeof body.deviceId !== "string") {
        return c.json({ error: "deviceId is required" }, 400);
      }

      const device = deviceStore.get(body.deviceId);
      if (!device) return c.json({ error: "Device not found" }, 404);
      if (!device.online) return c.json({ error: "Device is offline" }, 503);

      let appliedCount = 0;
      const errors: string[] = [];

      for (const [category, items] of Object.entries(profile.config)) {
        for (const [item, value] of Object.entries(items)) {
          const result = await devicePut(
            device,
            `/v1/configs/${encodeURIComponent(category)}/${encodeURIComponent(item)}`,
            { value },
          );
          if ("error" in result) {
            errors.push(`${category}/${item}: ${result.error}`);
          } else {
            appliedCount++;
          }
        }
      }

      if (body.saveToFlash) {
        const flashResult = await devicePut(device, "/v1/configs:save_to_flash");
        if ("error" in flashResult) {
          errors.push(`save_to_flash: ${flashResult.error}`);
        }
      }

      return c.json({ appliedCount, errors });
    })

    // Diff profile against another profile or live device
    .get("/profiles/:id/diff", async (c) => {
      const id = c.req.param("id");
      const profile = profileStore.get(id);
      if (!profile) return c.json({ error: "Profile not found" }, 404);

      const againstId = c.req.query("against");
      const deviceId = c.req.query("deviceId");

      if (!againstId && !deviceId) {
        return c.json({ error: "Query parameter 'against' or 'deviceId' is required" }, 400);
      }

      let rightConfig: Record<string, Record<string, string | number>>;

      if (againstId) {
        const otherProfile = profileStore.get(againstId);
        if (!otherProfile) return c.json({ error: "Comparison profile not found" }, 404);
        rightConfig = otherProfile.config;
      } else {
        const device = deviceStore.get(deviceId!);
        if (!device) return c.json({ error: "Device not found" }, 404);
        if (!device.online) return c.json({ error: "Device is offline" }, 503);

        const result = await captureDeviceConfig(device);
        if ("error" in result) return c.json({ error: result.error }, result.status as 502);
        rightConfig = result.config;
      }

      const diff = diffConfigs(profile.config, rightConfig);
      return c.json(diff);
    })

    // Export profile as downloadable JSON
    .get("/profiles/:id/export", (c) => {
      const id = c.req.param("id");
      const profile = profileStore.get(id);
      if (!profile) return c.json({ error: "Profile not found" }, 404);

      const exportData = {
        name: profile.name,
        description: profile.description,
        deviceProduct: profile.deviceProduct,
        config: profile.config,
      };

      const filename = `${profile.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
      return new Response(JSON.stringify(exportData, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    });

  return app;
}
