import { Routes, Stop } from "@/types/routes.type";
import dayjs from "dayjs";

export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 60;

// Safety cap: timeline renders at most 168 hours (7 days) of data.
// Optimization results with bad routing data (e.g. INT_MAX travel times
// producing year-2094 arrival times) are safely filtered out, preventing runaway
// millions of time markers while supporting overnight, multi-shift, and multi-day routes.
export const MAX_TIMELINE_HOURS = 168;

/**
 * Calculate dynamic pixels per minute based on interval
 * Smaller intervals get more pixels per minute for better spread
 */
export const getPixelsPerMinute = (intervalMinutes: number): number => {
  // Base scaling - smaller intervals need more spread
  const scalingMap: { [key: number]: number } = {
    5: 12, // 5 min intervals - most spread
    10: 8, // 10 min intervals
    15: 6, // 15 min intervals
    20: 5, // 20 min intervals
    25: 4.5, // 25 min intervals
    30: 4, // 30 min intervals - default
    60: 3, // 60 min intervals - least spread
  };

  return scalingMap[intervalMinutes] || 4; // Default to 4 if not found
};

export const calculateTimeRange = (routes: Routes[]) => {
  let resolvedMinTime: dayjs.Dayjs | null = null;

  // First pass: find the earliest legitimate arrival time across all routes
  routes.forEach((route) => {
    (route.stops || []).forEach((stop: Stop) => {
      if (!stop.arrival_time) return;
      const time = dayjs(stop.arrival_time);
      if (!time.isValid()) return;
      // Sanity check: must be a reasonable year (>= 2020)
      if (time.year() < 2020) return;
      if (!resolvedMinTime || time.isBefore(resolvedMinTime)) resolvedMinTime = time;
    });
  });

  if (!resolvedMinTime) {
    // Default fallback if no stops
    const fallbackMin = dayjs().startOf("day");
    return {
      startTime: fallbackMin.subtract(30, "minute"),
      endTime: fallbackMin.add(12, "hour"),
    };
  }

  const minTime: dayjs.Dayjs = resolvedMinTime;

  // Safety threshold: any stop beyond MAX_TIMELINE_HOURS from minTime is treated
  // as corrupted / rogue routing data (e.g. NextBillion / OR-tools INT_MAX year-2094 bug)
  const maxAllowedTime = minTime.add(MAX_TIMELINE_HOURS, "hour");
  let maxTime: dayjs.Dayjs = minTime;

  routes.forEach((route) => {
    (route.stops || []).forEach((stop: Stop) => {
      if (!stop.arrival_time) return;
      const time = dayjs(stop.arrival_time);
      if (!time.isValid()) return;
      // Ignore corrupted future dates or rogue past dates
      if (time.isAfter(maxAllowedTime) || time.isBefore(minTime)) return;

      const serviceDuration = stop.service_duration_minutes || 0;
      const finishTime = serviceDuration > 0 ? time.add(serviceDuration, "minute") : time;

      if (finishTime.isAfter(maxTime)) {
        maxTime = finishTime;
      }
    });

    // Also check idle blocks if any
    ((route as any).idle_blocks || []).forEach((idle: any) => {
      if (!idle.end_time) return;
      const idleEnd = dayjs(idle.end_time);
      if (idleEnd.isValid() && !idleEnd.isAfter(maxAllowedTime) && idleEnd.isAfter(maxTime)) {
        maxTime = idleEnd;
      }
    });
  });

  // Ensure at least 3 hours span for clean visual display even with single/close stops
  if (maxTime.diff(minTime, "minute") < 60) {
    maxTime = minTime.add(2, "hour");
  }

  // Add 30 minutes buffer before start, and 60 minutes buffer after end so the
  // final stop node and its hover tooltips have plenty of space and are never cut off.
  return {
    startTime: minTime.subtract(30, "minute"),
    endTime: maxTime.add(60, "minute"),
  };
};

export const getPosition = (
  timeString: string,
  startTime: dayjs.Dayjs,
  pixelsPerMinute: number = 4
): number => {
  const time = dayjs(timeString);
  if (!time.isValid()) return 0;
  const diffMinutes = time.diff(startTime, "minute", true);
  // Clamp: never negative, and capped at MAX_TIMELINE_HOURS to protect against rogue year-2094 values
  const clampedDiff = Math.max(0, Math.min(diffMinutes, MAX_TIMELINE_HOURS * 60));
  return clampedDiff * pixelsPerMinute;
};

export { formatTime12h } from "./app.utils";

export interface TimeMarker {
  time: dayjs.Dayjs;
  position: number;
  label: string;
  isNewDay?: boolean;
  dateLabel?: string;
}

export const generateTimeMarkers = (
  startTime: dayjs.Dayjs,
  endTime: dayjs.Dayjs,
  intervalMinutes: number = 30,
  pixelsPerMinute: number = 4
): TimeMarker[] => {
  const markers: TimeMarker[] = [];
  let currentTime: dayjs.Dayjs;

  // Hard safety cap: never exceed startTime + MAX_TIMELINE_HOURS + 1
  const maxSafeTime = startTime.add(MAX_TIMELINE_HOURS + 1, "hour");
  const safeEndTime = endTime.isAfter(maxSafeTime) ? maxSafeTime : endTime;

  // For intervals that divide evenly into an hour, align to the appropriate boundary
  if (60 % intervalMinutes === 0) {
    // Start from the hour and find the first interval boundary after startTime
    currentTime = startTime.clone().startOf("hour");

    // Move to the first interval boundary at or after startTime
    while (currentTime.isBefore(startTime)) {
      currentTime = currentTime.add(intervalMinutes, "minute");
    }
  } else {
    // For intervals that don't divide evenly (e.g., 25 min), start from startTime
    currentTime = startTime.clone();
  }

  let prevDateStr: string | null = null;

  while (currentTime.isBefore(safeEndTime) || currentTime.isSame(safeEndTime)) {
    if (currentTime.isAfter(startTime) || currentTime.isSame(startTime)) {
      const currentDateStr = currentTime.format("YYYY-MM-DD");
      const isNewDay = prevDateStr !== null && currentDateStr !== prevDateStr;
      const dateLabel = isNewDay || prevDateStr === null
        ? currentTime.format("ddd MMM D")
        : undefined;

      markers.push({
        time: currentTime,
        position: currentTime.diff(startTime, "minute", true) * pixelsPerMinute,
        label: currentTime.format("hh:mm A"),
        isNewDay,
        dateLabel,
      });

      prevDateStr = currentDateStr;
    }
    currentTime = currentTime.add(intervalMinutes, "minute");
  }
  return markers;
};

export const ROUTE_COLORS = [
  "#1f77b4", // Steel Blue
  "#ff7f0e", // Dark Orange
  "#059669", // Emerald Green
  "#9467bd", // Muted Purple
  "#8c564b", // Chestnut Brown
  "#e377c2", // Orchid Pink
  "#17becf", // Cyan Blue
  "#bcbd22", // Olive Yellow
  "#393b79", // Dark Indigo
  "#637939", // Olive Green
  "#8c6d31", // Bronze
  "#5254a3", // Dark Slate Blue
  "#7b4173", // Deep Plum
  "#3182bd", // Medium Blue
  "#e6550d", // Rust Orange
];

export const getRouteColor = (index: number) => {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
};
