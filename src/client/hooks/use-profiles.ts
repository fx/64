import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, getErrorMessage } from "../lib/api.ts";

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const res = await api.profiles.$get();
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to fetch profiles"));
      return res.json();
    },
  });
}

export function useProfile(id: string) {
  return useQuery({
    queryKey: ["profiles", id],
    queryFn: async () => {
      const res = await api.profiles[":id"].$get({ param: { id } });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to fetch profile"));
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      description?: string;
      deviceProduct?: string;
      config: Record<string, Record<string, string | number>>;
    }) => {
      const res = await api.profiles.$post({ json: body });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to create profile"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      deviceProduct?: string;
      config?: Record<string, Record<string, string | number>>;
    }) => {
      const res = await api.profiles[":id"].$put({
        param: { id },
        json: body,
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to update profile"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.profiles[":id"].$delete({ param: { id } });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to delete profile"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useCaptureProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { deviceId: string; name: string }) => {
      const res = await api.profiles.capture.$post({ json: body });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to capture profile"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}

export function useApplyProfile() {
  return useMutation({
    mutationFn: async ({
      id,
      deviceId,
      saveToFlash,
    }: {
      id: string;
      deviceId: string;
      saveToFlash?: boolean;
    }) => {
      const res = await api.profiles[":id"].apply.$post({
        param: { id },
        json: { deviceId, saveToFlash },
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to apply profile"));
      return res.json();
    },
  });
}

export function useProfileDiff(
  id: string,
  params: { against?: string; deviceId?: string },
) {
  const query: Record<string, string> = {};
  if (params.against) query.against = params.against;
  if (params.deviceId) query.deviceId = params.deviceId;

  return useQuery({
    queryKey: ["profiles", id, "diff", params],
    queryFn: async () => {
      const res = await api.profiles[":id"].diff.$get({
        param: { id },
        query,
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to fetch diff"));
      return res.json();
    },
    enabled: !!id && !!(params.against || params.deviceId),
  });
}

export function useExportProfile() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.profiles[":id"].export.$get({ param: { id } });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to export profile"));
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="(.+)"/);
      const filename = match?.[1] ?? "profile.json";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
}

export function useImportProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await api.profiles.import.$post({ json: data });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Failed to import profile"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    },
  });
}
