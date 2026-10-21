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
import { getJobStopEstimates, type JobTimingStop } from "./jobStopEstimates.utils";
import { buildJobEditPatch } from "./jobEditPatch.utils";

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
  isFullscreen?: boolean;
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

const DetailSection = ({ title, children, compact = false }: { title: string; children: React.ReactNode; compact?: boolean }) => (
  <section className={`${compact ? "space-y-2 pb-3" : "space-y-3 pb-4"} border-b border-gray-100 last:border-0 last:pb-0`} aria-label={title}>
    <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{title}</h3>
    {children}
  </section>
);

const EstimatedTime = ({ value }: { value?: string }) => (
  <div className="flex items-center gap-1.5 flex-wrap">
    <span>{value ? formatTime12h(value) : "Not scheduled"}</span>
    {value && dayjs(value).isValid() && (
      <time dateTime={value} className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
        {dayjs(value).format("ddd, MMM D")}
      </time>
    )}
  </div>
);

const JobDetailsCard: React.FC<JobDetailsCardProps> = ({
  stopData,
  job,
  stopIndex = 0,
  driverName,
  leg,
  routeStops,
  isUnassigned = false,
  onClose,
  onRemoveJob,
  onJobSaved,
  onEditJob,
  isFullscreen = false,
}) => {
  const { patchJobLocally, updateJobAction, jobs } = useJobsStore();
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

  if (!stopData && !job) return null;

  const jobId = job?.id || stopData?.job_id;
  const status = job?.status || stopData?.status || "assigned";
  const priority = (
    job?.priority_level ||
    (job as any)?.priority ||
    "medium"
  ).toLowerCase();

  const stopType = String(stopData?.stop_type || "").toLowerCase();
  const isDepotStop = stopType.includes("depot");
  const isPickupStop = stopType === "pickup";
  const isDropoffStop = stopType === "dropoff" || stopType === "drop_off";
  const stopBadge = STOP_TYPE_BADGES[stopType];

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
    if (job) {
      setEditValues(getInitialEditValues());
    }
  }, [job]);

  const handleUpdateStatus = async (newStatus: string) => {
    if (!jobId) return;

    let targetStatus = newStatus;
    if (newStatus === "completed" && isPickupStop) {
      targetStatus = "in_transit";
    }

    const isCompleteAction = newStatus === "completed";
    const title = isPickupStop
      ? "Mark Pickup as Done?"
      : isCompleteAction
        ? "Mark Job as Completed?"
        : "Skip this Job?";

    const content = isPickupStop
      ? `Are you sure you want to mark Pickup for Job #${jobId} as done?`
      : isCompleteAction
        ? `Are you sure you want to mark Job #${jobId} as completed?`
        : `Are you sure you want to skip Job #${jobId}?`;

    const okText = isPickupStop
      ? "Mark Pickup Done"
      : isCompleteAction
        ? "Mark Completed"
        : "Skip Job";

    modal.confirm({
      title,
      content,
      okText,
      okType: isCompleteAction ? "primary" : "danger",
      okButtonProps: isCompleteAction ? { style: { backgroundColor: "#003220", borderColor: "#003220" } } : undefined,
      onOk: async () => {
        try {
          setIsUpdating(true);
          const updated = await updateJobStatus(jobId, targetStatus);
          patchJobLocally(updated);
          await fetchRoutes(selectedStatus);
          message.success(
            isPickupStop
              ? "Pickup marked as done (In Transit)"
              : isCompleteAction
                ? "Job marked as completed"
                : "Job skipped",
          );
          onClose();
        } catch (err) {
          message.error("Failed to update job status");
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

  const legField = (
    <Field icon={<Navigation size={13} className="text-gray-400" />} label="Leg">
      {jobLeg ? (
        <span className="inline-flex border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold text-slate-800">
          {jobLeg}
        </span>
      ) : "-"}
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
        <span>{arrivalTime}</span>
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

  return (
    <div
      className={`fixed ${
        isFullscreen ? "top-3 right-3 z-50" : "top-16 right-3 z-50"
      } w-[calc(100vw-24px)] sm:w-[400px] h-[calc(100dvh-100px)] max-h-[720px] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col overflow-hidden text-xs transition-all animate-in fade-in slide-in-from-right-4 duration-200`}
    >
      {/* Header */}
      <div className="p-3.5 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-bold text-gray-900 text-sm truncate">
            {isDepotStop
              ? "Depot Station"
              : isUnassigned
                ? `Unassigned Job #${jobId}`
                : `Stop No - ${stopIndex} (${driverLabel})`}
          </div>
          {stopBadge && !isDepotStop && (
            <span
              className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 border rounded-none ${stopBadge.className}`}
            >
              {stopBadge.label}
            </span>
          )}
          {Boolean(stopData?.is_new || job?.is_new) && (
            <span className="shrink-0 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-400 flex items-center gap-1 animate-pulse">
              <Sparkles size={11} className="text-emerald-700" />
              Newly added
            </span>
          )}
          {Boolean(stopData?.time_edited || (job as any)?.time_edited || stopData?.is_edited || (job as any)?.is_edited) && (
            <span className="shrink-0 text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-300 flex items-center gap-0.5">
              <ClockCircleOutlined className="text-[10px]" /> EDITED
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
                title="Edit job"
                className="text-gray-400 hover:text-[#003220] transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
              >
                <EditOutlined className="text-sm" />
              </button>
            )
          )}
          {onRemoveJob && !isDepotStop && (
            <button
              onClick={onRemoveJob}
              title="Remove from Route"
              className="text-red-500 hover:text-red-700 transition-colors p-1 rounded hover:bg-red-50 cursor-pointer"
            >
              <DeleteOutlined className="text-sm" />
            </button>
          )}
          <button
            onClick={onClose}
            title="Close"
            className="text-gray-400 hover:text-gray-700 transition-colors p-1 rounded hover:bg-gray-100 cursor-pointer"
          >
            <CloseOutlined className="text-sm" />
          </button>
        </div>
      </div>

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
            <DetailSection title="Passenger" compact>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-2">
                <Field icon={<User size={13} className="text-gray-400" />} label="Candidate Name"
                  valueClassName="text-sm font-semibold text-gray-900 pl-4.5 break-words">
                  {dash(candidateName)}
                </Field>
                <Field icon={<Phone size={13} className="text-gray-400" />} label="Candidate Phone"
                  valueClassName="text-xs text-gray-600 font-medium break-words pl-4.5">
                  {candidatePhone ? <a href={`tel:${candidatePhone}`} className="hover:underline">{candidatePhone}</a> : "-"}
                </Field>
              </div>
            </DetailSection>

            <DetailSection title="Journey" compact>
              {([
                { key: "pickup", title: "Pickup", selected: isPickupStop, address: pickUpAddress,
                  estimate: estimates.pickup, Icon: Navigation },
                { key: "dropoff", title: "Dropoff", selected: isDropoffStop, address: dropOffAddress,
                  estimate: estimates.dropoff, Icon: Flag },
              ] as const).map(({ key, title, selected, address: journeyAddress, estimate, Icon }) => (
                <div key={key} aria-current={selected ? "step" : undefined}
                  className={`space-y-1.5 rounded-md border p-2.5 ${selected
                    ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-gray-50/40"}`}>
                  <div className="flex items-center justify-between">
                    <h4 className="flex items-center gap-1.5 font-semibold text-gray-900"><Icon size={14} />{title}</h4>
                    {selected && <span className="text-[10px] font-semibold text-emerald-800">Selected stop</span>}
                  </div>
                  <Field icon={<MapPin size={13} className="text-gray-400" />} label={`${title} address`}
                    valueClassName="text-xs text-gray-700 leading-snug break-words pl-4.5">
                    {dash(journeyAddress)}
                  </Field>
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px]">
                    <span className="flex items-center gap-1.5 font-bold text-gray-900">
                      <Clock size={13} className="text-gray-400" />
                      Estimated {key} time
                    </span>
                    <div className="text-xs font-semibold text-gray-900 pl-4.5">
                      <EstimatedTime value={estimate} />
                    </div>
                  </div>
                </div>
              ))}
            </DetailSection>

            <DetailSection title="Shift & schedule">
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                <Field icon={<Calendar size={13} className="text-gray-400" />} label="Scheduled Date">{dash(scheduledDate)}</Field>
                <Field icon={<Repeat size={13} className="text-gray-400" />} label="Pickup Type">
                  {pickupType ? <span className="inline-flex border border-emerald-400 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-emerald-900">
                    {formatPickupType(pickupType)}
                  </span> : "-"}
                </Field>
                <Field icon={<Clock size={13} className="text-gray-400" />} label="Shift Start Time">{dash(startHour)}</Field>
                <Field icon={<Clock size={13} className="text-gray-400" />} label="Shift End Time">{dash(endHour)}</Field>
                {legField}
              </div>
            </DetailSection>

            <DetailSection title="Assignment">
              <div className="grid grid-cols-2 gap-3">
                <Field icon={<User size={13} className="text-gray-400" />} label="Driver"
                  valueClassName="text-xs text-gray-700 break-words pl-4.5">{dash(driverName)}</Field>
                <Field icon={<Building2 size={13} className="text-gray-400" />} label="Client Name"
                  valueClassName="text-xs text-gray-700 break-words pl-4.5">{dash(passengerName)}</Field>
              </div>
            </DetailSection>
            {notes !== "-" && <DetailSection title="Notes"><div className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap break-words">{notes}</div></DetailSection>}
          </>
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
        <div className="p-3 bg-gray-50 border-t border-gray-100 flex flex-col gap-2 shrink-0">
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
            <div className="flex gap-2">
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={isUpdating}
                disabled={status === "completed"}
                onClick={() => handleUpdateStatus("completed")}
                className="w-1/2 bg-[#003220] hover:bg-[#002417] text-xs font-semibold h-8"
              >
                Mark Completed
              </Button>
              <Button
                type="default"
                size="small"
                disabled={status === "skipped" || status === "failed"}
                onClick={() => handleUpdateStatus("failed")}
                className="w-1/2 text-xs font-semibold h-8"
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
