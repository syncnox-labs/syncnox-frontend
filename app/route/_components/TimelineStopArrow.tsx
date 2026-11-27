import React from "react";
import { CheckOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Sparkles as SparklesIcon } from "lucide-react";

/**
 * Pure SVG presentation component for rendering a directional stop arrow.
 * - UP arrow for Pickup
 * - DOWN arrow for Drop-off
 * - BOTH ends for a shared drop-off and pickup visit
 * Displays the stop number centered inside the arrow shaft.
 */
interface StopArrowSvgProps {
  isPickup: boolean;
  isMixed?: boolean;
  displayIndex: number | string;
  fill: string;
  stroke: string;
  textColor: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export const StopArrowSvg: React.FC<StopArrowSvgProps> = ({
  isPickup,
  isMixed = false,
  displayIndex,
  fill,
  stroke,
  textColor,
  strokeWidth = 1.5,
  strokeDasharray,
}) => {
  const textStr = String(displayIndex ?? "");
  const fontSize = textStr.length >= 3 ? "9" : textStr.length === 2 ? "11" : "12";

  const path = isMixed
    ? "M 16 2 L 21 9 L 27 9 L 27 29 L 21 29 L 16 36 L 11 29 L 5 29 L 5 9 L 11 9 Z"
    : isPickup
      ? "M 16 2 L 21 10 L 27 10 L 27 34 L 5 34 L 5 10 L 11 10 Z"
      : "M 6 2 L 27 2 L 27 27 L 21 27 L 16 36 L 11 27 L 5 27 L 5 2 Z";

  return (
    <svg
      width="32"
      height="38"
      viewBox="0 0 32 38"
      className="overflow-visible pointer-events-none"
    >
      <path
        d={path}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinejoin="miter"
        strokeMiterlimit={4}
      />
      <text
        x="16"
        y={isMixed ? "19" : isPickup ? "22" : "15"}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight="600"
        fontSize={fontSize}
        fill={textColor}
      >
        {displayIndex}
      </text>
    </svg>
  );
};

/** The single "edited by hand" mark: a dark disc with a white pencil, readable at timeline size. */
export const EditedMark: React.FC<{ size?: number; className?: string; title?: string }> = ({ size = 18, className = "", title }) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#12211A] text-white border-[1.5px] border-white box-content ${className}`}
    style={{ width: size, height: size }}
    title={title}
    role={title ? "img" : undefined}
    aria-label={title}
    aria-hidden={title ? undefined : true}
  >
    <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M11.2 1.6a1.6 1.6 0 0 1 2.3 0l.9.9a1.6 1.6 0 0 1 0 2.3l-8.6 8.6L2 14.3l.9-3.8z" fill="currentColor" />
    </svg>
  </span>
);

export interface TimelineStopArrowProps {
  /** True for pickup (UP arrow), false for drop-off (DOWN arrow) */
  isPickup: boolean;
  /** One physical visit containing both drop-offs and pickups. */
  isMixed?: boolean;
  /** Stop number displayed inside the arrow body (e.g. 1, 2, 6) */
  displayIndex: number | string;
  /**
   * The color of this route / leg.
   * All stops (both pickup and dropoff) within the same leg share this color.
   */
  routeColor: string;
  /** Whether the stop is completed or in-transit */
  isStopDone?: boolean;
  /** Some passengers at this stop are done and some are still to do */
  isStopPartlyDone?: boolean;
  /** Read out with the stop, e.g. "1 of 2 passengers done" */
  doneLabel?: string;
  /** Raw job status string (e.g. "completed", "failed", "skipped", "assigned") */
  jobStatus?: string;
  /** Selection and editing flags */
  isStopSelected?: boolean;
  isStopNew?: boolean;
  isStopEdited?: boolean;
  isGroupPendingDelete?: boolean;
  isDraggingThis?: boolean;
  isDropTarget?: boolean;
  isDimmed?: boolean;
  /** X-coordinate position in pixels on the timeline */
  left: number;
  /** Interaction handlers */
  onClick?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * TimelineStopArrow
 * Dedicated modular component for rendering worker shuttle stops on the timeline track.
 * Maintains consistent leg color across both pickups and drop-offs while clearly
 * communicating pickup, drop-off, or both activities at a shared visit.
 * Wrapped in forwardRef to support Ant Design Tooltip and other parent wrappers.
 */
export const TimelineStopArrow = React.forwardRef<
  HTMLDivElement,
  TimelineStopArrowProps & React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const {
    isPickup,
    isMixed = false,
    displayIndex,
    routeColor,
    isStopDone = false,
    isStopPartlyDone = false,
    doneLabel,
    jobStatus = "assigned",
    isStopSelected = false,
    isStopNew = false,
    isStopEdited = false,
    isGroupPendingDelete = false,
    isDraggingThis = false,
    isDropTarget = false,
    isDimmed = false,
    left,
    onClick,
    draggable = false,
    onDragStart,
    onDragEnd,
    title,
    className = "",
    style = {},
    ...restProps
  } = props;

