import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { AllRoutes, Route } from "@/types/routes.type";
import { fetchRoutes, deleteOptimizationRequest, deleteRouteApi, deleteRoutesBulkApi } from "@/apis/routes.api";

interface RouteStore {
  routes: AllRoutes[];
  currentRoute: Route | null;
  isLoading: boolean;
  error: string | null;
  fetchRoutes: (status?: string) => Promise<void>;
  initializeRoutes: () => Promise<void>;
  hasFetched: boolean;
  selectedStatus: string;
  setSelectedStatus: (status: string) => void;
  setCurrentRoute: (route: Route | null) => void;
  updateRoute: (route: Route) => void;
  updateStopStatusLocally: (routeId: number, stopId: number, stopStatus: string) => void;
  deleteRoute: (id: number) => Promise<void>;
  deleteRoutesBulk: (ids: number[]) => Promise<void>;
}

export const useRouteStore = create(
  devtools(
    immer<RouteStore>((set, get) => ({
      routes: [],
      currentRoute: null,
      isLoading: false,
      error: null,
      hasFetched: false,
      selectedStatus: "scheduled",

      fetchRoutes: async (status?: string) => {
        set({ isLoading: true });
        try {
          const routes = await fetchRoutes(status);
          set({ routes });
          set({ hasFetched: true });
        } catch (error) {
          set({ error: error as string });
        } finally {
          set({ isLoading: false });
        }
      },
      initializeRoutes: async () => {
        const { hasFetched, isLoading, selectedStatus } = get();
        if (hasFetched || isLoading) return;
        await get().fetchRoutes(selectedStatus === "all" ? undefined : selectedStatus);
      },
      setSelectedStatus: (status: string) => {
        set({ selectedStatus: status });
        get().fetchRoutes(status === "all" ? undefined : status);
      },
      setCurrentRoute: (route: Route | null) => set({ currentRoute: route }),
      updateRoute: (updatedRoute: Route) => {
        set((state) => {
          const index = state.routes.findIndex((r) => r.id === updatedRoute.id);
          if (index !== -1) {
            state.routes[index] = {
              ...state.routes[index],
              ["name"]: updatedRoute.route_name,
            };
          }
          if (state.currentRoute?.id === updatedRoute.id) {
            state.currentRoute = { ...state.currentRoute, ...updatedRoute };
          }
        });
      },
      updateStopStatusLocally: (routeId: number, stopId: number, stopStatus: string) => {
        set((state) => {
          // Update summary in state.routes (AllRoutes[])
          const routeIndex = state.routes.findIndex((r) => r.id === routeId || r.optimization_id === routeId);
          if (routeIndex !== -1) {
            const target = state.routes[routeIndex];
            if (stopStatus === "completed") {
              target.completed_stops = (target.completed_stops || 0) + 1;
            } else if (stopStatus === "failed") {
              target.failed_stops = (target.failed_stops || 0) + 1;
            }
            target.attempted_stops = (target.attempted_stops || 0) + 1;
            if (target.total_stops > 0) {
              target.progress_percentage = Math.round((target.attempted_stops / target.total_stops) * 100);
            }
          }

          // Update detailed stops in state.currentRoute (Route | null)
          if (state.currentRoute && (state.currentRoute.id === routeId || (state.currentRoute as any).optimization_id === routeId)) {
            state.currentRoute.result?.routes?.forEach((r) => {
              r.stops?.forEach((s: any) => {
                if (s.id === stopId || s.job_id === stopId) {
                  s.status = stopStatus;
                  if (s.job) {
                    s.job.status = stopStatus;
                  }
                }
              });
            });
          }
        });
      },
      deleteRoute: async (id: number) => {
        try {
          await deleteRouteApi(id);
          set((state) => {
            state.routes = state.routes.filter((r) => r.id !== id);
            if (state.currentRoute?.id === id) {
              state.currentRoute = null;
            }
          });
        } catch (error) {
          try {
            await deleteOptimizationRequest(id);
            set((state) => {
              state.routes = state.routes.filter((r) => r.id !== id);
              if (state.currentRoute?.id === id) {
                state.currentRoute = null;
              }
            });
          } catch (err) {
            console.error("Failed to delete route:", err);
            throw err;
          }
        }
      },
      deleteRoutesBulk: async (ids: number[]) => {
        try {
          await deleteRoutesBulkApi(ids);
          set((state) => {
            const idSet = new Set(ids);
            state.routes = state.routes.filter((r) => !idSet.has(r.id));
            if (state.currentRoute && idSet.has(state.currentRoute.id)) {
              state.currentRoute = null;
            }
          });
        } catch (error) {
          console.error("Failed to bulk delete routes:", error);
          throw error;
        }
      },
    }))
  )
);
