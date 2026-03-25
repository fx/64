import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.ts";
import { C64Box } from "../components/ui/c64-box.tsx";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const res = await api.health.$get();
      return res.json();
    },
  });

  return (
    <div className="p-4">
      <C64Box title="COMMODORE 64 BASIC V2">
        <p>64K RAM SYSTEM  38911 BASIC BYTES FREE</p>
        <p>&nbsp;</p>
        <p>READY.</p>
        <p>
          {healthQuery.isLoading && (
            <span className="animate-c64-cursor">{"\u2588"}</span>
          )}
          {healthQuery.isSuccess && (
            <>
              <span>SYSTEM STATUS: {healthQuery.data.status.toUpperCase()}</span>
            </>
          )}
          {healthQuery.isError && (
            <span className="text-c64-2-red">?SYSTEM ERROR</span>
          )}
        </p>
      </C64Box>
    </div>
  );
}
