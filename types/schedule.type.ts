// Schedule types for the timeline view
// Generalized to support different resource types (drivers, employees, etc.)

export type ScheduleBlockType = "route" | "break" | "job" | "idle" | "depot";

export type ScheduleStatus =
  | "scheduled"
  | "in_transit"
  | "completed"
  | "failed";

export interface ScheduleBlockMetadata {
  route_id?: number;
  stops_count?: number;
  total_distance_meters?: number;
  total_duration_seconds?: number;
  driver_id?: number;
  // Break-specific
  break_duration_minutes?: number;
  break_location_address?: string;
  // Job-specific
  service_duration_minutes?: number;
  job_id?: number;
  address?: string;
  // Idle-specific
  idle_duration_minutes?: number;
}

export interface ScheduleBlock {
  id: string;
  type: ScheduleBlockType;
  start_time: string; // ISO datetime string (UTC)
  end_time: string; // ISO datetime string (UTC)
  title: string;
  status: ScheduleStatus | null;
  metadata: ScheduleBlockMetadata | null;
}

export interface ResourceSchedule {
  resource_id: number;
  resource_name: string;
  resource_type: string; // "driver", "employee", etc.
  blocks: ScheduleBlock[];
}

export interface ScheduleResponse {
  date: string; // YYYY-MM-DD
  resources: ResourceSchedule[];
}

// Status color mapping
export const SCHEDULE_STATUS_COLORS: Record<
  ScheduleStatus | "break" | "idle" | "depot",
  string
> = {
  // The app's own palette (see the route screen): grey-green for planned, greens for moving and done.
  scheduled: "#626E67",
  in_transit: "#0B5D3B",
  completed: "#1F845A",
  failed: "#C9372C",
  break: "#9AA59F",
  idle: "#C4CCC7",
  depot: "#003220",
};

// Pale fills for timeline blocks: the status color is a thin marker, the text stays black
export const SCHEDULE_STATUS_FILLS: Record<keyof typeof SCHEDULE_STATUS_COLORS, string> = {
  scheduled: "#F3F6F4",
  in_transit: "#F1F8F4",
  completed: "#E7F3ED",
  failed: "#FDECEA",
  break: "#F3F6F4",
  idle: "#F8FAF9",
  depot: "#EEF1EF",
};

export function getBlockFill(block: ScheduleBlock): string {
  if (block.type === "break" || block.type === "idle" || block.type === "depot") {
    return SCHEDULE_STATUS_FILLS[block.type];
  }
  return SCHEDULE_STATUS_FILLS[block.status || "scheduled"];
}

// Helper function to get block color
export function getBlockColor(block: ScheduleBlock): string {
  if (block.type === "break") {
    return SCHEDULE_STATUS_COLORS.break;
  }
  if (block.type === "idle") {
    return SCHEDULE_STATUS_COLORS.idle;
  }
  if (block.type === "depot") {
    return SCHEDULE_STATUS_COLORS.depot;
  }
  return SCHEDULE_STATUS_COLORS[block.status || "scheduled"];
}
