import apiClient from "@/config/apiClient.config";
import { Vehicle } from "@/types/vehicle.type";

const url = "/vehicles";

export const fetchVehicles = async (): Promise<Vehicle[]> => {
  const response = await apiClient.get<Vehicle[]>(url);
  return response.data;
};

export const createVehicle = async (
  vehicle: Partial<Vehicle>
): Promise<Vehicle> => {
  const response = await apiClient.post<Vehicle>(url, vehicle);
  return response.data;
};

export const updateVehicle = async (vehicle: Vehicle): Promise<Vehicle> => {
  const response = await apiClient.put<Vehicle>(
    `${url}/${vehicle.id}`,
    vehicle
  );
  return response.data;
};

export const deleteVehicle = async (vehicleId: number): Promise<void> => {
  await apiClient.delete(`${url}/${vehicleId}`);
};

export const bulkDeleteVehicles = async (ids: number[]): Promise<void> => {
  await apiClient.post(`${url}/bulk-delete`, ids);
};

export const bulkImportVehicles = async (file: File): Promise<Vehicle[]> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<Vehicle[]>(`${url}/bulk-import`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const batchCreateVehicles = async (
  vehicles: Partial<Vehicle>[]
): Promise<Vehicle[]> => {
  const response = await apiClient.post<Vehicle[]>(`${url}/batch`, vehicles);
  return response.data;
};

export const downloadVehicleTemplate = async (): Promise<void> => {
  const response = await apiClient.get(`${url}/template/download`, {
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "text/csv" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", "vehicles_template.csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const exportVehicles = async (ids?: number[]): Promise<void> => {
  const params = ids && ids.length > 0 ? { ids: ids.join(",") } : undefined;
  const response = await apiClient.get(`${url}/export`, {
    params,
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute(
    "download",
    ids && ids.length > 0 ? `vehicles_selected_${ids.length}.csv` : "vehicles_export.csv"
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
};

