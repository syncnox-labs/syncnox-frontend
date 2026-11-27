"use client";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  ScheduleBlock as ScheduleBlockType,
  getBlockColor,
  getBlockFill,
} from "@/types/schedule.type";
import { Tooltip } from "antd";

// Enable dayjs timezone plugins
dayjs.extend(utc);
dayjs.extend(timezone);

interface ScheduleBlockProps {
  block: ScheduleBlockType;
  dayStartHour?: number;
  dayEndHour?: number;
  timezone?: string;
}

export default function ScheduleBlock({
  block,
  dayStartHour = 0,
  dayEndHour = 24,
  timezone: tz,
}: ScheduleBlockProps) {
  // Use provided timezone or auto-detect from browser
  const effectiveTimezone =
    tz || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Parse times with proper timezone handling
  const startDayjs = dayjs(block.start_time).tz(effectiveTimezone);
  const endDayjs = dayjs(block.end_time).tz(effectiveTimezone);

  // Calculate hours with fractional minutes in the specified timezone
  const startHour = startDayjs.hour() + startDayjs.minute() / 60;
  const endHour = endDayjs.hour() + endDayjs.minute() / 60;

  const totalHours = dayEndHour - dayStartHour;
  const leftPercent = ((startHour - dayStartHour) / totalHours) * 100;
  const widthPercent = ((endHour - startHour) / totalHours) * 100;

  const clampedLeft = Math.max(0, leftPercent);
  const clampedWidth = Math.min(100 - clampedLeft, widthPercent);

  if (clampedWidth <= 0 || clampedLeft >= 100) {
    return null;
  }

  const backgroundColor = getBlockColor(block);

  const formatTime = (date: dayjs.Dayjs) => {
    return date.format("h:mm A");
  };

  const tooltipContent = (
    <div>
      <div className="font-semibold">{block.title}</div>
      <div>
        {formatTime(startDayjs)} - {formatTime(endDayjs)}
      </div>
      {block.status && (
        <div className="capitalize">
          Status: {block.status.replace("_", " ")}
        </div>
      )}
      {block.metadata?.stops_count !== undefined && (
        <div>Stops: {block.metadata.stops_count}</div>
      )}
      {/* Break-specific info */}
      {block.type === "break" && block.metadata?.break_location_address && (
        <div>📍 {block.metadata.break_location_address}</div>
      )}
      {block.type === "break" && block.metadata?.break_duration_minutes && (
        <div>Duration: {block.metadata.break_duration_minutes} min</div>
      )}
      {/* Idle-specific info */}
      {block.type === "idle" && block.metadata?.idle_duration_minutes && (
        <div>Waiting: {block.metadata.idle_duration_minutes} min</div>
      )}
      {block.type === "idle" && block.metadata?.address && (
        <div>📍 {block.metadata.address}</div>
      )}
    </div>
  );

  // Determine if this is an idle block (use striped pattern)
  const isIdle = block.type === "idle";
  const blockStyle: React.CSSProperties = {
    left: `${clampedLeft}%`,
    width: `${clampedWidth}%`,
    backgroundColor: getBlockFill(block),
    borderLeft: `3px solid ${backgroundColor}`,
    ...(isIdle && {
      backgroundImage: `repeating-linear-gradient(
        45deg,
        transparent,
        transparent 5px,
        rgba(0,0,0,0.06) 5px,
        rgba(0,0,0,0.06) 10px
      )`,
    }),
  };

  return (
    <Tooltip title={tooltipContent} placement="top">
      <div
        className={`absolute top-1.5 bottom-1.5 rounded-none px-2 transition-shadow hover:shadow-[0_1px_1px_#091E4240,0_0_1px_#091E424F] overflow-hidden whitespace-nowrap text-ellipsis text-xs font-medium cursor-pointer flex items-center min-w-[20px] ${
          isIdle ? "text-[#44546F]" : "text-[#172B4D]"
        }`}
        style={blockStyle}
      >
        <span className="overflow-hidden text-ellipsis">{block.title}</span>
      </div>
    </Tooltip>
  );
}
