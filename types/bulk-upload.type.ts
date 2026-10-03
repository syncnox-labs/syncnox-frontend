export interface ColumnMetadata {
  description: string;
  identifier: string;
  index: number;
  mapping: string | null;
  sample_value: string;
}

export interface BulkUploadResponse {
  columns: ColumnMetadata[];
  sample_data: Record<string, any>[];
  total_rows: number;
  success: boolean;
}

export interface GeocodeResult {
  address: string;
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
  quality_score: number | null;
  error: string | null;
  warning: string | null;
}

export interface GeocodedRow {
  original_data: Record<string, any>;
  geocode_result: GeocodeResult;
  is_duplicate: boolean;
  validation_errors: string[];
  duplicate_message?: string | null;
}


export interface BulkGeocodeResponse {
  data: GeocodedRow[];
  errors_count: number;
  warnings_count: number;
  duplicates_count: number;
  validation_errors_count: number;
}

export interface BulkGeocodeRequest {
  column_mapping: Record<string, string>;
  data: Record<string, any>[];
  scheduled_date?: string;
}

/** Response from /jobs/bulk/resolve-row — resolver output only, no row text. */
export interface BulkResolveRowResponse {
  resolved_fields: Record<string, any>;
  geocode_result: GeocodeResult;
  warnings: string[];
}

export interface JobCreate {
  location: { lat: number; lng: number };
  address_formatted: string;
  scheduled_date?: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  email?: string;
  business_name?: string;
  time_window_start?: string;
  time_window_end?: string;
  service_duration?: number;
  job_type?: string;
  priority_level?: string;
  customer_preferences?: string;
  additional_notes?: string;
  [key: string]: any; // Additional fields from CSV/original data
}

export interface BulkImportRequest {
  jobs: JobCreate[];
  save_mapping: boolean;
  mapping_config: Record<string, string> | null;
}

export interface BulkImportResponse {
  created: number;
  failed: number;
  errors: Array<{ row_index: number; error_message: string }>;
}

export interface UserMappingConfig {
  id: number;
  tenant_id: number;
  entity_type: string;
  mapping_config: Record<string, string>;
}
