import apiClient from "@/config/apiClient.config";

export interface FieldSurfaces {
  disp?: boolean;
  driver?: boolean;
  track?: boolean;
}

export interface CustomFieldDefinition {
  id: number;
  tenant_id: number;
  entity_type: "job" | "vehicle" | "team_member" | "depot";
  field_key: string;
  label: string;
  data_type: "string" | "number" | "boolean" | "select" | "date" | "geo";
  is_required: boolean;
  is_visible_in_list: boolean;
  options?: string[] | number[] | null;
  default_value?: string | null;
  display_order: number;
  description?: string | null;
  group?: "optimization" | "additional" | "pod" | string;
  surfaces?: FieldSurfaces | null;
}

export interface CustomFieldDefinitionCreate {
  entity_type: "job" | "vehicle" | "team_member" | "depot";
  field_key: string;
  label: string;
  data_type?: "string" | "number" | "boolean" | "select" | "date" | "geo";
  is_required?: boolean;
  is_visible_in_list?: boolean;
  options?: string[] | number[] | null;
  default_value?: string | null;
  display_order?: number;
  description?: string | null;
  group?: "optimization" | "additional" | "pod" | string;
  surfaces?: FieldSurfaces | null;
}

export interface CustomFieldDefinitionUpdate {
  label?: string;
  data_type?: "string" | "number" | "boolean" | "select" | "date" | "geo";
  is_required?: boolean;
  is_visible_in_list?: boolean;
  options?: string[] | number[] | null;
  default_value?: string | null;
  display_order?: number;
  description?: string | null;
  group?: "optimization" | "additional" | "pod" | string;
  surfaces?: FieldSurfaces | null;
}

export interface FieldTemplateItem {
  field_key: string;
  label: string;
  data_type: string;
  is_required: boolean;
  is_visible_in_list: boolean;
  options?: string[] | number[] | null;
  default_value?: string | null;
  display_order: number;
  description?: string | null;
  group?: "optimization" | "additional" | "pod" | string;
  surfaces?: FieldSurfaces | null;
}

export interface FieldTemplate {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  category?: string | null;
  entity_type: "job" | "vehicle" | "team_member" | "depot";
  fields: FieldTemplateItem[];
  is_active: boolean;
  is_applied: boolean;
}

export const CUSTOM_FIELDS_CHANGED_EVENT = "syncnox_custom_fields_changed";

const notifyFieldChanges = (entityType?: string) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CUSTOM_FIELDS_CHANGED_EVENT, { detail: { entityType } }));
  }
};

export interface ApplyTemplateResponse {
  message: string;
  active_job_template?: string | null;
  template_id: number;
  template_slug: string;
  entity_type: string;
  added_count: number;
  skipped_count: number;
  apply_mode: "replace" | "merge";
}

export const getCustomFields = async (entityType?: string): Promise<CustomFieldDefinition[]> => {
  const params = entityType ? { entity_type: entityType } : {};
  const response = await apiClient.get<CustomFieldDefinition[]>("/custom-fields", { params });
  return response.data;
};

export const createCustomField = async (data: CustomFieldDefinitionCreate): Promise<CustomFieldDefinition> => {
  const response = await apiClient.post<CustomFieldDefinition>("/custom-fields", data);
  notifyFieldChanges(response.data.entity_type);
  return response.data;
};

export const updateCustomField = async (id: number, data: CustomFieldDefinitionUpdate): Promise<CustomFieldDefinition> => {
  const response = await apiClient.patch<CustomFieldDefinition>(`/custom-fields/${id}`, data);
  notifyFieldChanges(response.data.entity_type);
  return response.data;
};

export const deleteCustomField = async (id: number): Promise<void> => {
  await apiClient.delete(`/custom-fields/${id}`);
  notifyFieldChanges();
};

export const resetCustomFields = async (entityType: string): Promise<void> => {
  await apiClient.post("/custom-fields/reset", null, { params: { entity_type: entityType } });
  notifyFieldChanges(entityType);
};

export const getFieldTemplates = async (entityType?: string): Promise<FieldTemplate[]> => {
  const params = entityType ? { entity_type: entityType } : {};
  const response = await apiClient.get<FieldTemplate[]>("/custom-fields/templates", { params });
  return response.data;
};

export const getFieldTemplate = async (id: number): Promise<FieldTemplate> => {
  const response = await apiClient.get<FieldTemplate>(`/custom-fields/templates/${id}`);
  return response.data;
};

export const applyFieldTemplate = async (
  id: number,
  applyMode: "replace" | "merge" = "replace"
): Promise<ApplyTemplateResponse> => {
  const response = await apiClient.post<ApplyTemplateResponse>(`/custom-fields/templates/${id}/apply`, {
    apply_mode: applyMode,
  });
  notifyFieldChanges(response.data.entity_type);
  return response.data;
};
