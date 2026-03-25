import { Hono } from "hono";
import { Writable } from "node:stream";
import type { DeviceStore } from "../lib/device-store.ts";
import { FtpPool } from "../lib/ftp-pool.ts";
import { getExtension, getFileType, getFileTypeKey } from "../lib/file-type.ts";

const CACHE_TTL_MS = 10_000;

interface CachedListing {
  data: DirectoryListing;
  expiresAt: number;
}

interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  fileType?: string;
}

interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
  errors: string[];
}

/** Compute parent path for breadcrumb navigation */
function computeParent(path: string): string | null {
  // Normalize: ensure trailing slash for directories
  const normalized = path.endsWith("/") ? path : path + "/";
  if (normalized === "/") return null;

  // Remove trailing slash, then find last slash
  const withoutTrailing = normalized.slice(0, -1);
  const lastSlash = withoutTrailing.lastIndexOf("/");
  if (lastSlash < 0) return "/";
  return withoutTrailing.slice(0, lastSlash + 1);
}

/** Normalize a directory path to always end with / */
function normalizeDirPath(path: string): string {
  if (!path) return "/";
  if (!path.startsWith("/")) path = "/" + path;
  if (!path.endsWith("/")) path = path + "/";
  return path;
}

export function createFileRoutes(store: DeviceStore) {
  const ftpPool = new FtpPool();
  const cache = new Map<string, CachedListing>();

  function cacheKey(deviceId: string, path: string): string {
    return `${deviceId}:${path}`;
  }

  function getCached(deviceId: string, path: string): DirectoryListing | null {
    const key = cacheKey(deviceId, path);
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      cache.delete(key);
      return null;
    }
    return entry.data;
  }

  function setCache(deviceId: string, path: string, data: DirectoryListing): void {
    cache.set(cacheKey(deviceId, path), {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
  }

  function invalidateCache(deviceId: string, path: string): void {
    cache.delete(cacheKey(deviceId, normalizeDirPath(path)));
  }

  const app = new Hono();

  // List directory
  app.get("/devices/:deviceId/files", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = store.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const rawPath = c.req.query("path") ?? "/";
    const path = normalizeDirPath(rawPath);
    const refresh = c.req.query("refresh") === "true";

    // Check cache unless refresh requested
    if (!refresh) {
      const cached = getCached(deviceId, path);
      if (cached) return c.json(cached);
    }

    let client;
    try {
      client = await ftpPool.acquire(deviceId, device.ip, device.password);
      const list = await client.list(path);

      const entries: DirectoryEntry[] = list.map((item) => {
        const entry: DirectoryEntry = {
          name: item.name,
          type: item.isDirectory ? "directory" : "file",
        };
        if (!item.isDirectory) {
          entry.size = item.size;
          const ftKey = getFileTypeKey(item.name);
          if (ftKey) entry.fileType = ftKey;
        }
        if (item.modifiedAt) {
          entry.modified = item.modifiedAt.toISOString();
        }
        return entry;
      });

      const result: DirectoryListing = {
        path,
        parent: computeParent(path),
        entries,
        errors: [],
      };

      setCache(deviceId, path, result);
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json(
        {
          path,
          parent: computeParent(path),
          entries: [],
          errors: [msg],
        } satisfies DirectoryListing,
        502,
      );
    } finally {
      if (client) ftpPool.release(deviceId, client);
    }
  });

  // File metadata
  app.get("/devices/:deviceId/files/info", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = store.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query parameter is required" }, 400);

    let client;
    try {
      client = await ftpPool.acquire(deviceId, device.ip, device.password);

      // Get the directory listing and find this specific file
      const dirPath = filePath.substring(0, filePath.lastIndexOf("/") + 1) || "/";
      const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);

      const list = await client.list(dirPath);
      const item = list.find((f) => f.name === fileName);

      if (!item) {
        return c.json({ error: "File not found" }, 404);
      }

      const ext = getExtension(item.name);
      const typeInfo = getFileType(item.name);

      return c.json({
        name: item.name,
        path: filePath,
        type: item.isDirectory ? "directory" : "file",
        size: item.isDirectory ? undefined : item.size,
        modified: item.modifiedAt?.toISOString(),
        fileType: ext && typeInfo.category !== "generic" ? ext : undefined,
        category: typeInfo.category,
        actions: typeInfo.actions,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 502);
    } finally {
      if (client) ftpPool.release(deviceId, client);
    }
  });

  // Download file
  app.get("/devices/:deviceId/files/download", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = store.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query parameter is required" }, 400);

    let client;
    try {
      client = await ftpPool.acquire(deviceId, device.ip, device.password);

      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk, _encoding, callback) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });

      await client.downloadTo(writable, filePath);
      const data = Buffer.concat(chunks);

      const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
      return new Response(data, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename="${fileName}"`,
          "Content-Length": String(data.length),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 502);
    } finally {
      if (client) ftpPool.release(deviceId, client);
    }
  });

  // Upload file(s)
  app.post("/devices/:deviceId/files/upload", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = store.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const targetDir = normalizeDirPath(c.req.query("path") ?? "/");

    const body = await c.req.parseBody({ all: true });
    const files = body["file"];
    if (!files) return c.json({ error: "file field is required" }, 400);

    const fileList = Array.isArray(files) ? files : [files];
    const actualFiles = fileList.filter((f): f is File => f instanceof File);
    if (actualFiles.length === 0) return c.json({ error: "No valid files provided" }, 400);

    let client;
    try {
      client = await ftpPool.acquire(deviceId, device.ip, device.password);

      const uploaded: string[] = [];
      const errors: string[] = [];

      for (const file of actualFiles) {
        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          const { Readable } = await import("node:stream");
          const readable = Readable.from(buffer);
          const remotePath = targetDir + file.name;
          await client.uploadFrom(readable, remotePath);
          uploaded.push(file.name);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${file.name}: ${msg}`);
        }
      }

      // Invalidate cache for the target directory
      invalidateCache(deviceId, targetDir);

      return c.json({ uploaded, errors });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 502);
    } finally {
      if (client) ftpPool.release(deviceId, client);
    }
  });

  // Delete file
  app.delete("/devices/:deviceId/files", async (c) => {
    const deviceId = c.req.param("deviceId");
    const device = store.get(deviceId);
    if (!device) return c.json({ error: "Device not found" }, 404);
    if (!device.online) return c.json({ error: "Device is offline" }, 503);

    const filePath = c.req.query("path");
    if (!filePath) return c.json({ error: "path query parameter is required" }, 400);

    let client;
    try {
      client = await ftpPool.acquire(deviceId, device.ip, device.password);
      await client.remove(filePath);

      // Invalidate cache for parent directory
      const parentDir = filePath.substring(0, filePath.lastIndexOf("/") + 1) || "/";
      invalidateCache(deviceId, parentDir);

      return c.json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: msg }, 502);
    } finally {
      if (client) ftpPool.release(deviceId, client);
    }
  });

  return app;
}
