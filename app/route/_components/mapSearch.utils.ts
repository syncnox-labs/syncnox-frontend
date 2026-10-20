import type { Job } from "@/types/job.type";
import type { Routes, Stop } from "@/types/routes.type";
import { getRouteStopDisplay } from "./stopDisplay.utils";

export interface MapSearchResult {
  id: string;
  jobId: string;
  candidateName: string;
  candidatePhone: string;
  candidateId: string;
  shiftRef: string;
  pickupAddress: string;
  dropoffAddress: string;
  driverName: string;
  leg?: string;
  routeIndex: number;
  stopIndex: number;
  displayStopNumber: number;
  markerId: string;
  stop: Stop;
  job: Job | null;
  searchableText: string;
  phoneDigits: string[];
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

export function buildMapSearchIndex(routes: Routes[], jobs: Job[]): MapSearchResult[] {
  const jobsMap = new Map(jobs.map(job => [String(job.id), job]));
  const results: MapSearchResult[] = [];

  routes.forEach((route, routeIndex) => {
    const driverName = route.team_member_name || `Driver ${routeIndex + 1}`;
    const { byRawIndex } = getRouteStopDisplay(route);
    route.stops?.forEach((stop, stopIndex) => {
      const group = byRawIndex.get(stopIndex);
      if (!group?.displayStopNumber) return;
      const displayStopNumber = group.displayStopNumber;

      const embeddedJob = (stop as Stop & { job?: Job }).job;
      const jobId = stop.job_id ?? embeddedJob?.id ?? stop.id;
      const job = jobsMap.get(String(jobId)) || embeddedJob || null;
      const sources: object[] = [
        job || {}, job?.worker_shuttle_detail || {}, job?.pickup_delivery_detail || {},
        job?.custom_fields || {}, embeddedJob || {}, embeddedJob?.worker_shuttle_detail || {},
        embeddedJob?.pickup_delivery_detail || {}, embeddedJob?.custom_fields || {},
        stop,
      ];
      const values = (...keys: string[]): string[] => keys.flatMap(key =>
        sources.flatMap(source => {
          const value = (source as Record<string, unknown>)[key];
          return typeof value === "string" || typeof value === "number"
            ? [String(value).trim()].filter(text => text !== "" && text !== "-")
            : [];
        }),
      );
      const first = (...keys: string[]) => values(...keys)[0] || "";
      const fullName = `${first("first_name")} ${first("last_name")}`.trim();
      const candidateName = first("candidate_name") || fullName || "Unknown Candidate";
      const candidatePhone = first("candidate_phone", "phone_number", "client_phone");
      const candidateId = first("candidate_id", "client_id");
      const shiftRef = first("quant_id", "quart_id");
      const pickupAddress = first("pick_up_address", "candidate_address", "address_formatted");
      const dropoffAddress = first("drop_off_address", "client_address");
      const phones = values("candidate_phone", "phone_number", "client_phone");

      results.push({
        id: `${routeIndex}-${stopIndex}-${jobId ?? stopIndex}`,
        jobId: jobId == null ? "" : String(jobId),
        candidateName, candidatePhone, candidateId, shiftRef,
        pickupAddress, dropoffAddress, driverName, leg: stop.leg || route.leg,
        routeIndex, stopIndex, displayStopNumber, markerId: `${routeIndex}-${group.firstRawIndex}`, stop, job,
        searchableText: normalizeSearchText([
          jobId ?? "", candidateName, fullName, driverName,
          ...values(
            "candidate_name", "candidate_id", "client_id", "quant_id", "quart_id",
            "pick_up_address", "drop_off_address", "address_formatted",
            "candidate_address", "client_address", "go_pickup_point", "return_dropoff_point",
          ),
          ...phones,
        ].join(" ")),
        phoneDigits: phones.map(phone => phone.replace(/\D/g, "")).filter(Boolean),
      });
    });
  });
  return results;
}

export function filterMapSearchResults(candidates: MapSearchResult[], query: string): MapSearchResult[] {
  const text = normalizeSearchText(query);
  if (!text) return [];
  const digits = /^[\d\s()+.\-]+$/.test(text) ? text.replace(/\D/g, "") : "";
  return candidates.filter(candidate =>
    candidate.searchableText.includes(text) ||
    (digits !== "" && candidate.phoneDigits.some(phone => phone.includes(digits))),
  ).slice(0, 40);
}
