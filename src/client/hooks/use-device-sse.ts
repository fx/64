import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const MIN_RECONNECT_MS = 1_000;
const MAX_RECONNECT_MS = 30_000;

export function useDeviceSSE(deviceId: string): void {
  const queryClient = useQueryClient();
  const reconnectDelay = useRef(MIN_RECONNECT_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      es = new EventSource(`/api/events/devices/${deviceId}`);

      es.addEventListener("drives", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          queryClient.setQueryData(["devices", deviceId, "drives"], data);
        } catch { /* ignore malformed data */ }
      });

      es.addEventListener("info", (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          queryClient.setQueryData(["devices", deviceId, "info"], data);
        } catch { /* ignore malformed data */ }
      });

      es.addEventListener("offline", () => {
        queryClient.invalidateQueries({ queryKey: ["devices", deviceId] });
      });

      es.addEventListener("online", () => {
        queryClient.invalidateQueries({ queryKey: ["devices", deviceId] });
      });

      es.onopen = () => {
        reconnectDelay.current = MIN_RECONNECT_MS;
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (!closed && !reconnectTimer.current) {
          reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = undefined;
            connect();
          }, reconnectDelay.current);
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, MAX_RECONNECT_MS);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      es?.close();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [deviceId, queryClient]);
}
