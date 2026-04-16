import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "../lib/api.ts";

export interface LibraryFile {
  name: string;
  size: number;
  modified: string;
  type: string;
}

export function useLibrary() {
  return useQuery({
    queryKey: ["library"],
    queryFn: async () => {
      const res = await api.library.$get();
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to fetch library"));
      const data = await res.json();
      return data.files as LibraryFile[];
    },
  });
}
