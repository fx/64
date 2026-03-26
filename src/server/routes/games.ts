import { Hono } from "hono";
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const VALID_EXTENSIONS = new Set([".d64", ".d71", ".d81", ".g64", ".g71"]);

function getGamesDir(): string {
  return join(process.cwd(), "data", "games");
}

function getExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  if (lastDot === -1) return "";
  return name.slice(lastDot).toLowerCase();
}

const games = new Hono().get("/games", (c) => {
  const gamesDir = getGamesDir();
  mkdirSync(gamesDir, { recursive: true });

  let entries: string[];
  try {
    entries = readdirSync(gamesDir);
  } catch {
    return c.json({ files: [] });
  }

  const files = entries
    .filter((name) => VALID_EXTENSIONS.has(getExtension(name)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    .map((name) => {
      const fullPath = join(gamesDir, name);
      try {
        const stat = statSync(fullPath);
        return {
          name,
          size: stat.size,
          modified: stat.mtime.toISOString(),
        };
      } catch {
        return { name, size: 0, modified: new Date().toISOString() };
      }
    });

  return c.json({ files });
});

export type GamesRoute = typeof games;
export default games;
