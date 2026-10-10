export type TeamRoleType = "admin" | "driver" | "manager";

export interface ServiceZone {
  id: string;
  paths: { lat: number; lng: number }[];
  color: string;
}
export interface DayScheduleItem {
  enabled: boolean;
  start_time: string | null;
  end_time: string | null;
}

export type TeamStatusType = "active" | "inactive" | "online" | "offline";

export interface Team {
  id: number;
  vehicle_id?: number | null;
  status: TeamStatusType;
  role_type: TeamRoleType;
  external_identifier?: string | null;
  name: string;
  email?: string | null;
  phone_number?: string | null;
  navigation_link_format: string;
  vehicle?: string | null;
  work_start_time?: string | null;
  work_end_time?: string | null;
  day_schedules?: Record<string, DayScheduleItem> | null;
  allowed_overtime: boolean;
  max_distance?: number | null;
  break_time_start?: string | null;
  break_time_end?: string | null;
  skills: string[];
  fixed_cost_for_driver?: number | null;
  cost_per_km?: number | null;
  cost_per_hr?: number | null;
  cost_per_hr_overtime?: number | null;
  tenant_id: number;
  service_zones?: ServiceZone[];
  start_address?: string | null;
  start_location?: { lat: number; lng: number } | null;
  end_address?: string | null;
  end_location?: { lat: number; lng: number } | null;
  activation_code?: string | null;
  created_at: string;
  updated_at: string;
  custom_fields?: Record<string, any>;
}
