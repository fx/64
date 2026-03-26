import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Macro, MacroStep } from "@shared/types.ts";

const DEFAULT_DATA_PATH = "data/macros.json";

const BUILT_IN_TEMPLATES: Array<{
  name: string;
  description: string;
  steps: MacroStep[];
}> = [
  {
    name: "Quick Start Game",
    description: "Reset machine, mount a disk image, and run the program",
    steps: [
      { action: "reset" },
      { action: "delay", ms: 2000 },
      { action: "mount", drive: "a", image: "/USB0/game.d64" },
      { action: "run_prg", file: "/USB0/game.prg" },
    ],
  },
  {
    name: "Disk Swap",
    description: "Remove current disk and mount the next one",
    steps: [
      { action: "remove", drive: "a" },
      { action: "delay", ms: 500 },
      { action: "mount", drive: "a", image: "/USB0/disk2.d64" },
    ],
  },
  {
    name: "Memory Peek",
    description: "Pause machine, write to memory, then resume",
    steps: [
      { action: "pause" },
      { action: "writemem", address: "0400", data: "01" },
      { action: "resume" },
    ],
  },
];

export type MacroRemoveResult = "ok" | "not_found" | "built_in";

export class MacroStore {
  private macros: Map<string, Macro> = new Map();
  private readonly dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath ?? DEFAULT_DATA_PATH;
    mkdirSync(dirname(this.dataPath), { recursive: true });
    this.load();
    this.seedTemplates();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.dataPath, "utf-8");
      const arr = JSON.parse(raw) as Macro[];
      for (const macro of arr) {
        this.macros.set(macro.id, macro);
      }
    } catch {
      // Start with empty store if file doesn't exist or is corrupt
    }
  }

  private persist(): void {
    writeFileSync(this.dataPath, JSON.stringify(this.list(), null, 2));
  }

  private seedTemplates(): void {
    const hasBuiltIn = this.list().some((m) => m.builtIn);
    if (hasBuiltIn) return;

    const now = new Date().toISOString();
    for (const template of BUILT_IN_TEMPLATES) {
      const macro: Macro = {
        id: crypto.randomUUID(),
        name: template.name,
        description: template.description,
        steps: template.steps,
        builtIn: true,
        createdAt: now,
        updatedAt: now,
      };
      this.macros.set(macro.id, macro);
    }
    this.persist();
  }

  list(): Macro[] {
    return Array.from(this.macros.values());
  }

  get(id: string): Macro | undefined {
    return this.macros.get(id);
  }

  create(data: {
    name: string;
    description?: string;
    steps: MacroStep[];
  }): Macro {
    const now = new Date().toISOString();
    const macro: Macro = {
      id: crypto.randomUUID(),
      name: data.name,
      description: data.description,
      steps: data.steps,
      createdAt: now,
      updatedAt: now,
    };
    this.macros.set(macro.id, macro);
    this.persist();
    return macro;
  }

  update(
    id: string,
    fields: Partial<Pick<Macro, "name" | "description" | "steps">>,
  ): Macro | undefined {
    const macro = this.macros.get(id);
    if (!macro) return undefined;
    if (fields.name !== undefined) macro.name = fields.name;
    if (fields.description !== undefined) macro.description = fields.description;
    if (fields.steps !== undefined) macro.steps = fields.steps;
    macro.updatedAt = new Date().toISOString();
    this.macros.set(id, macro);
    this.persist();
    return macro;
  }

  remove(id: string): MacroRemoveResult {
    const macro = this.macros.get(id);
    if (!macro) return "not_found";
    if (macro.builtIn) return "built_in";
    this.macros.delete(id);
    this.persist();
    return "ok";
  }
}
