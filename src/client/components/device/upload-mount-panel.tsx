import { useEffect, useState } from "react";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { C64Input } from "../ui/c64-input.tsx";
import { C64Select } from "../ui/c64-select.tsx";
import { C64FileDropZone } from "../ui/c64-file-drop-zone.tsx";
import { useDeviceActions } from "../../hooks/use-device-actions.ts";
import { useToast } from "../ui/toast-context.tsx";

const DRIVE_OPTIONS = [
  { value: "a", label: "DRIVE A" },
  { value: "b", label: "DRIVE B" },
];

const MODE_OPTIONS = [
  { value: "readwrite", label: "READ/WRITE" },
  { value: "readonly", label: "READ ONLY" },
  { value: "unlinked", label: "UNLINKED" },
];

interface UploadMountPanelProps {
  deviceId: string;
  externalMountPath?: string;
}

export function UploadMountPanel({ deviceId, externalMountPath }: UploadMountPanelProps) {
  const actions = useDeviceActions(deviceId);
  const { addToast } = useToast();
  const [drive, setDrive] = useState("a");
  const [mode, setMode] = useState("readwrite");
  const [mountPath, setMountPath] = useState("");

  useEffect(() => {
    if (externalMountPath) {
      setMountPath(externalMountPath);
    }
  }, [externalMountPath]);

  const handleFileUpload = (file: File) => {
    actions.uploadMount.mutate(
      { file, drive, mode },
      {
        onSuccess: () =>
          addToast(`MOUNTED ${file.name} ON DRIVE ${drive.toUpperCase()}`, "success"),
        onError: (err) =>
          addToast(`MOUNT FAILED: ${err.message}`, "error"),
      },
    );
  };

  const handleMountByPath = () => {
    if (!mountPath.trim()) return;
    actions.mountByPath.mutate(
      { drive, imagePath: mountPath.trim() },
      {
        onSuccess: () => {
          addToast(`MOUNTED ${mountPath} ON DRIVE ${drive.toUpperCase()}`, "success");
          setMountPath("");
        },
        onError: (err) =>
          addToast(`MOUNT FAILED: ${err.message}`, "error"),
      },
    );
  };

  const isUploading = actions.uploadMount.isPending;
  const isMounting = actions.mountByPath.isPending;

  return (
    <div className="flex flex-col gap-[1em]">
      <C64Box title="UPLOAD & MOUNT">
        <div className="flex flex-col gap-[0.5em]">
          <div className="flex gap-[2ch] flex-wrap">
            <C64Select
              label="DRIVE"
              options={DRIVE_OPTIONS}
              value={drive}
              onChange={(e) => setDrive(e.target.value)}
            />
            <C64Select
              label="MODE"
              options={MODE_OPTIONS}
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            />
          </div>

          <C64FileDropZone
            onFile={handleFileUpload}
            disabled={isUploading}
          />

          {isUploading && (
            <p>
              <span className="animate-c64-cursor">{"\u2588"}</span> UPLOADING...
            </p>
          )}
        </div>
      </C64Box>

      <C64Box title="MOUNT BY PATH">
        <div className="flex flex-col gap-[0.5em]">
          <C64Input
            placeholder="PATH ON DEVICE"
            value={mountPath}
            onChange={(e) => setMountPath(e.target.value)}
          />
          <div>
            <C64Button
              onClick={handleMountByPath}
              disabled={isMounting || !mountPath.trim()}
            >
              {isMounting ? "MOUNTING..." : "MOUNT"}
            </C64Button>
          </div>
        </div>
      </C64Box>
    </div>
  );
}
