"use client";

import { useDriverPresenceStore, type DriverPresenceStatus } from "@/store/driverPresence.store";

const appearance: Record<DriverPresenceStatus, { color: string; label: string }> = {
  online: { color: "bg-green-500", label: "Online — driver app connected" },
  offline: { color: "bg-red-500", label: "Offline — driver app disconnected" },
  not_setup: { color: "bg-gray-400", label: "Mobile not set up — no activation code generated" },
  unknown: { color: "bg-transparent border border-gray-400", label: "Connection status unavailable" },
};

export default function DriverPresenceIndicator({ driverId }: { driverId?: number }) {
  const status = useDriverPresenceStore(state => driverId == null ? "unknown" : state.statuses[driverId] || "unknown");
  const { color, label } = appearance[status];
  return <span role="img" aria-label={label} title={label}
    data-driver-presence={status} className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />;
}
