type OptimizationGoal = "minimum_time" | "minimum_distance";

type OptimizationStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed"
  | "success";

export interface Stop {
  id?: number | string;
  job_id: number | null;
  stop_type: string;
  arrival_time: string;
  latitude: number;
  longitude: number;
  address_formatted: string;
  time_to_next_stop_seconds?: number;
  distance_to_next_stop_meters?: number;
}

export interface Routes {
  stops: Stop[];
  vehicle_id: number;
  /** Real vehicle name resolved backend-side (avoids stale driver.vehicle labels). */
  vehicle_name?: string | null;
  /** Real seat capacity resolved backend-side from load_constraints. */
  vehicle_capacity?: number | null;
  route_polyline: string;
  team_member_id: number;
  team_member_name: string;
  total_distance_meters: number;
  total_duration_seconds: number;
  /** Worker-shuttle routes only: "GO" (home → client) or "RETURN". */
  leg?: string;
}

export interface UnassignedJob {
  job_id: number;
  job_name?: string;
  worker_name?: string;
  reason: string;
  reason_code?: string;
  suggested_actions?: string[];
  scheduled_time?: string;
  address_formatted?: string;
}

interface RouteResult {
  routes: Routes[];
  status: OptimizationStatus;
  generated_at: string;
  optimization_goal: OptimizationGoal;
  unassigned_jobs: UnassignedJob[];
  total_distance_meters: number;
  total_duration_seconds: number;
}

export interface Route {
  id: number;
  tenant_id: number;
  route_name: string;
  depot_id: number;
  job_ids: number[];
  team_member_ids: number[];
  scheduled_date: string;
  optimization_goal: OptimizationGoal;
  status: OptimizationStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  result: RouteResult;
  created_at: string;
  updated_at: string;
}

interface TeamMember {
  id: number;
  name: string;
  avatar_url: string;
}

export interface AllRoutes {
  id: number;
  optimization_id: number;
  name: string;
  status: string;
  total_distance: number;
  total_time: number;
  total_stops: number;
  completed_stops: number;
  failed_stops: number;
  attempted_stops: number;
  rating: number;
  scheduled_date: string;
  assigned_team_members: TeamMember[];
  progress_percentage: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────
// Route Operations
// ─────────────────────────────────────────────

export interface RouteOperationResponse {
  success: boolean;
  message: string;
}
