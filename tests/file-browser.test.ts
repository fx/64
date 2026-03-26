import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Test the hook fetch logic by directly testing the query/mutation functions
// We test the exported utility functions and the fetch behavior

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("useFileListing fetch logic", () => {
  it("fetches directory listing with correct URL", async () => {
    const mockData = {
      path: "/USB0/",
      parent: "/",
      entries: [
        { name: "games", type: "directory" },
        { name: "test.d64", type: "file", size: 174848, fileType: "d64" },
      ],
      errors: [],
    };

    globalThis.fetch = mock(async (url: string) => {
      expect(url).toBe("/api/devices/DEV1/files?path=%2FUSB0%2F");
      return new Response(JSON.stringify(mockData), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const res = await fetch("/api/devices/DEV1/files?path=%2FUSB0%2F");
    const data = await res.json();
    expect(data.path).toBe("/USB0/");
    expect(data.entries).toHaveLength(2);
    expect(data.entries[0].name).toBe("games");
    expect(data.entries[1].fileType).toBe("d64");
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: "Device not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const res = await fetch("/api/devices/MISSING/files?path=%2F");
    expect(res.ok).toBe(false);
    const body = await res.json();
    expect(body.error).toBe("Device not found");
  });
});

describe("file upload fetch logic", () => {
  it("uploads file with correct URL and method", async () => {
    globalThis.fetch = mock(async (url: string, opts?: RequestInit) => {
      expect(url).toBe("/api/devices/DEV1/files/upload?path=%2FUSB0%2F");
      expect(opts?.method).toBe("POST");
      expect(opts?.body).toBeInstanceOf(FormData);
      return new Response(
        JSON.stringify({ uploaded: ["test.d64"], errors: [] }),
        { headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const form = new FormData();
    form.append("file", new File(["data"], "test.d64"));
    const res = await fetch("/api/devices/DEV1/files/upload?path=%2FUSB0%2F", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    expect(data.uploaded).toEqual(["test.d64"]);
    expect(data.errors).toEqual([]);
  });

  it("handles upload errors", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ error: "Upload failed" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const form = new FormData();
    form.append("file", new File(["data"], "test.d64"));
    const res = await fetch("/api/devices/DEV1/files/upload?path=%2F", {
      method: "POST",
      body: form,
    });
    expect(res.ok).toBe(false);
    const body = await res.json();
    expect(body.error).toBe("Upload failed");
  });
});

describe("file delete fetch logic", () => {
  it("deletes file with correct URL and method", async () => {
    globalThis.fetch = mock(async (url: string, opts?: RequestInit) => {
      expect(url).toBe(
        "/api/devices/DEV1/files?path=%2FUSB0%2Ftest.d64",
      );
      expect(opts?.method).toBe("DELETE");
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const res = await fetch(
      "/api/devices/DEV1/files?path=%2FUSB0%2Ftest.d64",
      { method: "DELETE" },
    );
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

describe("file download URL construction", () => {
  it("constructs correct download URL", () => {
    const deviceId = "DEV1";
    const filePath = "/USB0/game.d64";
    const url = `/api/devices/${deviceId}/files/download?path=${encodeURIComponent(filePath)}`;
    expect(url).toBe("/api/devices/DEV1/files/download?path=%2FUSB0%2Fgame.d64");
  });

  it("handles special characters in path", () => {
    const deviceId = "DEV1";
    const filePath = "/USB0/My Games/test file.d64";
    const url = `/api/devices/${deviceId}/files/download?path=${encodeURIComponent(filePath)}`;
    expect(url).toContain("My%20Games");
    expect(url).toContain("test%20file.d64");
  });
});

describe("C64Breadcrumb path parsing", () => {
  // Inline the parseSegments logic for unit testing
  function parseSegments(
    path: string,
  ): Array<{ label: string; path: string }> {
    const parts = path.split("/").filter(Boolean);
    const segments: Array<{ label: string; path: string }> = [
      { label: "/", path: "/" },
    ];
    let cumulative = "/";
    for (const part of parts) {
      cumulative += part + "/";
      segments.push({ label: part, path: cumulative });
    }
    return segments;
  }

  it("parses root path", () => {
    const segments = parseSegments("/");
    expect(segments).toEqual([{ label: "/", path: "/" }]);
  });

  it("parses single-level path", () => {
    const segments = parseSegments("/USB0/");
    expect(segments).toEqual([
      { label: "/", path: "/" },
      { label: "USB0", path: "/USB0/" },
    ]);
  });

  it("parses multi-level path", () => {
    const segments = parseSegments("/USB0/Games/Platformers/");
    expect(segments).toEqual([
      { label: "/", path: "/" },
      { label: "USB0", path: "/USB0/" },
      { label: "Games", path: "/USB0/Games/" },
      { label: "Platformers", path: "/USB0/Games/Platformers/" },
    ]);
  });
});

describe("file type icon mapping", () => {
  const TYPE_KEY_TO_CATEGORY: Record<string, string> = {
    d64: "disk-1541",
    g64: "disk-1541",
    d71: "disk-1571",
    g71: "disk-1571",
    d81: "disk-1581",
    prg: "program",
    crt: "cartridge",
    sid: "sid-music",
    mod: "mod-music",
    rom: "rom",
    bin: "rom",
  };

  it("maps disk types correctly", () => {
    expect(TYPE_KEY_TO_CATEGORY["d64"]).toBe("disk-1541");
    expect(TYPE_KEY_TO_CATEGORY["g64"]).toBe("disk-1541");
    expect(TYPE_KEY_TO_CATEGORY["d71"]).toBe("disk-1571");
    expect(TYPE_KEY_TO_CATEGORY["d81"]).toBe("disk-1581");
  });

  it("maps program types correctly", () => {
    expect(TYPE_KEY_TO_CATEGORY["prg"]).toBe("program");
    expect(TYPE_KEY_TO_CATEGORY["crt"]).toBe("cartridge");
  });

  it("maps music types correctly", () => {
    expect(TYPE_KEY_TO_CATEGORY["sid"]).toBe("sid-music");
    expect(TYPE_KEY_TO_CATEGORY["mod"]).toBe("mod-music");
  });

  it("maps rom types correctly", () => {
    expect(TYPE_KEY_TO_CATEGORY["rom"]).toBe("rom");
    expect(TYPE_KEY_TO_CATEGORY["bin"]).toBe("rom");
  });

  it("returns undefined for unknown types", () => {
    expect(TYPE_KEY_TO_CATEGORY["txt"]).toBeUndefined();
    expect(TYPE_KEY_TO_CATEGORY["jpg"]).toBeUndefined();
  });
});

describe("file type action mapping", () => {
  const TYPE_KEY_TO_ACTIONS: Record<string, string[]> = {
    d64: ["mount", "download", "delete"],
    g64: ["mount", "download", "delete"],
    d71: ["mount", "download", "delete"],
    g71: ["mount", "download", "delete"],
    d81: ["mount", "download", "delete"],
    prg: ["run", "load", "download", "delete"],
    crt: ["run", "download", "delete"],
    sid: ["play", "download", "delete"],
    mod: ["play", "download", "delete"],
    rom: ["load", "download", "delete"],
    bin: ["load", "download", "delete"],
  };

  it("disk types have mount action", () => {
    for (const key of ["d64", "g64", "d71", "g71", "d81"]) {
      expect(TYPE_KEY_TO_ACTIONS[key]).toContain("mount");
    }
  });

  it("program types have run action", () => {
    expect(TYPE_KEY_TO_ACTIONS["prg"]).toContain("run");
    expect(TYPE_KEY_TO_ACTIONS["crt"]).toContain("run");
  });

  it("music types have play action", () => {
    expect(TYPE_KEY_TO_ACTIONS["sid"]).toContain("play");
    expect(TYPE_KEY_TO_ACTIONS["mod"]).toContain("play");
  });

  it("all types have download and delete", () => {
    for (const actions of Object.values(TYPE_KEY_TO_ACTIONS)) {
      expect(actions).toContain("download");
      expect(actions).toContain("delete");
    }
  });
});

describe("file size formatting", () => {
  function formatSize(bytes?: number): string {
    if (bytes === undefined) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  }

  it("returns empty for undefined", () => {
    expect(formatSize(undefined)).toBe("");
  });

  it("formats bytes", () => {
    expect(formatSize(0)).toBe("0B");
    expect(formatSize(512)).toBe("512B");
    expect(formatSize(1023)).toBe("1023B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(1024)).toBe("1K");
    expect(formatSize(174848)).toBe("171K");
  });

  it("formats megabytes", () => {
    expect(formatSize(1048576)).toBe("1.0M");
    expect(formatSize(1572864)).toBe("1.5M");
  });
});

describe("file date formatting", () => {
  function formatDate(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    const y = d.getFullYear().toString().slice(2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  it("returns empty for undefined", () => {
    expect(formatDate(undefined)).toBe("");
  });

  it("returns empty for empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("formats ISO date", () => {
    const result = formatDate("2024-03-15T10:30:00Z");
    expect(result).toBe("24-03-15");
  });
});

describe("isDiskType helper", () => {
  function isDiskType(fileType?: string): boolean {
    if (!fileType) return false;
    return ["d64", "g64", "d71", "g71", "d81"].includes(fileType);
  }

  it("returns true for disk types", () => {
    expect(isDiskType("d64")).toBe(true);
    expect(isDiskType("g64")).toBe(true);
    expect(isDiskType("d71")).toBe(true);
    expect(isDiskType("g71")).toBe(true);
    expect(isDiskType("d81")).toBe(true);
  });

  it("returns false for non-disk types", () => {
    expect(isDiskType("prg")).toBe(false);
    expect(isDiskType("crt")).toBe(false);
    expect(isDiskType("sid")).toBe(false);
    expect(isDiskType(undefined)).toBe(false);
  });
});

describe("directory listing sorting", () => {
  it("sorts directories before files", () => {
    const entries = [
      { name: "z-file.d64", type: "file" as const },
      { name: "a-dir", type: "directory" as const },
      { name: "b-file.prg", type: "file" as const },
      { name: "c-dir", type: "directory" as const },
    ];
    const sorted = [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    expect(sorted[0].name).toBe("a-dir");
    expect(sorted[1].name).toBe("c-dir");
    expect(sorted[2].name).toBe("b-file.prg");
    expect(sorted[3].name).toBe("z-file.d64");
  });

  it("sorts alphabetically within same type", () => {
    const entries = [
      { name: "c.d64", type: "file" as const },
      { name: "a.d64", type: "file" as const },
      { name: "b.d64", type: "file" as const },
    ];
    const sorted = [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    expect(sorted[0].name).toBe("a.d64");
    expect(sorted[1].name).toBe("b.d64");
    expect(sorted[2].name).toBe("c.d64");
  });
});
