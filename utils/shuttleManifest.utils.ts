import type { Job } from "@/types/job.type";
import type { Routes, Stop } from "@/types/routes.type";
import { getJobLeg, getJobPickupType } from "@/utils/jobPickupType.utils";

const MISSING = "";
const pickup = (stop: Stop) => ["pickup", "pick_up", "job"].includes(stop.stop_type);
const dropoff = (stop: Stop) => ["dropoff", "drop_off"].includes(stop.stop_type);

export function shuttleValue(job: Job | undefined, ...keys: string[]): string {
  for (const key of keys) {
    for (const source of [job, job?.worker_shuttle_detail, job?.custom_fields]) {
      const value = source?.[key as keyof typeof source];
      if ((typeof value === "string" && value.trim()) || typeof value === "number") return String(value).trim();
    }
  }
  return "";
}

/** Service timestamps are local wall-clock values; do not shift them into the viewer's timezone. */
export function manifestTime(value?: string | null): string {
  const match = value?.trim().match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return "Not scheduled";
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return "Not scheduled";
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function manifestDate(value?: string | null): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return MISSING;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== match[0]) return MISSING;
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function manifestLocation(stop?: Stop): string {
  if (stop?.address_formatted?.trim()) return stop.address_formatted.trim();
  if (Number.isFinite(stop?.latitude) && Number.isFinite(stop?.longitude)
      && Math.abs(stop!.latitude) <= 90 && Math.abs(stop!.longitude) <= 180) {
    return `${stop!.latitude.toFixed(6)}, ${stop!.longitude.toFixed(6)}`;
  }
  return MISSING;
}

export function isShuttleRoute(route: Routes, jobs: ReadonlyMap<number, Job>): boolean {
  return ["GO", "RETURN", "COMBINED"].includes(route.leg || "") || route.stops.some(stop => {
    const job = stop.job_id != null ? jobs.get(stop.job_id) : undefined;
    return job?.template_type === "worker_shuttle" || Boolean(job?.worker_shuttle_detail);
  });
}

export type ManifestDriverSelection = "all" | number;

export function manifestDriverOptions(routes: Routes[]): { value: ManifestDriverSelection; label: string }[] {
  const drivers = new Map<number, string>();
  for (const route of selectManifestRoutes(routes, "all")) {
    drivers.set(route.team_member_id, route.team_member_name || `Driver #${route.team_member_id}`);
  }
  return [{ value: "all", label: "All drivers" }, ...[...drivers].map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label))];
}

/** Include every trip/vehicle/plan fragment belonging to the selected driver. */
export function selectManifestRoutes(routes: Routes[], driverId: ManifestDriverSelection): Routes[] {
  return routes.filter(route => (driverId === "all" || route.team_member_id === driverId)
    && route.stops.some(stop => stop.job_id != null));
}

export interface ShuttleManifestRow {
  key: string;
  sequence: number;
  jobId: number;
  candidateId: string;
  candidateName: string;
  candidatePhone: string;
  clientName: string;
  worksite: string;
  pickupType: string;
  leg: string;
  shift: string;
  shiftReference: string;
  shiftStart: string;
  shiftEnd: string;
  overnightShift: boolean;
  serviceDate: string;
  pickupDate: string;
  pickupTime: string;
  dropoffDate: string;
  dropoffTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  pickupCandidateCount: number;
  dropoffCandidateCount: number;
  notes: string;
}

export interface ShuttleManifestLocation {
  key: string;
  sequence: number;
  kind: "pickup" | "dropoff";
  location: string;
  plannedArrival: string;
  plannedDeparture: string;
  candidateCount: number;
  rows: ShuttleManifestRow[];
}

