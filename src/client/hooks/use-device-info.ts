import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";

export function useDevice(deviceId: string) {
  return useQuery({
    queryKey: ["devices", deviceId],
    queryFn: async () => {
      const res = await api.devices[":id"].$get({ param: { id: deviceId } });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err?.error || "Failed to fetch device");
      }
      return res.json();
    },
  });
}

export function useDeviceInfo(deviceId: string) {
  return useQuery({
    queryKey: ["devices", deviceId, "info"],
    queryFn: async () => {
      const res = await api.devices[":deviceId"].v1.info.$get({
        param: { deviceId },
      });
      if (!res.ok) {
        const err = (await res.json()) as { errors?: string[] };
        throw new Error(err?.errors?.[0] || "Failed to fetch device info");
      }
      const data = await res.json();
      if (data.errors?.length) {
        throw new Error(data.errors[0]);
      }
      return data;
    },
  });
}

export function useDriveStatus(deviceId: string) {
  return useQuery({
    queryKey: ["devices", deviceId, "drives"],
    queryFn: async () => {
      const res = await api.devices[":deviceId"].v1.drives.$get({
        param: { deviceId },
      });
      if (!res.ok) {
        const err = (await res.json()) as { errors?: string[] };
        throw new Error(err?.errors?.[0] || "Failed to fetch drive status");
      }
      const data = await res.json();
      if (data.errors?.length) {
        throw new Error(data.errors[0]);
      }
      return data;
    },
  });
}
