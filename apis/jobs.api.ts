import apiClient from "@/config/apiClient.config";
import { Job, FetchJobsParams } from "@/types/job.type";

export const fetchJobs = async (params?: FetchJobsParams): Promise<Job[]> => {
  const queryParams = new URLSearchParams();

  if (params?.skip !== undefined) {
    queryParams.append("skip", params.skip.toString());
  }
  if (params?.limit !== undefined) {
    queryParams.append("limit", params.limit.toString());
  }
  if (params?.status) {
    queryParams.append("status", params.status);
  }
  if (params?.date) {
    queryParams.append("date", params.date);
  }
  if (params?.job_ids) {
    queryParams.append("job_ids", params.job_ids);
  }

  const queryString = queryParams.toString();
  const url = queryString ? `/jobs?${queryString}` : "/jobs";

  const response = await apiClient.get<Job[]>(url);
  return response.data;
};

export const createJob = async (job: any): Promise<Job | Job[]> => {
  const response = await apiClient.post<Job | Job[]>("/jobs", job);
  return response.data;
};

export const updateJob = async (job: { id: number } & Partial<Job>): Promise<Job> => {
  const { id, ...changes } = job;
  const response = await apiClient.put<Job>(`/jobs/${id}`, changes);
  return response.data;
};

export const deleteJob = async (jobId: number): Promise<void> => {
  await apiClient.delete(`/jobs/${jobId}`);
};

export const deleteJobsBulk = async (jobIds: number[]): Promise<void> => {
  await apiClient.post("/jobs/bulk/delete", jobIds);
};

export const updateJobStatus = async (jobId: number, status: string): Promise<Job> => {
  const response = await apiClient.put<Job>(`/jobs/${jobId}`, {
    status: status,
  });
  return response.data;
};

export const bulkUpdateJobDate = async (
  jobIds: number[],
  scheduledDate: string,
): Promise<{ updated: number; requested: number }> => {
  const response = await apiClient.post("/jobs/bulk/update-date", {
    job_ids: jobIds,
    scheduled_date: scheduledDate,
  });
  return response.data;
};
