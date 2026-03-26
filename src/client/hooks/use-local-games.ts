import { useQuery } from "@tanstack/react-query";
import { api, getErrorMessage } from "../lib/api.ts";

export interface GameFile {
  name: string;
  size: number;
  modified: string;
}

export function useLocalGames() {
  return useQuery({
    queryKey: ["localGames"],
    queryFn: async () => {
      const res = await api.games.$get();
      if (!res.ok) throw new Error(await getErrorMessage(res, "Failed to fetch games"));
      const data = await res.json();
      return data.files as GameFile[];
    },
  });
}
