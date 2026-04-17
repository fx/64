import { useState, useCallback } from "react";
import { C64Box } from "../ui/c64-box.tsx";
import { C64Button } from "../ui/c64-button.tsx";
import { useSnapshots, useCreateSnapshot, useDeleteSnapshot } from "../../hooks/use-snapshots.ts";
import { useToast } from "../ui/toast-context.tsx";
import type { Snapshot } from "@shared/types.ts";

interface SnapshotManagerProps {
  deviceId: string;
  onCompare?: (snapshotId: string, againstId: string) => void;
  onClearDiff?: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`;
  return `${bytes}B`;
}

export function SnapshotManager({ deviceId, onCompare, onClearDiff }: SnapshotManagerProps) {
  const { addToast } = useToast();
  const snapshots = useSnapshots(deviceId);
  const createSnapshot = useCreateSnapshot(deviceId);
  const deleteSnapshot = useDeleteSnapshot(deviceId);

  const [nameInput, setNameInput] = useState("");
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");

  const handleCapture = useCallback(() => {
    const name = nameInput.trim();
    if (!name) {
      addToast("ENTER A NAME FOR THE SNAPSHOT", "error");
      return;
    }
    createSnapshot.mutate(name, {
      onSuccess: (snap) => {
        addToast(`SNAPSHOT "${snap.name}" CAPTURED`, "success");
        setNameInput("");
      },
      onError: (err) => addToast(`CAPTURE FAILED: ${err.message}`, "error"),
    });
  }, [nameInput, createSnapshot, addToast]);

  const handleDelete = useCallback(
    (snap: Snapshot) => {
      deleteSnapshot.mutate(snap.id, {
        onSuccess: () => {
          addToast(`DELETED "${snap.name}"`, "success");
          if (compareA === snap.id) setCompareA("");
          if (compareB === snap.id) setCompareB("");
        },
        onError: (err) => addToast(`DELETE FAILED: ${err.message}`, "error"),
      });
    },
    [deleteSnapshot, addToast, compareA, compareB],
  );

  const handleCompare = useCallback(() => {
    if (!compareA || !compareB || compareA === compareB) {
      addToast("SELECT TWO DIFFERENT SNAPSHOTS", "error");
      return;
    }
    onCompare?.(compareA, compareB);
  }, [compareA, compareB, onCompare, addToast]);

  const list = snapshots.data ?? [];

  return (
    <C64Box title="SNAPSHOTS" width={40}>
      <div className="flex flex-col gap-[0.5em]">
        {/* Capture form */}
        <div className="flex items-center gap-[1ch]">
          <input
            className="c64-control flex-1 p-[0.25em]"
            value={nameInput}
            placeholder="SNAPSHOT NAME"
            maxLength={40}
            onChange={(e) => setNameInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleCapture()}
          />
          <C64Button
            onClick={handleCapture}
            disabled={createSnapshot.isPending}
            className="p-[0.25em_0.5em]"
          >
            {createSnapshot.isPending ? "CAPTURING..." : "SNAPSHOT"}
          </C64Button>
        </div>

        {/* Snapshot list */}
        {snapshots.isLoading && (
          <div className="text-c64-11-dark-grey">
            <span className="animate-c64-cursor">{"\u2588"}</span> LOADING...
          </div>
        )}

        {list.length === 0 && !snapshots.isLoading && (
          <div className="text-c64-11-dark-grey">NO SNAPSHOTS YET</div>
        )}

        {list.map((snap) => (
          <div key={snap.id} className="flex items-center gap-[1ch]">
            <span className="flex-1 truncate">{snap.name}</span>
            <span className="text-c64-11-dark-grey">{formatSize(snap.size)}</span>
            <span className="text-c64-11-dark-grey">{formatDate(snap.createdAt)}</span>
            <C64Button
              variant="danger"
              onClick={() => handleDelete(snap)}
              disabled={deleteSnapshot.isPending}
              className="p-[0.25em_0.5em]"
            >
              DEL
            </C64Button>
          </div>
        ))}

        {/* Compare controls */}
        {list.length >= 2 && (
          <div className="flex flex-col gap-[0.5em] mt-[0.5em]">
            <span className="text-c64-15-light-grey">COMPARE:</span>
            <div className="flex items-center gap-[1ch]">
              <select
                className="c64-control cursor-pointer appearance-none flex-1 p-[0.25em]"
                value={compareA}
                onChange={(e) => setCompareA(e.target.value)}
              >
                <option value="">-- SELECT A --</option>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <span className="text-c64-15-light-grey">VS</span>
              <select
                className="c64-control cursor-pointer appearance-none flex-1 p-[0.25em]"
                value={compareB}
                onChange={(e) => setCompareB(e.target.value)}
              >
                <option value="">-- SELECT B --</option>
                {list.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-[1ch]">
              <C64Button
                onClick={handleCompare}
                disabled={!compareA || !compareB || compareA === compareB}
                className="p-[0.25em_0.5em]"
              >
                DIFF
              </C64Button>
              {onClearDiff && (
                <C64Button
                  onClick={onClearDiff}
                  className="p-[0.25em_0.5em]"
                >
                  CLEAR DIFF
                </C64Button>
              )}
            </div>
          </div>
        )}
      </div>
    </C64Box>
  );
}
