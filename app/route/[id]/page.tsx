"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { Spin, Alert, Input, Checkbox, Button } from "antd";
import {
  AlertTriangle,
  AlertCircle,
  MapPin,
  ChevronUp,
  ChevronDown,
  Clock,
  ShieldOff,
  Users,
  Gauge,
  CalendarX,
  HelpCircle,
  Lightbulb,
  ChevronRight,
  ListChecks,
  UserRound,
  Building2,
  Eye,
  GripVertical,
  Search,
  Sparkles,
  X,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
} from "lucide-react";
import FloatingUnassignedPanel from "../_components/FloatingUnassignedPanel";
import OptimizationView from "../_components/OptimizationView";
import { useManualRoutingStore } from "@/store/manualRouting.store";
import { BULK_ASSIGNMENT_LIMIT } from "@/apis/routes.api";
import { formatRouteClock, manualJobTrip } from "../_components/manualRouting.utils";
import TripPlaces, { splitAddress } from "../_components/TripPlaces";
import { useOptimizationStore } from "@/store/optimization.store";
import { useJobsStore } from "@/store/jobs.store";
import type { UnassignedJob } from "@/types/routes.type";

// ── Reason-code metadata ────────────────────────────────────────────────────
type ReasonMeta = {
  label: string;
  shortSummary: string;
  Icon: React.ElementType;
  color: string;      // text colour class
  bgColor: string;    // bg colour class
  borderColor: string;
  badgeBg: string;
  fixSteps: string[];
};

const REASON_META: Record<string, ReasonMeta> = {
  JOB_TIME_CONFLICT: {
    label: "Conflicting Job Times",
    shortSummary: "One driver cannot reach both stops within their required time windows.",
    Icon: Clock,
    color: "text-amber-700",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100/80",
    fixSteps: [
      "Assign the conflicting jobs to separate drivers.",
      "Change a job time only if the client's shift permits it.",
    ],
  },
  NO_FEASIBLE_ROUTE_FOUND: {
    label: "No Route Found",
    shortSummary: "Could not fit within driver, vehicle, or time constraints.",
    Icon: Clock,
    color: "text-amber-700",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100/80",
    fixSteps: [
      "Check the job's scheduled time, fixed driver, and compatible vehicles.",
      "Review driver shift hours and configured early/late pickup allowances.",
      "Assign manually to a route below or adjust constraints and re-optimize.",
    ],
  },
  NO_FEASIBLE_ROUTE: {
    label: "No Route Found",
    shortSummary: "Could not fit within driver, vehicle, or time constraints.",
    Icon: Clock,
    color: "text-amber-700",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100/80",
    fixSteps: [
      "Check the job's scheduled time, fixed driver, and compatible vehicles.",
      "Review driver shift hours and configured early/late pickup allowances.",
      "Assign manually to a route below or adjust constraints and re-optimize.",
    ],
  },
  ROUTE_CONSTRAINTS: {
    label: "Route Constraint Conflict",
    shortSummary: "Conflicts with existing route timing or capacity constraints.",
    Icon: Clock,
    color: "text-amber-700",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100/80",
    fixSteps: [
      "Review time windows and stop sequence on target routes.",
      "Assign manually to an alternative driver or re-run optimization.",
    ],
  },
  TIME_DISTANCE_REACH: {
    label: "Timing / Distance Constraint",
    shortSummary: "Pickup or dropoff window cannot be reached in time.",
    Icon: Clock,
    color: "text-orange-700",
    bgColor: "bg-orange-50/80",
    borderColor: "border-orange-200",
    badgeBg: "bg-orange-100/80",
    fixSteps: [
      "Add drivers stationed closer to the pickup location.",
      "Extend driver working hours to cover earlier or later time windows.",
      "Increase the reach-before buffer in job settings and re-optimize.",
    ],
  },
  SHIFT_TIME_MISMATCH: {
    label: "Outside Driver Shift Hours",
    shortSummary: "Job time window falls outside all selected drivers' shifts.",
    Icon: CalendarX,
    color: "text-orange-700",
    bgColor: "bg-orange-50/80",
    borderColor: "border-orange-200",
    badgeBg: "bg-orange-100/80",
    fixSteps: [
      "Extend a driver's shift start/end time to cover this job's pickup window.",
      "Add an early or late shift driver available during this time.",
    ],
  },
  NO_ELIGIBLE_DRIVER: {
    label: "No Eligible Driver",
    shortSummary: "No available driver meets the qualification requirements.",
    Icon: ShieldOff,
    color: "text-purple-700",
    bgColor: "bg-purple-50/80",
    borderColor: "border-purple-200",
    badgeBg: "bg-purple-100/80",
    fixSteps: [
      "Assign the required vehicle class or licence to existing drivers.",
      "Add a team member who holds the required qualifications.",
      "Review vehicle skill requirements in settings and relax if appropriate.",
    ],
  },
  NO_DRIVER_AVAILABLE: {
    label: "No Driver Available",
    shortSummary: "No active or matching fixed driver was available.",
    Icon: ShieldOff,
    color: "text-purple-700",
    bgColor: "bg-purple-50/80",
    borderColor: "border-purple-200",
    badgeBg: "bg-purple-100/80",
    fixSteps: [
      "Ensure the job's fixed driver is selected and active for this optimization.",
      "Or clear the fixed driver restriction on the job to allow other drivers.",
    ],
  },
  DRIVER_UNAVAILABLE: {
    label: "Driver Fully Booked",
    shortSummary: "Drivers are already at capacity during this time window.",
    Icon: CalendarX,
    color: "text-blue-700",
    bgColor: "bg-blue-50/80",
    borderColor: "border-blue-200",
    badgeBg: "bg-blue-100/80",
    fixSteps: [
      "Add more drivers so there is spare capacity for this time window.",
      "Adjust working-hour schedules for booked drivers to open a slot.",
      "Consider splitting existing routes to free up a driver.",
    ],
  },
  VEHICLE_BOOKED: {
    label: "Vehicle Already Booked",
    shortSummary: "The selected vehicle has a conflicting confirmed booking.",
    Icon: CalendarX,
    color: "text-blue-700",
    bgColor: "bg-blue-50/80",
    borderColor: "border-blue-200",
    badgeBg: "bg-blue-100/80",
    fixSteps: ["Select an available vehicle or reschedule the conflicting booking."],
  },
  DRIVER_BOOKED: {
    label: "Driver Already Booked",
    shortSummary: "The driver has a conflicting confirmed booking.",
    Icon: CalendarX,
    color: "text-blue-700",
    bgColor: "bg-blue-50/80",
    borderColor: "border-blue-200",
    badgeBg: "bg-blue-100/80",
    fixSteps: ["Select an available driver or reschedule the conflicting booking."],
  },
  RESOURCE_BOOKED: {
    label: "Drivers and Vehicles Booked",
    shortSummary: "Confirmed bookings block every eligible driver and vehicle pairing.",
    Icon: CalendarX,
    color: "text-blue-700",
    bgColor: "bg-blue-50/80",
    borderColor: "border-blue-200",
    badgeBg: "bg-blue-100/80",
    fixSteps: ["Select available drivers and vehicles or reschedule conflicting bookings."],
  },
  CAPACITY_PRESSURE: {
    label: "Review Seat Availability",
    shortSummary: "Estimated passenger overlap exceeds seats; capacity is not a confirmed cause.",
    Icon: Gauge,
    color: "text-amber-700",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100/80",
    fixSteps: ["Review actual passenger overlap and trip sequencing before changing vehicle capacity."],
  },
  CAPACITY_EXCEEDED: {
    label: "Vehicle Capacity Exceeded",
    shortSummary: "More passengers at this time than available vehicle seats.",
    Icon: Gauge,
    color: "text-rose-700",
    bgColor: "bg-rose-50/80",
    borderColor: "border-rose-200",
    badgeBg: "bg-rose-100/80",
    fixSteps: [
      "Assign a higher-capacity vehicle (e.g. a 14-seat van or bus) to the route.",
      "Add another driver/vehicle operating around this peak time window.",
      "Or manually assign this job to a route that still has open seats.",
    ],
  },
  MAX_RIDE_TIME: {
    label: "Max Ride Time Exceeded",
    shortSummary: "Adding this stop would exceed the maximum passenger ride time.",
    Icon: Gauge,
    color: "text-amber-700",
    bgColor: "bg-amber-50/80",
    borderColor: "border-amber-200",
    badgeBg: "bg-amber-100/80",
    fixSteps: [
      "Increase the maximum ride-time limit on affected jobs in settings.",
      "Assign a driver closer to the job area to shorten total ride time.",
    ],
  },
  SKILL_MISMATCH: {
    label: "Driver Skill Mismatch",
    shortSummary: "Drivers on shift lack required vehicle skills or permits.",
    Icon: Users,
    color: "text-indigo-700",
    bgColor: "bg-indigo-50/80",
    borderColor: "border-indigo-200",
    badgeBg: "bg-indigo-100/80",
    fixSteps: [
      "Update driver profiles with the required vehicle certification.",
      "Add a team member who already has the required skill set.",
    ],
  },
  MANUALLY_REMOVED: {
    label: "Removed from Route",
    shortSummary: "This job was manually removed from a route.",
    Icon: AlertCircle,
    color: "text-slate-700",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    badgeBg: "bg-slate-100",
    fixSteps: [
      "Use 'Assign to...' on the card or drag it onto a route timeline.",
      "Or re-optimize the route to include it again.",
    ],
  },
  MANUALLY_ADDED: {
    label: "Added Manually",
    shortSummary: "Added to the unassigned pool and waiting to be routed.",
    Icon: Sparkles,
    color: "text-emerald-700",
    bgColor: "bg-emerald-50/80",
    borderColor: "border-emerald-200",
    badgeBg: "bg-emerald-100/80",
    fixSteps: [
      "Pick a route from 'Assign to...' on the job card or drag it onto a route.",
      "Or click 'Reoptimize All Routes' to automatically place it.",
    ],
  },
};

