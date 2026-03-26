import {
  type DragEvent,
  type ChangeEvent,
  useState,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { C64Input } from "../ui/c64-input.tsx";
import { C64Breadcrumb } from "../ui/c64-breadcrumb.tsx";
import {
  useFileListing,
  useFileUpload,
  useFileDelete,
  downloadFile,
  type DirectoryEntry,
} from "../../hooks/use-file-browser.ts";
import { useToast } from "../ui/toast-context.tsx";

/** PETSCII-style icons per file type category */
const FILE_ICONS: Record<string, string> = {
  directory: "\u{EE71}",
  "disk-1541": "\u2588D",
  "disk-1571": "\u2588D",
  "disk-1581": "\u2588D",
  program: "\u2588P",
  cartridge: "\u2588C",
  "sid-music": "\u2588S",
  "mod-music": "\u2588M",
  rom: "\u2588R",
  generic: "\u2588\u2588",
};

/** Map file type key to category for icon lookup */
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

/** Map file type key to available actions */
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

const DEFAULT_ACTIONS = ["download", "delete"];

function getCategory(entry: DirectoryEntry): string {
  if (entry.type === "directory") return "directory";
  if (entry.fileType && TYPE_KEY_TO_CATEGORY[entry.fileType]) {
    return TYPE_KEY_TO_CATEGORY[entry.fileType];
  }
  return "generic";
}

function getIcon(entry: DirectoryEntry): string {
  return FILE_ICONS[getCategory(entry)] || FILE_ICONS.generic;
}

function getActions(entry: DirectoryEntry): string[] {
  if (entry.type === "directory") return [];
  if (entry.fileType && TYPE_KEY_TO_ACTIONS[entry.fileType]) {
    return TYPE_KEY_TO_ACTIONS[entry.fileType];
  }
  return DEFAULT_ACTIONS;
}

function formatSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear().toString().slice(2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DISK_TYPE_KEYS = new Set(
  Object.entries(TYPE_KEY_TO_CATEGORY)
    .filter(([, cat]) => cat.startsWith("disk-"))
    .map(([key]) => key),
);

function isDiskType(fileType?: string): boolean {
  return !!fileType && DISK_TYPE_KEYS.has(fileType);
}

interface C64FileBrowserProps {
  deviceId: string;
  initialPath?: string;
  onSelectDisk?: (path: string) => void;
  onSelectFile?: (path: string) => void;
  onPlayMusic?: (path: string, fileType: string) => void;
  onClose?: () => void;
}

export function C64FileBrowser({
  deviceId,
  initialPath = "/",
  onSelectDisk,
  onSelectFile,
  onPlayMusic,
  onClose,
}: C64FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [pathInput, setPathInput] = useState(initialPath);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [contextEntry, setContextEntry] = useState<DirectoryEntry | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const listing = useFileListing(deviceId, currentPath);
  const upload = useFileUpload(deviceId);
  const deleteMut = useFileDelete(deviceId);

  const navigateTo = useCallback(
    (path: string) => {
      let normalized = path.startsWith("/") ? path : "/" + path;
      if (!normalized.endsWith("/")) normalized += "/";
      setCurrentPath(normalized);
      setPathInput(normalized);
      setSelectedFile(null);
      setContextEntry(null);
    },
    [],
  );

  const handleEntryClick = useCallback(
    (entry: DirectoryEntry) => {
      if (entry.type === "directory") {
        navigateTo(currentPath + entry.name + "/");
      } else {
        const filePath = currentPath + entry.name;
        setSelectedFile(filePath);
        if (isDiskType(entry.fileType) && onSelectDisk) {
          onSelectDisk(filePath);
        } else if (!isDiskType(entry.fileType) && onSelectFile) {
          onSelectFile(filePath);
        }
      }
    },
    [currentPath, navigateTo, onSelectDisk, onSelectFile],
  );

  const handlePathGo = useCallback(() => {
    if (pathInput.trim()) {
      navigateTo(pathInput.trim());
    }
  }, [pathInput, navigateTo]);

  const handleAction = useCallback(
    (action: string, entry: DirectoryEntry) => {
      const filePath = currentPath + entry.name;
      setContextEntry(null);

      switch (action) {
        case "mount":
          if (onSelectDisk) {
            onSelectDisk(filePath);
            addToast(`SELECTED ${entry.name} FOR MOUNT`, "success");
          }
          break;
        case "download":
          downloadFile(deviceId, filePath);
          break;
        case "delete":
          deleteMut.mutate(filePath, {
            onSuccess: () => addToast(`DELETED ${entry.name}`, "success"),
            onError: (err) =>
              addToast(`DELETE FAILED: ${err.message}`, "error"),
          });
          break;
        case "play":
          if (onPlayMusic && entry.fileType) {
            onPlayMusic(filePath, entry.fileType);
          } else {
            addToast("PLAY NOT AVAILABLE", "info");
          }
          break;
        case "run":
        case "load":
          addToast(`${action.toUpperCase()} NOT YET IMPLEMENTED`, "info");
          break;
      }
    },
    [currentPath, deviceId, onSelectDisk, onPlayMusic, deleteMut, addToast],
  );

  const handleUpload = useCallback(
    (file: File) => {
      upload.mutate(
        { file, targetDir: currentPath },
        {
          onSuccess: (data) => {
            if (data.uploaded.length > 0) {
              addToast(`UPLOADED ${data.uploaded.join(", ")}`, "success");
            }
            if (data.errors.length > 0) {
              addToast(`ERRORS: ${data.errors.join(", ")}`, "error");
            }
          },
          onError: (err) =>
            addToast(`UPLOAD FAILED: ${err.message}`, "error"),
        },
      );
    },
    [upload, currentPath, addToast],
  );

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const handleFileInput = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = "";
    },
    [handleUpload],
  );

  const sortedEntries = useMemo(() => {
    const entries = listing.data?.entries ?? [];
    return [...entries].sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [listing.data?.entries]);

  return (
    <C64Box title="FILE BROWSER">
      <div className="flex flex-col gap-[0.5em]">
        {/* Close button */}
        {onClose && (
          <div className="flex justify-end">
            <C64Button onClick={onClose}>X CLOSE</C64Button>
          </div>
        )}

        {/* Breadcrumb */}
        <C64Breadcrumb path={currentPath} onNavigate={navigateTo} />

        {/* Path input */}
        <div className="flex gap-[1ch] items-end">
          <C64Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePathGo();
            }}
            className="flex-1"
            placeholder="/PATH/TO/DIR/"
          />
          <C64Button onClick={handlePathGo}>GO</C64Button>
        </div>

        {/* Upload zone */}
        <div
          className={`c64-box-border cursor-pointer ${dragOver ? "bg-c64-14-light-blue text-c64-6-blue" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="px-[1ch] py-[0.25em] text-center">
            {upload.isPending
              ? "\u2588 UPLOADING..."
              : "DROP FILE HERE OR CLICK TO UPLOAD"}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>

        {/* Loading */}
        {listing.isLoading && (
          <p>
            <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
          </p>
        )}

        {/* Error */}
        {listing.isError && (
          <p className="text-c64-2-red">
            {listing.error?.message || "FAILED TO LIST DIRECTORY"}
          </p>
        )}

        {/* API errors */}
        {listing.data?.errors?.length ? (
          <p className="text-c64-2-red">{listing.data.errors.join(", ")}</p>
        ) : null}

        {/* File list */}
        {listing.data && !listing.isError && (
          <div className="c64-box-border">
            {/* Header */}
            <div className="flex bg-c64-14-light-blue text-c64-6-blue">
              <span className="px-[1ch] py-[0.25em]" style={{ flex: "0 0 3ch" }}>
                {""}
              </span>
              <span className="px-[1ch] py-[0.25em] flex-1">NAME</span>
              <span
                className="px-[1ch] py-[0.25em]"
                style={{ flex: "0 0 7ch" }}
              >
                SIZE
              </span>
              <span
                className="px-[1ch] py-[0.25em]"
                style={{ flex: "0 0 9ch" }}
              >
                DATE
              </span>
            </div>

            {/* Parent directory link */}
            {listing.data.parent && (
              <div
                className="flex items-center cursor-pointer hover:bg-c64-14-light-blue hover:text-c64-6-blue"
                onClick={() => navigateTo(listing.data!.parent!)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigateTo(listing.data!.parent!);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <span
                  className="px-[1ch] py-[0.25em]"
                  style={{ flex: "0 0 3ch" }}
                >
                  {"\u{EE71}"}
                </span>
                <span className="px-[1ch] py-[0.25em] flex-1">..</span>
                <span
                  className="px-[1ch] py-[0.25em]"
                  style={{ flex: "0 0 7ch" }}
                />
                <span
                  className="px-[1ch] py-[0.25em]"
                  style={{ flex: "0 0 9ch" }}
                />
              </div>
            )}

            {/* Entries */}
            {sortedEntries.length === 0 && !listing.data.parent && (
              <div className="px-[1ch] py-[0.5em]">EMPTY DIRECTORY</div>
            )}

            {sortedEntries.map((entry) => {
              const filePath = currentPath + entry.name;
              const isSelected = selectedFile === filePath;
              const isContext = contextEntry?.name === entry.name;

              return (
                <div key={entry.name}>
                  <div
                    className={`flex items-center cursor-pointer ${
                      isSelected
                        ? "bg-c64-14-light-blue text-c64-6-blue"
                        : "hover:bg-c64-11-dark-grey"
                    }`}
                    onClick={() => handleEntryClick(entry)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (entry.type === "file") {
                        setContextEntry(isContext ? null : entry);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleEntryClick(entry);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span
                      className="px-[1ch] py-[0.25em]"
                      style={{ flex: "0 0 3ch" }}
                    >
                      {getIcon(entry)}
                    </span>
                    <span className="px-[1ch] py-[0.25em] flex-1 truncate">
                      {entry.name.toUpperCase()}
                    </span>
                    <span
                      className="px-[1ch] py-[0.25em]"
                      style={{ flex: "0 0 7ch" }}
                    >
                      {entry.type === "file" ? formatSize(entry.size) : "DIR"}
                    </span>
                    <span
                      className="px-[1ch] py-[0.25em]"
                      style={{ flex: "0 0 9ch" }}
                    >
                      {formatDate(entry.modified)}
                    </span>
                  </div>

                  {/* Context actions */}
                  {isContext && (
                    <div className="flex gap-[1ch] px-[1ch] py-[0.25em] bg-c64-11-dark-grey">
                      {getActions(entry).map((action) => (
                        <C64Button
                          key={action}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAction(action, entry);
                          }}
                          variant={action === "delete" ? "danger" : "default"}
                          className="text-[14px] px-[0.5ch] py-0"
                        >
                          {action.toUpperCase()}
                        </C64Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Delete pending indicator */}
        {deleteMut.isPending && (
          <p>
            <span className="animate-c64-cursor">{"\u2588"}</span> DELETING...
          </p>
        )}
      </div>
    </C64Box>
  );
}
