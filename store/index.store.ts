import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import apiClient from "@/config/apiClient.config";

export interface User {
  id: string;
  email: string;
  tenant_id: string;
}

export type TabKey =
  | "dashboard"
  | "jobs"
  | "routes"
  | "schedule" // /dashboard tabs
  | "add-jobs"
  | "unassigned-jobs" // /plan tabs
  | "team"
  | "vehicle" // /insights & /analytics tabs
  | "optimization"
  | "reports"
  | "api" // /schedule tabs
  | "depot"
  | "location_mapping"
  | "location";

interface UserState {
  user: User | null;
  isAuthenticated: boolean;
  currentTab: TabKey;
  sidebarNavigation: boolean;
  activeJobTemplate: string | null;
  setUser: (user: User) => void;
  clearUser: () => void;
  setCurrentTab: (tab: TabKey) => void;
  resetTab: (defaultTab: TabKey) => void;
  setSidebarNavigation: (value: boolean) => void;
  setActiveJobTemplate: (template: string) => void;
  updateActiveJobTemplate: (template: string) => Promise<void>;
  fetchTenant: () => Promise<void>;
}

export const useIndexStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      currentTab: "dashboard",
      sidebarNavigation: false,
      activeJobTemplate: null,
      setUser: (user) => set({ user, isAuthenticated: true }),
      clearUser: () => set({ user: null, isAuthenticated: false }),
      setCurrentTab: (tab) => set({ currentTab: tab }),
      resetTab: (defaultTab) => set({ currentTab: defaultTab }),
      setSidebarNavigation: (value) => set({ sidebarNavigation: value }),
      setActiveJobTemplate: (template) => set({ activeJobTemplate: template }),
      updateActiveJobTemplate: async (template) => {
        try {
          const response = await apiClient.patch("/tenant", {
            active_job_template: template
          });
          if (response.status === 200 || response.status === 204) {
            set({ activeJobTemplate: template });
          }
        } catch (error) {
          console.error("Failed to update active job template", error);
        }
      },
      fetchTenant: async () => {
        try {
          const response = await apiClient.get("/tenant");
          if (response.data && response.data.active_job_template) {
            set({ activeJobTemplate: response.data.active_job_template });
          }
        } catch (error) {
          console.error("Failed to fetch tenant info", error);
        }
      },
    }),
    {
      name: "user-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        currentTab: state.currentTab,
        activeJobTemplate: state.activeJobTemplate,
      }),
    }
  )
);
