import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Snapshot, SnapshotDiff } from "@shared/types.ts";

const SNAPSHOTS_BASE = "/api/devices";

export function useSnapshots(deviceId: string) {
  return useQuery({
    queryKey: ["devices", deviceId, "snapshots"],
    queryFn: async () => {
      const res = await fetch(`${SNAPSHOTS_BASE}/${deviceId}/snapshots`);
      if (!res.ok) {
        throw new Error("Failed to list snapshots");
      }
      return res.json() as Promise<Snapshot[]>;
    },
  });
}

export function useCreateSnapshot(deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${SNAPSHOTS_BASE}/${deviceId}/snapshots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          (body as { errors?: string[] })?.errors?.[0] ||
          `Snapshot capture failed: HTTP ${res.status}`;
        throw new Error(msg);
      }
      return res.json() as Promise<Snapshot>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["devices", deviceId, "snapshots"],
      });
    },
  });
}

export function useDeleteSnapshot(deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (snapshotId: string) => {
      const res = await fetch(`${SNAPSHOTS_BASE}/${deviceId}/snapshots/${snapshotId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to delete snapshot");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["devices", deviceId, "snapshots"],
      });
    },
  });
}

export function useSnapshotDiff(deviceId: string, snapshotId: string | null, againstId: string | null) {
  return useQuery({
    queryKey: ["devices", deviceId, "snapshots", snapshotId, "diff", againstId],
    queryFn: async () => {
      const res = await fetch(
        `${SNAPSHOTS_BASE}/${deviceId}/snapshots/${snapshotId}/diff?against=${againstId}`,
      );
      if (!res.ok) {
        throw new Error("Failed to diff snapshots");
      }
      return res.json() as Promise<SnapshotDiff>;
    },
    enabled: !!snapshotId && !!againstId && snapshotId !== againstId,
  });
}

export function useSnapshotData(deviceId: string, snapshotId: string | null) {
  return useQuery({
    queryKey: ["devices", deviceId, "snapshots", snapshotId, "data"],
    queryFn: async () => {
      const res = await fetch(
        `${SNAPSHOTS_BASE}/${deviceId}/snapshots/${snapshotId}/data`,
      );
      if (!res.ok) {
        throw new Error("Failed to download snapshot data");
      }
      return new Uint8Array(await res.arrayBuffer());
    },
    enabled: !!snapshotId,
  });
}
