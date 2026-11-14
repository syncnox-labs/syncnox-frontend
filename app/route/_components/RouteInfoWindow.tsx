import { useState } from "react";
import dayjs from "dayjs";
import { Typography, Tag, Button, message, App } from "antd";
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { JobStatus } from "@/types/job.type";
import { STATUS_COLORS } from "@/utils/jobs.utils";
import { formatTime12h } from "@/utils/app.utils";
import { updateJobStatus } from "@/apis/jobs.api";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";
import type { MarkerData } from "@/components/GoogleMaps";

import { MapPin, Building2, X } from "lucide-react";
import { LOCATION_TYPE_OPTIONS } from "@/apis/location-mapping.api";
import { getLocationTypeColor } from "@/utils/customMapMarker";

const { Text } = Typography;

interface RouteInfoWindowProps {
  marker: MarkerData;
  onClose?: () => void;
  onRemoveJob?: () => void;
  onViewDetails?: () => void;
}

const RouteInfoWindow: React.FC<RouteInfoWindowProps> = ({
  marker,
  onClose,
  onRemoveJob,
}) => {
  const { jobData, title, description } = marker;
  const { patchJobLocally } = useJobsStore();
  const { modal } = App.useApp();
  const { fetchRoutes, selectedStatus } = useRouteStore();
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const status = jobData?.status;
  const showButtons = status === "completed" || status === "failed";

  if (marker.isDepot) {
    const rawName = marker.jobData?.name || title || "Depot";
    const cleanDepotName =
      rawName.replace(/\s*\((Depot|Operational Base|Start|End)\)/gi, "").trim() || "Depot";
    const address = description || marker.jobData?.address || "Operational Base";
    const depotKindLabel =
      marker.depotKind === "start"
        ? "Start Depot"
        : marker.depotKind === "end"
          ? "End Depot"
          : "Depot";

    return (
      <div className="w-[230px] max-w-[245px] text-slate-800 font-sans select-none">
        {/* Header: Badge & Coordinates on the left, Close Cross Button on the right (same line) */}
        <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[#003220] text-white rounded shrink-0">
              <Building2 size={10} />
              <span>{depotKindLabel}</span>
            </span>
            <span className="text-[10px] font-mono font-semibold text-gray-600 select-all truncate" title="Coordinates">
              {marker.position.lat.toFixed(4)}, {marker.position.lng.toFixed(4)}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-5 h-5 -mr-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer border-none bg-transparent outline-none focus:outline-none shrink-0"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Name */}
        <div className="text-[13px] font-bold text-gray-900 leading-snug mt-1.5 mb-0.5 truncate" title={cleanDepotName}>
          {cleanDepotName}
        </div>

        {/* Address */}
        <div className="flex items-start gap-1 text-[11px] font-medium text-gray-700 leading-snug pt-0.5 pb-0.5">
          <MapPin size={11} className="shrink-0 text-gray-500 mt-0.5" />
          <span className="line-clamp-2 select-text">{address}</span>
        </div>
      </div>
    );
  }

  if (marker.isAdditionalLocation) {
    const rawName = marker.jobData?.name || title || "Location";
    const cleanLocName = rawName.replace(/\s*\([^)]*\)$/, "").trim() || "Location";
    const rawType = (
      marker.locationType ||
      marker.jobData?.type ||
      marker.jobData?.location_type ||
      "other"
    )
      .toLowerCase()
      .replace(/\s+/g, "_");
    const matchedOpt = LOCATION_TYPE_OPTIONS.find(
      (opt) => opt.value === rawType || opt.label.toLowerCase() === rawType
    );
    const typeLabel = matchedOpt
      ? matchedOpt.label
      : rawType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    const badgeColor = getLocationTypeColor(rawType);
    const address =
      description ||
      marker.jobData?.address ||
      [marker.jobData?.address, marker.jobData?.city].filter(Boolean).join(", ") ||
      "No address set";
    const aliases = marker.jobData?.aliases as string[] | undefined;

    return (
      <div className="w-[230px] max-w-[245px] text-slate-800 font-sans select-none">
        {/* Header: Category Badge & Coordinates on the left, Close Cross Button on the right (same line) */}
        <div className="flex items-center justify-between pb-1.5 border-b border-gray-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded shrink-0"
              style={{
                backgroundColor: `${badgeColor}18`,
                color: badgeColor,
                border: `1px solid ${badgeColor}35`,
              }}
            >
              <MapPin size={9} />
              <span>{typeLabel}</span>
            </span>
            <span className="text-[10px] font-mono font-semibold text-gray-600 select-all truncate" title="Coordinates">
              {marker.position.lat.toFixed(4)}, {marker.position.lng.toFixed(4)}
            </span>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-5 h-5 -mr-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer border-none bg-transparent outline-none focus:outline-none shrink-0"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Name */}
        <div className="text-[13px] font-bold text-gray-900 leading-snug mt-1.5 mb-0.5 truncate" title={cleanLocName}>
          {cleanLocName}
        </div>

        {/* Address */}
        <div className="flex items-start gap-1 text-[11px] font-medium text-gray-700 leading-snug pt-0.5 pb-0.5">
          <MapPin size={11} className="shrink-0 text-gray-500 mt-0.5" />
          <span className="line-clamp-2 select-text">{address}</span>
        </div>

        {/* Aliases / Codes (if any) */}
        {aliases && aliases.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pt-0.5 pb-0.5">
            <span className="text-[10px] text-gray-500 font-semibold">Codes:</span>
            {aliases.slice(0, 3).map((alias, i) => (
              <span key={i} className="text-[9px] font-mono font-medium bg-gray-100 text-gray-800 px-1 py-0.2 rounded">
                {alias}
              </span>
            ))}
            {aliases.length > 3 && (
              <span className="text-[9px] text-gray-500 font-mono font-medium">+{aliases.length - 3}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  const stopType = String(jobData?.stop_type || "").toLowerCase();
  const isPickupStop = stopType === "pickup";
  const isDropoffStop = stopType === "dropoff" || stopType === "drop_off";

  const handleUpdateJobStatus = async (status: string) => {
    if (!jobData?.id) return;

    let targetStatus = status;
    if (status === "completed" && isPickupStop) {
      targetStatus = "in_transit";
    }

    try {
      setIsMarkingComplete(true);
      const updatedJob = await updateJobStatus(jobData.id, targetStatus);
      patchJobLocally(updatedJob);
      await fetchRoutes(selectedStatus);
      message.success(
        isPickupStop
          ? "Pickup marked as done (In Transit)"
          : status === "completed"
            ? "Job marked as completed"
            : "Job marked as skipped",
      );
    } catch {
      message.error(
        status === "completed"
          ? "Failed to mark job as completed"
          : "Failed to skip job",
      );
    } finally {
      setIsMarkingComplete(false);
    }
  };

  const confirmAction = (status: string) => {
    const isComplete = status === "completed";
    const title = isPickupStop
      ? "Mark Pickup as Done?"
      : isComplete
        ? "Mark as Completed?"
        : "Skip this job?";
    const content = isPickupStop
      ? "Are you sure you want to mark this pickup as done?"
      : isComplete
        ? "Are you sure you want to mark this job as completed?"
        : "Are you sure you want to skip this job?";
    const okText = isPickupStop
      ? "Mark Pickup Done"
      : isComplete
        ? "Mark as Completed"
        : "Skip";

    modal.confirm({
      title,
      content,
      okText,
      okType: isComplete ? "primary" : "danger",
      cancelText: "Cancel",
      onOk: () => handleUpdateJobStatus(status),
    });
  };

  if (marker.comparison) {
    const detail = marker.comparison;
    const type = marker.stopType?.toLowerCase();
    const typeLabel = type === "pickup" || type === "pick_up" ? "Pickup"
      : type === "dropoff" || type === "drop_off" ? "Drop-off" : "Stop";
    const statusLabel = detail.unassigned ? "Unassigned"
      : status && !["draft", "assigned"].includes(status) ? String(status).replaceAll("_", " ") : "Assigned";
    const start = jobData?.time_window_start || jobData?.pickup_delivery_detail?.time_window_start || jobData?.custom_fields?.time_window_start;
    const end = jobData?.time_window_end || jobData?.pickup_delivery_detail?.time_window_end || jobData?.custom_fields?.time_window_end;
    const eta = detail.arrivalTime && dayjs(detail.arrivalTime).isValid()
      ? dayjs(detail.arrivalTime).format("MMM D, h:mm A") : null;
    const address = title && title !== "Address unavailable" ? title : null;

    return <div className="w-[min(270px,calc(100vw-64px))] max-w-full bg-white font-sans text-slate-800">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
        <span className="min-w-0 flex-1 text-xs font-bold text-slate-900">Job #{detail.jobId}</span>
        <span className="shrink-0 border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{typeLabel}</span>
        <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-semibold capitalize ${detail.unassigned ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{statusLabel}</span>
        {onClose && <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700"><X size={14} /></button>}
      </div>
      {detail.name && detail.name !== `Job #${detail.jobId}` && <div className="pt-2 break-words text-xs font-semibold leading-snug text-slate-900">{detail.name}</div>}
      <div className="mt-2 flex items-start gap-1.5">
        <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 select-text break-words text-xs leading-snug text-slate-700">{address || "Address unavailable"}</span>
        {address && <button type="button" aria-label="Copy address" title="Copy address" onClick={() => {
          void (async () => {
            try {
              if (!navigator.clipboard) throw new Error("Clipboard unavailable");
              await navigator.clipboard.writeText(address);
              message.success("Address copied");
            } catch { message.error("Unable to copy address"); }
          })();
        }} className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700"><CopyOutlined /></button>}
      </div>
      {(detail.driverName || detail.stopNumber || detail.leg || eta || (start && end)) && <dl className="mb-0 mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2 text-[11px] leading-snug">
        {detail.driverName && <div className="min-w-0"><dt className="text-slate-500">Driver</dt><dd className="m-0 break-words font-medium text-slate-800">{detail.driverName}</dd></div>}
        {detail.stopNumber !== undefined && <div><dt className="text-slate-500">Stop</dt><dd className="m-0 font-medium text-slate-800">#{detail.stopNumber}</dd></div>}
        {eta && <div><dt className="text-slate-500">ETA</dt><dd className="m-0 font-medium text-slate-800">{eta}</dd></div>}
        {start && end && <div><dt className="text-slate-500">Time window</dt><dd className="m-0 font-medium text-slate-800">{formatTime12h(start)} – {formatTime12h(end)}</dd></div>}
        {detail.leg && <div><dt className="text-slate-500">Trip</dt><dd className="m-0 font-medium text-slate-800">{detail.leg}</dd></div>}
      </dl>}
      {!detail.unassigned && jobData && !showButtons && <div className="mt-2 flex gap-2 border-t border-slate-100 pt-2">
        <Button size="small" icon={<CheckCircleOutlined />} loading={isMarkingComplete} onClick={() => confirmAction("completed")} className="flex-1">Mark Complete</Button>
        <Button size="small" disabled={isMarkingComplete} onClick={() => confirmAction("failed")}>Skip</Button>
      </div>}
    </div>;
  }

  return (
    <div className="w-[min(270px,calc(100vw-64px))] max-w-full bg-white text-slate-800 p-1">
      {/* Header: Pickup / Drop-off Badge & Status */}
      <div className="mb-2 pb-1.5 border-b border-slate-200 flex items-center justify-between">
        {isPickupStop ? (
          <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-400">
            <UserAddOutlined className="text-emerald-700 font-bold" />
            PICKUP
          </span>
        ) : isDropoffStop ? (
          <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-400">
            <UserDeleteOutlined className="text-blue-700 font-bold" />
            DROP-OFF
          </span>
        ) : null}

        <div className="flex items-center gap-1.5 ml-auto">
          {status && (
            <Tag
              color={STATUS_COLORS[status as JobStatus] || STATUS_COLORS.draft}
              className="mr-0 capitalize border-none px-2 py-0.5 text-xs font-semibold shrink-0"
              style={{ borderRadius: "0px" }}
            >
              {status.replace("_", " ")}
            </Tag>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-5 h-5 -mr-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer border-none bg-transparent outline-none focus:outline-none shrink-0"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Address */}
      <div className="flex gap-2.5 mb-2.5 items-start select-text">
        {isPickupStop ? (
          <EnvironmentOutlined className="text-emerald-600 text-base shrink-0 mt-0.5" />
        ) : (
          <EnvironmentOutlined className="text-blue-600 text-base shrink-0 mt-0.5" />
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 select-none">
              {isPickupStop ? "Pickup Address" : isDropoffStop ? "Drop-off Address" : "Address"}
            </span>
            {(title || jobData?.address_formatted) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const textToCopy = String(title || jobData?.address_formatted || "");
                  navigator.clipboard.writeText(textToCopy);
                  message.success("Address copied to clipboard");
                }}
                className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer transition-colors border-none bg-transparent flex items-center gap-1 text-[10px] font-semibold select-none"
                title="Copy address"
              >
                <CopyOutlined className="text-xs" />
                <span>Copy</span>
              </button>
            )}
          </div>
          <Text className="text-xs text-slate-900 leading-snug font-bold select-text cursor-text break-words">
            {title || jobData?.address_formatted || "Unknown Address"}
          </Text>
        </div>
      </div>

      {/* Time Info */}
      <div className="flex justify-center items-center bg-slate-50 border border-slate-200 p-2 text-center">
        <div className="flex gap-2 items-center justify-center">
          <ClockCircleOutlined className="text-slate-500 text-xs shrink-0" />
          <div className="flex flex-col items-center">
            {description && (
              <Text className="text-xs text-slate-900 font-bold leading-snug">
                {description}
              </Text>
            )}
            {jobData &&
              "time_window_start" in jobData &&
              jobData.time_window_start &&
              "time_window_end" in jobData &&
              jobData.time_window_end && (
                <Text className="text-[11px] text-slate-600 leading-tight">
                  Window: {formatTime12h(jobData.time_window_start)} - {formatTime12h(jobData.time_window_end)}
                </Text>
              )}
          </div>
        </div>
      </div>
      {jobData && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
          {/* {onViewDetails && (
            <Button
              type="primary"
              size="small"
              className="bg-[#003220] hover:bg-[#002417] text-xs font-semibold"
              style={{ width: "100%" }}
              onClick={onViewDetails}
            >
              View Full Job Details
            </Button>
          )} */}

          {!showButtons && (
            <div className="flex gap-2">
              <Button
                type="default"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={isMarkingComplete}
                onClick={() => confirmAction("completed")}
                style={{
                  width: "100%",
                }}
              >
                Mark Complete
              </Button>
              <Button
                onClick={() => confirmAction("failed")}
                type="default"
                size="small"
              >
                Skip
              </Button>
            </div>
          )}

          {onRemoveJob && !showButtons && (
            <Button
              danger
              type="text"
              size="small"
              style={{ width: "100%" }}
              onClick={onRemoveJob}
            >
              Remove from Route
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default RouteInfoWindow;
