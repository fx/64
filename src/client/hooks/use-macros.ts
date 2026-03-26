import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { getErrorMessage } from "../lib/api-error.ts";

export function useMacros() {
  return useQuery({
    queryKey: ["macros"],
    queryFn: async () => {
      const res = await api.macros.$get();
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to fetch macros"));
      return res.json();
    },
  });
}

export function useCreateMacro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      description?: string;
      steps: unknown[];
    }) => {
      const res = await api.macros.$post({ json: body as any });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to create macro"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
    },
  });
}

export function useUpdateMacro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      steps?: unknown[];
    }) => {
      const res = await api.macros[":id"].$put({
        param: { id },
        json: body as any,
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to update macro"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
    },
  });
}

export function useDeleteMacro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.macros[":id"].$delete({ param: { id } });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to delete macro"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
    },
  });
}

export function useExecuteMacro() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ macroId, deviceId }: { macroId: string; deviceId: string }) => {
      const res = await api.macros[":id"].execute.$post({
        param: { id: macroId },
        json: { deviceId } as any,
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to execute macro"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macroExecutions"] });
    },
  });
}

export function useExecutions() {
  return useQuery({
    queryKey: ["macroExecutions"],
    queryFn: async () => {
      const res = await api.macros.executions.$get();
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to fetch executions"));
      return res.json();
    },
    refetchInterval: 3000,
  });
}

export function useCancelExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (execId: string) => {
      const res = await api.macros.executions[":execId"].cancel.$post({
        param: { execId },
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to cancel execution"));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macroExecutions"] });
    },
  });
}