function prepareManifest(route: Routes, jobs: ReadonlyMap<number, Job>, scheduledDate: string) {
  const rows: ShuttleManifestRow[] = [];
  const pending = new Map<number, number[]>();
  const paired = new Map<number, Stop>();
  const consumed = new Set<number>();
  const locationGroups = new Map<Stop, Set<string>>();
  const visits: { stops: Stop[]; candidates: Set<string> }[] = [];
  const stopRows = new Map<Stop, ShuttleManifestRow>();
  let previousLocation = "";
  let candidates = new Set<string>();
  route.stops.forEach((stop, index) => {
    if (stop.job_id == null || (!pickup(stop) && !dropoff(stop))) {
      previousLocation = "";
      return;
    }
    const job = jobs.get(stop.job_id);
    const location = Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude)
      && Math.abs(stop.latitude) <= 90 && Math.abs(stop.longitude) <= 180
      ? `${stop.latitude.toFixed(4)},${stop.longitude.toFixed(4)}`
      : (stop.address_formatted || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    // Consecutive boarding/alighting at one place is one visit, including
    // boarding service time. A later trip to that place starts a new group.
    const locationKey = location ? JSON.stringify([location, pickup(stop) ? "pickup" : "dropoff", getJobLeg(job, stop.leg, route.leg)]) : "";
    if (!locationKey || locationKey !== previousLocation) {
      candidates = new Set<string>();
      visits.push({ stops: [], candidates });
    }
    visits[visits.length - 1].stops.push(stop);
    previousLocation = locationKey;
    const candidateId = shuttleValue(job, "candidate_id");
    candidates.add(candidateId ? `candidate:${candidateId}` : `job:${stop.job_id}`);
    if (locationKey) locationGroups.set(stop, candidates);
    const waiting = pending.get(stop.job_id) || [];
    if (pickup(stop)) {
      waiting.push(index);
      pending.set(stop.job_id, waiting);
    } else if (dropoff(stop)) {
      const match = waiting.findLastIndex(position => !stop.leg || !route.stops[position].leg || stop.leg === route.stops[position].leg);
      if (match >= 0) {
        paired.set(waiting[match], stop);
        waiting.splice(match, 1);
        consumed.add(index);
      }
    }
  });
  route.stops.forEach((stop, index) => {
    if (stop.job_id == null || (!pickup(stop) && !dropoff(stop)) || consumed.has(index)) return;
    const job = jobs.get(stop.job_id);
    const leg = getJobLeg(job, stop.leg, route.leg);
    const pickupStop = pickup(stop) ? stop : undefined;
    const dropoffStop = pickup(stop) ? paired.get(index) : stop;
    const direction = leg === "RETURN" ? "return" : "go";
    const pickupLocation = pickupStop ? manifestLocation(pickupStop) : MISSING;
    const dropoffLocation = dropoffStop ? manifestLocation(dropoffStop) : MISSING;
    const from = pickupLocation !== MISSING ? pickupLocation
      : shuttleValue(job, `${direction}_pickup_address`, "pick_up_address", direction === "go" ? "go_pickup_point" : "client_address") || MISSING;
    const to = dropoffLocation !== MISSING ? dropoffLocation
      : shuttleValue(job, `${direction}_dropoff_address`, "drop_off_address", direction === "return" ? "return_dropoff_point" : "client_address") || MISSING;
    const start = shuttleValue(job, "start_hour", "shift_start", "client_pick_up_time");
    const end = shuttleValue(job, "end_hour", "shift_end");
    const clock = (value: string) => {
      const formatted = manifestTime(value);
      const match = formatted.match(/^(\d+):(\d+) (AM|PM)$/);
      return match ? (Number(match[1]) % 12 + (match[3] === "PM" ? 12 : 0)) * 60 + Number(match[2]) : null;
    };
    const startMinutes = clock(start), endMinutes = clock(end);
    const bookingType = getJobPickupType(job);
    const row: ShuttleManifestRow = {
      key: `${stop.job_id}-${leg || "trip"}-${index}`, sequence: rows.length + 1, jobId: stop.job_id,
      candidateId: shuttleValue(job, "candidate_id") || MISSING,
      candidateName: shuttleValue(job, "candidate_name") || stop.candidate_name || `Job #${stop.job_id}`,
      candidatePhone: shuttleValue(job, "candidate_phone") || MISSING,
      clientName: shuttleValue(job, "client_name", "first_name") || MISSING,
      worksite: (leg === "RETURN" ? from : to) !== MISSING ? (leg === "RETURN" ? from : to)
        : shuttleValue(job, "client_address", "worksite_address", "work_address") || MISSING,
      pickupType: bookingType ? bookingType.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase()) : MISSING,
      leg: leg || "Trip", shift: shuttleValue(job, "shift", "shift_name", "shift_type") || MISSING,
      shiftReference: shuttleValue(job, "quart_id", "quant_id"),
      shiftStart: start ? manifestTime(start) : MISSING, shiftEnd: end ? manifestTime(end) : MISSING,
      overnightShift: startMinutes !== null && endMinutes !== null && endMinutes < startMinutes,
      serviceDate: manifestDate(job?.scheduled_date || scheduledDate),
      pickupDate: manifestDate(pickupStop?.arrival_time), pickupTime: manifestTime(pickupStop?.arrival_time),
      dropoffDate: manifestDate(dropoffStop?.arrival_time), dropoffTime: manifestTime(dropoffStop?.arrival_time),
      pickupLocation: from, dropoffLocation: to, notes: shuttleValue(job, "notes", "additional_notes"),
      pickupCandidateCount: pickupStop ? locationGroups.get(pickupStop)?.size || 0 : 0,
      dropoffCandidateCount: dropoffStop ? locationGroups.get(dropoffStop)?.size || 0 : 0,
    };
    rows.push(row);
    if (pickupStop) stopRows.set(pickupStop, row);
    if (dropoffStop) stopRows.set(dropoffStop, row);
  });
  const plannedAt = (stop: Stop) => [manifestDate(stop.arrival_time), manifestTime(stop.arrival_time)].filter(Boolean).join(" · ");
  const locations: ShuttleManifestLocation[] = visits.map((visit, index) => {
    const first = visit.stops[0];
    const visitRows = visit.stops.map(stop => stopRows.get(stop)!);
    return {
      key: `location-${index}`, sequence: index + 1,
      kind: pickup(first) ? "pickup" : "dropoff",
      location: manifestLocation(first) || (pickup(first) ? visitRows[0].pickupLocation : visitRows[0].dropoffLocation),
      plannedArrival: plannedAt(first), plannedDeparture: plannedAt(visit.stops[visit.stops.length - 1]),
      candidateCount: visit.candidates.size, rows: visitRows,
    };
  });
  return { rows, locations };
}

