import React, { useState, useEffect } from "react";
import { Tag, Button, App, message, Input, InputNumber, TimePicker, DatePicker, Select } from "antd";
import AddressAutocomplete, { AddressData } from "@/components/AddressAutocomplete";
import {
  CloseOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  EditOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import {
  User,
  Users,
  MapPin,
  Clock,
  Building2,
  Phone,
  Mail,
  Flag,
  Calendar,
  Timer,
  FileText,
  Activity,
  Repeat,
  Hash,
  Navigation,
  Fingerprint,
  ArrowRightLeft,
  Tag as TagIcon,
} from "lucide-react";
import dayjs from "dayjs";
import type { Job, JobStatus } from "@/types/job.type";
import { STATUS_COLORS, formatJobTypeLabel } from "@/utils/jobs.utils";
import { updateJobStatus, updateJob } from "@/apis/jobs.api";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";

interface JobDetailsCardProps {
  stopData: any | null;
  job: Job | null;
  stopIndex?: number;
  driverName?: string;
  leg?: string;
  onClose: () => void;
  onRemoveJob?: () => void;
  onJobSaved?: (requiresReOptimization: boolean) => void;
  onEditJob?: (job: Job) => void;
  isFullscreen?: boolean;
}

/** Pickup / drop-off / depot / break badge shown in the card header. */
const STOP_TYPE_BADGES: Record<string, { label: string; className: string }> = {
  pickup: {
    label: "Pickup",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  dropoff: {
    label: "Drop-off",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  drop_off: {
    label: "Drop-off",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  depot: {
    label: "Depot",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  depot_start: {
    label: "Depot Start",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  depot_end: {
    label: "Depot End",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  break: {
    label: "Break",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

const LEG_LABELS: Record<string, string> = {
  GO: "Go",
  RETURN: "Return",
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

const JobDetailsCard: React.FC<JobDetailsCardProps> = ({
  stopData,
  job,
  stopIndex = 0,
  driverName,
  leg,
  onClose,
  onRemoveJob,
  onJobSaved,
  onEditJob,
  isFullscreen = false,
}) => {
  const { patchJobLocally, jobs } = useJobsStore();
  const { modal } = App.useApp();
  const { fetchRoutes, selectedStatus } = useRouteStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    ? dayjs(stopData.arrival_time).format("hh:mm A")
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
      ? `${job.time_window_start} - ${job.time_window_end}`
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

  const tripType = job?.job_type || shuttleValue("pickup_type");
  const isReturnTrip = String(tripType || "").toLowerCase() === "return_only";

  const candidateName = shuttleValue("candidate_name");
  const candidatePhone = shuttleValue("candidate_phone");
  const candidateId = shuttleValue("candidate_id");
  const passengerName = shuttleValue("client_name", "first_name");
  const passengerPhone = shuttleValue("client_phone", "phone_number");
  const clientId = shuttleValue("client_id");
  const quantId = shuttleValue("quant_id", "quart_id");
  const pickUpAddress = shuttleValue(
    "pick_up_address",
    "go_pickup_point",
    "candidate_address",
  );
  const dropOffAddress = shuttleValue(
    "drop_off_address",
    "return_dropoff_point",
    "client_address",
  );

  const clientPickUpTime = isReturnTrip
    ? shuttleValue("end_hour", "client_pick_up_time", "start_hour")
    : shuttleValue("client_pick_up_time", "start_hour", "end_hour");
  const startHour = shuttleValue("start_hour");
  const endHour = shuttleValue("end_hour");
  const pickupType = shuttleValue("pickup_type");
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

  const candidatePickupEta = shuttleValue(
    "candidate_pickup_eta",
    "go_pickup_time_output",
    "return_pickup_time_output",
  );
  const reachBeforeMinutes =
    job?.reach_before_minutes ??
    (job?.worker_shuttle_detail as any)?.reach_before_minutes ??
    (job?.custom_fields as any)?.reach_before_minutes;
  const reachWindow =
    reachBeforeMinutes === undefined || reachBeforeMinutes === null
      ? "-"
      : `${Number(reachBeforeMinutes) > 0 ? "+" : ""}${reachBeforeMinutes}m`;

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

  const stopAddressLabel = isPickupStop
    ? "Pickup Address"
    : isDropoffStop
      ? "Drop-off Address"
      : "Address";

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
    pickup_type: shuttleValue("pickup_type") || "",
    quart_id: shuttleValue("quart_id", "quant_id") || "",
    reach_before_minutes: Number(reachBeforeMinutes ?? 10),
    pick_up_address: pickUpAddress || "",
    pick_up_location: (job?.worker_shuttle_detail as any)?.pick_up_location || job?.location || undefined,
    drop_off_address: dropOffAddress || "",
    drop_off_location: (job?.worker_shuttle_detail as any)?.drop_off_location || undefined,
    candidate_name: shuttleValue("candidate_name") || "",
    candidate_phone: shuttleValue("candidate_phone") || "",
    candidate_id: shuttleValue("candidate_id") || "",
    client_name: shuttleValue("client_name", "first_name") || "",
    client_phone: shuttleValue("client_phone", "phone_number") || "",
    client_id: shuttleValue("client_id") || "",
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
    if (!job || !jobId) return;
    try {
      setIsSaving(true);

      const origStartHour = shuttleValue("start_hour");
      const origEndHour = shuttleValue("end_hour");
      const origPickUpAddress = pickUpAddress;
      const origDropOffAddress = dropOffAddress;
      const origAddress = job.address_formatted || stopData?.address_formatted;
      const origTimeWindowStart = job.time_window_start;
      const origTimeWindowEnd = job.time_window_end;

      const startHourChanged = (editValues.start_hour || "") !== (origStartHour || "");
      const endHourChanged = (editValues.end_hour || "") !== (origEndHour || "");
      const pickUpAddrChanged = (editValues.pick_up_address || "") !== (origPickUpAddress || "");
      const dropOffAddrChanged = (editValues.drop_off_address || "") !== (origDropOffAddress || "");
      const addrChanged = (editValues.address_formatted || "") !== (origAddress || "");
      const twStartChanged = (editValues.time_window_start || "") !== (origTimeWindowStart || "");
      const twEndChanged = (editValues.time_window_end || "") !== (origTimeWindowEnd || "");

      const requiresReOptimization = isShuttle
        ? (startHourChanged || endHourChanged || pickUpAddrChanged || dropOffAddrChanged)
        : (addrChanged || twStartChanged || twEndChanged);

      const validDbJobTypes = ["pickup", "delivery", "service", "one_way", "return_only"];
      let targetJobType = editValues.job_type || job.job_type || "one_way";
      if (!validDbJobTypes.includes(targetJobType)) {
        targetJobType = validDbJobTypes.includes(job.job_type)
          ? job.job_type
          : (isReturnTrip ? "return_only" : "one_way");
      }

      const payload: any = {
        ...job,
        scheduled_date: editValues.scheduled_date || job.scheduled_date,
        job_type: targetJobType,
        additional_notes: editValues.notes,
        notes: editValues.notes,
      };

      if (isShuttle) {
        payload.worker_shuttle_detail = {
          ...(job.worker_shuttle_detail ?? {}),
          start_hour: editValues.start_hour || undefined,
          end_hour: editValues.end_hour || undefined,
          pickup_type: editValues.pickup_type || undefined,
          quart_id: editValues.quart_id || undefined,
          quant_id: editValues.quart_id || undefined,
          reach_before_minutes: editValues.reach_before_minutes,
          pick_up_address: editValues.pick_up_address || undefined,
          pick_up_location: editValues.pick_up_location || undefined,
          drop_off_address: editValues.drop_off_address || undefined,
          drop_off_location: editValues.drop_off_location || undefined,
          candidate_name: editValues.candidate_name || undefined,
          candidate_phone: editValues.candidate_phone || undefined,
          candidate_id: editValues.candidate_id || undefined,
          client_name: editValues.client_name || undefined,
          client_phone: editValues.client_phone || undefined,
          client_id: editValues.client_id || undefined,
          notes: editValues.notes || undefined,
        };
        payload.start_hour = editValues.start_hour || undefined;
        payload.end_hour = editValues.end_hour || undefined;
        payload.pickup_type = editValues.pickup_type || undefined;
        payload.quart_id = editValues.quart_id || undefined;
        payload.quant_id = editValues.quart_id || undefined;
        payload.reach_before_minutes = editValues.reach_before_minutes;
        payload.pick_up_address = editValues.pick_up_address || undefined;
        payload.pick_up_location = editValues.pick_up_location || undefined;
        payload.drop_off_address = editValues.drop_off_address || undefined;
        payload.drop_off_location = editValues.drop_off_location || undefined;
        payload.client_name = editValues.client_name || undefined;
        payload.client_phone = editValues.client_phone || undefined;
        payload.client_id = editValues.client_id || undefined;
        payload.candidate_name = editValues.candidate_name || undefined;
        payload.candidate_phone = editValues.candidate_phone || undefined;
        payload.candidate_id = editValues.candidate_id || undefined;
      } else {
        payload.address_formatted = editValues.address_formatted || undefined;
        payload.location = editValues.location || undefined;
        payload.time_window_start = editValues.time_window_start || undefined;
        payload.time_window_end = editValues.time_window_end || undefined;
        payload.service_duration = editValues.service_duration;
        payload.priority_level = editValues.priority_level;
      }

      const updated = await updateJob(payload);
      patchJobLocally(updated);
      setIsEditing(false);

      onJobSaved?.(requiresReOptimization);
    } catch (err) {
      console.error("Failed to save job:", err);
      message.error("Failed to save job");
    } finally {
      setIsSaving(false);
    }
  };

  const statusField = (
    <Field
      icon={<Activity size={13} className="text-gray-400 shrink-0" />}
      label="Status"
      valueClassName="pl-4.5 pt-0.5"
    >
      <Tag
        color={STATUS_COLORS[status as JobStatus] || "blue"}
        className="capitalize font-semibold border-none text-[10.5px] px-2 py-0.5 m-0 rounded"
      >
        {(status || "assigned").replace("_", " ")}
      </Tag>
    </Field>
  );

  const arrivalField = (
    <Field
      icon={<Clock size={13} className="text-gray-400 shrink-0" />}
      label="ETA / Arrival"
      valueClassName="text-xs text-gray-900 font-bold pl-4.5"
    >
      {arrivalTime}
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
      } w-88 h-[calc(100vh-100px)] max-h-[620px] bg-white rounded-lg shadow-2xl border border-gray-200 flex flex-col overflow-hidden text-xs transition-all animate-in fade-in slide-in-from-right-4 duration-200`}
    >
      {/* Header */}
      <div className="p-3.5 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-bold text-gray-900 text-sm truncate">
            {isDepotStop
              ? "Depot Station"
              : `Stop No - ${stopIndex} (${driverLabel})`}
          </div>
          {stopBadge && !isDepotStop && (
            <span
              className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 border rounded ${stopBadge.className}`}
            >
              {stopBadge.label}
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
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Trip Type
                      </label>
                      <Select
                        size="small"
                        className="w-full text-xs"
                        value={editValues.job_type}
                        onChange={(val) => setEditValues(v => ({ ...v, job_type: val }))}
                        options={[
                          { value: "one_way", label: "One Way" },
                          { value: "return_only", label: "Return Only" },
                        ]}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Shift Start Time
                      </label>
                      <TimePicker
                        format="HH:mm"
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.start_hour ? dayjs(editValues.start_hour, ["HH:mm:ss", "HH:mm"]) : null}
                        onChange={(t) => setEditValues(v => ({ ...v, start_hour: t ? t.format("HH:mm") : "" }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Shift End Time
                      </label>
                      <TimePicker
                        format="HH:mm"
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.end_hour ? dayjs(editValues.end_hour, ["HH:mm:ss", "HH:mm"]) : null}
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
                          { value: "GO", label: "GO" },
                          { value: "RETURN", label: "RETURN" },
                          { value: "BOTH", label: "BOTH" },
                          { value: "one_way", label: "One Way" },
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
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Client / Worker ID
                      </label>
                      <Input
                        size="small"
                        value={editValues.client_id}
                        onChange={(e) => setEditValues(v => ({ ...v, client_id: e.target.value }))}
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
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Client Phone
                      </label>
                      <Input
                        size="small"
                        value={editValues.client_phone}
                        onChange={(e) => setEditValues(v => ({ ...v, client_phone: e.target.value }))}
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
                        format="HH:mm"
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.time_window_start ? dayjs(editValues.time_window_start, ["HH:mm:ss", "HH:mm"]) : null}
                        onChange={(t) => setEditValues(v => ({ ...v, time_window_start: t ? t.format("HH:mm") : "" }))}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-600 font-semibold mb-0.5 block">
                        Time Window End
                      </label>
                      <TimePicker
                        format="HH:mm"
                        size="small"
                        needConfirm={false}
                        className="w-full text-xs"
                        value={editValues.time_window_end ? dayjs(editValues.time_window_end, ["HH:mm:ss", "HH:mm"]) : null}
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
                      value={customerName}
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
                        value={editValues.client_phone || phone}
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
                        value={email}
                        onChange={(e) => setEditValues(v => ({ ...v, email: e.target.value }))}
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
        ) : isShuttle ? (
          <>
            {/* Row 1: Candidate Name & Status */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<User size={13} className="text-gray-400 shrink-0" />}
                label="Candidate Name"
              >
                {dash(candidateName)}
              </Field>
              {statusField}
            </div>

            {/* Row 2: This stop's address & ETA / Arrival */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={
                  isDropoffStop ? (
                    <Flag size={13} className="text-gray-400 shrink-0" />
                  ) : (
                    <Navigation size={13} className="text-gray-400 shrink-0" />
                  )
                }
                label={stopAddressLabel}
                valueClassName="text-xs text-gray-600 font-medium leading-snug line-clamp-2 pl-4.5"
              >
                {address}
              </Field>
              {arrivalField}
            </div>

            {/* Row 3: Candidate Phone & Candidate ID */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Phone size={13} className="text-gray-400 shrink-0" />}
                label="Candidate Phone"
              >
                {dash(candidatePhone)}
              </Field>
              <Field
                icon={
                  <Fingerprint size={13} className="text-gray-400 shrink-0" />
                }
                label="Candidate ID"
              >
                {dash(candidateId)}
              </Field>
            </div>

            {/* Row 4: Passenger Name & Passenger Phone */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Users size={13} className="text-gray-400 shrink-0" />}
                label="Client Name"
              >
                {dash(passengerName)}
              </Field>
              <Field
                icon={<Phone size={13} className="text-gray-400 shrink-0" />}
                label="Client Phone"
              >
                {dash(passengerPhone)}
              </Field>
            </div>

            {/* Row 5: Trip Type & Quant / Shift Ref */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Repeat size={13} className="text-gray-400 shrink-0" />}
                label="Trip Type"
              >
                {tripType ? formatJobTypeLabel(tripType) : "-"}
              </Field>
              <Field
                icon={<Hash size={13} className="text-gray-400 shrink-0" />}
                label="Quant / Shift Ref"
              >
                {dash(quantId)}
              </Field>
            </div>

            {/* Shift Start Time & Shift End Time */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Clock size={13} className="text-gray-400 shrink-0" />}
                label="Shift Start Time"
              >
                {dash(startHour)}
              </Field>
              <Field
                icon={<Clock size={13} className="text-gray-400 shrink-0" />}
                label="Shift End Time"
              >
                {dash(endHour)}
              </Field>
            </div>

            {/* Pickup Type & Scheduled Date */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Repeat size={13} className="text-gray-400 shrink-0" />}
                label="Pickup Type"
              >
                {pickupType ? formatPickupType(pickupType) : "-"}
              </Field>
              <Field
                icon={<Calendar size={13} className="text-gray-400 shrink-0" />}
                label="Scheduled Date"
              >
                {dash(scheduledDate)}
              </Field>
            </div>

            {/* Row 6: Client Pick Up Time & Candidate Pickup ETA */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Calendar size={13} className="text-gray-400 shrink-0" />}
                label="Client Pick Up Time"
              >
                {dash(clientPickUpTime)}
              </Field>
              <Field
                icon={<Clock size={13} className="text-gray-400 shrink-0" />}
                label="Candidate Pickup ETA"
              >
                {dash(candidatePickupEta)}
              </Field>
            </div>

            {/* Row 7: Reach Window & Client / Worker ID */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<Timer size={13} className="text-gray-400 shrink-0" />}
                label="Reach Window"
              >
                {reachWindow}
              </Field>
              <Field
                icon={<TagIcon size={13} className="text-gray-400 shrink-0" />}
                label="Client / Worker ID"
              >
                {dash(clientId)}
              </Field>
            </div>

            {/* Row 8: Full journey — Pick Up & Drop Off addresses */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={
                  <Navigation size={13} className="text-gray-400 shrink-0" />
                }
                label="Pick Up Address"
                valueClassName="text-xs text-gray-600 font-medium leading-snug line-clamp-2 pl-4.5"
              >
                {dash(pickUpAddress)}
              </Field>
              <Field
                icon={<Flag size={13} className="text-gray-400 shrink-0" />}
                label="Drop Off Address"
                valueClassName="text-xs text-gray-600 font-medium leading-snug line-clamp-2 pl-4.5"
              >
                {dash(dropOffAddress)}
              </Field>
            </div>

            {/* Row 9: Driver & Trip Leg */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<User size={13} className="text-gray-400 shrink-0" />}
                label="Driver"
              >
                {dash(driverName)}
              </Field>
              <Field
                icon={
                  <ArrowRightLeft
                    size={13}
                    className="text-gray-400 shrink-0"
                  />
                }
                label="Trip Leg"
              >
                {leg ? LEG_LABELS[leg.toUpperCase()] || leg : "-"}
              </Field>
            </div>

            {/* Row 10: Notes */}
            {notesField}
          </>
        ) : (
          <>
            {/* Row 1: Contact Name & Status */}
            <div className="grid grid-cols-2 gap-3 border-b border-gray-100 pb-3">
              <Field
                icon={<User size={13} className="text-gray-400 shrink-0" />}
                label="Contact Name"
              >
                {customerName}
              </Field>
              {statusField}
            </div>

            {/* Row 2: Address & ETA / Arrival */}
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
