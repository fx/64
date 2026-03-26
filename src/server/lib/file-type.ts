export type FileCategory =
  | "disk-1541"
  | "disk-1571"
  | "disk-1581"
  | "program"
  | "cartridge"
  | "sid-music"
  | "mod-music"
  | "rom"
  | "generic";

export type FileAction = "mount" | "run" | "load" | "play" | "download" | "delete";

export interface FileTypeInfo {
  category: FileCategory;
  actions: FileAction[];
}

const FILE_TYPE_MAP: Record<string, FileTypeInfo> = {
  d64: { category: "disk-1541", actions: ["mount", "download", "delete"] },
  g64: { category: "disk-1541", actions: ["mount", "download", "delete"] },
  d71: { category: "disk-1571", actions: ["mount", "download", "delete"] },
  g71: { category: "disk-1571", actions: ["mount", "download", "delete"] },
  d81: { category: "disk-1581", actions: ["mount", "download", "delete"] },
  prg: { category: "program", actions: ["run", "load", "download", "delete"] },
  crt: { category: "cartridge", actions: ["run", "download", "delete"] },
  sid: { category: "sid-music", actions: ["play", "download", "delete"] },
  mod: { category: "mod-music", actions: ["play", "download", "delete"] },
  rom: { category: "rom", actions: ["load", "download", "delete"] },
  bin: { category: "rom", actions: ["load", "download", "delete"] },
};

const GENERIC_TYPE: FileTypeInfo = {
  category: "generic",
  actions: ["download", "delete"],
};

/** Extract file extension (lowercase, without dot) from a filename */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filename.length - 1) return "";
  return filename.slice(lastDot + 1).toLowerCase();
}

/** Get file type info (category + context actions) for a filename */
export function getFileType(filename: string): FileTypeInfo {
  const ext = getExtension(filename);
  if (!ext) return GENERIC_TYPE;
  return FILE_TYPE_MAP[ext] ?? GENERIC_TYPE;
}

/** Get just the file type key (extension) if it's a known type, otherwise undefined */
export function getFileTypeKey(filename: string): string | undefined {
  const ext = getExtension(filename);
  if (ext && ext in FILE_TYPE_MAP) return ext;
  return undefined;
}