/** One row per directional passenger journey, in saved pickup order. */
export function prepareShuttleManifest(route: Routes, jobs: ReadonlyMap<number, Job>, scheduledDate: string): ShuttleManifestRow[] {
  return prepareManifest(route, jobs, scheduledDate).rows;
}

/** Boarding and alighting visits in saved route order; later visits stay separate. */
export function prepareShuttleManifestLocations(route: Routes, jobs: ReadonlyMap<number, Job>, scheduledDate: string): ShuttleManifestLocation[] {
  return prepareManifest(route, jobs, scheduledDate).locations;
}

/** Fetch every referenced job without relying on the current table's page or filters. */
export async function loadManifestJobs(ids: number[], fetchPage: (params: { job_ids: string; limit: number }) => Promise<Job[]>): Promise<Job[]> {
  const unique = [...new Set(ids)];
  const loaded = new Map<number, Job>();
  for (let offset = 0; offset < unique.length; offset += 100) {
    const batch = unique.slice(offset, offset + 100);
    for (const job of await fetchPage({ job_ids: batch.join(","), limit: batch.length })) loaded.set(job.id, job);
  }
  const missing = unique.filter(id => !loaded.has(id));
  if (missing.length) throw new Error(`${missing.length} referenced booking(s) could not be loaded. Refresh the plan before printing the manifest.`);
  return unique.map(id => loaded.get(id)!);
}