  // ── Color Resolution ────────────────────────────────────────────────────────
  // Default: white background, stroke & text matching the leg's routeColor.
  let arrowFill = "#ffffff";
  let arrowStroke = routeColor;
  let arrowTextColor = routeColor;
  let arrowStrokeWidth = 1.5;
  let arrowStrokeDasharray: string | undefined = undefined;

  if (isGroupPendingDelete) {
    arrowFill = "#fee2e2";
    arrowStroke = "#ef4444";
    arrowTextColor = "#dc2626";
    arrowStrokeDasharray = "3 3";
  } else if (isStopDone) {
    // Completed stop: solid leg color fill with white text
    arrowFill = routeColor;
    arrowStroke = routeColor;
    arrowTextColor = "#ffffff";
  } else if (isStopPartlyDone) {
    // Some passengers done: a light fill in the leg colour, so progress shows before the whole stop is done
    arrowFill = `${routeColor}40`;
    arrowStroke = routeColor;
    arrowTextColor = routeColor;
  } else if (jobStatus === "failed") {
    arrowFill = "#fef2f2";
    arrowStroke = "#dc2626";
    arrowTextColor = "#dc2626";
  } else if (jobStatus === "skipped") {
    arrowFill = "#f8fafc";
    arrowStroke = "#94a3b8";
    arrowTextColor = "#64748b";
  } else if (isStopSelected) {
    arrowStroke = routeColor;
    arrowStrokeWidth = 2.5;
    arrowTextColor = routeColor;
  }

  // ── Filter / Glow Resolution ────────────────────────────────────────────────
  const filterStyle = isGroupPendingDelete
    ? undefined
    : isStopSelected
    ? `drop-shadow(0 0 6px ${routeColor || "#059669"}) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))`
    : isStopNew
    ? "drop-shadow(0 0 6px rgba(16, 185, 129, 0.75)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12))"
    : isStopEdited
    ? undefined
    : isDropTarget
    ? "drop-shadow(0 0 8px rgba(16, 185, 129, 0.85))"
    : undefined;

  return (
    <div
      ref={ref}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center z-10 transition-[transform,filter,opacity] duration-150 select-none ${
        draggable ? "cursor-grab active:cursor-grabbing hover:scale-110" : "cursor-pointer"
      } ${
        isDraggingThis ? "opacity-30 scale-95" : ""
      } ${
        isStopSelected ? "scale-110 z-30" : ""
      } ${className}`}
      style={{
        left,
        width: 32,
        height: 38,
        opacity: isDimmed ? 0.4 : isDraggingThis ? 0.3 : 1,
        filter: filterStyle,
        ...style,
      }}
      title={title}
      {...restProps}
      aria-label={[restProps["aria-label"], doneLabel].filter(Boolean).join(", ") || undefined}
    >
      {/* Selected Checkmark Badge */}
      {isStopSelected && (
        <div
          className="absolute -top-2 -left-2 w-4.5 h-4.5 text-white rounded-full flex items-center justify-center shadow-md z-30 pointer-events-none"
          style={{ backgroundColor: routeColor || "#059669" }}
        >
          <CheckOutlined className="text-[9px] font-black" />
        </div>
      )}

      {/* Newly Added Job Badge */}
      {isStopNew && !isStopSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-emerald-600 text-white text-[8px] font-black uppercase rounded shadow-xs flex items-center gap-0.5 tracking-tight animate-bounce z-30 select-none pointer-events-none whitespace-nowrap">
          <SparklesIcon size={8} /> NEW
        </div>
      )}

      {/* One directional arrow per physical visit, with its number centered. */}
      <StopArrowSvg
        isPickup={isPickup}
        isMixed={isMixed}
        displayIndex={displayIndex}
        fill={arrowFill}
        stroke={arrowStroke}
        textColor={arrowTextColor}
        strokeWidth={arrowStrokeWidth}
        strokeDasharray={arrowStrokeDasharray}
      />

      {/* Edited: one small mark in the corner; the stop keeps its route colour. */}
      {isStopEdited && !isStopNew && (
        <EditedMark title="Edited by hand" className="absolute -bottom-2 -right-2.5 z-20 pointer-events-none" />
      )}
    </div>
  );
});

TimelineStopArrow.displayName = "TimelineStopArrow";

export default TimelineStopArrow;
