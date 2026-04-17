import { useState, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { C64Box } from "../../components/ui/c64-box.tsx";
import { C64Button } from "../../components/ui/c64-button.tsx";
import { C64Input } from "../../components/ui/c64-input.tsx";
import { C64Select } from "../../components/ui/c64-select.tsx";
import {
  useProfiles,
  useDeleteProfile,
  useCaptureProfile,
  useApplyProfile,
  useProfileDiff,
  useExportProfile,
  useImportProfile,
} from "../../hooks/use-profiles.ts";
import { useDevices } from "../../hooks/use-devices.ts";
import { useToast } from "../../components/ui/toast-context.tsx";
import type { ConfigDiff } from "@shared/types.ts";

export const Route = createFileRoute("/profiles/")({
  component: ProfilesPage,
});

type Mode =
  | { type: "list" }
  | { type: "capture" }
  | { type: "apply"; profileId: string; profileName: string }
  | { type: "diff-preview"; profileId: string; profileName: string; deviceId: string }
  | { type: "delete-confirm"; profileId: string; profileName: string };

function ProfilesPage() {
  const { data: profiles, isLoading, isError } = useProfiles();
  const { data: devices } = useDevices();
  const deleteMutation = useDeleteProfile();
  const captureMutation = useCaptureProfile();
  const applyMutation = useApplyProfile();
  const exportMutation = useExportProfile();
  const importMutation = useImportProfile();
  const { addToast } = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>({ type: "list" });
  const [captureName, setCaptureName] = useState("");
  const [captureDeviceId, setCaptureDeviceId] = useState("");
  const [applyDeviceId, setApplyDeviceId] = useState("");
  const [saveToFlash, setSaveToFlash] = useState(false);

  const onlineDevices = devices?.filter((d) => d.online) ?? [];

  const handleCapture = () => {
    if (!captureName.trim() || !captureDeviceId) {
      addToast("NAME AND DEVICE ARE REQUIRED", "error");
      return;
    }
    captureMutation.mutate(
      { deviceId: captureDeviceId, name: captureName.trim() },
      {
        onSuccess: () => {
          addToast("PROFILE CAPTURED", "success");
          setCaptureName("");
          setCaptureDeviceId("");
          setMode({ type: "list" });
        },
        onError: (err) => addToast(err.message, "error"),
      },
    );
  };

  const handleDelete = (profileId: string) => {
    deleteMutation.mutate(profileId, {
      onSuccess: () => {
        addToast("PROFILE DELETED", "success");
        setMode({ type: "list" });
      },
      onError: (err) => addToast(err.message, "error"),
    });
  };

  const handleExport = (id: string) => {
    exportMutation.mutate(id, {
      onError: (err) => addToast(err.message, "error"),
    });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importMutation.mutate(file, {
      onSuccess: () => addToast("PROFILE IMPORTED", "success"),
      onError: (err) => addToast(err.message, "error"),
    });
    e.target.value = "";
  };

  const startApplyFlow = (profileId: string, profileName: string) => {
    setApplyDeviceId("");
    setSaveToFlash(false);
    setMode({ type: "apply", profileId, profileName });
  };

  const proceedToDiffPreview = () => {
    if (!applyDeviceId) {
      addToast("SELECT A DEVICE", "error");
      return;
    }
    if (mode.type === "apply") {
      setMode({
        type: "diff-preview",
        profileId: mode.profileId,
        profileName: mode.profileName,
        deviceId: applyDeviceId,
      });
    }
  };

  return (
    <div className="p-[1em]">
      <div className="mb-[1em]">
        <Link to="/" className="c64-button inline-block no-underline">
          &lt; BACK TO DEVICES
        </Link>
      </div>

      <C64Box title="CONFIG PROFILES">
        <p>MANAGE DEVICE CONFIGURATION PROFILES</p>
      </C64Box>

      {/* LIST MODE */}
      {mode.type === "list" && (
        <div className="mt-[1em]">
          <C64Box title="PROFILES">
            <div className="flex gap-[1ch] mb-[0.5em]">
              <C64Button onClick={() => setMode({ type: "capture" })}>
                + CAPTURE
              </C64Button>
              <C64Button onClick={() => importInputRef.current?.click()}>
                IMPORT
              </C64Button>
              <input
                ref={importInputRef}
                type="file"
                className="hidden"
                accept=".json"
                onChange={handleImportFile}
              />
            </div>

            {isLoading && (
              <p>
                <span className="animate-c64-cursor">{"\u2588"}</span>{" "}
                LOADING...
              </p>
            )}
            {isError && (
              <p className="text-c64-2-red">?ERROR LOADING PROFILES</p>
            )}

            {profiles && profiles.length === 0 && <p>NO PROFILES YET</p>}

            {profiles && profiles.length > 0 && (
              <div>
                {/* Table header */}
                <div className="flex bg-c64-14-light-blue text-c64-6-blue">
                  <span className="px-[1ch] flex-1">NAME</span>
                  <span className="px-[1ch]" style={{ flex: "0 0 12ch" }}>
                    DEVICE
                  </span>
                  <span className="px-[1ch]" style={{ flex: "0 0 24ch" }}>
                    ACTIONS
                  </span>
                </div>
                {/* Profile rows */}
                {profiles.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center py-[0.25em]"
                  >
                    <span className="px-[1ch] flex-1 truncate">
                      {p.name.toUpperCase()}
                    </span>
                    <span
                      className="px-[1ch] truncate"
                      style={{ flex: "0 0 12ch" }}
                    >
                      {(p.deviceProduct ?? "-").toUpperCase()}
                    </span>
                    <span
                      className="px-[1ch] flex gap-[1ch]"
                      style={{ flex: "0 0 24ch" }}
                    >
                      <C64Button
                        onClick={() => startApplyFlow(p.id, p.name)}
                      >
                        APPLY
                      </C64Button>
                      <C64Button onClick={() => handleExport(p.id)}>
                        EXPORT
                      </C64Button>
                      <C64Button
                        variant="danger"
                        onClick={() =>
                          setMode({
                            type: "delete-confirm",
                            profileId: p.id,
                            profileName: p.name,
                          })
                        }
                      >
                        DEL
                      </C64Button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </C64Box>
        </div>
      )}

      {/* CAPTURE MODE */}
      {mode.type === "capture" && (
        <div className="mt-[1em]">
          <C64Box title="CAPTURE CONFIG">
            <div className="flex flex-col gap-[0.5em]">
              <C64Input
                placeholder="PROFILE NAME"
                value={captureName}
                onChange={(e) => setCaptureName(e.target.value)}
              />
              {onlineDevices.length > 0 ? (
                <C64Select
                  label="SOURCE DEVICE"
                  options={[
                    { value: "", label: "-- SELECT DEVICE --" },
                    ...onlineDevices.map((d) => ({
                      value: d.id,
                      label: (d.name || d.ip).toUpperCase(),
                    })),
                  ]}
                  value={captureDeviceId}
                  onChange={(e) => setCaptureDeviceId(e.target.value)}
                />
              ) : (
                <p className="text-c64-2-red">NO ONLINE DEVICES</p>
              )}
              <div className="flex gap-[1ch] mt-[0.5em]">
                <C64Button
                  onClick={handleCapture}
                  disabled={captureMutation.isPending}
                >
                  {captureMutation.isPending ? "CAPTURING..." : "CAPTURE"}
                </C64Button>
                <C64Button onClick={() => setMode({ type: "list" })}>
                  CANCEL
                </C64Button>
              </div>
            </div>
          </C64Box>
        </div>
      )}

      {/* APPLY MODE — select device */}
      {mode.type === "apply" && (
        <div className="mt-[1em]">
          <C64Box title={`APPLY: ${mode.profileName.toUpperCase()}`}>
            <div className="flex flex-col gap-[0.5em]">
              {onlineDevices.length > 0 ? (
                <C64Select
                  label="TARGET DEVICE"
                  options={[
                    { value: "", label: "-- SELECT DEVICE --" },
                    ...onlineDevices.map((d) => ({
                      value: d.id,
                      label: (d.name || d.ip).toUpperCase(),
                    })),
                  ]}
                  value={applyDeviceId}
                  onChange={(e) => setApplyDeviceId(e.target.value)}
                />
              ) : (
                <p className="text-c64-2-red">NO ONLINE DEVICES</p>
              )}
              <label className="flex items-center gap-[1ch]">
                <input
                  type="checkbox"
                  checked={saveToFlash}
                  onChange={(e) => setSaveToFlash(e.target.checked)}
                />
                SAVE TO FLASH
              </label>
              <div className="flex gap-[1ch] mt-[0.5em]">
                <C64Button onClick={proceedToDiffPreview}>
                  PREVIEW DIFF
                </C64Button>
                <C64Button onClick={() => setMode({ type: "list" })}>
                  CANCEL
                </C64Button>
              </div>
            </div>
          </C64Box>
        </div>
      )}

      {/* DIFF PREVIEW + CONFIRM APPLY */}
      {mode.type === "diff-preview" && (
        <DiffPreviewPanel
          profileId={mode.profileId}
          profileName={mode.profileName}
          deviceId={mode.deviceId}
          saveToFlash={saveToFlash}
          onApply={(profileId, deviceId) => {
            applyMutation.mutate(
              { id: profileId, deviceId, saveToFlash },
              {
                onSuccess: (result) => {
                  const msg =
                    result.errors && result.errors.length > 0
                      ? `APPLIED ${result.appliedCount} ITEMS, ${result.errors.length} ERRORS`
                      : `APPLIED ${result.appliedCount} ITEMS`;
                  addToast(msg, result.errors?.length ? "error" : "success");
                  setMode({ type: "list" });
                },
                onError: (err) => addToast(err.message, "error"),
              },
            );
          }}
          isApplying={applyMutation.isPending}
          onCancel={() => setMode({ type: "list" })}
          devices={devices ?? []}
        />
      )}

      {/* DELETE CONFIRMATION */}
      {mode.type === "delete-confirm" && (
        <div className="mt-[1em]">
          <C64Box title="CONFIRM DELETE">
            <p>
              DELETE PROFILE &quot;{mode.profileName.toUpperCase()}&quot;?
            </p>
            <div className="flex gap-[1ch] mt-[0.5em]">
              <C64Button
                variant="danger"
                onClick={() => handleDelete(mode.profileId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "DELETING..." : "YES, DELETE"}
              </C64Button>
              <C64Button onClick={() => setMode({ type: "list" })}>
                CANCEL
              </C64Button>
            </div>
          </C64Box>
        </div>
      )}
    </div>
  );
}

/* ── Diff Preview Panel ──────────────────────────────── */

function DiffPreviewPanel({
  profileId,
  profileName,
  deviceId,
  saveToFlash,
  onApply,
  isApplying,
  onCancel,
  devices,
}: {
  profileId: string;
  profileName: string;
  deviceId: string;
  saveToFlash: boolean;
  onApply: (profileId: string, deviceId: string) => void;
  isApplying: boolean;
  onCancel: () => void;
  devices: Array<{ id: string; name: string; ip: string }>;
}) {
  const { data: diff, isLoading, isError } = useProfileDiff(profileId, {
    deviceId,
  });

  const device = devices.find((d) => d.id === deviceId);
  const deviceLabel = device ? (device.name || device.ip).toUpperCase() : deviceId;

  return (
    <div className="mt-[1em]">
      <C64Box title={`DIFF: ${profileName.toUpperCase()} VS ${deviceLabel}`}>
        {isLoading && (
          <p>
            <span className="animate-c64-cursor">{"\u2588"}</span>{" "}
            LOADING DIFF...
          </p>
        )}
        {isError && (
          <p className="text-c64-2-red">?ERROR LOADING DIFF</p>
        )}

        {diff && <DiffViewer diff={diff} />}

        {diff && (
          <div className="flex gap-[1ch] mt-[0.5em]">
            <C64Button
              onClick={() => onApply(profileId, deviceId)}
              disabled={isApplying}
            >
              {isApplying ? "APPLYING..." : "CONFIRM APPLY"}
            </C64Button>
            {saveToFlash && (
              <span className="text-c64-7-yellow">+ SAVE TO FLASH</span>
            )}
            <C64Button onClick={onCancel}>CANCEL</C64Button>
          </div>
        )}
      </C64Box>
    </div>
  );
}

/* ── Diff Viewer Component ───────────────────────────── */

function DiffViewer({ diff }: { diff: ConfigDiff }) {
  const { changes, leftOnly, rightOnly, identicalCount } = diff;

  // Group changes by category
  const changesByCategory = new Map<string, typeof changes>();
  for (const entry of changes) {
    const list = changesByCategory.get(entry.category) ?? [];
    list.push(entry);
    changesByCategory.set(entry.category, list);
  }

  const leftByCategory = new Map<string, typeof leftOnly>();
  for (const entry of leftOnly) {
    const list = leftByCategory.get(entry.category) ?? [];
    list.push(entry);
    leftByCategory.set(entry.category, list);
  }

  const rightByCategory = new Map<string, typeof rightOnly>();
  for (const entry of rightOnly) {
    const list = rightByCategory.get(entry.category) ?? [];
    list.push(entry);
    rightByCategory.set(entry.category, list);
  }

  const allCategories = new Set([
    ...changesByCategory.keys(),
    ...leftByCategory.keys(),
    ...rightByCategory.keys(),
  ]);

  const totalDiffs = changes.length + leftOnly.length + rightOnly.length;

  if (totalDiffs === 0) {
    return (
      <div>
        <p className="text-c64-5-green">
          NO DIFFERENCES - {identicalCount} IDENTICAL ITEMS
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-[0.5em]">
        {changes.length} CHANGED, {leftOnly.length} PROFILE ONLY,{" "}
        {rightOnly.length} DEVICE ONLY, {identicalCount} IDENTICAL
      </p>

      {[...allCategories].sort().map((category) => {
        const catChanges = changesByCategory.get(category) ?? [];
        const catLeft = leftByCategory.get(category) ?? [];
        const catRight = rightByCategory.get(category) ?? [];

        return (
          <div key={category} className="mb-[0.5em]">
            <div className="bg-c64-14-light-blue text-c64-6-blue px-[1ch]">
              {category.toUpperCase()}
            </div>

            {/* Changed items */}
            {catChanges.map((entry) => (
              <div
                key={`${entry.category}-${entry.item}-changed`}
                className="px-[1ch] text-c64-7-yellow"
              >
                ~ {entry.item.toUpperCase()}: {String(entry.left)} {"\u2192"}{" "}
                {String(entry.right)}
              </div>
            ))}

            {/* Profile-only items (will be added to device) */}
            {catLeft.map((entry) => (
              <div
                key={`${entry.category}-${entry.item}-left`}
                className="px-[1ch] text-c64-5-green"
              >
                + {entry.item.toUpperCase()}: {String(entry.value)}
              </div>
            ))}

            {/* Device-only items (not in profile) */}
            {catRight.map((entry) => (
              <div
                key={`${entry.category}-${entry.item}-right`}
                className="px-[1ch] text-c64-2-red"
              >
                - {entry.item.toUpperCase()}: {String(entry.value)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
