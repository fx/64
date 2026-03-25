import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";

async function getErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const clone = res.clone();
    const body = await clone.json() as { error?: string };
    return body?.error || fallback;
  } catch {
    try {
      const clone = res.clone();
      const text = await clone.text();
      return text || fallback;
    } catch {
      return fallback;
    }
  }
}

export function useDevices() {
  return useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const res = await api.devices.$get();
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to fetch devices"));
      return res.json();
    },
  });
}

export function useRegisterDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      ip: string;
      name?: string;
      password?: string;
    }) => {
      const res = await api.devices.$post({ json: body });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Registration failed"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.devices[":id"].$delete({ param: { id } });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Delete failed"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });
}
