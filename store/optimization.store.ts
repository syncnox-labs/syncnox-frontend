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
  pollUntilComplete: (id: number, intervalMs?: number, maxAttempts?: number) => Promise<Route>;
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
      if (status === "completed" || status === "success") {
        set({
          currentOptimization: {
            ...currentOptimization,
            status: "completed",
            result: result || currentOptimization.result,
          },
          isOptimizing: false,
          error: null,
        });
      } else if (status === "failed") {
        set({
          currentOptimization: {
            ...currentOptimization,
            status: "failed",
            error_message: errorMessage || "Optimization failed",
          },
          isOptimizing: false,
          error: errorMessage || "Optimization failed",
        });
      } else if (status === "processing" || status === "queued") {
        set({
          currentOptimization: {
            ...currentOptimization,
            status: status as any,
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
      set({ error: null });
      const optimization = await getOptimizationRequest(id);
      set({ currentOptimization: optimization });
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
      set({ error: null, isOptimizing: true });
      const optimization = await reOptimizeRequest(id);
      set({ currentOptimization: optimization });
      return optimization;
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.detail ||
        error.message ||
        "Failed to re-optimize";
      set({ error: errorMessage, isOptimizing: false });
      throw new Error(errorMessage);
    }
  },

  pollUntilComplete: async (id: number, intervalMs = 2000, maxAttempts = 90) => {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      try {
        const optimization = await getOptimizationRequest(id);
        set({ currentOptimization: optimization });
        const status = optimization.status;
        if (status === "completed" || status === "failed") {
          set({ isOptimizing: false });
          if (status === "failed") {
            const errMsg = (optimization as any).error_message || "Re-optimization failed";
            set({ error: errMsg });
          } else {
            set({ error: null });
          }
          return optimization;
        }
      } catch (err: any) {
        // Network hiccup — keep polling
        console.warn("[pollUntilComplete] fetch error, retrying:", err?.message);
      }
    }
    // Timed out
    set({ isOptimizing: false, error: "Re-optimization timed out. Please refresh." });
    throw new Error("Polling timed out after max attempts");
  },
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
