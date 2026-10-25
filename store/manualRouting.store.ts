import { create } from "zustand";
import type { ManualRoutingRequest } from "@/apis/manualRouting.api";

export interface ManualRoutingIntent {
  planId: number;
  action: ManualRoutingRequest["action"];
  jobIds?: number[];
  routeIndex?: number;
  driverId?: number;
  driverName?: string;
  placement?: ManualRoutingRequest["placement"];
}
export const useManualRoutingStore = create<{
  intent: ManualRoutingIntent | null;
  open: (intent: ManualRoutingIntent) => void;
  close: () => void;
}>((set) => ({ intent: null, open: (intent) => set({ intent }), close: () => set({ intent: null }) }));
