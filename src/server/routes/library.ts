import { Hono } from "hono";
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const VALID_EXTENSIONS = new Set([
  ".d64", ".d71", ".d81", ".g64", ".g71",  // disk images
  ".prg",                                    // programs
  ".crt",                                    // cartridges
  ".sid",                                    // SID music
  ".mod",                                    // MOD music
]);

function getLibraryDir(): string {
  return join(process.cwd(), "data", "library");
}

function getExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) return "";
  return name.slice(lastDot).toLowerCase();
}

const library = new Hono().get("/library", (c) => {
  const dir = getLibraryDir();
  mkdirSync(dir, { recursive: true });

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return c.json({ files: [] });
  }

  const files = entries
    .filter((name) => VALID_EXTENSIONS.has(getExtension(name)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .reduce<{ name: string; size: number; modified: string; type: string }[]>((acc, name) => {
      const fullPath = join(dir, name);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) return acc;
        acc.push({
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          type: getExtension(name).slice(1),
        });
      } catch {
        // Skip files where stat fails
      }
      return acc;
    }, []);

  return c.json({ files });
});

export type LibraryRoute = typeof library;
export default library;
