import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MacroStore } from "../src/server/lib/macro-store.ts";
import type { Macro } from "../src/shared/types.ts";

function testDataPath() {
  return join(
    tmpdir(),
    `macros-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );
}

describe("MacroStore", () => {
  let dataPath: string;

  beforeEach(() => {
    dataPath = testDataPath();
  });

  afterEach(() => {
    if (existsSync(dataPath)) unlinkSync(dataPath);
  });

  it("seeds built-in templates on first run", () => {
    const store = new MacroStore(dataPath);
    const macros = store.list();
    expect(macros.length).toBe(3);
    expect(macros.every((m) => m.builtIn === true)).toBe(true);

    const names = macros.map((m) => m.name);
    expect(names).toContain("Quick Start Game");
    expect(names).toContain("Disk Swap");
    expect(names).toContain("Memory Peek");
  });

  it("does not re-seed templates when built-ins already exist", () => {
    const store1 = new MacroStore(dataPath);
    expect(store1.list()).toHaveLength(3);

    // Reload from same file — should not duplicate
    const store2 = new MacroStore(dataPath);
    expect(store2.list()).toHaveLength(3);
  });

  it("creates a user macro", () => {
    const store = new MacroStore(dataPath);
    const macro = store.create({
      name: "My Macro",
      description: "Test macro",
      steps: [{ action: "reset" }],
    });

    expect(macro.id).toBeDefined();
    expect(macro.name).toBe("My Macro");
    expect(macro.description).toBe("Test macro");
    expect(macro.steps).toEqual([{ action: "reset" }]);
    expect(macro.builtIn).toBeUndefined();
    expect(macro.createdAt).toBeDefined();
    expect(macro.updatedAt).toBeDefined();
  });

  it("gets a macro by id", () => {
    const store = new MacroStore(dataPath);
    const macro = store.create({
      name: "Test",
      steps: [{ action: "pause" }],
    });
    expect(store.get(macro.id)).toEqual(macro);
  });

  it("returns undefined for non-existent macro", () => {
    const store = new MacroStore(dataPath);
    expect(store.get("nonexistent")).toBeUndefined();
  });

  it("lists all macros", () => {
    const store = new MacroStore(dataPath);
    store.create({ name: "Custom 1", steps: [{ action: "reset" }] });
    store.create({ name: "Custom 2", steps: [{ action: "pause" }] });
    // 3 built-in + 2 custom
    expect(store.list()).toHaveLength(5);
  });

  it("updates a macro", () => {
    const store = new MacroStore(dataPath);
    const macro = store.create({
      name: "Original",
      steps: [{ action: "reset" }],
    });

    const updated = store.update(macro.id, {
      name: "Updated",
      description: "New description",
      steps: [{ action: "pause" }, { action: "resume" }],
    });

    expect(updated).toBeDefined();
    expect(updated!.name).toBe("Updated");
    expect(updated!.description).toBe("New description");
    expect(updated!.steps).toEqual([
      { action: "pause" },
      { action: "resume" },
    ]);
    expect(updated!.updatedAt).toBeDefined();
  });

  it("partially updates a macro", () => {
    const store = new MacroStore(dataPath);
    const macro = store.create({
      name: "Original",
      description: "Desc",
      steps: [{ action: "reset" }],
    });

    const updated = store.update(macro.id, { name: "New Name" });
    expect(updated!.name).toBe("New Name");
    expect(updated!.description).toBe("Desc");
    expect(updated!.steps).toEqual([{ action: "reset" }]);
  });

  it("returns undefined when updating non-existent macro", () => {
    const store = new MacroStore(dataPath);
    expect(store.update("nope", { name: "x" })).toBeUndefined();
  });

  it("removes a user macro", () => {
    const store = new MacroStore(dataPath);
    const macro = store.create({
      name: "To Delete",
      steps: [{ action: "reset" }],
    });
    expect(store.remove(macro.id)).toBe("ok");
    expect(store.get(macro.id)).toBeUndefined();
  });

  it("returns not_found when removing non-existent macro", () => {
    const store = new MacroStore(dataPath);
    expect(store.remove("nope")).toBe("not_found");
  });

  it("prevents deleting built-in macros", () => {
    const store = new MacroStore(dataPath);
    const builtIn = store.list().find((m) => m.builtIn);
    expect(builtIn).toBeDefined();
    expect(store.remove(builtIn!.id)).toBe("built_in");
    expect(store.get(builtIn!.id)).toBeDefined();
  });

  it("persists to disk and reloads", () => {
    const store1 = new MacroStore(dataPath);
    store1.create({
      name: "Persistent",
      steps: [{ action: "reboot" }],
    });

    const store2 = new MacroStore(dataPath);
    // 3 built-in + 1 custom
    expect(store2.list()).toHaveLength(4);
    const custom = store2.list().find((m) => m.name === "Persistent");
    expect(custom).toBeDefined();
    expect(custom!.steps).toEqual([{ action: "reboot" }]);
  });

  it("handles corrupt data file gracefully", () => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(dataPath, "not valid json{{{");
    const store = new MacroStore(dataPath);
    // Should still seed templates
    expect(store.list()).toHaveLength(3);
  });

  it("templates have correct steps", () => {
    const store = new MacroStore(dataPath);
    const macros = store.list();

    const quickStart = macros.find((m) => m.name === "Quick Start Game")!;
    expect(quickStart.steps).toHaveLength(4);
    expect(quickStart.steps[0]).toEqual({ action: "reset" });
    expect(quickStart.steps[1]).toEqual({ action: "delay", ms: 2000 });

    const diskSwap = macros.find((m) => m.name === "Disk Swap")!;
    expect(diskSwap.steps).toHaveLength(3);
    expect(diskSwap.steps[0]).toEqual({ action: "remove", drive: "a" });

    const memPeek = macros.find((m) => m.name === "Memory Peek")!;
    expect(memPeek.steps).toHaveLength(3);
    expect(memPeek.steps[0]).toEqual({ action: "pause" });
    expect(memPeek.steps[2]).toEqual({ action: "resume" });
  });
});
