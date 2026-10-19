import Tooltip from "./TimelineTooltip";
import { ClockCircleOutlined, EnvironmentOutlined } from "@ant-design/icons";
import { Truck } from "lucide-react";
import type { getTimelineSegment } from "./timelineSegment.utils";

interface TimelineTravelSegmentProps {
  segment: ReturnType<typeof getTimelineSegment>;
  left: number;
  width: number;
  pixelsPerMinute: number;
  routeColor: string;
  vehicleName?: string | null;
  vehicleCapacity?: number | null;
  isDimmed?: boolean;
  isDragging?: boolean;
}

const durationLabel = (seconds: number) => seconds < 60
  ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`;

const waitingPattern = "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 6px)";
const tooltipStyles = {
  container: {
    padding: "8px 12px", borderRadius: "6px", color: "#1e293b",
    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.12)", border: "1px solid #cbd5e1",
  },
};

/** Travel and waiting are adjacent hover targets, never nested tooltips. */
export default function TimelineTravelSegment({
  segment, left, width, pixelsPerMinute, routeColor,
  vehicleName, vehicleCapacity, isDimmed = false, isDragging = false,
}: TimelineTravelSegmentProps) {
  const waitingWidth = Math.min(width, Math.max(0, (segment.waitingSeconds ?? 0) / 60 * pixelsPerMinute));
  const travelWidth = Math.max(0, width - waitingWidth);
  const distanceKm = segment.distanceMeters === null ? null : segment.distanceMeters / 1000;
  const isServiceOnly = segment.travelSeconds === 0 && (segment.serviceSeconds ?? 0) > 0;
  const isUnknownTransfer = segment.isBetweenTrips && segment.travelSeconds === null;
  const vehicleHeader = vehicleName ? (
    <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200 font-bold text-slate-900">
      <Truck size={13} style={{ color: routeColor }} className="shrink-0" />
      <span className="truncate">{vehicleName}</span>
      {vehicleCapacity ? <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-1.5 border border-slate-200 rounded">
        {vehicleCapacity} seats
      </span> : null}
    </div>
  ) : null;

  return <>
    {travelWidth > 0 && <Tooltip color="#ffffff" styles={tooltipStyles} title={
      <div className="flex flex-col gap-1.5 text-xs text-slate-800 min-w-[140px]">
        {vehicleHeader}
        <div className="flex items-center gap-3 text-[11px] font-medium">
          <span className="flex items-center gap-1">
            <ClockCircleOutlined className="text-slate-400" />
            <strong>{isServiceOnly
              ? `Boarding / alighting: ${durationLabel(segment.serviceSeconds!)}`
              : isUnknownTransfer
                ? `Between trips: ${durationLabel(segment.elapsedSeconds)} elapsed`
                : segment.travelSeconds === null ? "Travel time unavailable" : `Travel: ${durationLabel(segment.travelSeconds)}`}</strong>
          </span>
          {!isServiceOnly && <span className="flex items-center gap-1">
            <EnvironmentOutlined className="text-slate-400" />
            <strong>{distanceKm === null ? "Distance unavailable" : distanceKm === 0 ? "Same location" : `${distanceKm.toFixed(2)} km`}</strong>
          </span>}
        </div>
      </div>
    }>
      <div aria-label={isServiceOnly ? "Boarding / alighting time" : isUnknownTransfer ? "Between trips" : "Travel time and distance"}
        className="absolute top-1/2 cursor-pointer border-y border-slate-300 rounded-xs"
        style={{ left, width: travelWidth, height: 5, transform: "translateY(-50%)",
          backgroundColor: isUnknownTransfer ? "#e2e8f0" : routeColor,
          backgroundImage: isUnknownTransfer ? waitingPattern : undefined,
          opacity: isDimmed ? 0.15 : 0.35, pointerEvents: isDragging ? "none" : "auto" }} />
    </Tooltip>}
    {waitingWidth > 0 && <Tooltip color="#ffffff" styles={tooltipStyles} title={
      <div className="flex flex-col gap-1.5 text-xs text-slate-800 min-w-[140px]">
        {vehicleHeader}
        <span className="flex items-center gap-1 font-semibold text-amber-700">
          <ClockCircleOutlined />
          <strong>Waiting: {durationLabel(segment.waitingSeconds!)}</strong>
        </span>
      </div>
    }>
      <div aria-label="Waiting time" className="absolute top-1/2 cursor-pointer border-y border-slate-300"
        style={{ left: left + travelWidth, width: waitingWidth, height: 6, transform: "translateY(-50%)",
          backgroundColor: "#e2e8f0", backgroundImage: waitingPattern,
          opacity: isDimmed ? 0.15 : 0.85, pointerEvents: isDragging ? "none" : "auto" }} />
    </Tooltip>}
  </>;
}
