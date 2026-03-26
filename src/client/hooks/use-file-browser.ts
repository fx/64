import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  fileType?: string;
}

interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: DirectoryEntry[];
  errors: string[];
}

export type { DirectoryEntry, DirectoryListing };

export function useFileListing(deviceId: string, path: string) {
  return useQuery({
    queryKey: ["devices", deviceId, "files", path],
    queryFn: async (): Promise<DirectoryListing> => {
      const res = await fetch(
        `/api/devices/${deviceId}/files?path=${encodeURIComponent(path)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string })?.error || "Failed to list directory",
        );
      }
      return res.json();
    },
  });
}

export function useFileUpload(deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      file,
      targetDir,
    }: {
      file: File;
      targetDir: string;
    }) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(
        `/api/devices/${deviceId}/files/upload?path=${encodeURIComponent(targetDir)}`,
        { method: "POST", body: form },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string })?.error || "Upload failed",
        );
      }
      return res.json() as Promise<{ uploaded: string[]; errors: string[] }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["devices", deviceId, "files"],
      });
    },
  });
}

export function useFileDelete(deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (filePath: string) => {
      const res = await fetch(
        `/api/devices/${deviceId}/files?path=${encodeURIComponent(filePath)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string })?.error || "Delete failed",
        );
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["devices", deviceId, "files"],
      });
    },
  });
}

export function downloadFile(deviceId: string, filePath: string) {
  const url = `/api/devices/${deviceId}/files/download?path=${encodeURIComponent(filePath)}`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filePath.split("/").pop() || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
