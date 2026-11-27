import Tooltip from "./TimelineTooltip";
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
  onEditWaiting?: () => void;
  /** Why the wait cannot be edited right now, shown in place of the click hint. */
  editBlockedReason?: string;
  /** People or items on board while this part is driven. Undefined hides the load. */
  load?: number;
}

const durationLabel = (seconds: number) => seconds < 60
  ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`;

const waitingPattern = "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 6px)";
const tooltipStyles = {
  container: {
    padding: "10px 12px", borderRadius: 0, color: "#12211A",
    boxShadow: "0 6px 16px rgba(18,33,26,0.12)", border: "1px solid #D5DCD8",
  },
};

/** Travel and waiting are adjacent hover targets, never nested tooltips. */
export default function TimelineTravelSegment({
  segment, left, width, pixelsPerMinute, routeColor,
  vehicleName, vehicleCapacity, isDimmed = false, isDragging = false, onEditWaiting, load, editBlockedReason,
}: TimelineTravelSegmentProps) {
  const hasLoad = typeof load === "number";
  const isEmptyRun = hasLoad && load === 0;
  // One line, four fills. Every part has the same height and the same strength;
  // only the fill says what the vehicle is doing. Load is a number, never a shade:
  // a shade is also used for dimming and reads differently on every route color.
  const lineHeight = 5;
  const lineOpacity = isDimmed ? 0.15 : 0.6;
  let waitingWidth = Math.min(width, Math.max(0, (segment.waitingSeconds ?? 0) / 60 * pixelsPerMinute));
  const waitOnLeft = segment.waitingPosition === "left";
  const leftServiceWidth = waitOnLeft && waitingWidth > 0
    ? Math.min(width - waitingWidth, Math.max(0, (segment.serviceSeconds ?? 0) / 60 * pixelsPerMinute)) : 0;
  if ((segment.travelSeconds ?? 0) > 0 && waitingWidth > 0) {
    // Stop markers cover the ends of the connector. Keep both parts reachable
    // when a short drive or wait would otherwise sit entirely under a marker.
    // Only the visual split changes; timestamps and tooltip durations stay exact.
    const availableWidth = width - leftServiceWidth;
    const minimumPartWidth = Math.min(22 + 12, availableWidth / 2);
    waitingWidth = Math.min(availableWidth - minimumPartWidth, Math.max(minimumPartWidth, waitingWidth));
  }
  const travelWidth = Math.max(0, width - waitingWidth - leftServiceWidth);
  const interactive = onEditWaiting && !isDragging;
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (interactive && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); event.stopPropagation(); onEditWaiting();
    }
  };
  const distanceKm = segment.distanceMeters === null ? null : segment.distanceMeters / 1000;
  const isServiceOnly = segment.travelSeconds === 0 && (segment.serviceSeconds ?? 0) > 0;
  const isUnknownTransfer = segment.isBetweenTrips && segment.travelSeconds === null;
  // Shared pieces: what kind of part, then the number, then the vehicle and load, then the action.
  const kicker = (label: string, swatch: React.CSSProperties) => (
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#626E67]">
      <span aria-hidden="true" className="block h-[5px] w-5 shrink-0" style={{ boxSizing: "border-box", ...swatch }} />{label}
    </div>
  );
  const seatsLine = hasLoad && vehicleCapacity ? (
    <div className="flex items-center gap-1.5 text-[12px] text-[#4A5750] tabular-nums">
      {vehicleCapacity <= 16 && <span aria-hidden="true" className="flex gap-px">
        {Array.from({ length: vehicleCapacity }, (_, i) => <span key={i} className="h-2.5 w-1.5"
          style={{ backgroundColor: i < (load ?? 0) ? routeColor : "#E3E8E5" }} />)}
      </span>}
      <span>{isEmptyRun ? "Empty run, nobody on board" : `On board: ${load} of ${vehicleCapacity}`}</span>
      {vehicleName && <span className="min-w-0 truncate text-[#626E67]">· {vehicleName}</span>}
    </div>
  ) : hasLoad ? <div className="text-[12px] text-[#4A5750]">{isEmptyRun ? "Empty run, nobody on board" : `On board: ${load}`}{vehicleName ? ` · ${vehicleName}` : ""}</div> : null;
  const speed = segment.travelSeconds && distanceKm ? Math.round(distanceKm / (segment.travelSeconds / 3600)) : null;
  const vehicleHeader = vehicleName ? (
    <div className="flex items-center gap-1.5 text-[12px] text-[#4A5750]">
      <Truck size={13} className="shrink-0 text-[#4A5750]" aria-hidden="true" />
      <span className="truncate">{vehicleName}</span>
      {vehicleCapacity ? <span className="shrink-0 text-[#626E67]">· {vehicleCapacity} seats</span> : null}
    </div>
  ) : null;
  const actionLine = (text: string) => interactive
    ? <div className="mt-0.5 border-t border-[#E3E8E5] pt-1.5 text-[12px] text-[#0B5D3B]">{text}</div>
    : editBlockedReason && !isDragging
      ? <div className="mt-0.5 max-w-[260px] border-t border-[#E3E8E5] pt-1.5 text-[12px] text-[#8A6700]">{editBlockedReason}</div> : null;
  const drivingSwatch: React.CSSProperties = isUnknownTransfer ? { backgroundColor: "#fff", border: "1px dotted #64748b" }
    : isEmptyRun ? { backgroundColor: "#fff", border: `1px solid ${routeColor}` } : { backgroundColor: routeColor, opacity: 0.6 };
  const waitSwatch: React.CSSProperties = { backgroundColor: "#cbd5e1", backgroundImage: waitingPattern };

  return <>
    {leftServiceWidth > 0 && <Tooltip color="#ffffff" styles={tooltipStyles} title={
      <div className="flex min-w-[200px] flex-col gap-1.5">
        {kicker("At the stop", { backgroundColor: routeColor, opacity: 0.6 })}
        <div className="text-[15px] font-medium tabular-nums">Boarding / alighting: {durationLabel(segment.serviceSeconds!)}</div>
      </div>
    }>
      <div aria-label="Boarding / alighting time" className="absolute top-1/2"
        style={{ left, width: leftServiceWidth, height: lineHeight, transform: "translateY(-50%)", backgroundColor: routeColor,
          opacity: lineOpacity, pointerEvents: isDragging ? "none" : "auto" }} />
    </Tooltip>}
    {travelWidth > 0 && <Tooltip color="#ffffff" styles={tooltipStyles} title={
      <div className="flex min-w-[220px] flex-col gap-1.5">
        {kicker(isServiceOnly ? "At the stop" : isUnknownTransfer ? "Between trips" : isEmptyRun ? "Driving empty" : "Driving", isServiceOnly ? { backgroundColor: routeColor, opacity: 0.6 } : drivingSwatch)}
        <div className="flex flex-wrap items-baseline gap-x-2 tabular-nums">
          <span className="text-[15px] font-medium">{isServiceOnly
            ? `Boarding / alighting: ${durationLabel(segment.serviceSeconds!)}`
            : isUnknownTransfer
              ? `Between trips: ${durationLabel(segment.elapsedSeconds)} elapsed`
              : segment.travelSeconds === null ? "Travel time unavailable" : `Travel: ${durationLabel(segment.travelSeconds)}`}</span>
          {!isServiceOnly && <span className="text-[12px] text-[#4A5750]">
            {distanceKm === null ? "Distance unavailable" : distanceKm === 0 ? "Same location" : `${distanceKm.toFixed(2)} km`}
            {speed && !isUnknownTransfer ? <span className="text-[#626E67]"> · {speed} km/h avg</span> : null}
          </span>}
        </div>
        {!isServiceOnly && !isUnknownTransfer ? (seatsLine ?? vehicleHeader) : vehicleHeader}
        {actionLine("Click to add waiting here")}
      </div>
    }>
      <div aria-label={isServiceOnly ? "Boarding / alighting time" : isUnknownTransfer ? "Between trips" : "Travel time and distance"}
        role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? event => { event.stopPropagation(); onEditWaiting(); } : undefined} onKeyDown={handleKeyDown}
        className={`absolute top-1/2 ${interactive ? "cursor-pointer" : "cursor-default"}`}
        style={{ left: left + (waitOnLeft ? waitingWidth + leftServiceWidth : 0), width: travelWidth, height: lineHeight, transform: "translateY(-50%)",
          boxSizing: "border-box",
          // carrying: solid · empty: hollow · unknown gap between trips: dotted outline
          backgroundColor: isUnknownTransfer || (isEmptyRun && !isServiceOnly) ? "#ffffff" : routeColor,
          border: isUnknownTransfer ? "1px dotted #64748b" : isEmptyRun && !isServiceOnly ? `1px solid ${routeColor}` : undefined,
          opacity: lineOpacity, pointerEvents: isDragging ? "none" : "auto" }} />
    </Tooltip>}
    {hasLoad && !isEmptyRun && !isServiceOnly && !isUnknownTransfer && travelWidth >= 56 && <span aria-hidden="true"
      className="absolute pointer-events-none select-none text-[9.5px] leading-none tabular-nums text-slate-500"
      style={{ left: left + (waitOnLeft ? waitingWidth + leftServiceWidth : 0) + travelWidth / 2, top: "50%",
        transform: "translate(-50%, -13px)", opacity: isDimmed ? 0.3 : 1 }}>
      {vehicleCapacity ? `${load}/${vehicleCapacity}` : load}
    </span>}
    {waitingWidth > 0 && <Tooltip color="#ffffff" styles={tooltipStyles} title={
      <div className="flex min-w-[220px] flex-col gap-1.5">
        {kicker(waitOnLeft ? "Waiting before driving" : "Waiting after driving", waitSwatch)}
        <div className="text-[15px] font-medium tabular-nums">Waiting: {durationLabel(segment.waitingSeconds!)}</div>
        <div className="text-[12px] text-[#4A5750]">{waitOnLeft ? "Waits at the earlier stop, then drives on." : "Drives first, then waits at the next stop."}</div>
        {actionLine("Click to change the wait")}
      </div>
    }>
      <div aria-label="Waiting time" className={`absolute top-1/2 ${interactive ? "cursor-pointer" : "cursor-default"}`}
        role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined}
        onClick={interactive ? event => { event.stopPropagation(); onEditWaiting(); } : undefined} onKeyDown={handleKeyDown}
        style={{ left: left + (waitOnLeft ? leftServiceWidth : travelWidth), width: waitingWidth, height: lineHeight, transform: "translateY(-50%)",
          backgroundColor: "#cbd5e1", backgroundImage: waitingPattern,
          opacity: isDimmed ? 0.15 : 1, pointerEvents: isDragging ? "none" : "auto" }} />
    </Tooltip>}
  </>;
}
