import { useEffect } from "react";
import { useDriverPresenceStore } from "@/store/driverPresence.store";

export function useDriverPresence(tenantId: string | number | undefined) {
  useEffect(() => {
    const presence = useDriverPresenceStore.getState();
    presence.setTenant(tenantId == null ? null : String(tenantId));
    if (tenantId == null) return;
    void presence.refresh();
    const timer = setInterval(() => { void presence.refresh(); }, 15000);
    const reconcile = () => { if (document.visibilityState === "visible") void presence.refresh(); };
    document.addEventListener("visibilitychange", reconcile);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", reconcile);
      presence.setTenant(null);
    };
  }, [tenantId]);
}
