import { type FieldSurfaces } from "@/apis/custom-fields.api";

export type EntityTab = "job" | "vehicle" | "team_member" | "depot";

export interface BaseFieldDefinition {
  field_key: string;
  label: string;
  data_type: string;
  is_required: boolean;
  description: string;
  group?: "optimization" | "additional" | "pod";
  surfaces?: FieldSurfaces | null;
  options?: string[] | number[] | null;
}

export const DEFAULT_SURFACES: FieldSurfaces = {
  disp: true,
  driver: false,
  track: false,
};

export const SURFACES_CONFIG = [
  { key: "disp", label: "D", title: "Dispatch Manager (Web App)" },
  { key: "driver", label: "V", title: "Driver App (Mobile App)" },
  { key: "track", label: "C", title: "Customer Tracking (Tracking Page)" },
];

export const formatHumanizedLabel = (key: string): string => {
  if (!key) return "";
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const TEMPLATE_BASE_FIELDS: Record<string, BaseFieldDefinition[]> = {
  pickup_delivery_job: [
    { field_key: "scheduled_date", label: "Scheduled Date", data_type: "date", is_required: true, description: "Target date when job is scheduled", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "job_type", label: "Job Type", data_type: "select", is_required: true, description: "Pickup, delivery, or service", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "address_formatted", label: "Address Formatted", data_type: "string", is_required: true, description: "Formatted delivery address", group: "optimization", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "location", label: "Location", data_type: "string", is_required: true, description: "Geocoded coordinates (lat, lng)", group: "optimization", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "time_window_start", label: "Time Window Start", data_type: "string", is_required: false, description: "Allowed window start time", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "time_window_end", label: "Time Window End", data_type: "string", is_required: false, description: "Allowed window end time", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "service_duration", label: "Service Duration", data_type: "number", is_required: false, description: "Duration in minutes", group: "optimization", surfaces: { disp: true, driver: false, track: false } },
    { field_key: "priority_level", label: "Priority Level", data_type: "select", is_required: false, description: "Low, Medium, High", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "first_name", label: "First Name", data_type: "string", is_required: false, description: "Customer first name", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "last_name", label: "Last Name", data_type: "string", is_required: false, description: "Customer last name", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "client_name", label: "Client Name", data_type: "string", is_required: false, description: "Customer/recipient full name", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "client_email", label: "Client Email", data_type: "string", is_required: false, description: "Customer contact email", group: "additional", surfaces: { disp: true, driver: false, track: false } },
    { field_key: "email", label: "Customer Email", data_type: "string", is_required: false, description: "Recipient email address", group: "additional", surfaces: { disp: true, driver: false, track: false } },
    { field_key: "phone_number", label: "Customer Phone", data_type: "string", is_required: false, description: "Recipient phone number", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "business_name", label: "Business Name", data_type: "string", is_required: false, description: "Company or store name", group: "additional", surfaces: { disp: true, driver: false, track: false } },
    { field_key: "customer_preferences", label: "Customer Preferences", data_type: "string", is_required: false, description: "Special preferences", group: "additional", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "additional_notes", label: "Special Notes", data_type: "string", is_required: false, description: "Gate codes, parking instructions, or notes", group: "additional", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "recurrence_type", label: "Recurrence Type", data_type: "select", is_required: false, description: "One time, daily, weekly, monthly", group: "additional", surfaces: { disp: true, driver: false, track: false } },
    { field_key: "payment_status", label: "Payment Status", data_type: "select", is_required: false, description: "Paid or unpaid", group: "additional", surfaces: { disp: true, driver: false, track: false } },
    { field_key: "pod_notes", label: "Pod Notes", data_type: "string", is_required: false, description: "Proof of delivery notes", group: "pod", surfaces: { disp: false, driver: true, track: true } },
    { field_key: "started_at", label: "Started At", data_type: "date", is_required: false, description: "Service started timestamp", group: "pod", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "completed_at", label: "Completed At", data_type: "date", is_required: false, description: "Service completion timestamp", group: "pod", surfaces: { disp: true, driver: true, track: false } },
  ],
  worker_shuttle: [
    { field_key: "quart_id", label: "Quart / Shift Ref", data_type: "string", is_required: false, description: "Shift reference or batch ID", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "scheduled_date", label: "Scheduled Date", data_type: "date", is_required: true, description: "Date of shuttle shift", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "start_hour", label: "Shift Start Time", data_type: "string", is_required: true, description: "Shift start time (e.g. 08:00)", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "end_hour", label: "Shift End Time", data_type: "string", is_required: true, description: "Shift end time (e.g. 17:00)", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "pickup_type", label: "Pickup Type", data_type: "select", is_required: true, description: "GO, RETURN, or BOTH", group: "optimization", surfaces: { disp: true, driver: true, track: false }, options: ["GO", "RETURN", "BOTH"] },
    { field_key: "job_type", label: "Trip Type", data_type: "select", is_required: true, description: "One Way, Return Only, or Round Trip", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "pick_up_address", label: "Pick Up Address", data_type: "string", is_required: true, description: "Passenger pickup location address", group: "optimization", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "drop_off_address", label: "Drop Off Address", data_type: "string", is_required: true, description: "Passenger dropoff location address", group: "optimization", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "candidate_address", label: "Candidate Address", data_type: "string", is_required: false, description: "Candidate home address", group: "additional", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "client_address", label: "Client Address", data_type: "string", is_required: false, description: "Client/Workplace address", group: "optimization", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "quant_id", label: "Quant / Shift Ref ID", data_type: "string", is_required: false, description: "Shift reference or batch ID", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "reach_before_minutes", label: "Reach Window (mins)", data_type: "number", is_required: false, description: "Reach window minutes (e.g. 10 or -15)", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "client_pick_up_time", label: "Client Pick Up Time", data_type: "string", is_required: false, description: "Client scheduled pickup time", group: "optimization", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "candidate_id", label: "Candidate ID", data_type: "string", is_required: false, description: "Candidate reference ID", group: "additional", surfaces: { disp: true, driver: true, track: false } },
    { field_key: "candidate_name", label: "Candidate Name", data_type: "string", is_required: false, description: "Candidate full name", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "candidate_phone", label: "Candidate Phone", data_type: "string", is_required: false, description: "Candidate phone number", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "client_name", label: "Passenger Name", data_type: "string", is_required: false, description: "Client or passenger full name", group: "additional", surfaces: { disp: true, driver: true, track: true } },
    { field_key: "notes", label: "Notes", data_type: "string", is_required: false, description: "Shuttle special notes", group: "additional", surfaces: { disp: true, driver: true, track: false } },
  ],
};

export const DEFAULT_BASE_FIELDS: Record<EntityTab, BaseFieldDefinition[]> = {
  job: TEMPLATE_BASE_FIELDS.pickup_delivery_job,

  vehicle: [
    { field_key: "name", label: "Vehicle Name", data_type: "string", is_required: true, description: "Name of the vehicle", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "type", label: "Vehicle Type", data_type: "select", is_required: false, description: "Car, Van, Truck, etc.", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "license_plate", label: "License Plate", data_type: "string", is_required: false, description: "Vehicle license registration", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "make", label: "Make", data_type: "string", is_required: false, description: "Vehicle manufacturer/make", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "model", label: "Model", data_type: "string", is_required: false, description: "Vehicle model", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "load_constraints", label: "Capacity / Load Constraints", data_type: "number", is_required: false, description: "Max weight or volume capacity", group: "additional", surfaces: DEFAULT_SURFACES },
  ],
  team_member: [
    { field_key: "name", label: "Name", data_type: "string", is_required: true, description: "Team member full name", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "email", label: "Email", data_type: "string", is_required: false, description: "Email address", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "phone_number", label: "Phone", data_type: "string", is_required: false, description: "Phone number", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "role_type", label: "Role", data_type: "select", is_required: false, description: "Driver, Admin, Manager", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "work_start_time", label: "Shift Start", data_type: "string", is_required: false, description: "Daily work start time", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "work_end_time", label: "Shift End", data_type: "string", is_required: false, description: "Daily work end time", group: "additional", surfaces: DEFAULT_SURFACES },
  ],
  depot: [
    { field_key: "name", label: "Depot Name", data_type: "string", is_required: true, description: "Depot identifier name", group: "additional", surfaces: DEFAULT_SURFACES },
    { field_key: "address", label: "Depot Address", data_type: "string", is_required: true, description: "Physical location address", group: "additional", surfaces: DEFAULT_SURFACES },
  ],
};
