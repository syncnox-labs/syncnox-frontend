"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { isAxiosError } from "axios";
import { Spin, Alert, Select, message, Input, Checkbox, Button } from "antd";
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
} from "lucide-react";
import OptimizationView from "../_components/OptimizationView";
import { addStopToRoute, bulkAssignJobsToRoute, BULK_ASSIGNMENT_LIMIT } from "@/apis/routes.api";
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
  const [isUnassignedExpanded, setIsUnassignedExpanded] = useState(true);
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
  const [bulkRouteIndex, setBulkRouteIndex] = useState<number>();
  const [isBulkAssigning, setIsBulkAssigning] = useState(false);
  const assignmentInProgressRef = useRef(false);
  const [assigningJobId, setAssigningJobId] = useState<number | null>(null);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedJobIds([]);
    setBulkRouteIndex(undefined);
    setAssignmentError(null);
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

  const handleAssignJob = async (jobId: number, routeIndex: number) => {
    if (!id || assignmentInProgressRef.current || currentOptimization?.status === "processing" || currentOptimization?.status === "queued") return;
    assignmentInProgressRef.current = true;
    setAssigningJobId(jobId);
    try {
      message.loading({ content: "Assigning job...", key: "assign" });
      const result = await addStopToRoute(id, routeIndex, jobId);
      if (!result.success) throw new Error(result.message || "Failed to assign job");
      setSelectedJobIds((previous) => previous.filter((selectedId) => selectedId !== jobId));
      message.success({ content: "Job assigned successfully", key: "assign" });
      try {
        await fetchOptimization(id);
      } catch {
        message.error("Job assigned, but the route could not be refreshed. Reload to see the latest assignments.");
      }
    } catch (err: unknown) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined;
      message.error({ content: detail || (err instanceof Error ? err.message : "Failed to assign job"), key: "assign" });
    } finally {
      assignmentInProgressRef.current = false;
      setAssigningJobId(null);
    }
  };

  // ── Auto-poll when a worker is running ──────────────────────────────────────
  // After any async op (re-optimize, swap-driver) status becomes "processing".
  // Poll every 2.5s until it flips back to "completed" or "failed" so the UI
  // auto-refreshes without the user needing to manually reload.
  useEffect(() => {
    if (!id) return;
    const status = currentOptimization?.status;
    if (status !== "processing" && status !== "queued") return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        const updated = await fetchOptimization(id);
        const newStatus = updated?.status;
        if (newStatus === "completed" || newStatus === "failed") {
          clearInterval(timer);
        }
      } catch {
        // silently ignore transient fetch errors — keep polling
      }
    }, 2500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id, currentOptimization?.status, fetchOptimization]);


  const unassignedJobs = useMemo<UnassignedJob[]>(
    () => currentOptimization?.result?.unassigned_jobs || [],
    [currentOptimization?.result?.unassigned_jobs],
  );

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

      const fixedDriver =
        customFields.fixed_driver_name ||
        customFields.fixed_return_driver_name ||
        undefined;

      const reasonCode = unassignedJob.reason_code || "OTHER";
      const reasonMeta = REASON_META[reasonCode] ?? FALLBACK_META;
      const reasonParts = summarizeReasonText(unassignedJob.reason);

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
        fixedDriver: fixedDriver ? String(fixedDriver) : undefined,
      };
    });
  }, [jobs, unassignedJobs]);

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

  useEffect(() => {
    const available = new Set(unassignedJobs.map((job) => job.job_id));
    setSelectedJobIds((previous) => previous.filter((jobId) => available.has(jobId)));
  }, [unassignedJobs]);

  const visibleJobIds = [...new Set(filteredUnassignedJobCards.map((job) => job.job_id))];
  const selectedVisibleCount = visibleJobIds.filter((jobId) => selectedJobIds.includes(jobId)).length;
  const assignmentDisabled = isBulkAssigning || assigningJobId !== null || currentOptimization?.status === "processing" || currentOptimization?.status === "queued";

  const routeSelectOptions = useMemo(() => {
    return (currentOptimization?.result?.routes || []).map((driverRoute, index) => {
      const driverLabel = driverRoute.team_member_name || "No driver";
      const legBadge = driverRoute.leg ? ` (${driverRoute.leg})` : "";
      const jobStopsCount = (driverRoute.stops || []).filter((s) => s.job_id !== null).length;
      const capText = driverRoute.vehicle_capacity
        ? `${jobStopsCount}/${driverRoute.vehicle_capacity} seats`
        : `${jobStopsCount} stops`;
      return {
        value: index,
        label: `R${index + 1} · ${driverLabel}${legBadge} · ${capText}`,
        shortLabel: `R${index + 1} · ${driverLabel}${legBadge}`,
      };
    });
  }, [currentOptimization?.result?.routes]);

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
    if (!id || assignmentDisabled || assignmentInProgressRef.current || bulkRouteIndex === undefined || !currentOptimization?.result?.routes?.[bulkRouteIndex] || !selectedJobIds.length || selectedJobIds.length > BULK_ASSIGNMENT_LIMIT) return;
    assignmentInProgressRef.current = true;
    setIsBulkAssigning(true);
    setAssignmentTotal(selectedJobIds.length);
    setAssignmentError(null);
    const jobIds = [...selectedJobIds];
    try {
      const targetRoute = currentOptimization.result.routes[bulkRouteIndex];
      const response = await bulkAssignJobsToRoute(id, bulkRouteIndex, jobIds, targetRoute.team_member_id, targetRoute.leg);
      if (!response.success) throw new Error(response.message || "Failed to assign selected jobs");
      // The response includes the saved plan, so no additional fetch is needed.
      useOptimizationStore.setState((state) => state.currentOptimization?.id === id
        ? { currentOptimization: { ...state.currentOptimization, result: response.result } }
        : {});
      const assigned = new Set([...response.assigned_job_ids, ...response.already_assigned_job_ids]);
      setSelectedJobIds((previous) => previous.filter((jobId) => !assigned.has(jobId)));
      message.success(response.message);
    } catch (error: unknown) {
      // apiClient may reject with the decoded response body rather than AxiosError.
      const data = isAxiosError<{ detail?: unknown }>(error) ? error.response?.data : error;
      const detail = typeof data === "object" && data !== null && "detail" in data ? data.detail : undefined;
      const reason = typeof detail === "string" ? detail : error instanceof Error ? error.message : "Failed to assign selected jobs";
      setAssignmentError(reason);
      message.error("Bulk assignment did not complete. Your selection is kept; refresh if the request timed out, or retry safely.");
    } finally {
      assignmentInProgressRef.current = false;
      setIsBulkAssigning(false);
    }
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

      {/* Unassigned Jobs Panel - Floating Bottom Right */}
      {unassignedJobs.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-[410px] max-w-[calc(100vw-32px)] transition-all duration-300">
          {isUnassignedExpanded ? (
            /* ── Expanded Panel ──────────────────────────────────────── */
            <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/15 border border-slate-200/90 overflow-hidden flex flex-col max-h-[calc(100vh-88px)]">

              {/* ── 1. Header ─────────────────────────────────────────── */}
              <div
                onClick={() => setIsUnassignedExpanded(false)}
                className="px-4 py-3 bg-gradient-to-r from-rose-50/90 via-white to-amber-50/60 border-b border-slate-200/80 flex items-center justify-between cursor-pointer select-none hover:from-rose-100/60 transition-colors shrink-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
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
                      Drag onto a route or select a route to assign
                    </p>
                  </div>
                </div>
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

              {/* ── 2. Interactive Reason Filter & Fix Guide ──────────── */}
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

              {/* ── 3. Fixed Search & Bulk Selection Toolbar ──────────── */}
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

                {/* Bulk assign action bar (only shown when jobs are selected) */}
                {selectedJobIds.length > 0 && (
                  <div className="p-2 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Select
                        size="small"
                        className="flex-1 min-w-0"
                        placeholder="Choose route to assign..."
                        aria-label="Route for selected jobs"
                        value={bulkRouteIndex}
                        disabled={assignmentDisabled}
                        onChange={setBulkRouteIndex}
                        popupMatchSelectWidth={false}
                        options={routeSelectOptions.map((opt) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                      />
                      <Button
                        size="small"
                        type="primary"
                        loading={isBulkAssigning}
                        disabled={
                          assignmentDisabled ||
                          selectedJobIds.length > BULK_ASSIGNMENT_LIMIT ||
                          bulkRouteIndex === undefined ||
                          !currentOptimization.result?.routes?.[bulkRouteIndex]
                        }
                        onClick={handleBulkAssign}
                      >
                        Assign {selectedJobIds.length}
                      </Button>
                    </div>
                    {selectedJobIds.length > BULK_ASSIGNMENT_LIMIT && (
                      <p role="alert" className="m-0 text-[11px] text-rose-600 font-medium">
                        Select up to {BULK_ASSIGNMENT_LIMIT} jobs per batch.
                      </p>
                    )}
                    {isBulkAssigning && (
                      <p role="status" className="m-0 text-[11px] text-emerald-800">
                        Assigning {assignmentTotal} jobs to route…
                      </p>
                    )}
                  </div>
                )}

                {assignmentError && (
                  <Alert
                    className="max-h-24 overflow-y-auto text-xs"
                    type="warning"
                    showIcon
                    description={assignmentError}
                    closable
                    onClose={() => setAssignmentError(null)}
                  />
                )}
              </div>

              {/* ── 4. Scrollable Per-Job Cards List ──────────────────── */}
              <div className="px-3.5 py-2.5 overflow-y-auto flex-1 min-h-0 max-h-[360px] space-y-2.5 bg-slate-50/60">
                {filteredUnassignedJobCards.map((job, idx) => {
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
                      className={`group bg-white border rounded-xl p-3 text-xs space-y-2 transition-all cursor-pointer active:cursor-grabbing ${
                        isSelected
                          ? "border-emerald-500 ring-1 ring-emerald-500/30 bg-emerald-50/10 shadow-sm"
                          : "border-slate-200/90 shadow-xs hover:border-emerald-300 hover:shadow-md hover:shadow-slate-900/5"
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

                          <div className="w-7 h-7 rounded-full bg-[#003220] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                            <UserRound size={14} />
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
                              {job.scheduledTime && (
                                <span
                                  className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100/90 px-1.5 py-0.5 rounded leading-none"
                                  title="Scheduled shift / pickup time"
                                >
                                  <Clock size={10} className="text-slate-500" />
                                  {job.scheduledTime}
                                </span>
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

                        {/* Quick Assign Select */}
                        {routeSelectOptions.length > 0 && (
                          <div
                            className="shrink-0"
                            onClick={(event) => event.stopPropagation()}
                            onMouseDown={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <Select
                              size="small"
                              placeholder="Assign to..."
                              disabled={assignmentDisabled}
                              loading={assigningJobId === job.job_id}
                              style={{ width: 118, fontSize: "11px" }}
                              popupMatchSelectWidth={false}
                              onChange={(val) => {
                                if (val !== undefined && val !== null && job.job_id) {
                                  handleAssignJob(job.job_id, Number(val));
                                }
                              }}
                              value={null}
                              options={routeSelectOptions.map((opt) => ({
                                value: opt.value,
                                label: opt.label,
                              }))}
                            />
                          </div>
                        )}
                      </div>

                      {/* Location & Client Info */}
                      {(job.address || job.hasClientName) && (
                        <div className="pl-6 space-y-1 text-[11px]">
                          {job.address && (
                            <div className="flex items-start gap-1.5 text-slate-600 leading-snug">
                              <MapPin size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                              <span className="line-clamp-1 font-medium" title={job.address}>
                                {job.address}
                              </span>
                            </div>
                          )}
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
                })}

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
                onClick={() => setIsUnassignedExpanded(true)}
                className="flex items-center gap-2.5 px-3.5 py-2 bg-white rounded-full shadow-lg border border-rose-200 text-slate-800 hover:border-rose-300 hover:shadow-xl transition-all cursor-pointer select-none group"
              >
                <div className="w-5 h-5 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={12} />
                </div>
                <span className="font-bold text-xs text-slate-900">
                  Unassigned Jobs
                </span>
                <span className="bg-rose-600 text-white font-bold text-[10.5px] px-2 py-0.5 rounded-full leading-none">
                  {unassignedJobs.length}
                </span>
                <ChevronUp
                  size={14}
                  className="text-slate-400 group-hover:text-slate-700 transition-colors"
                />
              </button>
            </div>
          )}
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

export default RoutePage;
