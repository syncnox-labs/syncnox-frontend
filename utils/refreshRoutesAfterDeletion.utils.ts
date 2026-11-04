import { useOptimizationStore } from "@/store/optimization.store";
import { useRouteStore } from "@/store/routes.store";

export async function refreshRoutesAfterDeletion() {
  const { currentOptimization, fetchOptimization } = useOptimizationStore.getState();
  await Promise.allSettled([
    useRouteStore.getState().refreshRoutes(),
    ...(currentOptimization ? [fetchOptimization(currentOptimization.id)] : []),
  ]);
}
