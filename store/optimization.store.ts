import { create } from "zustand";
import { useEffect } from "react";
import {
  createOptimizationRequest,
  getOptimizationRequest,
  updateOptimizationRequest,
  reOptimizeRequest,
  CreateOptimizationRequestPayload,
  UpdateOptimizationRequestPayload,
} from "@/apis/routes.api";
import { Route } from "@/types/routes.type";
import { formatOptimizationError } from "@/utils/optimizationError.utils";

interface OptimizationStore {
  currentOptimization: Route | null;
  isOptimizing: boolean;
  error: string | null;

  // Actions
  startOptimization: (
    payload: CreateOptimizationRequestPayload
  ) => Promise<Route>;
  setOptimizationResult: (
    status: string,
    result?: any,
    errorMessage?: string
  ) => void;
  clearOptimization: () => void;
  fetchOptimization: (id: number) => Promise<Route>;
  updateOptimization: (
    id: number,
    payload: UpdateOptimizationRequestPayload
  ) => Promise<Route>;
  reOptimize: (id: number) => Promise<Route>;
  waitUntilComplete: (id: number, timeoutMs?: number) => Promise<Route>;
}

export const useOptimizationStore = create<OptimizationStore>((set, get) => ({
  currentOptimization: null,
  isOptimizing: false,
  error: null,

  startOptimization: async (payload: CreateOptimizationRequestPayload) => {
    try {
      set({ error: null, isOptimizing: true });
      const optimization = await createOptimizationRequest(payload);
      set({ currentOptimization: optimization });
      return optimization;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to create optimization request";
      set({ error: errorMessage, isOptimizing: false });
      throw new Error(errorMessage);
    }
  },

  setOptimizationResult: (status: string, result?: any, errorMessage?: string) => {
    const { currentOptimization } = get();
    if (currentOptimization) {
      const formattedError = errorMessage ? formatOptimizationError(errorMessage) : null;
      if (status === "completed" || status === "success") {
        set({
          currentOptimization: {
            ...currentOptimization,
            status: "completed",
            error_message: formattedError,
            result: result || currentOptimization.result,
          },
          isOptimizing: false,
          error: formattedError,
        });
      } else if (status === "failed") {
        set({
          currentOptimization: {
            ...currentOptimization,
            status: "failed",
            error_message: formattedError || "Optimization failed",
          },
          isOptimizing: false,
          error: formattedError || "Optimization failed",
        });
      } else if (status === "processing" || status === "queued") {
        set({
          currentOptimization: {
            ...currentOptimization,
            status: status as any,
            error_message: null,
          },
          isOptimizing: true,
          error: null,
        });
      }
    }
  },

  clearOptimization: () => {
    set({
      currentOptimization: null,
      error: null,
      isOptimizing: false,
    });
  },

  fetchOptimization: async (id: number) => {
    try {
      // Keep the current issue visible until the refreshed state replaces it.
      const snapshot = get().currentOptimization;
      const optimization = await getOptimizationRequest(id);
      // A WebSocket update or navigation may have overtaken this request.
      if (get().currentOptimization !== snapshot) return optimization;
      set({
        currentOptimization: optimization,
        isOptimizing: optimization.status === "processing" || optimization.status === "queued",
        error: optimization.error_message ? formatOptimizationError(optimization.error_message) : null,
      });
      return optimization;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to fetch optimization";
      set({ error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  updateOptimization: async (
    id: number,
    payload: UpdateOptimizationRequestPayload
  ) => {
    try {
      set({ error: null });
      const optimization = await updateOptimizationRequest(id, payload);
      set({ currentOptimization: optimization });
      return optimization;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to update optimization";
      set({ error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  reOptimize: async (id: number) => {
    try {
      get().setOptimizationResult("processing");
      const optimization = await reOptimizeRequest(id);
      if (get().isOptimizing && get().currentOptimization?.id === id) {
        set({ currentOptimization: optimization });
      }
      return optimization;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to re-optimize";
      // Enqueue failures leave the previous plan intact on the server.
      if (get().currentOptimization?.id === id) {
        await get().fetchOptimization(id).catch(() => {});
      }
      set({ error: errorMessage, isOptimizing: false });
      throw new Error(errorMessage);
    }
  },

  // Completion comes from the shared dispatch WebSocket, with no recurring GETs.
  waitUntilComplete: (id: number, timeoutMs = 10 * 60 * 1000) =>
    new Promise<Route>((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        const error = "Re-optimization timed out. Please refresh.";
        if (get().currentOptimization?.id === id) set({ isOptimizing: false, error });
        reject(new Error(error));
      }, timeoutMs);
      const check = (state: OptimizationStore) => {
        const optimization = state.currentOptimization;
        if (!optimization || optimization.id !== id) {
          clearTimeout(timer);
          unsubscribe();
          reject(new Error("Optimization view changed"));
          return;
        }
        if (optimization.status !== "completed" && optimization.status !== "failed") return;
        clearTimeout(timer);
        unsubscribe();
        const rawError = optimization.error_message ||
          (optimization.status === "failed" ? "Re-optimization failed" : null);
        if (rawError) reject(new Error(formatOptimizationError(rawError)));
        else resolve(optimization);
      };
      unsubscribe = useOptimizationStore.subscribe(check);
      // Also catches events that arrived while the enqueue request was in flight.
      check(get());
    }),
}));

export const useOptimizationCleanup = () => {
  const clearOptimization = useOptimizationStore(
    (state) => state.clearOptimization
  );

  useEffect(() => {
    return () => {
      clearOptimization();
    };
  }, [clearOptimization]);
};
