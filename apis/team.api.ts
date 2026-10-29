import apiClient from "@/config/apiClient.config";
import { Team } from "@/types/team.type";
import type { ZonePolygon } from "@/app/team/_components/ServiceZoneMap";

const url = "/team-members";

export const fetchTeams = async (params?: {
  status: string;
}): Promise<Team[]> => {
  const response = await apiClient.get<Team[]>(url, { params });
  return response.data;
};

export const createTeam = async (team: Team): Promise<Team> => {
  const response = await apiClient.post<Team>(url, team);
  return response.data;
};

export const updateTeam = async (team: Team): Promise<Team> => {
  const response = await apiClient.put<Team>(`${url}/${team.id}`, team);
  return response.data;
};

export const deleteTeam = async (teamId: number): Promise<void> => {
  await apiClient.delete(`${url}/${teamId}`);
};

export const bulkDeleteTeams = async (ids: number[]): Promise<void> => {
  await apiClient.post(`${url}/bulk-delete`, ids);
};

export const activateDriver = async (driverId: number): Promise<{ activation_code: string }> => {
  const response = await apiClient.post<{ activation_code: string }>(`/driver/${driverId}/activate`);
  return response.data;
};

export const deactivateDriver = async (driverId: number): Promise<{ status: string }> => {
  const response = await apiClient.post<{ status: string }>(`/driver/${driverId}/deactivate`);
  return response.data;
};

export const fetchDriverZones = async (driverId: number): Promise<ZonePolygon[]> => {
  const response = await apiClient.get<ZonePolygon[]>(`/driver/${driverId}/zones`);
  return response.data;
};

export const saveDriverZones = async (driverId: number, zones: ZonePolygon[]): Promise<void> => {
  await apiClient.put(`/driver/${driverId}/zones`, { zones });
};

export const bulkImportTeams = async (file: File): Promise<Team[]> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await apiClient.post<Team[]>(`${url}/bulk-import`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const batchCreateTeams = async (
  teams: Partial<Team>[]
): Promise<Team[]> => {
  const response = await apiClient.post<Team[]>(`${url}/batch`, teams);
  return response.data;
};

export const downloadTeamTemplate = async (): Promise<void> => {
  const response = await apiClient.get(`${url}/template/download`, {
    responseType: "blob",
  });
  const blob = new Blob([response.data], { type: "text/csv" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.setAttribute("download", "drivers_template.csv");
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const exportTeamMembers = async (ids?: number[]): Promise<void> => {
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
    ids && ids.length > 0 ? `drivers_selected_${ids.length}.csv` : "drivers_export.csv"
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
};


