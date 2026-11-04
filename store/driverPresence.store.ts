import { create } from "zustand";
import apiClient from "@/config/apiClient.config";

export type DriverPresenceStatus = "online" | "offline" | "not_setup" | "unknown";
export interface DriverPresence { driver_id: number; status: DriverPresenceStatus }

interface DriverPresenceState {
  tenantId: string | null;
  statuses: Record<number, DriverPresenceStatus>;
  versions: Record<number, number>;
  setTenant: (tenantId: string | null) => void;
  refresh: () => Promise<void>;
  update: (tenantId: string | number, entry: DriverPresence) => void;
  markUnavailable: () => void;
}

let requestSequence = 0;
let tenantGeneration = 0;
const validStatuses = new Set(["online", "offline", "not_setup", "unknown"]);

export const useDriverPresenceStore = create<DriverPresenceState>((set, get) => ({
  tenantId: null, statuses: {}, versions: {},
  setTenant: tenantId => {
    if (get().tenantId === tenantId) return;
    tenantGeneration++;
    set({ tenantId, statuses: {}, versions: {} });
  },
  refresh: async () => {
    const { tenantId, versions } = get();
    if (!tenantId) return;
    const generation = tenantGeneration;
    const request = ++requestSequence;
    try {
      const response = await apiClient.get<DriverPresence[]>("/driver/presence");
      if (generation !== tenantGeneration || request !== requestSequence) return;
      set(state => {
        const statuses = Object.fromEntries(response.data
          .filter(entry => validStatuses.has(entry.status))
          .map(entry => [entry.driver_id, entry.status]));
        for (const [id, version] of Object.entries(state.versions)) {
          if (version !== versions[Number(id)]) statuses[Number(id)] = state.statuses[Number(id)];
        }
        return { statuses };
      });
    } catch {
      if (generation === tenantGeneration && request === requestSequence) get().markUnavailable();
    }
  },
  update: (tenantId, entry) => {
    if (get().tenantId !== String(tenantId) || !validStatuses.has(entry.status)) return;
    set(state => ({ statuses: { ...state.statuses, [entry.driver_id]: entry.status },
      versions: { ...state.versions, [entry.driver_id]: (state.versions[entry.driver_id] || 0) + 1 } }));
  },
  markUnavailable: () => set(state => ({ statuses: Object.fromEntries(Object.entries(state.statuses)
    .map(([id, status]) => [id, status === "not_setup" ? status : "unknown"])) })),
}));