const FALLBACK_META: ReasonMeta = {
  label: "Other Constraint",
  shortSummary: "Could not be automatically assigned under current constraints.",
  Icon: HelpCircle,
  color: "text-slate-600",
  bgColor: "bg-slate-50",
  borderColor: "border-slate-200",
  badgeBg: "bg-slate-100",
  fixSteps: [
    "Review the individual job constraints (time windows, fixed driver, capacity).",
    "Assign manually to a route below or re-run optimization after adjustments.",
  ],
};

function formatShortTime(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2}:\d{2})(?::\d{2})?$/);
  if (match) return match[1];
  return trimmed;
}

function formatShortDate(raw?: string | null): string | null {
  if (!raw) return null;
  // Parse the calendar date locally so UTC conversion cannot shift the day.
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function summarizeReasonText(reason?: string): { primary: string; secondary?: string } {
  if (!reason) return { primary: "" };
  const cleaned = reason.trim();
  // Split out boilerplate disclaimers so the key constraint (like deadline 20:50 or seat counts) stands out
  const disclaimerSplit = cleaned.split(/\.\s+(?=This does not|Review actual passenger overlap)/i);
  if (disclaimerSplit.length > 1) {
    return {
      primary: `${disclaimerSplit[0].replace(/\.$/, "")}.`,
      secondary: disclaimerSplit.slice(1).join(". "),
    };
  }
  return { primary: cleaned };
}

// ── Component ────────────────────────────────────────────────────────────────
const RoutePage = () => {
  const params = useParams();

  const rawId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : undefined;
  const parsedId = rawId ? Number(rawId) : NaN;
  const id = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;

  const { fetchOptimization, currentOptimization, clearOptimization, error } =
    useOptimizationStore();
  const { jobs } = useJobsStore();
  const [isLoading, setIsLoading] = useState(true);
  // On a phone the open panel covers the whole plan, so it starts closed there; anyone's own choice wins.
  const [unassignedChoice, setIsUnassignedExpanded] = useState<boolean | null>(null);
  const isSmallScreen = useSyncExternalStore(subscribeSmallScreen, readSmallScreen, () => false);
  const isUnassignedExpanded = unassignedChoice ?? !isSmallScreen;
  /** Active reason filter ("ALL" or specific reason_code) */
  const [activeReasonFilter, setActiveReasonFilter] = useState<string>("ALL");
  /** Whether the "How to fix" steps drawer is expanded */
  const [showFixGuide, setShowFixGuide] = useState(false);
  /** Jobs whose full reason / tips are expanded inline */
  const [expandedReasonJobIds, setExpandedReasonJobIds] = useState<number[]>([]);
  const [requestedJobDetailsId, setRequestedJobDetailsId] = useState<
    number | null
  >(null);
  const [unassignedJobSearch, setUnassignedJobSearch] = useState("");
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  /** Full-size view of the unassigned jobs, and how it is drawn and ordered */
  const [isFullView, setIsFullView] = useState(false);
  const [fullViewMode, setFullViewMode] = useState<"table" | "cards">("table");
  const [unassignedSort, setUnassignedSort] = useState<{ key: "time" | "name" | "client" | "issue"; dir: 1 | -1 }>({ key: "time", dir: 1 });

  useEffect(() => {
    setSelectedJobIds([]);
    setActiveReasonFilter("ALL");
  }, [id]);

  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    const currentId = useOptimizationStore.getState().currentOptimization?.id;
    if (currentId === id) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetchOptimization(id)
      .then(() => {
        if (!cancelled) setIsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
      clearOptimization();
    };
  }, [id, fetchOptimization, clearOptimization]);

  const handleAssignJob = async (jobId: number, routeIndex?: number) => {
    if (!id) return;
    useManualRoutingStore.getState().open({ planId: id, action: "assign", jobIds: [jobId],
      routeIndex, placement: routeIndex === undefined ? "auto" : "existing" });
  };

  // The server can leave a job on its unassigned list after the job was placed by hand (seen on a plan:
  // return-only jobs with both stops on a trip, still listed as "no feasible route"). A job whose every
  // stop is already on a trip is not unassigned, so it is not offered for assigning a second time.
  const unassignedJobs = useMemo<UnassignedJob[]>(() => {
    const listed = currentOptimization?.result?.unassigned_jobs || [];
    const routed = new Map<string, number>();
    (currentOptimization?.result?.routes || []).forEach((trip) => trip.stops?.forEach((stop) => {
      if (stop.job_id == null) return;
      const type = String(stop.stop_type || "").toLowerCase();
      if (!["pickup", "pick_up", "dropoff", "drop_off"].includes(type)) return;
      routed.set(String(stop.job_id), (routed.get(String(stop.job_id)) ?? 0) + 1);
    }));
    if (routed.size === 0) return listed;
    const jobTypeById = new Map(jobs.map((job) => [String(job.id), String(job.job_type || "").toLowerCase()]));
    return listed.filter((item) => {
      const count = routed.get(String(item.job_id)) ?? 0;
      if (count === 0) return true;
      const type = jobTypeById.get(String(item.job_id)) ?? "";
      // One-way jobs need a pickup and a drop-off; round trips need both on each leg.
      const needed = type.includes("round") ? 4 : 2;
      return count < needed;
    });
  }, [currentOptimization?.result?.unassigned_jobs, currentOptimization?.result?.routes, jobs]);

  const unassignedJobCards = useMemo(() => {
    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    return unassignedJobs.map((unassignedJob) => {
      const fullJob = jobsById.get(unassignedJob.job_id);
      const customFields = fullJob?.custom_fields || {};
      const shuttleDetails = fullJob?.worker_shuttle_detail;
      const pickupDetails = fullJob?.pickup_delivery_detail;
      const fullName = [fullJob?.first_name, fullJob?.last_name]
        .filter(Boolean)
        .join(" ");
      const workerName = unassignedJob.worker_name?.trim();
      const isGeneratedWorkerName = Boolean(
        workerName && /^worker\s*\(\s*job\s*#?\d+\s*\)$/i.test(workerName),
      );

      const resolvedCandidate =
        unassignedJob.candidate_name ||
        shuttleDetails?.candidate_name ||
        fullJob?.candidate_name ||
        customFields.candidate_name ||
        fullName ||
        (!isGeneratedWorkerName ? workerName : undefined);

      const hasCandidateName = Boolean(resolvedCandidate && String(resolvedCandidate).trim());
      const candidateName = hasCandidateName
        ? String(resolvedCandidate).trim()
        : unassignedJob.job_name || `Job #${unassignedJob.job_id}`;

      const rawClientName =
        unassignedJob.client_name ||
        shuttleDetails?.client_name ||
        fullJob?.client_name ||
        pickupDetails?.client_name ||
        customFields.client_name ||
        fullJob?.business_name;

      const hasClientName = Boolean(rawClientName && String(rawClientName).trim());
      const clientName = hasClientName ? String(rawClientName).trim() : "Client not specified";

      const address =
        unassignedJob.address_formatted ||
        fullJob?.pick_up_address ||
        shuttleDetails?.pick_up_address ||
        customFields.candidate_address ||
        customFields.go_pickup_point ||
        fullJob?.address_formatted ||
        pickupDetails?.address_formatted;

      const scheduledTime = formatShortTime(
        unassignedJob.scheduled_time ||
          fullJob?.start_hour ||
          shuttleDetails?.start_hour ||
          customFields.start_hour ||
          fullJob?.time_window_start ||
          pickupDetails?.time_window_start,
      );
      const scheduledDate = formatShortDate(
        fullJob?.scheduled_date || currentOptimization?.scheduled_date,
      );

      const fixedDriver =
        customFields.team_leader_name || customFields.team_leader ||
        (fullJob?.job_type === "return_only" ? customFields.fixed_return_driver_name : customFields.fixed_driver_name) ||
        undefined;

      const reasonCode = unassignedJob.reason_code || "OTHER";
      const reasonMeta = REASON_META[reasonCode] ?? FALLBACK_META;
      const reasonParts = summarizeReasonText(unassignedJob.reason);

      // The trip as the Assign window describes it: which way it goes and what its time means.
      const jobTrip = fullJob ? manualJobTrip(fullJob) : null;
      const tripDirection = jobTrip?.direction || "";
      // A return after midnight belongs to the next day; the Assign window says so, and the order must follow it.
      const isNextDay = Boolean(jobTrip?.timeLabel.includes("(next day)"));
      const direction: "GO" | "RETURN" | "" = tripDirection === "GO" || tripDirection === "RETURN" ? tripDirection : "";
      const timeMeaning = direction === "GO" ? "Work starts" : direction === "RETURN" ? "Pickup" : "Scheduled";
      const toAddress =
        fullJob?.drop_off_address ||
        shuttleDetails?.drop_off_address ||
        customFields.drop_off_address ||
        undefined;
      // A deadline the optimizer names in its explanation, for example "(deadline 22:15)".
      const deadlineMatch = /deadline\s+(\d{1,2}:\d{2})/i.exec(unassignedJob.reason || "");

      return {
        ...unassignedJob,
        reasonCode,
        reasonMeta,
        reasonParts,
        hasCandidateName,
        candidateName: String(candidateName),
        hasClientName,
        clientName: String(clientName),
        address,
        scheduledTime,
        scheduledDate,
        fixedDriver: fixedDriver ? String(fixedDriver) : undefined,
        direction,
        timeMeaning,
        timeText: scheduledTime ? formatRouteClock(scheduledTime) : "",
        /** 24-hour "HH:MM" used only for sorting; jobs without a time go last. */
        timeSort: scheduledTime && /^\d{1,2}:\d{2}/.test(scheduledTime)
          ? isNextDay ? `${Number(scheduledTime.split(":")[0]) + 24}:${scheduledTime.split(":")[1].slice(0, 2)}` : scheduledTime.padStart(5, "0")
          : "99:99",
        isNextDay,
        deadlineText: deadlineMatch ? formatRouteClock(deadlineMatch[1]) : "",
        toAddress: toAddress ? String(toAddress) : undefined,
      };
    });
  }, [jobs, unassignedJobs, currentOptimization?.scheduled_date]);

  /** Group jobs by reason_code */
  const reasonGroups = useMemo(() => {
    const map = new Map<string, typeof unassignedJobCards>();
    unassignedJobCards.forEach((job) => {
      const code = job.reasonCode;
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(job);
    });
    // Sort descending by count
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [unassignedJobCards]);

  // Reset activeReasonFilter if that group no longer exists
  useEffect(() => {
    if (
      activeReasonFilter !== "ALL" &&
      !reasonGroups.some(([code]) => code === activeReasonFilter)
    ) {
      setActiveReasonFilter("ALL");
    }
  }, [activeReasonFilter, reasonGroups]);

  const filteredUnassignedJobCards = useMemo(() => {
    const query = unassignedJobSearch.trim().toLowerCase();
    return unassignedJobCards.filter((job) => {
      if (activeReasonFilter !== "ALL" && job.reasonCode !== activeReasonFilter) {
        return false;
      }
      if (!query) return true;
      return `${job.candidateName} ${job.clientName} ${job.address || ""} ${job.job_id} job ${job.job_id} job #${job.job_id}`
        .toLowerCase()
        .includes(query);
    });
  }, [unassignedJobCards, unassignedJobSearch, activeReasonFilter]);

  /** The filtered jobs in the chosen order. By default the job that leaves soonest is first. */
  const orderedUnassignedJobCards = useMemo(() => {
    const value = (job: (typeof filteredUnassignedJobCards)[number]) =>
      unassignedSort.key === "time" ? job.timeSort
        : unassignedSort.key === "name" ? job.candidateName.toLowerCase()
          : unassignedSort.key === "client" ? job.clientName.toLowerCase()
            : job.reasonMeta.label.toLowerCase();
    return [...filteredUnassignedJobCards].sort(
      (a, b) => value(a).localeCompare(value(b)) * unassignedSort.dir || a.timeSort.localeCompare(b.timeSort) || a.job_id - b.job_id,
    );
  }, [filteredUnassignedJobCards, unassignedSort]);

  useEffect(() => {
    const available = new Set(unassignedJobs.map((job) => job.job_id));
    setSelectedJobIds((previous) => previous.filter((jobId) => available.has(jobId)));
  }, [unassignedJobs]);

  const visibleJobIds = [...new Set(filteredUnassignedJobCards.map((job) => job.job_id))];
  const selectedVisibleCount = visibleJobIds.filter((jobId) => selectedJobIds.includes(jobId)).length;
  const assignmentDisabled = currentOptimization?.status === "processing" || currentOptimization?.status === "queued";

  const activeFixMeta = useMemo(() => {
    const targetCode =
      activeReasonFilter !== "ALL"
        ? activeReasonFilter
        : reasonGroups[0]?.[0] || "OTHER";
    const groupJobs =
      reasonGroups.find(([c]) => c === targetCode)?.[1] || [];
    const meta = REASON_META[targetCode] ?? FALLBACK_META;
    // Combine job-specific suggested_actions if available with fallback fixSteps
    const dynamicActions = Array.from(
      new Set(
        groupJobs.flatMap((j) => j.suggested_actions || []).filter(Boolean),
      ),
    );
    return {
      code: targetCode,
      meta,
      count: groupJobs.length,
      steps: dynamicActions.length > 0 ? dynamicActions : meta.fixSteps,
    };
  }, [activeReasonFilter, reasonGroups]);

  const handleBulkAssign = async () => {
    if (!id || !selectedJobIds.length || selectedJobIds.length > BULK_ASSIGNMENT_LIMIT) return;
    useManualRoutingStore.getState().open({ planId: id, action: "assign", jobIds: [...selectedJobIds],
      placement: "auto" });
  };

  // ── Pieces shared by the side panel and the full-size view ─────────────────
  const actionBar = (
              <div className="px-3.5 py-2.5 flex flex-wrap gap-2 border-b border-slate-100">
                <Button size="small" type="primary" disabled={assignmentDisabled || !selectedJobIds.length || selectedJobIds.length > BULK_ASSIGNMENT_LIMIT}
                  onClick={handleBulkAssign}>Assign selected{selectedJobIds.length ? ` (${selectedJobIds.length})` : ""}</Button>
                <Button size="small" disabled={assignmentDisabled} onClick={() => id && useManualRoutingStore.getState().open({ planId: id, action: "create", jobIds: [...selectedJobIds] })}>+ Create route</Button>
              </div>
  );

  const reasonFilterBlock = (
              <div className="px-3.5 py-2.5 border-b border-slate-200/80 bg-slate-50/70 shrink-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wider">
                    Filter by issue
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFixGuide((v) => !v)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                      showFixGuide
                        ? "bg-amber-100 text-amber-800"
                        : "text-amber-700 hover:bg-amber-50"
                    }`}
                  >
                    <Lightbulb size={12} className="text-amber-500 shrink-0" />
                    <span>{showFixGuide ? "Hide fix tips" : "How to fix"}</span>
                  </button>
                </div>

                {/* Filter chips */}
                <div className="flex flex-wrap gap-1.5">
                  {reasonGroups.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setActiveReasonFilter("ALL")}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border ${
                        activeReasonFilter === "ALL"
                          ? "bg-slate-800 text-white border-slate-800 shadow-xs"
                          : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <span>All</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          activeReasonFilter === "ALL"
                            ? "bg-white/20 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {unassignedJobs.length}
                      </span>
                    </button>
                  )}

                  {reasonGroups.map(([code, groupJobs]) => {
                    const meta = REASON_META[code] ?? FALLBACK_META;
                    const { Icon, label, color, bgColor, borderColor } = meta;
                    const isSelected = activeReasonFilter === code;

                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setActiveReasonFilter(
                            isSelected && reasonGroups.length > 1 ? "ALL" : code,
                          );
                        }}
                        title={`Filter by ${label}: ${meta.shortSummary}`}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer border ${
                          isSelected
                            ? `${bgColor} ${color} ${borderColor} ring-2 ring-offset-1 ring-slate-300 shadow-xs`
                            : `bg-white text-slate-700 border-slate-200 hover:${bgColor}`
                        }`}
                      >
                        <Icon size={12} className={`${color} shrink-0`} />
                        <span className="truncate max-w-[175px]">{label}</span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${meta.badgeBg} ${color}`}
                        >
                          {groupJobs.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Collapsible How-to-Fix Guide */}
                {showFixGuide && (
                  <div className="rounded-xl bg-white border border-amber-200/90 p-2.5 shadow-xs space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ListChecks size={13} className="text-emerald-600 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-800 truncate">
                          How to resolve: {activeFixMeta.meta.label} ({activeFixMeta.count})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFixGuide(false)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                        aria-label="Close fix guide"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 m-0 leading-snug">
                      {activeFixMeta.meta.shortSummary}
                    </p>
                    <div className="space-y-1 pt-0.5">
                      {activeFixMeta.steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 text-[9.5px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-[11px] text-slate-700 leading-snug">
                            {step}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
  );

  const searchSelectBlock = (
              <div className="px-3.5 py-2.5 bg-white border-b border-slate-200/80 shrink-0 space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    size="small"
                    allowClear
                    value={unassignedJobSearch}
                    onChange={(event) =>
                      setUnassignedJobSearch(event.target.value)
                    }
                    placeholder="Search name, client, location, or #ID..."
                    aria-label="Search unassigned jobs by candidate name or job ID"
                    prefix={<Search size={13} className="text-slate-400" />}
                    className="flex-1"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 text-xs">
                  <Checkbox
                    checked={visibleJobIds.length > 0 && selectedVisibleCount === visibleJobIds.length}
                    indeterminate={selectedVisibleCount > 0 && selectedVisibleCount < visibleJobIds.length}
                    disabled={assignmentDisabled || !visibleJobIds.length}
                    onChange={(event) =>
                      setSelectedJobIds((previous) =>
                        event.target.checked
                          ? [...new Set([...previous, ...visibleJobIds])]
                          : previous.filter((jobId) => !visibleJobIds.includes(jobId)),
                      )
                    }
                  >
                    <span className="text-[11.5px] font-medium text-slate-700">
                      Select all visible ({visibleJobIds.length})
                    </span>
                  </Checkbox>

                  {selectedJobIds.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {selectedJobIds.length} selected
                      </span>
                      <button
                        type="button"
                        disabled={assignmentDisabled}
                        onClick={() => setSelectedJobIds([])}
                        className="text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      Showing {filteredUnassignedJobCards.length} of {unassignedJobs.length}
                    </span>
                  )}
                </div>

                {selectedJobIds.length > BULK_ASSIGNMENT_LIMIT && <p role="alert" className="text-xs text-rose-600 m-0">Select up to {BULK_ASSIGNMENT_LIMIT} jobs per batch.</p>}
              </div>
  );

  /** One job as a card: when, who, where, for whom, why it is unassigned, and what you can do. */
  const renderJobCard = (job: (typeof unassignedJobCards)[number], idx: number) => {
                  const isSelected = selectedJobIds.includes(job.job_id);
                  const isReasonExpanded = expandedReasonJobIds.includes(job.job_id);
                  const { Icon: ReasonIcon, label: reasonLabel, color: reasonColor, bgColor: reasonBg, borderColor: reasonBorder } = job.reasonMeta;

                  return (
                    <div
                      key={`${job.job_id}-${idx}`}
                      draggable={!assignmentDisabled}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setRequestedJobDetailsId(job.job_id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setRequestedJobDetailsId(job.job_id);
                        }
                      }}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ type: "unassigned_job", jobId: job.job_id }),
                        );
                        e.dataTransfer.effectAllowed = "move";

                        const dragEl = document.getElementById("custom-drag-image");
                        const nameEl = document.getElementById("drag-candidate-name");
                        const idEl = document.getElementById("drag-job-id");

                        if (dragEl && nameEl && idEl) {
                          nameEl.textContent = job.candidateName;
                          idEl.textContent = `Job #${job.job_id}`;
                          e.dataTransfer.setDragImage(dragEl, 20, 20);
                        }
                      }}
                      className={`group border border-solid p-3 text-xs space-y-2 transition-colors cursor-pointer active:cursor-grabbing ${
                        isSelected
                          ? "border-[#0B5D3B] bg-[#F1F8F4] shadow-[inset_2px_0_0_#0B5D3B]"
                          : "border-slate-200 bg-white hover:border-[#0B5D3B]"
                      }`}
                      aria-label={`Open details for ${job.candidateName}`}
                    >
                      {/* Top row: Checkbox + Candidate Info + Quick Route Assign */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <span
                            className="pt-0.5"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                          >
                            <Checkbox
                              aria-label={`Select ${job.candidateName}, job #${job.job_id}`}
                              checked={isSelected}
                              disabled={assignmentDisabled}
                              onChange={(event) =>
                                setSelectedJobIds((previous) =>
                                  event.target.checked
                                    ? [...new Set([...previous, job.job_id])]
                                    : previous.filter((jobId) => jobId !== job.job_id),
                                )
                              }
                            />
                          </span>

                          {/* When: the time is the first thing read on the card, with what it means and which way the trip goes */}
                          <div className="w-[88px] shrink-0 whitespace-nowrap border-0 border-r border-solid border-slate-200 pr-2" title="Scheduled shift / pickup date and time">
                            <div className="text-[15px] font-semibold leading-5 tabular-nums text-slate-900">{job.timeText || "No time"}</div>
                            <div className="mt-0.5 flex items-center gap-1 text-[10.5px] font-medium leading-4 text-slate-500">
                              {job.direction === "RETURN" ? <ArrowLeft size={11} aria-hidden="true" /> : job.direction === "GO" ? <ArrowRight size={11} aria-hidden="true" /> : <Clock size={10} aria-hidden="true" />}
                              <span>{job.timeMeaning}</span>
                            </div>
                            {job.isNextDay && <div className="mt-0.5 text-[10.5px] font-medium leading-4 text-slate-500">next day</div>}
                            {job.deadlineText && <div className="mt-0.5 text-[10.5px] font-semibold leading-4 text-slate-700" title="The latest time the optimizer allowed for this job">by {job.deadlineText}</div>}
                            {job.scheduledDate && job.scheduledDate !== formatShortDate(currentOptimization?.scheduled_date) && (
                              <div className="mt-0.5 text-[10.5px] leading-4 text-slate-500">{job.scheduledDate}</div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className="font-bold text-slate-900 text-[12.5px] leading-tight truncate max-w-[155px]"
                                title={job.candidateName}
                              >
                                {job.candidateName}
                              </span>
                              {job.hasCandidateName && (
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md leading-none shrink-0">
                                  #{job.job_id}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-1 flex-wrap text-[10.5px] text-slate-500">
                              {!job.hasCandidateName && (
                                <span>Candidate name not set</span>
                              )}
                              {job.fixedDriver && (
                                <span
                                  className="inline-flex items-center gap-1 text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-medium leading-none truncate max-w-[130px]"
                                  title={`Fixed driver: ${job.fixedDriver}`}
                                >
                                  Driver: {job.fixedDriver}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0" onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
                          <Button size="small" disabled={assignmentDisabled} onClick={() => handleAssignJob(job.job_id)}>Assign…</Button>
                        </div>
                      </div>

                      {/* Location & Client Info */}
                      {(job.address || job.hasClientName) && (
                        <div className="space-y-1 text-[11px]">
                          {(job.address || job.toAddress) && <TripPlaces from={job.address} to={job.toAddress} />}
                          {job.hasClientName && (
                            <div className="flex items-start gap-1.5 text-slate-600 leading-snug">
                              <Building2 size={12} className="text-blue-500 shrink-0 mt-0.5" />
                              <span className="truncate" title={job.clientName}>
                                <span className="text-slate-400 font-medium mr-1">Client:</span>
                                <span className="font-semibold text-slate-700">{job.clientName}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Clear Diagnostic Reason Box */}
                      {job.reason && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedReasonJobIds((prev) =>
                              prev.includes(job.job_id)
                                ? prev.filter((id) => id !== job.job_id)
                                : [...prev, job.job_id],
                            );
                          }}
                          className={`rounded-lg border ${reasonBorder} ${reasonBg} p-2 transition-colors cursor-pointer`}
                          title="Click to expand or collapse full reason and fix suggestions"
                        >
                          <div className="flex items-center justify-between gap-1.5 mb-0.5">
                            <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold ${reasonColor}`}>
                              <ReasonIcon size={11} className="shrink-0" />
                              {reasonLabel}
                            </span>
                            <span className="text-[9.5px] text-slate-500 font-medium">
                              {isReasonExpanded ? "Less" : "Why?"}
                            </span>
                          </div>
                          <p className={`text-[10.5px] text-slate-700 m-0 leading-snug ${isReasonExpanded ? "" : "line-clamp-2"}`}>
                            {isReasonExpanded ? job.reason : job.reasonParts.primary}
                          </p>
                          {isReasonExpanded && job.suggested_actions && job.suggested_actions.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t border-black/5 space-y-1">
                              <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 block">
                                Suggested fix
                              </span>
                              {job.suggested_actions.map((act, i) => (
                                <div key={i} className="flex items-start gap-1.5 text-[10.5px] text-slate-700 leading-snug">
                                  <span className="text-emerald-600 font-bold">•</span>
                                  <span>{act}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Card Footer */}
                      <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1 text-[10.5px] text-emerald-700 font-semibold group-hover:text-emerald-800 transition-colors">
                          <Eye size={12} />
                          <span>View / edit job details</span>
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-slate-600 transition-colors"
                          title="Drag this card onto any route in the timeline"
                        >
                          <span>Drag to route</span>
                          <GripVertical size={13} className="text-slate-400" />
                        </span>
                      </div>
                    </div>
                  );
  };

  /** A column heading that sorts the full-size table. */
  const sortHeading = (key: "time" | "name" | "client" | "issue", label: string) => {
    const active = unassignedSort.key === key;
    return (
      <button
        type="button"
        onClick={() => setUnassignedSort((prev) => ({ key, dir: prev.key === key && prev.dir === 1 ? -1 : 1 }))}
        aria-label={`Sort by ${label}${active ? (unassignedSort.dir === 1 ? ", ascending" : ", descending") : ""}`}
        className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67] hover:text-[#12211A]"
      >
        {label}
        {active && (unassignedSort.dir === 1 ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />)}
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (error && !currentOptimization) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Alert
          message="Error Loading Optimization"
          description={error}
          type="error"
          showIcon
        />
      </div>
    );
  }

  if (!currentOptimization) {
    return (
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Alert
          message="Optimization Not Found"
          description="The requested optimization could not be found."
          type="warning"
          showIcon
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Optimization View - Full screen */}
      <div className="flex-1 min-h-0">
        <OptimizationView
          route={currentOptimization}
          requestedJobDetailsId={requestedJobDetailsId}
          onRequestedJobDetailsOpened={() => setRequestedJobDetailsId(null)}
        />
      </div>

      {/* Floating panel moves by its pill or expanded header. */}
      {unassignedJobs.length > 0 && !isFullView && (
        <FloatingUnassignedPanel expanded={isUnassignedExpanded}>
          {isUnassignedExpanded ? (
            /* ── Expanded Panel ──────────────────────────────────────── */
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 border border-slate-200/90 overflow-hidden flex flex-col max-h-[calc(100dvh-88px)]">

              {/* ── 1. Header ─────────────────────────────────────────── */}
              <div
                data-panel-drag-handle
                style={{ touchAction: "none" }}
                title="Drag to move; click to minimize. Alt + arrow keys to move with keyboard."
                role="button"
                tabIndex={0}
                aria-label="Minimize or move unassigned jobs panel"
                aria-expanded={true}
                onKeyDown={event => {
                  if (event.target !== event.currentTarget || event.altKey) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsUnassignedExpanded(false);
                  }
                }}
                onClick={() => setIsUnassignedExpanded(false)}
                className="px-4 py-3 bg-white border-b border-[#D5DCD8] flex items-center justify-between cursor-pointer select-none hover:bg-[#F3F6F4] transition-colors shrink-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="text-[#C9372C] flex items-center justify-center shrink-0">
                    <AlertTriangle size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm leading-tight">
                        Unassigned Jobs
                      </span>
                      <span className="bg-rose-600 text-white font-bold text-[11px] px-2 py-0.5 rounded-full leading-none shadow-xs">
                        {unassignedJobs.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 m-0 leading-tight mt-0.5">
                      Select jobs to review an assignment, or drag onto a route
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsFullView(true);
                  }}
                  aria-label="Open unassigned jobs in full view"
                  data-tip="Full view and table"
                  className="tip ml-auto mr-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <Maximize2 size={15} aria-hidden="true" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsUnassignedExpanded(false);
                  }}
                  title="Minimize panel"
                  className="text-slate-400 hover:text-slate-700 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <ChevronDown size={16} />
                </button>
              </div>

              {actionBar}
              {reasonFilterBlock}
              {searchSelectBlock}

              {/* ── 4. Scrollable Per-Job Cards List ──────────────────── */}
              <div className="px-3.5 py-2.5 overflow-y-auto flex-1 min-h-0 max-h-[360px] space-y-2.5 bg-slate-50/60">
                {orderedUnassignedJobCards.map((job, idx) => renderJobCard(job, idx))}

                {filteredUnassignedJobCards.length === 0 && (
                  <div className="py-8 px-4 text-center space-y-2">
                    <p className="text-xs font-medium text-slate-500 m-0">
                      No unassigned jobs match your filter.
                    </p>
                    {(unassignedJobSearch.trim() || activeReasonFilter !== "ALL") && (
                      <button
                        type="button"
                        onClick={() => {
                          setUnassignedJobSearch("");
                          setActiveReasonFilter("ALL");
                        }}
                        className="text-[11px] font-semibold text-emerald-700 hover:underline cursor-pointer"
                      >
                        Reset search &amp; filters
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ── Minimised Pill ──────────────────────────────────────── */
            <div className="flex justify-end">
              <button
                type="button"
                aria-expanded={false}
                data-panel-drag-handle
                style={{ touchAction: "none" }}
                title="Drag to move; click to open. Alt + arrow keys to move with keyboard."
                onClick={() => setIsUnassignedExpanded(true)}
                className="flex h-10 items-center gap-2.5 border border-[#B3B9C4] bg-white px-3 text-[#172B4D] shadow-[0_2px_8px_rgba(9,30,66,0.16)] hover:bg-[#F7F8F9] transition-colors cursor-pointer select-none group"
              >
                <AlertTriangle size={16} className="shrink-0 text-[#C9372C]" />
                <GripVertical size={14} className="text-slate-400 cursor-grab active:cursor-grabbing" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-[#172B4D]">
                  Unassigned jobs
                </span>
                <span className="min-w-5 bg-[#C9372C] px-1.5 py-1 text-center text-[11px] font-semibold leading-none text-white tabular-nums">
                  {unassignedJobs.length}
                </span>
                <ChevronUp
                  size={14}
                  className="text-slate-400 group-hover:text-slate-700 transition-colors"
                />
              </button>
            </div>
          )}
        </FloatingUnassignedPanel>
      )}

      {/* Full-size view: every unassigned job with all its facts side by side, as a table or as cards. */}
      {unassignedJobs.length > 0 && isFullView && (
        <div
          role="dialog"
          aria-label="Unassigned jobs, full view"
          className="lang absolute inset-3 z-[45] flex min-h-0 flex-col border border-solid border-[#D5DCD8] bg-white shadow-[0_8px_24px_rgba(18,33,26,0.16)]"
          onKeyDown={(event) => {
            if (event.key === "Escape") setIsFullView(false);
          }}
        >
          <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 border-0 border-b border-solid border-[#D5DCD8] px-5 pb-0 pt-4">
            <div className="min-w-0 pb-3">
              <p className="m-0 text-[11px] font-medium uppercase leading-4 tracking-[0.09em] text-[#626E67]">Not on any route</p>
              <p className="m-0 mt-0.5 flex items-baseline gap-2 text-lg font-medium leading-6 text-[#12211A]">
                <span className="tabular-nums text-[#C9372C]">{unassignedJobs.length}</span>
                unassigned job{unassignedJobs.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div role="tablist" aria-label="How to show the jobs" className="flex gap-4">
                {(["table", "cards"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={fullViewMode === mode}
                    onClick={() => setFullViewMode(mode)}
                    className={`inline-flex h-9 cursor-pointer items-center border-0 bg-transparent px-0 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B] ${
                      fullViewMode === mode ? "font-medium text-[#12211A] shadow-[inset_0_-2px_0_#0B5D3B]" : "text-[#4A5750] hover:text-[#12211A]"
                    }`}
                  >
                    {mode === "table" ? "Table" : "Cards"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsFullView(false)}
                aria-label="Back to the side panel"
                data-tip="Back to side panel"
                className="tip mb-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] hover:bg-[#EAEFEC] hover:text-[#12211A]"
              >
                <Minimize2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          {actionBar}
          {reasonFilterBlock}
          {searchSelectBlock}

          <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
            {orderedUnassignedJobCards.length === 0 ? (
              <p className="m-0 px-5 py-8 text-center text-[13px] text-[#626E67]">No unassigned jobs match your filter.</p>
            ) : fullViewMode === "cards" ? (
              <div className="grid gap-3 bg-slate-50/60 p-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
                {orderedUnassignedJobCards.map((job, idx) => renderJobCard(job, idx))}
              </div>
            ) : (
              <table className="w-full min-w-[1080px] border-collapse text-left text-[13px] text-[#12211A]">
                <thead className="sticky top-0 z-10 bg-[#F3F6F4]">
                  <tr className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">
                    <th scope="col" className="w-10 py-2.5 pl-5 pr-2"><span className="sr-only">Select</span></th>
                    <th scope="col" className="px-3 py-2.5 font-medium">{sortHeading("time", "Time")}</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">{sortHeading("name", "Name")}</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">From</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">To</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">{sortHeading("client", "Client")}</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Required driver</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">{sortHeading("issue", "Issue")}</th>
                    <th scope="col" className="py-2.5 pl-3 pr-5"><span className="sr-only">Assign</span></th>
                  </tr>
                </thead>
                <tbody>
                  {orderedUnassignedJobCards.map((job, idx) => {
                    const isSelected = selectedJobIds.includes(job.job_id);
                    const { Icon: ReasonIcon, label: reasonLabel, color: reasonColor } = job.reasonMeta;
                    return (
                      <tr
                        key={`${job.job_id}-${idx}`}
                        tabIndex={0}
                        onClick={() => setRequestedJobDetailsId(job.job_id)}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter") setRequestedJobDetailsId(job.job_id);
                        }}
                        aria-label={`Open details for ${job.candidateName}`}
                        className={`cursor-pointer border-0 border-b border-solid border-[#E3E8E5] align-top outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B5D3B] ${
                          isSelected ? "bg-[#F1F8F4] shadow-[inset_2px_0_0_#0B5D3B]" : "hover:bg-[#F8FAF9]"
                        }`}
                      >
                        <td className="py-2.5 pl-5 pr-2" onClick={(event) => event.stopPropagation()}>
                          <Checkbox
                            aria-label={`Select ${job.candidateName}, job #${job.job_id}`}
                            checked={isSelected}
                            disabled={assignmentDisabled}
                            onChange={(event) =>
                              setSelectedJobIds((previous) =>
                                event.target.checked ? [...new Set([...previous, job.job_id])] : previous.filter((jobId) => jobId !== job.job_id),
                              )
                            }
                          />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <div className="font-medium tabular-nums">{job.timeText || "No time"}</div>
                          <div className="mt-0.5 flex items-center gap-1 text-xs text-[#626E67]">
                            {job.direction === "RETURN" ? <ArrowLeft size={12} aria-hidden="true" /> : job.direction === "GO" ? <ArrowRight size={12} aria-hidden="true" /> : null}
                            {job.timeMeaning}
                          </div>
                          {job.isNextDay && <div className="mt-0.5 text-xs text-[#626E67]">next day</div>}
                          {job.deadlineText && <div className="mt-0.5 text-xs font-medium text-[#12211A]" title="The latest time the optimizer allowed for this job">by {job.deadlineText}</div>}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="whitespace-nowrap font-medium">{job.candidateName}</div>
                          <div className="mt-0.5 text-xs tabular-nums text-[#626E67]">{job.hasCandidateName ? `#${job.job_id}` : "Candidate name not set"}</div>
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5" title={job.address || undefined}>
                          <div className="truncate">{splitAddress(job.address).main || "–"}</div>
                          {splitAddress(job.address).rest && <div className="mt-0.5 truncate text-xs text-[#626E67]">{splitAddress(job.address).rest}</div>}
                        </td>
                        <td className="max-w-[220px] px-3 py-2.5" title={job.toAddress || undefined}>
                          <div className="truncate">{splitAddress(job.toAddress).main || "–"}</div>
                          {splitAddress(job.toAddress).rest && <div className="mt-0.5 truncate text-xs text-[#626E67]">{splitAddress(job.toAddress).rest}</div>}
                        </td>
                        <td className="max-w-[180px] px-3 py-2.5"><span className="line-clamp-2" title={job.hasClientName ? job.clientName : undefined}>{job.hasClientName ? job.clientName : "–"}</span></td>
                        <td className="max-w-[160px] px-3 py-2.5 text-[#4A5750]"><span className="line-clamp-2" title={job.fixedDriver}>{job.fixedDriver || "–"}</span></td>
                        <td className="max-w-[300px] px-3 py-2.5">
                          <div className={`flex items-center gap-1.5 whitespace-nowrap font-medium ${reasonColor}`}>
                            <ReasonIcon size={13} aria-hidden="true" className="shrink-0" />
                            {reasonLabel}
                          </div>
                          {job.reason && <div className="mt-0.5 line-clamp-1 text-xs text-[#626E67]" title={job.reason}>{job.reasonParts.primary}</div>}
                        </td>
                        <td className="whitespace-nowrap py-2.5 pl-3 pr-5 text-right" onClick={(event) => event.stopPropagation()}>
                          <Button size="small" disabled={assignmentDisabled} onClick={() => handleAssignJob(job.job_id)}>Assign…</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Hidden drag image container */}
      <div
        id="custom-drag-image"
        className="fixed -top-[1000px] -left-[1000px] pointer-events-none bg-white border border-slate-200 rounded-xl p-2.5 shadow-xl flex items-center gap-2.5 z-[-1]"
        aria-hidden="true"
      >
        <div className="w-8 h-8 rounded-full bg-[#003220] text-white flex items-center justify-center shrink-0">
          <UserRound size={15} />
        </div>
        <div className="min-w-0">
          <div id="drag-candidate-name" className="font-bold text-slate-900 text-[12px] truncate max-w-[200px]"></div>
          <div id="drag-job-id" className="text-[9.5px] text-slate-400 font-medium mt-0.5"></div>
        </div>
      </div>
    </div>
  );
};

const SMALL_SCREEN = "(max-width: 767px)";
const subscribeSmallScreen = (onChange: () => void) => {
  const query = window.matchMedia(SMALL_SCREEN);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readSmallScreen = () => window.matchMedia(SMALL_SCREEN).matches;

export default RoutePage;
