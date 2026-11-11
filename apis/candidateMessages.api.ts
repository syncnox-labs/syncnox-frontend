import apiClient from "@/config/apiClient.config";

export interface CandidateMessageItem {
  publication_id: number; job_id: number; driver_id: number;
  name: string | null; phone: string | null; language: string | null;
  shift_date: string | null; pickup_time: string | null; pickup_date: string | null;
  pickup_location: string | null; destination: string | null; driver: string | null;
  revision: string; errors: string[]; last_status: string | null; last_attempt_id: number | null;
}
export interface MessageStatus { id: number; job_id: number; status: string; error: string | null }

export async function candidateMessagesEnabled(): Promise<boolean> {
  const { data } = await apiClient.get("optimization/candidate-messages/configuration");
  return data.enabled === true;
}
export async function previewCandidateMessages(planId: number, driverId?: number): Promise<CandidateMessageItem[]> {
  const { data } = await apiClient.get(`optimization/requests/${planId}/candidate-messages/preview`, { params: { driver_id: driverId } });
  return data.items;
}
export async function sendCandidateMessages(planId: number, requestToken: string, driverId: number | undefined,
  recipients: { publication_id: number; job_id: number; revision: string; allow_resend: boolean }[]) {
  const { data } = await apiClient.post(`optimization/requests/${planId}/candidate-messages/send`, {
    request_token: requestToken, driver_id: driverId, recipients,
  });
  return data as { attempt_ids: number[]; enqueued: boolean };
}
export async function candidateMessageStatus(planId: number, requestToken: string): Promise<MessageStatus[]> {
  const { data } = await apiClient.get(`optimization/requests/${planId}/candidate-messages/status`, { params: { request_token: requestToken } });
  return data.items;
}
export async function retryCandidateMessageQueue(planId: number) {
  const { data } = await apiClient.post(`optimization/requests/${planId}/candidate-messages/retry-queue`);
  return data as { enqueued: boolean };
}
