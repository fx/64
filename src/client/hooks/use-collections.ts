import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.ts";

async function getErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const clone = res.clone();
    const body = (await clone.json()) as { error?: string };
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

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await api.collections.$get();
      if (!res.ok)
        throw new Error(
          await getErrorMessage(res, "Failed to fetch collections"),
        );
      return res.json();
    },
  });
}

export function useCollection(id: string) {
  return useQuery({
    queryKey: ["collections", id],
    queryFn: async () => {
      const res = await api.collections[":id"].$get({ param: { id } });
      if (!res.ok)
        throw new Error(
          await getErrorMessage(res, "Failed to fetch collection"),
        );
      return res.json();
    },
    enabled: !!id,
  });
}

export function useCreateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: {
      name: string;
      description?: string;
      disks: Array<{
        label: string;
        path: string;
        drive: "a" | "b";
        type?: string;
      }>;
    }) => {
      const res = await api.collections.$post({ json: body });
      if (!res.ok)
        throw new Error(
          await getErrorMessage(res, "Failed to create collection"),
        );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useUpdateCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      disks?: Array<{
        label: string;
        path: string;
        drive: "a" | "b";
        type?: string;
      }>;
    }) => {
      const res = await api.collections[":id"].$put({
        param: { id },
        json: body,
      });
      if (!res.ok)
        throw new Error(
          await getErrorMessage(res, "Failed to update collection"),
        );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useDeleteCollection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.collections[":id"].$delete({ param: { id } });
      if (!res.ok)
        throw new Error(
          await getErrorMessage(res, "Failed to delete collection"),
        );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
    },
  });
}

export function useFlipDisk() {
  return useMutation({
    mutationFn: async ({
      id,
      deviceId,
      slot,
      direction,
    }: {
      id: string;
      deviceId: string;
      slot?: number;
      direction?: "prev";
    }) => {
      const query: Record<string, string> = { deviceId };
      if (slot !== undefined) query.slot = String(slot);
      if (direction) query.direction = direction;

      const res = await api.collections[":id"].flip.$post({
        param: { id },
        query,
      });
      if (!res.ok)
        throw new Error(await getErrorMessage(res, "Flip failed"));
      return res.json();
    },
  });
}
