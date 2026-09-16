"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Spin, Alert } from "antd";
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
  X,
} from "lucide-react";
import OptimizationView from "../_components/OptimizationView";
import { useOptimizationStore } from "@/store/optimization.store";
import type { UnassignedJob } from "@/types/routes.type";

// ── Reason-code metadata ────────────────────────────────────────────────────
type ReasonMeta = {
  label: string;
  Icon: React.ElementType;
  color: string;      // text colour class
  bgColor: string;    // bg colour class
  borderColor: string;
  fixSteps: string[];
};

const REASON_META: Record<string, ReasonMeta> = {
  TIME_DISTANCE_REACH: {
    label: "Timing / Distance Constraint",
    Icon: Clock,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    fixSteps: [
      "Add more team members who are stationed closer to the affected pickup locations.",
      "Extend the working hours of existing drivers to cover earlier / later time windows.",
      "Increase the reach-before buffer on affected jobs (e.g. from 10 min to 20 min) in job settings.",
      "Re-run the optimisation after making driver or job changes.",
    ],
  },
  NO_ELIGIBLE_DRIVER: {
    label: "No Eligible Driver",
    Icon: ShieldOff,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    fixSteps: [
      "Assign the required vehicle class or licence to one or more existing drivers.",
      "Add a new team member who already holds the required qualifications.",
      "Review vehicle skill requirements in the vehicle settings and relax if appropriate.",
    ],
  },
  DRIVER_UNAVAILABLE: {
    label: "Driver Fully Booked",
    Icon: CalendarX,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    fixSteps: [
      "Add more team members so there is spare capacity for this time window.",
      "Adjust working-hour schedules for currently booked drivers to open up a slot.",
      "Consider splitting existing routes to free up a driver for this job.",
    ],
  },
  CAPACITY_EXCEEDED: {
    label: "Vehicle Capacity Exceeded",
    Icon: Gauge,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-200",
    fixSteps: [
      "Assign a larger vehicle (e.g. a van or bus) to the route.",
      "Add another driver / vehicle to handle the overflow passengers.",
      "Split the passenger group into smaller batches across multiple routes.",
    ],
  },
  MAX_RIDE_TIME: {
    label: "Max Ride Time Exceeded",
    Icon: Gauge,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    fixSteps: [
      "Increase the maximum ride-time limit on affected jobs in job settings.",
      "Look for a pickup point closer to the dropoff location.",
      "Add a driver closer to the job area to shorten the total ride time.",
    ],
  },
  SKILL_MISMATCH: {
    label: "Driver Skill Mismatch",
    Icon: Users,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-200",
    fixSteps: [
      "Update driver profiles with the missing vehicle class / certification.",
      "Add a team member who already has the required skill set.",
      "Reassign the vehicle to a driver who meets its requirements.",
    ],
  },
};

