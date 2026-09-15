import { Routes, Stop } from "@/types/routes.type";
import dayjs from "dayjs";

export const HEADER_HEIGHT = 40;
export const ROW_HEIGHT = 60;

// Safety cap: timeline renders at most 24 hours of data.
// Optimization results with bad routing data (e.g. INT_MAX travel times
// producing year-2094 arrival times) would otherwise generate tens-of-millions
// of time markers, freezing the browser's JS thread entirely.
const MAX_TIMELINE_HOURS = 24;

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
  let minTime: dayjs.Dayjs | null = null;
  let maxTime: dayjs.Dayjs | null = null;

  routes.forEach((route) => {
    route.stops.forEach((stop: Stop) => {
      const time = dayjs(stop.arrival_time);
      if (!time.isValid()) return;
      if (!minTime || time.isBefore(minTime)) minTime = time;
      if (!maxTime || time.isAfter(maxTime)) maxTime = time;
    });
  });

  if (!minTime || !maxTime) {
    // Default fallback if no stops
    minTime = dayjs().startOf("day");
    maxTime = dayjs().endOf("day");
  }

  // Guard: clamp maxTime so the timeline never exceeds MAX_TIMELINE_HOURS.
  // Bad optimization results can produce arrival_times in year 2094+ (caused
  // by INT_MAX travel-time values from failed routing), which would create
  // 71 million+ time markers and hang the browser forever.
  const cappedMax = minTime.add(MAX_TIMELINE_HOURS, "hour");
  if (maxTime.isAfter(cappedMax)) {
    maxTime = cappedMax;
  }

  // Add buffer
  return {
    startTime: minTime.subtract(30, "minute"),
    endTime: maxTime.add(30, "minute"),
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
  // Clamp so a far-future stop doesn't extend the rendered position infinitely
  const clampedDiff = Math.min(diffMinutes, MAX_TIMELINE_HOURS * 60);
  return clampedDiff * pixelsPerMinute;
};

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

  // Hard safety cap — should never be needed after calculateTimeRange clamp,
  // but protects against any future callers that bypass it.
  const safeEndTime = endTime.isAfter(startTime.add(MAX_TIMELINE_HOURS + 1, "hour"))
    ? startTime.add(MAX_TIMELINE_HOURS + 1, "hour")
    : endTime;

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

  while (currentTime.isBefore(safeEndTime)) {
    if (currentTime.isAfter(startTime) || currentTime.isSame(startTime)) {
      const currentDateStr = currentTime.format("YYYY-MM-DD");
      const isNewDay = prevDateStr !== null && currentDateStr !== prevDateStr;
      const dateLabel = isNewDay || prevDateStr === null
        ? currentTime.format("ddd MMM D")
        : undefined;

      markers.push({
        time: currentTime,
        position: currentTime.diff(startTime, "minute", true) * pixelsPerMinute,
        label: currentTime.format("HH:mm"),
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
