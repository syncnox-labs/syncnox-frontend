import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";
import { useOptimizationStore } from "@/store/optimization.store";
import { JobStatus } from "@/types/job.type";

function getWsUrl(tenantId: string | number, token: string): string {
  const rawUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8000";
  const wsBase = rawUrl
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://");
  return `${wsBase}/ws/dispatch/${tenantId}?token=${encodeURIComponent(token)}`;
}

export function useDispatchSocket() {
  const { data: session } = useSession();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  const updateJobStatusLocally = useJobsStore((s) => s.updateJobStatusLocally);
  const updateStopStatusLocally = useRouteStore((s) => s.updateStopStatusLocally);
  const fetchRoutes = useRouteStore((s) => s.fetchRoutes);
  const selectedStatus = useRouteStore((s) => s.selectedStatus);

  useEffect(() => {
    const tenantId = session?.user?.tenant_id;
    const token = (session as any)?.access_token;

    if (!tenantId || !token) return;

    let isMounted = true;
    let delay = 1000;

    function connect() {
      if (!isMounted) return;
      const url = getWsUrl(tenantId!, token!);

      console.log(`[WS Dispatch] Connecting to ${url}`);

      try {
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[WS Dispatch] Connected to dispatch channel ✓");
          delay = 1000;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "stop_updated") {
              console.log("[WS Dispatch] Real-time stop_updated received:", data);

              // 1. Update job status locally in jobs store (updates plan / jobs views)
              if (data.job_id && data.job_status && updateJobStatusLocally) {
                updateJobStatusLocally(data.job_id, data.job_status as JobStatus);
              }

              // 2. Update stop status locally in routes store (updates timeline / tracking views)
              if (data.route_id && data.stop_id && data.new_status && updateStopStatusLocally) {
                updateStopStatusLocally(data.route_id, data.stop_id, data.new_status);
              }

              // 3. Silently refetch routes to sync progress bars and server state
              if (fetchRoutes) {
                fetchRoutes(selectedStatus === "all" ? undefined : selectedStatus);
              }
            } else if (data.event === "optimization_updated") {
              console.log("[WS Dispatch] Real-time optimization_updated received:", data);
              const { setOptimizationResult } = useOptimizationStore.getState();
              if (setOptimizationResult) {
                setOptimizationResult(data.status, data.result, data.error_message);
              }
            }
          } catch (e) {
            console.error("[WS Dispatch] Error parsing WebSocket message:", e);
          }
        };

        ws.onclose = () => {
          console.log(`[WS Dispatch] Channel closed. Reconnecting in ${delay}ms...`);
          if (!isMounted) return;
          reconnectTimer.current = setTimeout(() => {
            delay = Math.min(delay * 2, 30000);
            connect();
          }, delay);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        console.error("[WS Dispatch] Failed to connect WebSocket:", e);
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [session, updateJobStatusLocally, updateStopStatusLocally, fetchRoutes, selectedStatus]);
}
