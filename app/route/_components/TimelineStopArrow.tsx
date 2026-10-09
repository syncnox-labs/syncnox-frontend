import React from "react";
import { CheckOutlined, ClockCircleOutlined } from "@ant-design/icons";
import { Sparkles as SparklesIcon } from "lucide-react";

/**
 * Pure SVG presentation component for rendering a directional stop arrow.
 * - UP arrow for Pickup
 * - DOWN arrow for Drop-off
 * Displays the stop number centered inside the arrow shaft.
 */
interface StopArrowSvgProps {
  isPickup: boolean;
  displayIndex: number | string;
  fill: string;
  stroke: string;
  textColor: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export const StopArrowSvg: React.FC<StopArrowSvgProps> = ({
  isPickup,
  displayIndex,
  fill,
  stroke,
  textColor,
  strokeWidth = 2,
  strokeDasharray,
}) => {
  const textStr = String(displayIndex ?? "");
  const fontSize = textStr.length >= 3 ? "9" : textStr.length === 2 ? "11" : "12";

  if (isPickup) {
    // UP Arrow (Pickup): tip at top (y=2), shaft to bottom (y=36), center at y=19
    return (
      <svg
        width="32"
        height="38"
        viewBox="0 0 32 38"
        className="overflow-visible pointer-events-none"
      >
        <path
          d="M 16 2 L 31 13 L 26 13 L 26 36 L 6 36 L 6 13 L 1 13 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          strokeLinejoin="miter"
          strokeMiterlimit={4}
        />
        <text
          x="16"
          y="19"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="800"
          fontSize={fontSize}
          fill={textColor}
        >
          {displayIndex}
        </text>
      </svg>
    );
  }

  // DOWN Arrow (Drop-off): flat top (y=2), shaft to y=25, wings and tip at bottom (y=36), center at y=19
  return (
    <svg
      width="32"
      height="38"
      viewBox="0 0 32 38"
      className="overflow-visible pointer-events-none"
    >
      <path
        d="M 6 2 L 26 2 L 26 25 L 31 25 L 16 36 L 1 25 L 6 25 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinejoin="miter"
        strokeMiterlimit={4}
      />
      <text
        x="16"
        y="19"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize={fontSize}
        fill={textColor}
      >
        {displayIndex}
      </text>
    </svg>
  );
};

export interface TimelineStopArrowProps {
  /** True for pickup (UP arrow), false for drop-off (DOWN arrow) */
  isPickup: boolean;
  /** Stop number displayed inside the arrow body (e.g. 1, 2, 6) */
  displayIndex: number | string;
  /**
   * The color of this route / leg.
   * All stops (both pickup and dropoff) within the same leg share this color.
   */
  routeColor: string;
  /** Whether the stop is completed or in-transit */
  isStopDone?: boolean;
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
 * communicating stop direction (UP for pickup, DOWN for dropoff).
 * Wrapped in forwardRef to support Ant Design Tooltip and other parent wrappers.
 */
export const TimelineStopArrow = React.forwardRef<
  HTMLDivElement,
  TimelineStopArrowProps & React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const {
    isPickup,
    displayIndex,
    routeColor,
    isStopDone = false,
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
  let arrowStrokeWidth = 2;
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
  } else if (isStopEdited) {
    arrowStroke = "#9333ea";
    arrowTextColor = "#9333ea";
  }

  // ── Filter / Glow Resolution ────────────────────────────────────────────────
  const filterStyle = isGroupPendingDelete
    ? undefined
    : isStopSelected
    ? `drop-shadow(0 0 6px ${routeColor || "#059669"}) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.15))`
    : isStopNew
    ? "drop-shadow(0 0 6px rgba(16, 185, 129, 0.75)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12))"
    : isStopEdited
    ? "drop-shadow(0 0 6px rgba(147, 51, 234, 0.75)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12))"
    : isDropTarget
    ? "drop-shadow(0 0 8px rgba(16, 185, 129, 0.85))"
    : "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12))";

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

      {/* Edited Job Badge */}
      {!isStopNew && isStopEdited && !isStopSelected && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-purple-600 text-white text-[8px] font-black uppercase rounded shadow-xs flex items-center gap-0.5 tracking-tight z-30 select-none pointer-events-none whitespace-nowrap">
          <ClockCircleOutlined className="text-[8px]" /> EDITED
        </div>
      )}

      {/* Directional Arrow SVG (UP for pickup, DOWN for dropoff) with number centered */}
      <StopArrowSvg
        isPickup={isPickup}
        displayIndex={displayIndex}
        fill={arrowFill}
        stroke={arrowStroke}
        textColor={arrowTextColor}
        strokeWidth={arrowStrokeWidth}
        strokeDasharray={arrowStrokeDasharray}
      />

      {/* Corner edited indicator */}
      {isStopEdited && !isStopNew && (
        <div
          className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 bg-purple-600 text-white rounded-full border border-white shadow-xs z-20 pointer-events-none"
          title="Job edited"
        >
          <ClockCircleOutlined className="text-[7.5px]" />
        </div>
      )}
    </div>
  );
});

TimelineStopArrow.displayName = "TimelineStopArrow";

export default TimelineStopArrow;
