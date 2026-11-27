import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button, App, message, Input, InputNumber, TimePicker, DatePicker, Select } from "antd";
import AddressAutocomplete, { AddressData } from "@/components/AddressAutocomplete";
import {
  CloseOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  EditOutlined,
  SaveOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import {
  User,
  MapPin,
  Clock,
  Building2,
  Phone,
  Mail,
  Flag,
  Calendar,
  Timer,
  FileText,
  Repeat,
  Navigation,
  Sparkles,
} from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import { formatTime12h } from "@/utils/app.utils";
import { getJobLeg, getJobPickupType } from "@/utils/jobPickupType.utils";
import { updateJobStatus } from "@/apis/jobs.api";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";
import { useDepotStore } from "@/store/depots.store";
import { useLocationMappingStore } from "@/store/location-mapping.store";
import { getJobJourneyStops, getJobStopEstimates, getStopProgress, reconcileStopProgress, type JobTimingStop } from "./jobStopEstimates.utils";
import { buildJobEditPatch } from "./jobEditPatch.utils";
import { stopStatusConfirm } from "./stopStatusConfirm";

interface JobDetailsCardProps {
  stopData: any | null;
  job: Job | null;
  stopIndex?: number;
  driverName?: string;
  leg?: string;
  routeStops?: readonly JobTimingStop[];
  isUnassigned?: boolean;
  onClose: () => void;
  onRemoveJob?: () => void;
  onJobSaved?: (info: { requiresReOptimization: boolean, timeChanged: boolean, startTime?: string, endTime?: string, oldStartTime?: string, oldEndTime?: string }) => void | Promise<void>;
  onEditJob?: (job: Job) => void;
  onShowLocation?: (kind: "pickup" | "dropoff") => void;
  onEditETA?: (kind: "pickup" | "dropoff" | "arrival", arrival: string) => void;
  onEditVehicle?: () => void;
  onMergeAdjacentRoute?: () => void;
  vehicleName?: string | null;
  isFullscreen?: boolean;
  /** False before the plan is shared or before its day: completing or skipping a stop cannot have happened yet. */
  runDayActionsReady?: boolean;
  /** Why the run-day actions are off, in one sentence. */
  runDayActionsReason?: string;
}

/** Pickup / drop-off / depot / break badge shown in the card header. */
const STOP_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  pickup: {
    label: "Pickup",
    className: "bg-emerald-100 text-emerald-900 border-emerald-400 font-extrabold",
  },
  dropoff: {
    label: "Drop-off",
    className: "bg-blue-100 text-blue-900 border-blue-400 font-extrabold",
  },
  drop_off: {
    label: "Drop-off",
    className: "bg-blue-100 text-blue-900 border-blue-400 font-extrabold",
  },
  depot: {
    label: "Depot",
    className: "bg-amber-100 text-amber-900 border-amber-400 font-extrabold",
  },
  depot_start: {
    label: "Depot Start",
    className: "bg-amber-100 text-amber-900 border-amber-400 font-extrabold",
  },
  depot_end: {
    label: "Depot End",
    className: "bg-amber-100 text-amber-900 border-amber-400 font-extrabold",
  },
  break: {
    label: "Break",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
  unassigned: {
    label: "Unassigned",
    className: "bg-rose-50 text-rose-700 border-rose-200 font-extrabold",
  },
};

const Field: React.FC<{
  icon: React.ReactNode;
  label: string;
  valueClassName?: string;
  children: React.ReactNode;
}> = ({ icon, label, valueClassName, children }) => (
  <div className="flex flex-col gap-0.5">
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-900">
      {icon}
      <span>{label}</span>
    </div>
    <div
      className={
        valueClassName ?? "text-xs text-gray-600 font-medium truncate pl-4.5"
      }
    >
      {children}
    </div>
  </div>
);

const DetailSection = ({ title, badge, children, compact = false }: { title: string; badge?: React.ReactNode; children: React.ReactNode; compact?: boolean }) => (
  <section className={`${compact ? "space-y-2 pb-4" : "space-y-3 pb-4"} border-b border-[#E3E8E5] last:border-0 last:pb-0`} aria-label={title}>
    <h3 className="m-0 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-[#626E67]">{title}{badge}</h3>
    {children}
  </section>
);

/** Label above value, the way every record screen shows fields. */
const KeyValue = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <div className="text-[11px] text-[#626E67]">{label}</div>
    <div className="mt-0.5 text-[13px] text-[#12211A] break-words">{children}</div>
  </div>
);

const EstimatedTime = ({ value }: { value?: string }) => (
  <span className="inline-flex items-center gap-1.5 flex-wrap">
    <span>{value ? formatTime12h(value) : "Not scheduled"}</span>
    {value && dayjs(value).isValid() && (
      <time dateTime={value} className="text-[11px] font-normal text-[#626E67]">
        {dayjs(value).format("ddd, MMM D")}
      </time>
    )}
  </span>
);

const minutesText = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

const ProgressBadge = ({ progress }: { progress: ReturnType<typeof getStopProgress> }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-normal ${
    progress.status === "completed" ? "text-[#0B5D3B]" : progress.status === "failed" ? "text-[#C9372C]" : "text-[#626E67]"}`}>
    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${
      progress.status === "completed" ? "bg-[#0B5D3B]" : progress.status === "failed" ? "bg-[#C9372C]" : "bg-[#9AA59F]"}`} />
    {progress.label}
  </span>
);

const ActualTime = ({ value, timezone }: { value?: string; timezone?: string }) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return <span>Not recorded</span>;
  const date = new Date(value);
  return <time dateTime={value} className="inline-flex flex-wrap items-center gap-1.5">
    <span>{new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).format(date)}</span>
    <span className="text-[10px] font-semibold text-slate-500">
      {new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(date)}
    </span>
  </time>;
};

