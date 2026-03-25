import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";
import type { Device } from "../src/shared/types.ts";

// Mock basic-ftp before importing routes
const mockList = mock(() => Promise.resolve([]));
const mockDownloadTo = mock((_writable: any, _path: string) => Promise.resolve());
const mockUploadFrom = mock((_readable: any, _path: string) => Promise.resolve());
const mockRemove = mock((_path: string) => Promise.resolve());
const mockAccess = mock(() => Promise.resolve());
let mockClientClosed = false;

mock.module("basic-ftp", () => ({
  Client: class MockClient {
    closed = mockClientClosed;
    access = mockAccess;
    list = mockList;
    downloadTo = mockDownloadTo;
    uploadFrom = mockUploadFrom;
    remove = mockRemove;
    close() {
      this.closed = true;
    }
  },
}));

const { DeviceStore } = await import("../src/server/lib/device-store.ts");
const { createFileRoutes } = await import("../src/server/routes/files.ts");

function testDataPath() {
  return join(tmpdir(), `files-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function makeDevice(overrides: Partial<Device> = {}): Device {
  return {
    id: "ABC123",
    name: "Test Device",
    ip: "192.168.1.42",
    port: 80,
    product: "Ultimate 64",
    firmware: "3.12",
    fpga: "11F",
    online: true,
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

describe("File Browser Routes", () => {
  let dataPath: string;
  let store: InstanceType<typeof DeviceStore>;
  let app: Hono;

  beforeEach(() => {
    dataPath = testDataPath();
    store = new DeviceStore(dataPath);
    const routes = createFileRoutes(store);
    app = new Hono().basePath("/api").route("/", routes);
    mockList.mockClear();
    mockDownloadTo.mockClear();
    mockUploadFrom.mockClear();
    mockRemove.mockClear();
    mockAccess.mockClear();
    mockClientClosed = false;
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  // --- List directory ---
  describe("GET /devices/:deviceId/files", () => {
    it("returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/UNKNOWN/files?path=/");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns 503 for offline device", async () => {
      store.upsert(makeDevice({ online: false }));
      const res = await app.request("/api/devices/ABC123/files?path=/");
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain("offline");
    });

    it("lists directory with file type detection", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() =>
        Promise.resolve([
          { name: "Games", isDirectory: true, size: 0, modifiedAt: new Date("2024-03-15T10:30:00Z"), type: 2 },
          { name: "game.d64", isDirectory: false, size: 174848, modifiedAt: new Date("2024-03-15T10:30:00Z"), type: 1 },
          { name: "readme.txt", isDirectory: false, size: 512, modifiedAt: new Date("2024-03-15T10:30:00Z"), type: 1 },
        ]),
      );

      const res = await app.request("/api/devices/ABC123/files?path=/USB0/");
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.path).toBe("/USB0/");
      expect(body.parent).toBe("/");
      expect(body.entries).toHaveLength(3);

      const dir = body.entries.find((e: any) => e.name === "Games");
      expect(dir.type).toBe("directory");
      expect(dir.fileType).toBeUndefined();

      const disk = body.entries.find((e: any) => e.name === "game.d64");
      expect(disk.type).toBe("file");
      expect(disk.size).toBe(174848);
      expect(disk.fileType).toBe("d64");

      const txt = body.entries.find((e: any) => e.name === "readme.txt");
      expect(txt.fileType).toBeUndefined();
    });

    it("defaults path to /", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() => Promise.resolve([]));

      const res = await app.request("/api/devices/ABC123/files");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.path).toBe("/");
      expect(body.parent).toBeNull();
    });

    it("returns cached listing on second request", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() =>
        Promise.resolve([
          { name: "file.prg", isDirectory: false, size: 100, modifiedAt: null, type: 1 },
        ]),
      );

      await app.request("/api/devices/ABC123/files?path=/USB0/");
      const res = await app.request("/api/devices/ABC123/files?path=/USB0/");

      expect(res.status).toBe(200);
      // FTP list should only be called once due to caching
      // mockAccess is called once for pool, mockList once for listing
      expect(mockList).toHaveBeenCalledTimes(1);
    });

    it("bypasses cache with refresh=true", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() => Promise.resolve([]));

      await app.request("/api/devices/ABC123/files?path=/USB0/");
      await app.request("/api/devices/ABC123/files?path=/USB0/&refresh=true");

      expect(mockList).toHaveBeenCalledTimes(2);
    });

    it("returns 502 on FTP error", async () => {
      store.upsert(makeDevice());
      mockAccess.mockImplementationOnce(() => Promise.reject(new Error("Connection refused")));

      const res = await app.request("/api/devices/ABC123/files?path=/");
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.errors[0]).toContain("Connection refused");
    });

    it("computes parent path correctly", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() => Promise.resolve([]));

      const res = await app.request("/api/devices/ABC123/files?path=/USB0/Games/");
      const body = await res.json();
      expect(body.parent).toBe("/USB0/");
    });

    it("normalizes path without trailing slash", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() => Promise.resolve([]));

      const res = await app.request("/api/devices/ABC123/files?path=/USB0");
      const body = await res.json();
      expect(body.path).toBe("/USB0/");
    });
  });

  // --- File info ---
  describe("GET /devices/:deviceId/files/info", () => {
    it("returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/UNKNOWN/files/info?path=/file.d64");
      expect(res.status).toBe(404);
    });

    it("returns 400 when path is missing", async () => {
      store.upsert(makeDevice());
      const res = await app.request("/api/devices/ABC123/files/info");
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("path");
    });

    it("returns file metadata with type info", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() =>
        Promise.resolve([
          { name: "game.d64", isDirectory: false, size: 174848, modifiedAt: new Date("2024-03-15T10:30:00Z"), type: 1 },
        ]),
      );

      const res = await app.request("/api/devices/ABC123/files/info?path=/USB0/game.d64");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("game.d64");
      expect(body.path).toBe("/USB0/game.d64");
      expect(body.type).toBe("file");
      expect(body.size).toBe(174848);
      expect(body.category).toBe("disk-1541");
      expect(body.actions).toContain("mount");
      expect(body.fileType).toBe("d64");
    });

    it("returns 404 when file not found in listing", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() => Promise.resolve([]));

      const res = await app.request("/api/devices/ABC123/files/info?path=/USB0/missing.d64");
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("not found");
    });

    it("returns 503 for offline device", async () => {
      store.upsert(makeDevice({ online: false }));
      const res = await app.request("/api/devices/ABC123/files/info?path=/file.d64");
      expect(res.status).toBe(503);
    });
  });

  // --- Download ---
  describe("GET /devices/:deviceId/files/download", () => {
    it("returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/UNKNOWN/files/download?path=/file.d64");
      expect(res.status).toBe(404);
    });

    it("returns 400 when path is missing", async () => {
      store.upsert(makeDevice());
      const res = await app.request("/api/devices/ABC123/files/download");
      expect(res.status).toBe(400);
    });

    it("downloads file as binary stream", async () => {
      store.upsert(makeDevice());
      const testData = Buffer.from("hello c64");
      mockDownloadTo.mockImplementation((writable: any) => {
        writable.write(testData);
        writable.end();
        return Promise.resolve();
      });

      const res = await app.request("/api/devices/ABC123/files/download?path=/USB0/game.d64");
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/octet-stream");
      expect(res.headers.get("content-disposition")).toContain("game.d64");

      const body = await res.arrayBuffer();
      expect(Buffer.from(body).toString()).toBe("hello c64");
    });

    it("returns 502 on FTP error", async () => {
      store.upsert(makeDevice());
      mockAccess.mockImplementationOnce(() => Promise.reject(new Error("FTP error")));

      const res = await app.request("/api/devices/ABC123/files/download?path=/file.d64");
      expect(res.status).toBe(502);
    });

    it("returns 503 for offline device", async () => {
      store.upsert(makeDevice({ online: false }));
      const res = await app.request("/api/devices/ABC123/files/download?path=/file.d64");
      expect(res.status).toBe(503);
    });
  });

  // --- Upload ---
  describe("POST /devices/:deviceId/files/upload", () => {
    it("returns 404 for unknown device", async () => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(1)], "test.d64"));
      const res = await app.request("/api/devices/UNKNOWN/files/upload?path=/", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 when no file provided", async () => {
      store.upsert(makeDevice());
      const form = new FormData();
      const res = await app.request("/api/devices/ABC123/files/upload?path=/", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
    });

    it("uploads a file successfully", async () => {
      store.upsert(makeDevice());
      mockUploadFrom.mockImplementation(() => Promise.resolve());

      const form = new FormData();
      form.append("file", new File([new Uint8Array(1024)], "game.d64"));

      const res = await app.request("/api/devices/ABC123/files/upload?path=/USB0/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploaded).toContain("game.d64");
      expect(body.errors).toHaveLength(0);
    });

    it("uploads multiple files", async () => {
      store.upsert(makeDevice());
      mockUploadFrom.mockImplementation(() => Promise.resolve());

      const form = new FormData();
      form.append("file", new File([new Uint8Array(100)], "game1.d64"));
      form.append("file", new File([new Uint8Array(100)], "game2.d64"));

      const res = await app.request("/api/devices/ABC123/files/upload?path=/USB0/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploaded).toHaveLength(2);
    });

    it("reports per-file errors during upload", async () => {
      store.upsert(makeDevice());
      let callCount = 0;
      mockUploadFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("Disk full"));
        return Promise.resolve();
      });

      const form = new FormData();
      form.append("file", new File([new Uint8Array(100)], "fail.d64"));
      form.append("file", new File([new Uint8Array(100)], "ok.d64"));

      const res = await app.request("/api/devices/ABC123/files/upload?path=/USB0/", {
        method: "POST",
        body: form,
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uploaded).toContain("ok.d64");
      expect(body.errors[0]).toContain("fail.d64");
      expect(body.errors[0]).toContain("Disk full");
    });

    it("returns 503 for offline device", async () => {
      store.upsert(makeDevice({ online: false }));
      const form = new FormData();
      form.append("file", new File([new Uint8Array(1)], "test.d64"));
      const res = await app.request("/api/devices/ABC123/files/upload?path=/", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(503);
    });
  });

  // --- Delete ---
  describe("DELETE /devices/:deviceId/files", () => {
    it("returns 404 for unknown device", async () => {
      const res = await app.request("/api/devices/UNKNOWN/files?path=/file.d64", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    it("returns 400 when path is missing", async () => {
      store.upsert(makeDevice());
      const res = await app.request("/api/devices/ABC123/files", {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
    });

    it("deletes a file successfully", async () => {
      store.upsert(makeDevice());
      mockRemove.mockImplementation(() => Promise.resolve());

      const res = await app.request("/api/devices/ABC123/files?path=/USB0/game.d64", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });

    it("returns 502 on FTP error", async () => {
      store.upsert(makeDevice());
      mockRemove.mockImplementation(() => Promise.reject(new Error("Permission denied")));

      const res = await app.request("/api/devices/ABC123/files?path=/USB0/game.d64", {
        method: "DELETE",
      });

      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain("Permission denied");
    });

    it("returns 503 for offline device", async () => {
      store.upsert(makeDevice({ online: false }));
      const res = await app.request("/api/devices/ABC123/files?path=/file.d64", {
        method: "DELETE",
      });
      expect(res.status).toBe(503);
    });

    it("invalidates cache after deletion", async () => {
      store.upsert(makeDevice());
      mockList.mockImplementation(() =>
        Promise.resolve([
          { name: "game.d64", isDirectory: false, size: 100, modifiedAt: null, type: 1 },
        ]),
      );

      // Populate cache
      await app.request("/api/devices/ABC123/files?path=/USB0/");
      expect(mockList).toHaveBeenCalledTimes(1);

      // Delete a file in that directory
      mockRemove.mockImplementation(() => Promise.resolve());
      await app.request("/api/devices/ABC123/files?path=/USB0/game.d64", {
        method: "DELETE",
      });

      // Next listing should NOT use cache
      await app.request("/api/devices/ABC123/files?path=/USB0/");
      expect(mockList).toHaveBeenCalledTimes(2);
    });
  });
});
