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
  travel_time_to_next_stop_seconds?: number;
  service_duration_seconds?: number;
  waiting_time_to_next_stop_seconds?: number;
  waiting_position?: "left" | "right";
  manual_waiting?: boolean;
  leg?: "GO" | "RETURN";
  segment_type_to_next?: "team_leader_work" | "between_trips";
  is_new?: boolean;
  needs_optimization?: boolean;
  time_edited?: boolean;
  candidate_name?: string;
  passenger_count?: number;
  service_duration_minutes?: number;
}

export interface WorkingTimeExtension {
  driver_id: number;
  driver_name: string;
  request_id: number;
  service_date: string;
  approved: boolean;
  extra_seconds: number;
  extra_minutes: number;
  windows: { start_at: string; end_at: string }[];
  added_windows: { start_at: string; end_at: string }[];
}

export interface Routes {
  route_id?: number;
  operational_route_ids?: number[];
  name?: string;
  manual_route?: boolean;
  working_time_extension?: WorkingTimeExtension;
  is_shared?: boolean;
  planning_settings?: {
    start_point?: { lat: number; lng: number; address: string };
    end_point?: { lat: number; lng: number; address: string };
    start_at?: string | null;
    end_at?: string | null;
  };
  stops: Stop[];
  needs_optimization?: boolean;
  vehicle_id: number;
  /** Real vehicle name resolved backend-side (avoids stale driver.vehicle labels). */
  vehicle_name?: string | null;
  vehicle_locked?: boolean;
  is_team_leader?: boolean;
  /** Real seat capacity resolved backend-side from load_constraints. */
  vehicle_capacity?: number | null;
  route_polyline: string;
  team_member_id: number;
  team_member_name: string;
  total_distance_meters: number;
  total_duration_seconds: number;
  /** Worker-shuttle routes only: "GO" (home → client) or "RETURN". */
  leg?: string;
  source_optimization_id?: number;
  source_route_index?: number;
  source_route_name?: string | null;
  source_scheduled_date?: string | null;
  source_stop_range?: [number, number];
  source_leg?: string | null;
}

export interface UnassignedJob {
  job_id: number;
  is_new?: boolean;
  job_name?: string;
  worker_name?: string;
  candidate_name?: string;
  client_name?: string;
  reason: string;
  reason_code?: string;
  suggested_actions?: string[];
  scheduled_time?: string;
  address_formatted?: string;
}

interface RouteResult {
  added_job_ids?: number[];
  manual_job_creations?: Record<string, { fingerprint: string; job_ids: number[] }>;
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
  result?: Route["result"];
  message: string;
  route?: Routes | Record<string, unknown>;
  target_route?: Routes | Record<string, unknown>;
  routes?: (Routes | Record<string, unknown>)[];
  is_async?: boolean;
  removed_job_ids?: number[];
  affected_route_indices?: number[];
}

export interface BulkAssignJobsResponse extends RouteOperationResponse {
  assigned_job_ids: number[];
  already_assigned_job_ids: number[];
  result: Route["result"];
}

export interface TripStopSnapshot {
  job_id: number | null;
  stop_type: string;
  arrival_time: string;
}
export interface TripMoveSelection {
  sourceRouteIndex: number;
  startStopIndex: number;
  sourceDriverId: number;
  sourceLeg: string | null;
  stops: TripStopSnapshot[];
}

export interface StopMoveSelection {
  sourceRouteIndex: number;
  sourceDriverId: number;
  sourceLeg: string | null;
  jobIds: number[];
  sourceStops: StopMoveSnapshot[];
}
export interface StopMoveSnapshot {
  job_id: number | null;
  stop_type: string;
  arrival_time: string | null;
}
