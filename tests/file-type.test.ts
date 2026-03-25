import { describe, it, expect } from "bun:test";
import { getExtension, getFileType, getFileTypeKey } from "../src/server/lib/file-type.ts";

describe("getExtension", () => {
  it("extracts lowercase extension from filename", () => {
    expect(getExtension("game.D64")).toBe("d64");
    expect(getExtension("file.PRG")).toBe("prg");
    expect(getExtension("music.SID")).toBe("sid");
  });

  it("returns empty string for no extension", () => {
    expect(getExtension("noext")).toBe("");
    expect(getExtension("")).toBe("");
  });

  it("returns empty string when dot is last character", () => {
    expect(getExtension("file.")).toBe("");
  });

  it("handles multiple dots", () => {
    expect(getExtension("my.game.d64")).toBe("d64");
  });
});

describe("getFileType", () => {
  it("returns disk-1541 for d64 and g64", () => {
    expect(getFileType("game.d64").category).toBe("disk-1541");
    expect(getFileType("game.g64").category).toBe("disk-1541");
    expect(getFileType("game.d64").actions).toContain("mount");
  });

  it("returns disk-1571 for d71 and g71", () => {
    expect(getFileType("game.d71").category).toBe("disk-1571");
    expect(getFileType("game.g71").category).toBe("disk-1571");
  });

  it("returns disk-1581 for d81", () => {
    expect(getFileType("game.d81").category).toBe("disk-1581");
    expect(getFileType("game.d81").actions).toContain("mount");
  });

  it("returns program for prg", () => {
    const t = getFileType("hello.prg");
    expect(t.category).toBe("program");
    expect(t.actions).toContain("run");
    expect(t.actions).toContain("load");
  });

  it("returns cartridge for crt", () => {
    const t = getFileType("cart.crt");
    expect(t.category).toBe("cartridge");
    expect(t.actions).toContain("run");
  });

  it("returns sid-music for sid", () => {
    const t = getFileType("tune.sid");
    expect(t.category).toBe("sid-music");
    expect(t.actions).toContain("play");
  });

  it("returns mod-music for mod", () => {
    const t = getFileType("track.mod");
    expect(t.category).toBe("mod-music");
    expect(t.actions).toContain("play");
  });

  it("returns rom for rom and bin", () => {
    expect(getFileType("kernel.rom").category).toBe("rom");
    expect(getFileType("dump.bin").category).toBe("rom");
    expect(getFileType("kernel.rom").actions).toContain("load");
  });

  it("returns generic for unknown extensions", () => {
    const t = getFileType("readme.txt");
    expect(t.category).toBe("generic");
    expect(t.actions).toEqual(["download", "delete"]);
  });

  it("returns generic for files without extension", () => {
    expect(getFileType("noext").category).toBe("generic");
  });

  it("all types include download and delete", () => {
    const testFiles = ["g.d64", "g.g64", "g.d71", "g.g71", "g.d81", "g.prg", "g.crt", "g.sid", "g.mod", "g.rom", "g.bin", "g.txt"];
    for (const f of testFiles) {
      const t = getFileType(f);
      expect(t.actions).toContain("download");
      expect(t.actions).toContain("delete");
    }
  });
});

describe("getFileTypeKey", () => {
  it("returns extension for known types", () => {
    expect(getFileTypeKey("game.d64")).toBe("d64");
    expect(getFileTypeKey("tune.sid")).toBe("sid");
  });

  it("returns undefined for unknown types", () => {
    expect(getFileTypeKey("file.txt")).toBeUndefined();
    expect(getFileTypeKey("noext")).toBeUndefined();
  });
});
