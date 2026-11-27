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

import { MapPin, X, Flag, Warehouse, UserRound, Truck, Timer, Package } from "lucide-react";
import { LOCATION_TYPE_OPTIONS } from "@/apis/location-mapping.api";
import { getLocationTypeColor } from "@/utils/customMapMarker";
import { stopKindOf, stopStatusConfirm } from "./stopStatusConfirm";

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
    // Route depots carry the address as title; plain depots carry a name in jobData.
    const info = marker.depotInfo;
    const depotName = String(marker.jobData?.name || "").replace(/\s*\((Depot|Operational Base|Start|End)\)/gi, "").trim();
    const address = (info ? title : description || marker.jobData?.address || title) || "";
    const kind = marker.depotKind === "start" ? "start" : marker.depotKind === "end" ? "end" : "depot";
    const valid = (v?: string) => (v && dayjs(v).isValid() ? dayjs(v) : null);
    const when = valid(info?.time), start = valid(info?.tripStart), end = valid(info?.tripEnd);
    const minutes = start && end ? end.diff(start, "minute") : 0;
    const length = minutes > 0 ? [Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} h` : "", minutes % 60 ? `${minutes % 60} min` : ""].filter(Boolean).join(" ") : null;
    const nextDay = kind === "end" && start && end && !end.isSame(start, "day");
    const tint = info && marker.color ? marker.color : "#12211A";
    const coords = `${marker.position.lat.toFixed(5)}, ${marker.position.lng.toFixed(5)}`;
    const heading = kind === "start" ? "Start of trip" : kind === "end" ? "End of trip" : depotName || "Depot";
    const HeadIcon = kind === "depot" ? Warehouse : Flag;
    const facts = [
      info?.driverName && { icon: UserRound, text: info.driverName, label: "Driver" },
      info?.vehicleName && { icon: Truck, text: info.vehicleName, label: "Vehicle" },
      length && { icon: Timer, text: length, label: "Trip length" },
      info?.jobCount ? { icon: Package, text: `${info.jobCount} ${info.jobCount === 1 ? "job" : "jobs"}`, label: "Jobs on this trip" } : null,
    ].filter(Boolean) as { icon: typeof Timer; text: string; label: string }[];
    const copyAddress = async () => {
      try {
        if (!navigator.clipboard) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(`${address}\n${coords}`);
        message.success("Address copied");
      } catch { message.error("Could not copy the address"); }
    };

    return (
      <div className="lang w-[248px] font-sans text-[#12211A]">
        <div className="flex items-center gap-2">
          <HeadIcon size={18} color={tint} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{heading}</span>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] hover:bg-[#F3F6F4] hover:text-[#12211A]">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>

        {when && (
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums">{when.format("h:mm A")}</span>
            <span className={`text-[12px] ${nextDay ? "font-medium text-[#8A5A00]" : "text-[#626E67]"}`} title={when.format("dddd, MMM D, YYYY")}>
              {nextDay ? "next day" : when.format("ddd, MMM D")}
            </span>
          </div>
        )}

        {facts.length > 0 && (
          <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px]">
            {facts.map(({ icon: Icon, text, label }) => (
              <div key={label} className="flex min-w-0 items-center gap-1.5" title={label}>
                <Icon size={15} aria-hidden="true" className="shrink-0 text-[#626E67]" />
                <span className="truncate" aria-label={`${label}: ${text}`}>{text}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex items-start gap-1.5 border-t border-[#E3E8E5] pt-2">
          <MapPin size={15} aria-hidden="true" className="mt-px shrink-0 text-[#626E67]" />
          <span className="min-w-0 flex-1 text-[12px] leading-[17px] text-[#4A5750] line-clamp-2 select-text" title={`${address}\n${coords}`}>
            {address || "Address not set"}
          </span>
          {address && (
            <button type="button" aria-label="Copy address and coordinates" title="Copy address and coordinates" onClick={() => void copyAddress()}
              className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] hover:bg-[#F3F6F4] hover:text-[#12211A]">
              <CopyOutlined aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (marker.isAdditionalLocation) {
    // Same card shape as the depot card: coloured icon and name, one line of facts, address with copy.
    const rawName = marker.jobData?.name || title || "Location";
    const name = rawName.replace(/\s*\([^)]*\)$/, "").trim() || "Location";
    const rawType = String(marker.locationType || marker.jobData?.type || marker.jobData?.location_type || "other")
      .toLowerCase().replace(/\s+/g, "_");
    const matched = LOCATION_TYPE_OPTIONS.find(opt => opt.value === rawType || opt.label.toLowerCase() === rawType);
    const typeLabel = matched ? matched.label : rawType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
    const tint = getLocationTypeColor(rawType);
    const address = description || [marker.jobData?.address, marker.jobData?.city].filter(Boolean).join(", ") || "";
    const aliases = (marker.jobData?.aliases as string[] | undefined) ?? [];
    const coords = `${marker.position.lat.toFixed(5)}, ${marker.position.lng.toFixed(5)}`;
    const copyAddress = async () => {
      try {
        if (!navigator.clipboard) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(`${address}\n${coords}`);
        message.success("Address copied");
      } catch { message.error("Could not copy the address"); }
    };

    return (
      <div className="lang w-[248px] font-sans text-[#12211A]">
        <div className="flex items-center gap-2">
          <MapPin size={18} color={tint} aria-hidden="true" className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium" title={name}>{name}</span>
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close"
              className="-mr-1.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] hover:bg-[#F3F6F4] hover:text-[#12211A]">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[26px] text-[12px]">
          <span className="font-medium" style={{ color: tint }}>{typeLabel}</span>
          {aliases.slice(0, 3).map(alias => (
            <span key={alias} className="bg-[#F3F6F4] px-1.5 py-px text-[11.5px] text-[#4A5750]">{alias}</span>
          ))}
          {aliases.length > 3 && <span className="text-[11.5px] text-[#626E67]" title={aliases.slice(3).join(", ")}>+{aliases.length - 3}</span>}
        </div>
        <div className="mt-2.5 flex items-start gap-1.5 border-t border-[#E3E8E5] pt-2">
          <MapPin size={15} aria-hidden="true" className="mt-px shrink-0 text-[#626E67]" />
          <span className="min-w-0 flex-1 text-[12px] leading-[17px] text-[#4A5750] line-clamp-2 select-text" title={`${address}\n${coords}`}>
            {address || "Address not set"}
          </span>
          {address && (
            <button type="button" aria-label="Copy address and coordinates" title="Copy address and coordinates" onClick={() => void copyAddress()}
              className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] hover:bg-[#F3F6F4] hover:text-[#12211A]">
              <CopyOutlined aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const stopType = String(jobData?.stop_type || marker.stopType || "").toLowerCase();
  const stopKind = stopKindOf(stopType);
  const isPickupStop = stopKind === "pickup";
  const isDropoffStop = stopKind === "dropoff";

  const confirmAction = (action: "completed" | "failed") => {
    const jobId = jobData?.id ?? marker.comparison?.jobId;
    if (!jobId) return;
    const eta = marker.comparison?.arrivalTime;
    const who = marker.comparison?.name || [jobData?.first_name, jobData?.last_name].filter(Boolean).join(" ")
      || jobData?.worker_shuttle_detail?.candidate_name || jobData?.custom_fields?.candidate_name || null;
    const confirm = stopStatusConfirm({
      action, kind: stopKind, jobId, who,
      whenText: eta && dayjs(eta).isValid() ? `${dayjs(eta).format("h:mm A")} · ${dayjs(eta).format("ddd, MMM D")}` : null,
      address: (title && title !== "Address unavailable" ? title : null) || jobData?.address_formatted || null,
    });
    modal.confirm({
      ...confirm.modal,
      onOk: async () => {
        try {
          setIsMarkingComplete(true);
          const updatedJob = await updateJobStatus(jobId, confirm.targetStatus);
          patchJobLocally(updatedJob);
          await fetchRoutes(selectedStatus);
          message.success(confirm.successText);
        } catch {
          message.error(confirm.errorText);
        } finally {
          setIsMarkingComplete(false);
        }
      },
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
        <Button size="small" icon={<CheckCircleOutlined />} loading={isMarkingComplete} onClick={() => confirmAction("completed")} className="flex-1">Mark Completed</Button>
        <Button size="small" disabled={isMarkingComplete} onClick={() => confirmAction("failed")}>Skip Stop</Button>
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
                Mark Completed
              </Button>
              <Button
                onClick={() => confirmAction("failed")}
                type="default"
                size="small"
              >
                Skip Stop
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