const FALLBACK_META: ReasonMeta = {
  label: "Other Constraint",
  Icon: HelpCircle,
  color: "text-gray-500",
  bgColor: "bg-gray-50",
  borderColor: "border-gray-200",
  fixSteps: [
    "Review the individual job constraints (time windows, max ride time, etc.).",
    "Re-run the optimisation after adjusting driver availability or job parameters.",
    "Contact support if the issue persists.",
  ],
};

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
  const [isLoading, setIsLoading] = useState(true);
  const [isUnassignedExpanded, setIsUnassignedExpanded] = useState(true);
  /** Which reason-group's fix steps are currently open */
  const [openReasonCode, setOpenReasonCode] = useState<string | null>(null);
  /** Show the full per-job list */
  const [showJobList, setShowJobList] = useState(false);

  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    const currentId = currentOptimization?.id;
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

  const unassignedJobs: UnassignedJob[] =
    currentOptimization?.result?.unassigned_jobs || [];

  /** Group jobs by reason_code */
  const reasonGroups = useMemo(() => {
    const map = new Map<string, UnassignedJob[]>();
    unassignedJobs.forEach((job) => {
      const code = job.reason_code || "OTHER";
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(job);
    });
    // Sort descending by count
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [unassignedJobs]);

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
        <OptimizationView route={currentOptimization} />
      </div>

      {/* Unassigned Jobs Panel - Floating Bottom Right */}
      {unassignedJobs.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-32px)] transition-all duration-300">
          {isUnassignedExpanded ? (
            /* ── Expanded Panel ──────────────────────────────────────── */
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col">

              {/* Header */}
              <div
                onClick={() => setIsUnassignedExpanded(false)}
                className="px-3 py-2.5 bg-rose-50 border-b border-rose-100 flex items-center justify-between cursor-pointer select-none hover:bg-rose-100/70 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-rose-600 shrink-0" />
                  <span className="font-bold text-gray-900 text-xs">
                    Unassigned Jobs
                  </span>
                  <span className="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                    {unassignedJobs.length}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsUnassignedExpanded(false);
                  }}
                  title="Minimize"
                  className="text-gray-400 hover:text-gray-700 transition-colors p-0.5 rounded hover:bg-rose-200/60 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              {/* ── Reason Breakdown ───────────────────────────────────── */}
              <div className="border-b border-gray-100 px-3 py-2">
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={11} className="text-amber-500 shrink-0" />
                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                    Why &amp; How to Fix
                  </span>
                </div>

                <div className="space-y-1">
                  {reasonGroups.map(([code, jobs]) => {
                    const meta = REASON_META[code] ?? FALLBACK_META;
                    const { Icon, label, color, bgColor, borderColor, fixSteps } = meta;
                    const isOpen = openReasonCode === code;

                    return (
                      <div key={code} className={`rounded-lg border ${borderColor} overflow-hidden`}>
                        {/* Reason row */}
                        <button
                          type="button"
                          onClick={() => setOpenReasonCode(isOpen ? null : code)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 ${bgColor} hover:brightness-95 transition-all cursor-pointer text-left`}
                        >
                          <Icon size={11} className={`${color} shrink-0`} />
                          <span className={`text-[10.5px] font-semibold ${color} flex-1 truncate`}>
                            {label}
                          </span>
                          <span className={`text-[9px] font-bold ${color} bg-white/70 px-1.5 py-0.5 rounded-full border ${borderColor} shrink-0`}>
                            {jobs.length}
                          </span>
                          <ChevronRight
                            size={11}
                            className={`${color} shrink-0 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
                          />
                        </button>

                        {/* Fix steps */}
                        {isOpen && (
                          <div className="px-2.5 py-2 bg-white space-y-1.5">
                            <div className="flex items-center gap-1 mb-1">
                              <ListChecks size={10} className="text-emerald-600 shrink-0" />
                              <span className="text-[9.5px] font-semibold text-emerald-700 uppercase tracking-wide">
                                Suggested fix steps
                              </span>
                            </div>
                            {fixSteps.map((step, i) => (
                              <div key={i} className="flex items-start gap-1.5">
                                <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-emerald-100 text-emerald-700 text-[8px] font-bold flex items-center justify-center mt-0.5">
                                  {i + 1}
                                </span>
                                <span className="text-[10.5px] text-gray-700 leading-tight">
                                  {step}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Per-Job List Toggle ────────────────────────────────── */}
              <div className="px-3 py-1.5 border-b border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowJobList((v) => !v)}
                  className="flex items-center gap-1.5 text-[10.5px] text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                >
                  {showJobList ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <span className="font-semibold">
                    {showJobList ? "Hide" : "Show"} job list ({unassignedJobs.length})
                  </span>
                </button>
              </div>

              {/* ── Per-Job Cards ─────────────────────────────────────── */}
              {showJobList && (
                <div className="px-2.5 py-2 max-h-48 overflow-y-auto space-y-1.5">
                  {unassignedJobs.map((job, idx) => (
                    <div
                      key={job.job_id || idx}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-2 text-xs space-y-1 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900 text-[10.5px]">
                          Job #{job.job_id}
                        </span>
                        <span className="text-[9px] font-semibold text-rose-600 uppercase tracking-wide bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                          Unassigned
                        </span>
                      </div>

                      {job.address_formatted && (
                        <div className="flex items-start gap-1 text-gray-500 leading-tight text-[10.5px]">
                          <MapPin size={10} className="text-gray-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-1">{job.address_formatted}</span>
                        </div>
                      )}

                      {job.reason && (
                        <div className="flex items-start gap-1 p-1.5 bg-rose-50 border border-rose-100 rounded text-[10px] leading-tight">
                          <AlertCircle size={10} className="text-rose-500 shrink-0 mt-0.5" />
                          <span className="line-clamp-2 text-rose-700">{job.reason}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ── Minimised Pill ──────────────────────────────────────── */
            <div className="flex justify-end">
              <button
                onClick={() => setIsUnassignedExpanded(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full shadow-lg border border-gray-200 text-gray-800 hover:border-rose-300 hover:shadow-rose-100 transition-all cursor-pointer select-none group"
              >
                <AlertTriangle size={12} className="text-rose-600 shrink-0" />
                <span className="font-semibold text-xs text-gray-900">
                  Unassigned Jobs
                </span>
                <span className="bg-rose-600 text-white font-bold text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                  {unassignedJobs.length}
                </span>
                <ChevronUp
                  size={13}
                  className="text-gray-400 group-hover:text-gray-700 transition-colors"
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RoutePage;
