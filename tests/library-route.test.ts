import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Hono } from "hono";

// We need to override the GAMES_DIR used by the route. The route uses
// process.cwd() + "data/library", so we'll test via the Hono app after
// setting up a temp directory and patching process.cwd.

function makeTempLibraryDir(): string {
  const dir = join(tmpdir(), `library-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, "data", "library"), { recursive: true });
  return dir;
}

describe("GET /api/library", () => {
  let tempDir: string;
  let originalCwd: () => string;
  let app: Hono;

  beforeEach(async () => {
    tempDir = makeTempLibraryDir();
    originalCwd = process.cwd;
    process.cwd = () => tempDir;

    // Re-import the module fresh so it picks up the new cwd
    const mod = await import("../src/server/routes/library.ts");
    const library = mod.default;
    app = new Hono().basePath("/api").route("/", library);
  });

  afterEach(() => {
    process.cwd = originalCwd;
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns empty files array for empty directory", async () => {
    const res = await app.request("/api/library");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ files: [] });
  });

  it("returns disk image files sorted alphabetically", async () => {
    const libraryDir = join(tempDir, "data", "library");
    writeFileSync(join(libraryDir, "zork.d64"), Buffer.alloc(174848));
    writeFileSync(join(libraryDir, "archon.d64"), Buffer.alloc(174848));
    writeFileSync(join(libraryDir, "maniac.d81"), Buffer.alloc(819200));

    const res = await app.request("/api/library");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: { name: string; size: number; modified: string }[] };
    expect(body.files).toHaveLength(3);
    expect(body.files[0]!.name).toBe("archon.d64");
    expect(body.files[1]!.name).toBe("maniac.d81");
    expect(body.files[2]!.name).toBe("zork.d64");

    // Verify size and modified fields are present
    expect(body.files[0]!.size).toBe(174848);
    expect(typeof body.files[0]!.modified).toBe("string");
  });

  it("only returns files with valid disk image extensions", async () => {
    const libraryDir = join(tempDir, "data", "library");
    writeFileSync(join(libraryDir, "game.d64"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "game.d71"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "game.d81"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "game.g64"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "game.g71"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "readme.txt"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "image.png"), Buffer.alloc(100));
    writeFileSync(join(libraryDir, "program.prg"), Buffer.alloc(100));

    const res = await app.request("/api/library");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { files: { name: string }[] };
    expect(body.files).toHaveLength(6);
    const names = body.files.map((f) => f.name);
    expect(names).toContain("game.d64");
    expect(names).toContain("game.d71");
    expect(names).toContain("game.d81");
    expect(names).toContain("game.g64");
    expect(names).toContain("game.g71");
    expect(names).toContain("program.prg");
    expect(names).not.toContain("readme.txt");
    expect(names).not.toContain("image.png");
  });

  it("creates data/library directory if it does not exist", async () => {
    // Remove the library directory
    rmSync(join(tempDir, "data", "library"), { recursive: true, force: true });
    expect(existsSync(join(tempDir, "data", "library"))).toBe(false);

    const res = await app.request("/api/library");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ files: [] });

    // Directory should now exist
    expect(existsSync(join(tempDir, "data", "library"))).toBe(true);
  });

  it("returns application/json content type", async () => {
    const res = await app.request("/api/library");
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
