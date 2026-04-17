import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const MEMORY_BASE = "/api/devices";

/**
 * Read a block of memory from a device.
 * Returns raw Uint8Array of bytes.
 */
export function useMemoryRead(deviceId: string, address: number, length: number) {
  return useQuery({
    queryKey: ["devices", deviceId, "memory", address, length],
    queryFn: async () => {
      const addr = address.toString(16).toUpperCase().padStart(4, "0");
      const res = await fetch(
        `${MEMORY_BASE}/${deviceId}/memory?address=${addr}&length=${length}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          (body as { errors?: string[] })?.errors?.[0] ||
          `Memory read failed: HTTP ${res.status}`;
        throw new Error(msg);
      }
      return new Uint8Array(await res.arrayBuffer());
    },
    enabled: length > 0,
  });
}

/**
 * Write bytes to device memory.
 * Input: { address: hex string, data: hex string }
 */
export function useMemoryWrite(deviceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { address: string; data: string }) => {
      const res = await fetch(`${MEMORY_BASE}/${deviceId}/memory`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg =
          (body as { errors?: string[] })?.errors?.[0] ||
          `Memory write failed: HTTP ${res.status}`;
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["devices", deviceId, "memory"],
      });
    },
  });
}