const JobDetailsCard: React.FC<JobDetailsCardProps> = ({
  stopData,
  job: selectedJob,
  stopIndex = 0,
  driverName,
  leg,
  routeStops,
  isUnassigned = false,
  onClose,
  onRemoveJob,
  onJobSaved,
  onEditJob,
  onShowLocation,
  onEditETA,
  onEditVehicle,
  onMergeAdjacentRoute,
  vehicleName,
  isFullscreen = false,
  runDayActionsReady = true,
  runDayActionsReason,
}) => {
  const { patchJobLocally, updateJobAction, jobs } = useJobsStore();
  const job = jobs.find(item => item.id === (selectedJob?.id ?? stopData?.job_id)) ?? selectedJob;
  const { modal } = App.useApp();
  const { fetchRoutes, selectedStatus } = useRouteStore();
  const { depots } = useDepotStore();
  const { locationMappings } = useLocationMappingStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveInFlight = useRef(false);

  const predefinedLocations = useMemo(() => {
    const opts: { label: string; addressData: AddressData }[] = [];
    
    depots.forEach(depot => {
      opts.push({
        label: `Depot: ${depot.name}`,
        addressData: {
          address_formatted: depot.address?.formatted_address || '',
          location: { lat: depot.location?.lat || 0, lng: depot.location?.lng || 0 },
        }
      });
    });

    locationMappings.forEach(loc => {
      opts.push({
        label: `Location: ${loc.name || loc.address || ''}`,
        addressData: {
          address_formatted: loc.address || '',
          location: { lat: loc.latitude || 0, lng: loc.longitude || 0 },
        }
      });
    });

    return opts;
  }, [depots, locationMappings]);

  // Nothing to show is decided after every hook has run, so hook order never changes between renders.
  const isEmpty = !stopData && !job;

  const jobId = job?.id || stopData?.job_id;
  const status = job?.status || stopData?.status || "assigned";
  const priority = (
    job?.priority_level ||
    (job as any)?.priority ||
    "medium"
  ).toLowerCase();

  const stopType = String(stopData?.stop_type || "").toLowerCase();
  const isDepotStop = stopType.includes("depot");
  const isPickupStop = stopType === "pickup" || stopType === "pick_up"
    || (stopType === "job" && (job?.template_type === "worker_shuttle" || Boolean(job?.worker_shuttle_detail)));
  const isDropoffStop = stopType === "dropoff" || stopType === "drop_off";
  const stopBadge = STOP_TYPE_BADGES[isPickupStop ? "pickup" : stopType];

  const isShuttle =
    job?.template_type === "worker_shuttle" ||
    Boolean(job?.worker_shuttle_detail) ||
    isPickupStop ||
    isDropoffStop;

  const arrivalTime = stopData?.arrival_time
    ? formatTime12h(stopData.arrival_time)
    : "--:--";
  const serviceDuration =
    stopData?.service_duration_minutes || job?.service_duration || 0;

  const customerName =
    job?.first_name || job?.last_name
      ? `${job.first_name || ""} ${job.last_name || ""}`.trim()
      : (job as any)?.customer_name || "-";
  const phone = job?.phone_number || (job as any)?.customer_phone || "-";
  const email = job?.email || (job as any)?.customer_email || "-";
  const companyName = job?.business_name || "-";
  const timeWindow =
    job?.time_window_start && job?.time_window_end
      ? `${formatTime12h(job.time_window_start)} - ${formatTime12h(job.time_window_end)}`
      : "-";

  const driverLabel = driverName
    ? driverName.split(" ")[0].toUpperCase()
    : "DR1";

  const shuttleValue = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const candidates = [
        (job as any)?.[key],
        (job?.worker_shuttle_detail as any)?.[key],
        (job?.custom_fields as any)?.[key],
      ];
      const hit = candidates.find(
        (v) => v !== undefined && v !== null && v !== "",
      );
      if (hit !== undefined) return String(hit);
    }
    return undefined;
  };

  const dash = (value?: string | number | null) =>
    value === undefined || value === null || value === "" ? "-" : String(value);

  const candidateName = shuttleValue("candidate_name");
  const candidatePhone = shuttleValue("candidate_phone");
  const passengerName = shuttleValue("client_name", "first_name");
  const pickUpAddress = shuttleValue(
    "pick_up_address",
    "go_pickup_point",
    "candidate_address",
  ) || (isPickupStop ? stopData?.address_formatted : undefined);
  const dropOffAddress = shuttleValue(
    "drop_off_address",
    "return_dropoff_point",
    "client_address",
  ) || (isDropoffStop ? stopData?.address_formatted : undefined);

  const jobLeg = getJobLeg(job, stopData?.leg || stopData?.extra?.leg, leg);
  const estimates = getJobStopEstimates(job, stopData, routeStops, isUnassigned);
  const journeyStops = getJobJourneyStops(job, stopData, routeStops, isUnassigned);
  // Run-day actions follow this stop's own day, not the plan's: a plan's trips can start the day before.
  const stopMoment = (isDropoffStop ? estimates.dropoff : isPickupStop ? estimates.pickup : undefined) || stopData?.arrival_time;
  const stopDayNotStarted = Boolean(stopMoment && dayjs(stopMoment).isValid() && dayjs(stopMoment).isAfter(dayjs(), "day"));
  const actionsReady = runDayActionsReady && !stopDayNotStarted;
  const actionsReason = !runDayActionsReady
    ? runDayActionsReason || "This stop's day has not started yet."
    : `This stop is on ${dayjs(stopMoment).format("ddd, MMM D")}, which has not started.`;
  const selectedKind = isDropoffStop ? "dropoff" : isPickupStop ? "pickup" : "arrival";
  // A job's status speaks for its stops only when the job is one direction (one pickup, one drop-off).
  // Legacy combined bookings carry both legs under one job, so there the stops keep their own status.
  const singleLegJob = ["one_way", "return_only", "go_only"].includes(String(job?.job_type || "").toLowerCase());
  const jobStatusForStops = singleLegJob ? job?.status : undefined;
  const selectedProgress = reconcileStopProgress(getStopProgress(
    (isDropoffStop ? journeyStops.dropoff : journeyStops.pickup) ?? stopData,
    selectedKind, isShuttle,
  ), jobStatusForStops, selectedKind, isShuttle);
  const startHour = formatTime12h(shuttleValue("start_hour"));
  const endHour = formatTime12h(shuttleValue("end_hour"));
  const pickupType = getJobPickupType(job);
  const scheduledDate =
    job?.scheduled_date ||
    shuttleValue("scheduled_date") ||
    stopData?.scheduled_date;

  const formatPickupType = (val?: string) => {
    if (!val || val === "-") return "-";
    return String(val)
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };

  const reachBeforeMinutes =
    job?.reach_before_minutes ??
    (job?.worker_shuttle_detail as any)?.reach_before_minutes ??
    (job?.custom_fields as any)?.reach_before_minutes;

  const notes = isShuttle
    ? dash(
        shuttleValue("notes", "additional_notes", "dress_code") ||
          job?.additional_notes,
      )
    : job?.additional_notes || (job as any)?.notes || "-";

  const address =
    (isShuttle
      ? stopData?.address_formatted ||
        (isPickupStop ? pickUpAddress : undefined) ||
        (isDropoffStop ? dropOffAddress : undefined)
      : job?.address_formatted || stopData?.address_formatted) ||
    job?.address_formatted ||
    stopData?.address_formatted ||
    "Address not specified";

  const getPriorityBadgeClass = (p: string) => {
    switch (p) {
      case "high":
      case "urgent":
        return "bg-red-50 text-red-700 border-red-200";
      case "medium":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "low":
        return "bg-slate-100 text-slate-700 border-slate-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const getInitialEditValues = () => ({
    scheduled_date: job?.scheduled_date || stopData?.scheduled_date || "",
    job_type: job?.job_type || shuttleValue("job_type", "pickup_type") || "one_way",
    start_hour: shuttleValue("start_hour") || "",
    end_hour: shuttleValue("end_hour") || "",
    pickup_type: pickupType || "",
    quart_id: shuttleValue("quart_id", "quant_id") || "",
    reach_before_minutes: Number(reachBeforeMinutes ?? 10),
    pick_up_address: pickUpAddress || "",
    pick_up_location: (job?.worker_shuttle_detail as any)?.pick_up_location || job?.location || undefined,
    drop_off_address: dropOffAddress || "",
    drop_off_location: (job?.worker_shuttle_detail as any)?.drop_off_location || undefined,
    candidate_name: shuttleValue("candidate_name") || "",
    candidate_phone: shuttleValue("candidate_phone") || "",
    candidate_id: shuttleValue("candidate_id") || "",
    client_name: (isShuttle ? shuttleValue("client_name", "first_name") : customerName !== "-" ? customerName : "") || "",
    client_phone: (isShuttle ? shuttleValue("client_phone", "phone_number") : phone !== "-" ? phone : "") || "",
    client_id: shuttleValue("client_id") || "",
    client_email: job?.pickup_delivery_detail?.client_email || job?.client_email || "",
    notes: notes !== "-" ? notes : "",
    address_formatted: job?.address_formatted || "",
    location: job?.location || undefined,
    time_window_start: job?.time_window_start || "",
    time_window_end: job?.time_window_end || "",
    service_duration: job?.service_duration || 0,
    priority_level: job?.priority_level || "medium",
  });

  const [editValues, setEditValues] = useState(getInitialEditValues);

  useEffect(() => {
    if (job && !isEditing) {
      setEditValues(getInitialEditValues());
    }
  }, [job, isEditing]);

  const handleUpdateStatus = async (newStatus: "completed" | "failed") => {
    if (!jobId) return;
    const kind = isPickupStop ? "pickup" : isDropoffStop ? "dropoff" : "stop";
    const when = kind === "pickup" ? estimates.pickup : kind === "dropoff" ? estimates.dropoff : stopData?.arrival_time;
    const confirm = stopStatusConfirm({
      action: newStatus, kind, jobId,
      who: (isShuttle ? candidateName : undefined) || (customerName !== "-" ? customerName : undefined),
      whenText: when && dayjs(when).isValid() ? `${dayjs(when).format("h:mm A")} · ${dayjs(when).format("ddd, MMM D")}` : null,
      address: address && address !== "Address not specified" ? address : null,
      note: [
        actionsReady ? null : actionsReason,
        // Completing a drop-off closes the whole job, so a pickup not yet recorded is closed with it.
        newStatus === "completed" && kind === "dropoff"
          && reconcileStopProgress(getStopProgress(journeyStops.pickup, "pickup"), jobStatusForStops, "pickup").status === "pending"
          ? "The pickup is not recorded yet. Completing the drop-off also closes the pickup." : null,
      ].filter(Boolean).join(" ") || null,
    });
    modal.confirm({
      ...confirm.modal,
      onOk: async () => {
        try {
          setIsUpdating(true);
          const updated = await updateJobStatus(jobId, confirm.targetStatus);
          patchJobLocally(updated);
          await fetchRoutes(selectedStatus);
          message.success(confirm.successText);
          onClose();
        } catch {
          message.error(confirm.errorText);
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const handleSaveJob = async () => {
    if (!job || !jobId || saveInFlight.current) return;
    saveInFlight.current = true;
    setIsSaving(true);
    try {
      const initial = getInitialEditValues();
      const { payload, requiresReOptimization, timeChanged } = buildJobEditPatch(jobId, initial, editValues, isShuttle);
      if (Object.keys(payload).length === 1) {
        setIsEditing(false);
        return;
      }
      const updated = await updateJobAction(payload);
      setIsEditing(false);
      await onJobSaved?.({
        requiresReOptimization, timeChanged,
        startTime: editValues.start_hour || editValues.time_window_start,
        endTime: editValues.end_hour || editValues.time_window_end,
        oldStartTime: initial.start_hour || initial.time_window_start,
        oldEndTime: initial.end_hour || initial.time_window_end,
      });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      message.error(typeof detail === "string" ? detail : "Failed to save job. Please retry.");
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
    }
  };

  const rideMinutes = estimates.pickup && estimates.dropoff
    && dayjs(estimates.pickup).isValid() && dayjs(estimates.dropoff).isValid()
    ? Math.round(dayjs(estimates.dropoff).diff(dayjs(estimates.pickup), "minute", true)) : null;
  const shiftVerdict = (() => {
    const clock = (value?: string) => {
      const m = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };
    // Outbound: drop-off against the shift start. Return: pickup against the shift end.
    const isReturn = String(jobLeg ?? "").toUpperCase() === "RETURN";
    const at = isReturn ? estimates.pickup : estimates.dropoff;
    const target = clock(shuttleValue(isReturn ? "end_hour" : "start_hour"));
    if (!at || target === null || !dayjs(at).isValid()) return null;
    // Compare whole minutes, the same precision the times are shown in.
    const when = dayjs(at).startOf("minute");
    let goal = when.startOf("day").add(target, "minute");
    if (goal.diff(when, "minute") > 720) goal = goal.subtract(1, "day");
    if (when.diff(goal, "minute") > 720) goal = goal.add(1, "day");
    const gap = goal.diff(when, "minute");
    const shiftClock = goal.format("h:mm A");
    if (isReturn) {
      if (gap === 0) return { tone: "ok" as const, text: `Picked up as the shift ends at ${shiftClock}` };
      return gap < 0
        ? { tone: "ok" as const, text: `Picked up ${minutesText(-gap)} after the shift ends at ${shiftClock}` }
        : { tone: "bad" as const, text: `Picked up ${minutesText(gap)} before the shift ends at ${shiftClock}` };
    }
    const needed = Number(reachBeforeMinutes);
    const hasRule = Number.isFinite(needed) && needed > 0;
    if (gap < 0) return { tone: "bad" as const, text: `Arrives ${minutesText(-gap)} after the shift starts at ${shiftClock}` };
    if (hasRule && gap < needed) return { tone: "bad" as const, text: `Arrives ${minutesText(gap)} before the ${shiftClock} shift; ${needed} min are needed` };
    return { tone: "ok" as const, text: `Arrives ${minutesText(gap)} before the ${shiftClock} shift${hasRule ? ` (${needed} min needed)` : ""}` };
  })();

  const legBadge = jobLeg ? (
    <span aria-label={`Leg ${jobLeg}`} className="inline-flex bg-[#F3F6F4] px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-[#4A5750]">
      {jobLeg}
    </span>
  ) : null;

  const legField = (
    <Field icon={<Navigation size={13} className="text-gray-400" />} label="Leg">
      {legBadge ?? "-"}
    </Field>
  );

  const arrivalField = (
    <Field
      icon={<Clock size={13} className="text-gray-400 shrink-0" />}
      label={
        stopType === "depot_start"
          ? "Start Time"
          : stopType === "depot_end"
            ? "End Time"
            : isDropoffStop ? "Estimated dropoff time"
              : isPickupStop ? "Estimated pickup time" : "Estimated arrival time"
      }
      valueClassName="text-xs text-gray-900 font-bold pl-4.5"
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {onEditETA && stopData?.arrival_time ? <button type="button" className="inline-flex items-center gap-1 text-emerald-800 underline decoration-dotted underline-offset-2"
          aria-label="Edit estimated arrival time" onClick={() => onEditETA("arrival", stopData.arrival_time)}>{arrivalTime}<EditOutlined /></button> : <span>{arrivalTime}</span>}
        {stopData?.arrival_time && dayjs(stopData.arrival_time).isValid() && (
          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
            {dayjs(stopData.arrival_time).format("ddd, MMM D")}
          </span>
        )}
      </div>
    </Field>
  );

  const notesField = (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-900">
        <FileText size={13} className="text-gray-400 shrink-0" />
        <span>Notes</span>
      </div>
      <div className="text-xs text-gray-700 leading-relaxed break-words bg-gray-50/80 p-2.5 border border-gray-200 rounded text-[11.5px] ml-4.5">
        {notes}
      </div>
    </div>
  );

  if (isEmpty) return null;

  return (
    <div
      className={`fixed ${
        isFullscreen ? "top-3 right-3 z-50" : "top-16 right-3 z-50"
      } w-[calc(100vw-24px)] sm:w-[400px] h-[calc(100dvh-76px)] max-h-[744px] bg-white rounded-none shadow-[0_8px_24px_rgba(18,33,26,0.14)] border border-[#D5DCD8] flex flex-col overflow-hidden text-xs transition-all animate-in fade-in slide-in-from-right-4 duration-200`}
    >
      {/* Header: kind of stop, then whose it is, then who drives it */}
      <div className="lang px-4 pt-3.5 pb-3 border-b border-[#E3E8E5] flex items-start justify-between gap-3 bg-white shrink-0">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium uppercase tracking-wide text-[#626E67]">
            {isDepotStop ? <span>Depot</span> : isUnassigned ? <span>Unassigned</span> : (
              <>
                {stopBadge && <span className={isPickupStop ? "text-[#0B5D3B]" : "text-[#12211A]"}>{stopBadge.label}</span>}
                <span aria-hidden="true">·</span>
                <span>Stop {stopIndex}</span>
              </>
            )}
            {Boolean(stopData?.is_new || job?.is_new) && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal text-[#0B5D3B]">
                <Sparkles size={11} /> Newly added
              </span>
            )}
            {Boolean(stopData?.time_edited || (job as any)?.time_edited || stopData?.is_edited || (job as any)?.is_edited) && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal text-[#4A5750]">
                <ClockCircleOutlined className="text-[10px]" /> Edited
              </span>
            )}
          </div>
          <h2 className="m-0 mt-1 text-[15px] font-medium leading-snug text-[#12211A] break-words">
            {isDepotStop ? (stopType === "depot_end" ? "Trip ends at the depot" : stopType === "depot_start" ? "Trip starts at the depot" : "Depot")
              : isUnassigned ? `Unassigned Job #${jobId}`
                : (isShuttle ? candidateName : undefined) || (customerName !== "-" ? customerName : undefined) || `Job #${jobId}`}
          </h2>
          {!isUnassigned && (
            <div className="mt-0.5 text-[12px] text-[#4A5750] break-words">
              {[!isDepotStop && jobId ? `Job #${jobId}` : null, driverName || null, vehicleName || null].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 -mr-2 -mt-1">
          {/* Edit / Save / Cancel toggle — only for job stops, not depot */}
          {!isDepotStop && job && (
            isEditing ? (
              <>
                <button
                  onClick={handleSaveJob}
                  disabled={isSaving}
                  title="Save changes"
                  className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-50 cursor-pointer disabled:opacity-50"
                >
                  <SaveOutlined className="text-sm" />
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  title="Cancel edit"
                  className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
                >
                  <CloseOutlined className="text-sm" />
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  if (onEditJob) {
                    const targetJob =
                      job ||
                      jobs.find((j) => j.id === (stopData?.job_id || stopData?.id)) ||
                      ({
                        id: stopData?.job_id || stopData?.id,
                        ...stopData,
                      } as any);
                    onEditJob(targetJob);
                  } else {
                    setIsEditing(true);
                  }
                }}
                title="Edit job" aria-label="Edit job"
                className="inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#626E67] hover:text-[#12211A] hover:bg-[#F3F6F4] cursor-pointer"
              >
                <EditOutlined className="text-sm" />
              </button>
            )
          )}
          {onRemoveJob && !isDepotStop && (() => {
            // A job already worked on the day (boarded, done, no-show) stays on its trip as the record of what happened.
            const worked = selectedProgress.status !== "pending" || ["in_transit", "in_progress", "completed", "failed"].includes(String(status));
            return (
            <button
              onClick={worked ? undefined : onRemoveJob}
              disabled={worked}
              title={worked ? "This job was already worked on the day, so it stays on the trip" : "Remove from route"} aria-label="Remove from route"
              className="inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#626E67] hover:text-[#C9372C] hover:bg-[#FDECEA] cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[#626E67]"
            >
              <DeleteOutlined className="text-sm" />
            </button>
            );
          })()}
          <button
            onClick={onClose}
            title="Close" aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent text-[#626E67] hover:text-[#12211A] hover:bg-[#F3F6F4] cursor-pointer"
          >
            <CloseOutlined className="text-sm" />
          </button>
        </div>
      </div>

      {onEditVehicle && <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-3.5 py-3">
        <div><div className="font-bold text-gray-900">Vehicle</div><div className="mt-1 text-gray-600">{vehicleName || "Unassigned"}</div></div>
        <Button size="small" onClick={onEditVehicle}>Edit vehicle</Button>
      </div>}
      {onMergeAdjacentRoute && <div className="border-b border-gray-100 px-3.5 py-3">
        <Button size="small" onClick={onMergeAdjacentRoute}>
          {stopType === "depot_start" ? "Merge with previous route" : "Merge with next route"}
        </Button>
      </div>}
      {/* Scrollable Key-Value Grid / Edit Form */}
      <div className="p-3.5 space-y-3 flex-1 overflow-y-auto custom-scrollbar">
        {isEditing ? (
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
              <span className="font-bold text-gray-900 text-xs uppercase tracking-wider">
                Edit Job Details
              </span>
            </div>

            {isShuttle ? (
              <>
                {/* 1. Shift & Schedule */}
                <div className="space-y-2 bg-gray-50/70 p-2.5 rounded border border-gray-200">
                  <div className="text-[10.5px] font-bold text-gray-800 border-b border-gray-200 pb-1">
                    Shift & Schedule
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Scheduled Date
                      </label>
                      <DatePicker
                        format="YYYY-MM-DD"
                        size="small"
                        className="w-full text-xs"
                        value={editValues.scheduled_date ? dayjs(editValues.scheduled_date) : null}
                        onChange={(d) => setEditValues(v => ({ ...v, scheduled_date: d ? d.format("YYYY-MM-DD") : "" }))}
                      />
                    </div>
                    {legField}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Shift Start Time
                      </label>
                      <TimePicker
                        format="hh:mm A"
                        use12Hours
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.start_hour ? dayjs(editValues.start_hour, ["HH:mm:ss", "HH:mm", "hh:mm A"]) : null}
                        onChange={(t) => setEditValues(v => ({ ...v, start_hour: t ? t.format("HH:mm") : "" }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Shift End Time
                      </label>
                      <TimePicker
                        format="hh:mm A"
                        use12Hours
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.end_hour ? dayjs(editValues.end_hour, ["HH:mm:ss", "HH:mm", "hh:mm A"]) : null}
                        onChange={(t) => setEditValues(v => ({ ...v, end_hour: t ? t.format("HH:mm") : "" }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Pickup Type
                      </label>
                      <Select
                        size="small"
                        className="w-full text-xs"
                        value={editValues.pickup_type}
                        onChange={(val) => setEditValues(v => ({ ...v, pickup_type: val }))}
                        options={[
                          { value: "one_way", label: "One Way Go" },
                          { value: "return_only", label: "Return Only" },
                          { value: "round_trip", label: "Round Trip" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Quart / Shift Ref
                      </label>
                      <Input
                        size="small"
                        placeholder="e.g. 44280"
                        value={editValues.quart_id}
                        onChange={(e) => setEditValues(v => ({ ...v, quart_id: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                      Reach Window (mins)
                    </label>
                    <InputNumber
                      size="small"
                      className="w-full text-xs"
                      value={editValues.reach_before_minutes}
                      onChange={(val) => setEditValues(v => ({ ...v, reach_before_minutes: val ?? 0 }))}
                    />
                  </div>
                </div>

                {/* 2. Locations */}
                <div className="space-y-2 bg-gray-50/70 p-2.5 rounded border border-gray-200">
                  <div className="text-[10.5px] font-bold text-gray-800 border-b border-gray-200 pb-1">
                    Locations
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                      Pick Up Address
                    </label>
                    <AddressAutocomplete
                      value={editValues.pick_up_address}
                      placeholder="Search pickup address"
                      predefinedOptions={predefinedLocations}
                      onChange={(val) =>
                        setEditValues((v) => ({
                          ...v,
                          pick_up_address: val,
                          pick_up_location: undefined,
                        }))
                      }
                      onSelect={(addressData: AddressData) => {
                        setEditValues((v) => ({
                          ...v,
                          pick_up_address: addressData.address_formatted,
                          pick_up_location: addressData.location,
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                      Drop Off Address
                    </label>
                    <AddressAutocomplete
                      value={editValues.drop_off_address}
                      placeholder="Search dropoff address"
                      predefinedOptions={predefinedLocations}
                      onChange={(val) =>
                        setEditValues((v) => ({
                          ...v,
                          drop_off_address: val,
                          drop_off_location: undefined,
                        }))
                      }
                      onSelect={(addressData: AddressData) => {
                        setEditValues((v) => ({
                          ...v,
                          drop_off_address: addressData.address_formatted,
                          drop_off_location: addressData.location,
                        }));
                      }}
                    />
                  </div>
                </div>

                {/* 3. Passenger & Candidate Info */}
                <div className="space-y-2 bg-gray-50/70 p-2.5 rounded border border-gray-200">
                  <div className="text-[10.5px] font-bold text-gray-800 border-b border-gray-200 pb-1">
                    Passenger & Candidate
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Candidate Name
                      </label>
                      <Input
                        size="small"
                        value={editValues.candidate_name}
                        onChange={(e) => setEditValues(v => ({ ...v, candidate_name: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Candidate Phone
                      </label>
                      <Input
                        size="small"
                        value={editValues.candidate_phone}
                        onChange={(e) => setEditValues(v => ({ ...v, candidate_phone: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Candidate ID
                      </label>
                      <Input
                        size="small"
                        value={editValues.candidate_id}
                        onChange={(e) => setEditValues(v => ({ ...v, candidate_id: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Client Name
                      </label>
                      <Input
                        size="small"
                        value={editValues.client_name}
                        onChange={(e) => setEditValues(v => ({ ...v, client_name: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Notes */}
                <div className="space-y-2 bg-gray-50/70 p-2.5 rounded border border-gray-200">
                  <div className="text-[10.5px] font-bold text-gray-800 border-b border-gray-200 pb-1">
                    Notes
                  </div>
                  <Input.TextArea
                    rows={2}
                    size="small"
                    placeholder="Special instructions or notes"
                    value={editValues.notes}
                    onChange={(e) => setEditValues(v => ({ ...v, notes: e.target.value }))}
                    className="text-xs"
                  />
                </div>
              </>
            ) : (
              /* Pickup/Delivery Form */
              <>
                <div className="space-y-2 bg-gray-50/70 p-2.5 rounded border border-gray-200">
                  <div>
                    <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                      Address
                    </label>
                    <AddressAutocomplete
                      value={editValues.address_formatted}
                      placeholder="Search address"
                      predefinedOptions={predefinedLocations}
                      onChange={(val) =>
                        setEditValues((v) => ({
                          ...v,
                          address_formatted: val,
                          location: undefined,
                        }))
                      }
                      onSelect={(addressData: AddressData) => {
                        setEditValues((v) => ({
                          ...v,
                          address_formatted: addressData.address_formatted,
                          location: addressData.location,
                        }));
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Time Window Start
                      </label>
                      <TimePicker
                        format="hh:mm A"
                        use12Hours
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.time_window_start ? dayjs(editValues.time_window_start, ["HH:mm:ss", "HH:mm", "hh:mm A"]) : null}
                        onChange={(t) => setEditValues(v => ({ ...v, time_window_start: t ? t.format("HH:mm") : "" }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Time Window End
                      </label>
                      <TimePicker
                        format="hh:mm A"
                        use12Hours
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.time_window_end ? dayjs(editValues.time_window_end, ["HH:mm:ss", "HH:mm", "hh:mm A"]) : null}
                        onChange={(t) => setEditValues(v => ({ ...v, time_window_end: t ? t.format("HH:mm") : "" }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Service Duration (mins)
                      </label>
                      <InputNumber
                        size="small"
                        className="w-full text-xs"
                        min={0}
                        value={editValues.service_duration}
                        onChange={(val) => setEditValues(v => ({ ...v, service_duration: val ?? 0 }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Priority Level
                      </label>
                      <Select
                        size="small"
                        className="w-full text-xs"
                        value={editValues.priority_level}
                        onChange={(val) => setEditValues(v => ({ ...v, priority_level: val }))}
                        options={[
                          { value: "low", label: "Low" },
                          { value: "medium", label: "Medium" },
                          { value: "high", label: "High" },
                          { value: "urgent", label: "Urgent" },
                        ]}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 bg-gray-50/70 p-2.5 rounded border border-gray-200">
                  <div className="text-[10.5px] font-bold text-gray-800 border-b border-gray-200 pb-1">
                    Customer & Notes
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                      Customer Name
                    </label>
                    <Input
                      size="small"
                      value={editValues.client_name}
                      onChange={(e) => setEditValues(v => ({ ...v, client_name: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Phone
                      </label>
                      <Input
                        size="small"
                        value={editValues.client_phone}
                        onChange={(e) => setEditValues(v => ({ ...v, client_phone: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Email
                      </label>
                      <Input
                        size="small"
                        value={editValues.client_email}
                        onChange={(e) => setEditValues(v => ({ ...v, client_email: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                      Notes
                    </label>
                    <Input.TextArea
                      rows={2}
                      size="small"
                      value={editValues.notes}
                      onChange={(e) => setEditValues(v => ({ ...v, notes: e.target.value }))}
                      className="text-xs"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        ) : isShuttle && !isDepotStop ? (
          <>
            {(rideMinutes !== null || shiftVerdict) && (
              <div className="-mt-1 pb-4 border-b border-[#E3E8E5]">
                <div className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-medium text-[#12211A] tabular-nums">
                  {(estimates.pickup || estimates.dropoff) && dayjs(estimates.pickup || estimates.dropoff).isValid() && (
                    <time dateTime={estimates.pickup || estimates.dropoff} className="text-[12px] font-normal text-[#4A5750]">
                      {dayjs(estimates.pickup || estimates.dropoff).format("ddd, MMM D")}
                    </time>
                  )}
                  <span>{estimates.pickup ? formatTime12h(estimates.pickup) : "--:--"}</span>
                  <span aria-hidden="true" className="text-[#626E67]">→</span>
                  <span>{estimates.dropoff ? formatTime12h(estimates.dropoff) : "--:--"}</span>
                  {rideMinutes !== null && <span className="text-[12px] font-normal text-[#4A5750]">{rideMinutes} min ride</span>}
                </div>
                {shiftVerdict && (
                  <div className={`mt-1 text-[12px] ${shiftVerdict.tone === "ok" ? "text-[#0B5D3B]" : "text-[#C9372C]"}`}>{shiftVerdict.text}</div>
                )}
              </div>
            )}

            <DetailSection title="Journey" badge={legBadge} compact>
              <ol className="m-0 list-none p-0">
              {([
                { key: "pickup", title: "Pickup", selected: isPickupStop, address: pickUpAddress,
                  estimate: estimates.pickup, progress: reconcileStopProgress(getStopProgress(journeyStops.pickup, "pickup"), jobStatusForStops, "pickup") },
                { key: "dropoff", title: "Dropoff", selected: isDropoffStop, address: dropOffAddress,
                  estimate: estimates.dropoff, progress: reconcileStopProgress(getStopProgress(journeyStops.dropoff, "dropoff"), jobStatusForStops, "dropoff") },
              ] as const).map(({ key, title, selected, address: journeyAddress, estimate, progress }, index) => (
                <li key={key} aria-current={selected ? "step" : undefined}
                  className={`relative py-2.5 pl-7 pr-2 ${selected ? "bg-[#F1F8F4]" : ""}`}>
                  {selected && <span aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#003220]" />}
                  <span aria-hidden="true" className={`absolute left-2.5 top-[15px] h-2 w-2 rounded-full border border-[#4A5750] ${key === "pickup" ? "bg-[#4A5750]" : "bg-white"}`} />
                  {index === 0 && <span aria-hidden="true" className="absolute left-[13px] top-[25px] -bottom-[15px] w-px bg-[#C4CCC7]" />}
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="m-0 flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#12211A]">{title}<ProgressBadge progress={progress} /></h4>
                    {selected && <span className="text-[11px] text-[#0B5D3B]">This stop</span>}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-snug text-[#4A5750] break-words">
                    {onShowLocation && journeyAddress ? (
                      <button type="button" onClick={() => onShowLocation(key)}
                        aria-label={`Show ${title.toLowerCase()} location on map`}
                        title={`Show ${title.toLowerCase()} on map`}
                        className="inline-flex items-start gap-1 border-0 bg-transparent p-0 text-left text-[12px] text-[#4A5750] cursor-pointer hover:text-[#0B5D3B] hover:underline">
                        <MapPin size={12} className="mt-0.5 shrink-0" />{journeyAddress}
                      </button>
                    ) : dash(journeyAddress)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px]">
                    <span className="text-[#626E67]">Estimated {key} time</span>
                    <span className="font-medium text-[#12211A] tabular-nums">
                      {/* A stop already worked keeps its time: only open stops can be re-timed. */}{onEditETA && estimate && progress.status === "pending" ? <button type="button" aria-label={`Edit estimated ${key} time`}
                        onClick={() => onEditETA(key, estimate)} title="Change this time"
                        className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[12px] font-medium text-[#12211A] cursor-pointer hover:text-[#0B5D3B]">
                        <EstimatedTime value={estimate} /><EditOutlined className="text-[#626E67]" />
                      </button> : <EstimatedTime value={estimate} />}
                    </span>
                  </div>
                  {progress.status !== "pending" && (
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[12px]">
                      <span className="text-[#626E67]">
                        {progress.status === "failed" ? key === "pickup" ? "No-show recorded at" : "Failure recorded at"
                          : progress.status === "skipped" ? "Skipped at" : `Actual ${key} time`}
                      </span>
                      <span className="font-medium text-[#12211A]"><ActualTime value={progress.actualTime} timezone={progress.timezone} /></span>
                    </div>
                  )}
                </li>
              ))}
              </ol>
            </DetailSection>

            <DetailSection title="Passenger" compact>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <KeyValue label="Candidate Phone">
                  {candidatePhone ? <a href={`tel:${candidatePhone}`} className="text-[#12211A] hover:text-[#0B5D3B] hover:underline">{candidatePhone}</a> : "-"}
                </KeyValue>
                <KeyValue label="Client Name">{dash(passengerName)}</KeyValue>
              </div>
            </DetailSection>

            <DetailSection title="Shift & schedule">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <KeyValue label="Scheduled Date">{scheduledDate && dayjs(scheduledDate).isValid() ? dayjs(scheduledDate).format("ddd, MMM D, YYYY") : dash(scheduledDate)}</KeyValue>
                <KeyValue label="Pickup Type">{pickupType ? formatPickupType(pickupType) : "-"}</KeyValue>
<KeyValue label="Shift starts">{startHour && startHour !== "-" ? startHour : "-"}</KeyValue>
                <KeyValue label="Shift ends">
                  {dash(endHour)}
                  {(() => {
                    const toMin = (v?: string) => { const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
                    const sMin = toMin(shuttleValue("start_hour")), eMin = toMin(shuttleValue("end_hour"));
                    return sMin !== null && eMin !== null && eMin <= sMin ? <span className="text-[#626E67]"> (next day)</span> : null;
                  })()}
                </KeyValue>
              </div>
            </DetailSection>

            {notes !== "-" && <DetailSection title="Notes"><div className="text-[13px] leading-relaxed text-[#12211A] whitespace-pre-wrap break-words">{notes}</div></DetailSection>}
          </>
        ) : isDepotStop ? (
          <div className="grid grid-cols-1 gap-3">
            <KeyValue label="Address">
              {/^previous .*trip end$/i.test(String(address).trim()) ? "Where the previous trip ended" : address}
            </KeyValue>
            <KeyValue label={stopType === "depot_end" ? "Arrives" : stopType === "depot_start" ? "Leaves" : "Time"}>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {onEditETA && stopData?.arrival_time ? <button type="button" aria-label="Edit estimated arrival time"
                  onClick={() => onEditETA("arrival", stopData.arrival_time)} title="Change this time"
                  className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-[#12211A] cursor-pointer hover:text-[#0B5D3B]">
                  {arrivalTime}<EditOutlined className="text-[#626E67]" /></button> : arrivalTime}
                {stopData?.arrival_time && dayjs(stopData.arrival_time).isValid() && (
                  <time dateTime={stopData.arrival_time} className="text-[12px] text-[#626E67]">{dayjs(stopData.arrival_time).format("ddd, MMM D")}</time>
                )}
              </span>
            </KeyValue>
          </div>
        ) : (
          <>
            {/* Contact */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<User size={13} className="text-gray-400 shrink-0" />}
                label="Contact Name"
              >
                {customerName}
              </Field>
            </div>

            {/* Address and arrival time */}
            {!isDepotStop && <DetailSection title="Progress">
              <div className="grid grid-cols-2 gap-3">
                <Field icon={<CheckCircleOutlined className="text-gray-400" />} label="Status"><ProgressBadge progress={selectedProgress} /></Field>
                {selectedProgress.status !== "pending" && <Field icon={<Clock size={13} className="text-gray-400" />} label="Actual completion time">
                  <ActualTime value={selectedProgress.actualTime} timezone={selectedProgress.timezone} />
                </Field>}
              </div>
            </DetailSection>}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<MapPin size={13} className="text-gray-400 shrink-0" />}
                label="Address"
                valueClassName="text-xs text-gray-600 font-medium leading-snug line-clamp-2 pl-4.5"
              >
                {address}
              </Field>
              {arrivalField}
            </div>

            {/* Row 3: Company Name & Phone */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={
                  <Building2 size={13} className="text-gray-400 shrink-0" />
                }
                label="Company Name"
              >
                {companyName}
              </Field>
              <Field
                icon={<Phone size={13} className="text-gray-400 shrink-0" />}
                label="Phone"
              >
                {phone}
              </Field>
            </div>

            {/* Row 4: Email & Priority */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-900">
                  <Mail size={13} className="text-gray-400 shrink-0" />
                  <span>Email</span>
                </div>
                <div
                  className="text-xs text-gray-600 font-medium truncate pl-4.5"
                  title={email}
                >
                  {email}
                </div>
              </div>

              <Field
                icon={<Flag size={13} className="text-gray-400 shrink-0" />}
                label="Priority"
                valueClassName="pl-4.5 pt-0.5"
              >
                <span
                  className={`inline-block text-[10.5px] font-bold capitalize px-2 py-0.5 border rounded ${getPriorityBadgeClass(
                    priority,
                  )}`}
                >
                  {priority}
                </span>
              </Field>
            </div>

            {/* Row 5: Time Window & Service Duration */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Calendar size={13} className="text-gray-400 shrink-0" />}
                label="Time Window"
              >
                {timeWindow}
              </Field>
              <Field
                icon={<Timer size={13} className="text-gray-400 shrink-0" />}
                label="Service Duration"
              >
                {serviceDuration} min
              </Field>
            </div>

            {/* Row 6: Notes */}
            {notesField}
          </>
        )}
      </div>

      {/* Quick Action Footer */}
      {!isDepotStop && (
        <div className="lang px-4 py-3 bg-white border-t border-[#E3E8E5] flex flex-col gap-2 shrink-0">
          {isEditing ? (
            <div className="flex gap-2">
              <Button
                type="primary"
                size="small"
                icon={<SaveOutlined />}
                loading={isSaving}
                onClick={handleSaveJob}
                className="w-1/2 bg-[#003220] hover:bg-[#002417] text-xs font-semibold h-8"
              >
                Save Changes
              </Button>
              <Button
                type="default"
                size="small"
                onClick={() => setIsEditing(false)}
                className="w-1/2 text-xs font-semibold h-8"
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="job-details-actions flex flex-wrap items-center justify-end gap-2">
              {!actionsReady && (
                <span className="w-full text-[12px] text-[#626E67]">{actionsReason} You can still record it after a confirmation.</span>
              )}
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={isUpdating}
                disabled={selectedProgress.status !== "pending" || status === "completed"}
                onClick={() => handleUpdateStatus("completed")}
                className="w-auto px-3 text-xs font-medium h-8"
              >
                Mark Completed
              </Button>
              <Button
                type="default"
                size="small"
                disabled={selectedProgress.status !== "pending" || status === "skipped" || status === "failed"}
                onClick={() => handleUpdateStatus("failed")}
                className="w-auto px-3 text-xs font-medium h-8"
              >
                Skip Stop
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default JobDetailsCard;
