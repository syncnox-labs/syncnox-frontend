import apiClient from "@/config/apiClient.config";

export type LocationTypeEnum =
  | "metro_station"
  | "customer_site"
  | "end_customer"
  | "pickup"
  | "warehouse"
  | "other"
  | string;

export interface LocationTypeOption {
  value: string;
  label: string;
  is_custom?: boolean;
}

export const LOCATION_TYPE_OPTIONS: LocationTypeOption[] = [
  { value: "metro_station", label: "Metro station" },
  { value: "customer_site", label: "Customer site" },
  { value: "end_customer", label: "End customer" },
  { value: "pickup", label: "Pickup" },
  { value: "warehouse", label: "Warehouse" },
  { value: "other", label: "Other" },
];

export interface LocationMapping {
  id: number;
  tenant_id: number;
  name: string;
  type?: LocationTypeEnum | string | null;
  location_type?: string | null;
  aliases?: string[] | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  is_active: boolean;
}

export interface LocationMappingCreate {
  name: string;
  type?: LocationTypeEnum | string;
  location_type?: string;
  aliases?: string[];
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
}

export interface LocationMappingUpdate {
  name?: string;
  type?: LocationTypeEnum | string;
  location_type?: string;
  aliases?: string[];
  address?: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  is_active?: boolean;
}


export const fetchLocationMappings = async (): Promise<LocationMapping[]> => {
  try {
    const response = await apiClient.get("/location-mappings/metro-stations");
    return response.data.items || response.data || [];
  } catch (err) {
    console.error("Error fetching location mappings:", err);
    return [];
  }
};

export const createLocationMapping = async (payload: LocationMappingCreate): Promise<LocationMapping> => {
  const response = await apiClient.post("/location-mappings/metro-stations", payload);
  return response.data;
};

export const updateLocationMapping = async (
  id: number,
  payload: LocationMappingUpdate
): Promise<LocationMapping> => {
  const response = await apiClient.put(`/location-mappings/metro-stations/${id}`, payload);
  return response.data;
};

export const batchCreateLocationMappings = async (stations: LocationMappingCreate[]): Promise<number> => {
  const response = await apiClient.post("/location-mappings/metro-stations/batch", { stations });
  if (typeof response.data?.upserted === "number") {
    return response.data.upserted;
  }
  if (Array.isArray(response.data?.items)) {
    return response.data.items.length;
  }
  if (Array.isArray(response.data)) {
    return response.data.length;
  }
  return 0;
};


export const deleteLocationMapping = async (id: number): Promise<void> => {
  await apiClient.delete(`/location-mappings/metro-stations/${id}`);
};

export const fetchLocationTypes = async (): Promise<LocationTypeOption[]> => {
  try {
    const response = await apiClient.get("/location-mappings/location-types");
    return response.data || [];
  } catch (err) {
    console.error("Error fetching location types:", err);
    return LOCATION_TYPE_OPTIONS;
  }
};

export const createCustomLocationType = async (name: string): Promise<LocationTypeOption> => {
  const response = await apiClient.post("/location-mappings/location-types", { name });
  return response.data;
};
