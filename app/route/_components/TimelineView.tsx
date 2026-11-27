import { useMediaQuery } from "@/hooks/useMediaQuery";
import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Truck, Calendar, Home, Flag, ArrowUp, ArrowDown, House, Minus, Plus, PanelTop, PanelRight, User, Users, Clock } from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import type { Vehicle } from "@/types/vehicle.type";
import type { Team } from "@/types/team.type";
import { Avatar, Tooltip, Select, Dropdown, Input, message, Modal } from "antd";
import type { MenuProps } from "antd";
import { useIndexStore } from "@/store/index.store";
import { getJobLeg } from "@/utils/jobPickupType.utils";
import { routeNeedsOptimization } from "./jobAddition.utils";
import { isDriverMatch } from "./optimizationView.utils";
import DriverPresenceIndicator from "@/components/DriverPresenceIndicator";
import {
  UserOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  MoreOutlined,
  PlusOutlined,
  SwapOutlined,
  RetweetOutlined,
  ThunderboltOutlined,
  FileTextOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  CarOutlined,
  SearchOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  UndoOutlined,
  MenuOutlined,
  LoadingOutlined,
  CheckOutlined,
  ShareAltOutlined,
  MessageOutlined,
} from "@ant-design/icons";
import {
  GripVertical,
  Sparkles as SparklesIcon,
} from "lucide-react";
import ReorderStopsModal from "./ReorderStopsModal";
import TransferStopsModal from "./TransferStopsModal";
import type { StopMoveSelection } from "@/types/routes.type";
import { selectTripToMove, snapshotMoveStops, type TripMoveSelection } from "./tripMove.utils";
import type { TransferSelection } from "./transferStops.utils";
import TimelineStopArrow, { StopArrowSvg, EditedMark } from "./TimelineStopArrow";
import TimelineTravelSegment from "./TimelineTravelSegment";
import TimelineTooltip, { TimelineTooltipProvider } from "./TimelineTooltip";
import { getTimelineSegment } from "./timelineSegment.utils";
import { TIMELINE_INTERVALS } from "./optimizationShortcuts.utils";
import { useTimelineZoom } from "./useTimelineZoom";
import { moveVisibleDriver, orderDrivers } from "./timelineDriverOrder.utils";
import { waitingMergeButtonLayout, waitingMergeCandidates } from "./routeWaiting.utils";
import { isRedundantLeaderClientStart } from "./leaderRoute.utils";
import { getRouteStopDisplay, getSimultaneousStopLayout, getStopTooltipStops, type GroupedStop as DisplayStopGroup } from "./stopDisplay.utils";
import {
  calculateTimeRange,
  generateTimeMarkers,
  getPosition,
  getPixelsPerMinute,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  getRouteColor,
} from "@/utils/timeline.utils";

type GroupedStop = DisplayStopGroup<any>;

interface TimelineViewProps {
  routes: any[];
  planId?: number | string;
  jobs?: Job[];
  teams?: Team[];
  scheduledDate?: string | null;
  showDriverWorkingTime?: boolean;
  onDriverWorkingHoursChange?: (
    teamId: number,
    dayKey: string,
    startTime: string,
    endTime: string,
  ) => Promise<void>;
  /** Optional template type indicator (e.g. "worker_shuttle") */
  templateType?: string;
  /** Vehicle list from vehicle store — used to show vehicle info per route. */
  vehicles?: Vehicle[];
  /** Selected marker ID `${routeIndex}-${stopIndex}` from map click or stop selection */
  selectedMarkerId?: string | number | null;
  onStopClick?: (stop: any, routeIndex: number, stopIndex: number) => void;
  onAddStop?: (routeIndex: number) => void;
  onShareDriver?: (routeIndex: number) => void;
  onMessageDriver?: (routeIndex: number) => void;
  sharingDisabled?: boolean;
  sharingDriverId?: number | null;
  onEditWaiting?: (routeIndex: number, afterStopIndex: number) => void;
  onMergeRoutes?: (routeIndex: number, mergeRouteIndex?: number) => void;
  onSwapDriver?: (routeIndex: number) => void;
  onChangeVehicle?: (routeIndex: number) => void;
  onSwapVehicles?: (routeIndex: number) => void;
  onReverseRoute?: (routeIndex: number) => void;
  onReOptimize?: (routeIndex: number) => void;
  pendingRouteIndices?: ReadonlySet<number>;
  onReorderStops?: (
    routeIndex: number,
    orderedJobIds: number[],
    orderedStopIndices?: number[],
    orderedStops?: any[]
  ) => Promise<void> | void;
  onSaveAndReOptimize?: (
    routeIndex: number,
    orderedJobIds: number[],
    orderedStopIndices?: number[],
    orderedStops?: any[]
  ) => Promise<void> | void;
  onRemoveStop?: (
    routeIndex: number,
    jobId: number,
    stopType?: string,
  ) => Promise<void> | void;
  /** Index of the route currently isolated on the map, or null for "show all". */
  focusedRouteIndex?: number | null;
  onFocusRoute?: (routeIndex: number) => void;
  driverSearch?: string;
  onDriverSearchChange?: (search: string) => void;
  exactMatch?: boolean;
  onExactMatchChange?: (exact: boolean) => void;
  pendingDeletedJobIds?: Set<number>;
  onDeleteJob?: (jobId: number) => void;
  onUndoDeleteJob?: (jobId: number) => void;
  reorderingRouteIndex?: number | null;
  onAddUnassignedJob?: (routeIndex: number, jobId: number, position?: number) => Promise<void> | void;
  onMoveStops?: (selection: StopMoveSelection, targetRouteIndex: number) => void;
  onMoveTrip?: (selection: TripMoveSelection, targetRouteIndex: number) => void;
  onTransferStops?: (
    sourceRouteIndex: number,
    targetRouteIndex: number,
    jobIds: number[],
    targetPosition?: number,
    reoptimize?: boolean,
    selection?: TransferSelection,
  ) => Promise<void> | void;
  /** Where the map sits: above the trips, or beside them. Omit to hide the switch. */
  layout?: "stacked" | "side";
  onLayoutChange?: (layout: "stacked" | "side") => void;
  /** Turns the working-time bands on and off (remembered by the page). */
  onToggleWorkingTime?: (show: boolean) => void;
  /** Rendered first in the toolbar, for example the Timeline / Jobs / Vehicles tabs. */
  leadingControls?: React.ReactNode;
}

const INTERVAL_OPTIONS = TIMELINE_INTERVALS.map(value => ({ value, label: `${value} min` }));
/** The app shows 12-hour times everywhere today. When the onboarding language/clock
 * setting exists, read it here so the axis and every card switch together. */
const USES_12_HOUR_CLOCK = true;
const formatAxisTime = (time: dayjs.Dayjs) => USES_12_HOUR_CLOCK
  ? time.format(time.minute() === 0 ? "h:mm A" : "h:mm") : time.format("HH:mm");
const formatShiftRange = (shift: { startMinutes: number; endMinutes: number }) =>
  formatMinutesAsTime(shift.startMinutes) + "–" + formatMinutesAsTime(shift.endMinutes) +
  (shift.endMinutes > 24 * 60 ? " (next day)" : "");
/** One toolbar row above the time axis, on every screen size. */
const TIMELINE_TOOLBAR_HEIGHT = 41;
const hatch = "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 6px)";

const formatDurationSeconds = (seconds: number): string => {
  if (!seconds || seconds <= 0) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${minutes} min`;
  }
};

const getRouteDurationStr = (route: any): string => {
  if (route.total_duration_seconds && route.total_duration_seconds > 0) {
    return formatDurationSeconds(route.total_duration_seconds);
  }
  if (route.stops && route.stops.length > 0) {
    const firstStop = route.stops[0];
    const lastStop = route.stops[route.stops.length - 1];
    if (firstStop?.arrival_time && lastStop?.arrival_time) {
      const start = dayjs(firstStop.arrival_time);
      const end = dayjs(lastStop.arrival_time);
      const lastService = lastStop.service_duration_minutes || 0;
      const diffMins = end.diff(start, "minute") + lastService;
      if (diffMins > 0) {
        return formatDurationSeconds(diffMins * 60);
      }
    }
  }
  return "";
};

const DESKTOP_DRIVER_COLUMN_WIDTH = 265;

interface DriverGroup {
  driverKey: string;
  driverName: string;
  routes: Array<{
    route: any;
    originalIndex: number;
  }>;
}

interface DriverShift {
  startMinutes: number;
  endMinutes: number;
}

interface DriverAvailabilityWindow {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
  dayKey?: string;
  shift?: DriverShift;
}

interface DriverScheduleLike {
  enabled?: boolean | string | number;
  is_working?: boolean | string | number;
  start_time?: string | null;
  end_time?: string | null;
  start?: string | null;
  end?: string | null;
}

interface TimelineCompletionStop {
  arrival_time?: string | null;
  departure_time?: string | null;
  service_duration_minutes?: number | null;
}

interface ShiftDragState extends DriverShift {
  teamId: number;
  driverName: string;
  edge: "start" | "end";
  initialClientX: number;
  dayKey: string;
  dayStart: dayjs.Dayjs;
}

const SHIFT_SNAP_MINUTES = 15;
const MIN_SHIFT_MINUTES = 60;
const MAX_SHIFT_MINUTES = 24 * 60 - 1;

const getShiftOverrideKey = (teamId: number, dayKey: string): string =>
  String(teamId) + ":" + dayKey.toLowerCase();

const parseTimeToMinutes = (value?: string | null): number | null => {
  if (!value) return null;
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatMinutesAsTime = (minutes: number): string => {
  const safeMinutes = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
};

const isScheduleEnabled = (value: unknown): boolean =>
  value !== false && value !== 0 && String(value).toLowerCase() !== "false";

const getDriverShiftForDay = (team: Team, dayKey: string): DriverShift | null => {
  const rawSchedules = (team.day_schedules || {}) as Record<
    string,
    DriverScheduleLike | undefined
  >;
  const scheduleKey = Object.keys(rawSchedules).find(
    (key) => key.trim().toLowerCase() === dayKey.trim().toLowerCase(),
  );
  const daySchedule = scheduleKey ? rawSchedules[scheduleKey] : undefined;

  if (
    daySchedule &&
    (!isScheduleEnabled(daySchedule.enabled) ||
      !isScheduleEnabled(daySchedule.is_working))
  ) {
    return null;
  }

  const startMinutes = parseTimeToMinutes(
    daySchedule?.start_time ?? daySchedule?.start ?? team.work_start_time,
  );
  const rawEndMinutes = parseTimeToMinutes(
    daySchedule?.end_time ?? daySchedule?.end ?? team.work_end_time,
  );
  if (startMinutes === null || rawEndMinutes === null) return null;

  // An end time at or before the start is an overnight shift, not an invalid
  // schedule (for example 18:00–01:00 ends on the following calendar day).
  const endMinutes =
    rawEndMinutes <= startMinutes ? rawEndMinutes + 24 * 60 : rawEndMinutes;
  return { startMinutes, endMinutes };
};

const buildAvailabilityWindows = (
  team: Team,
  rangeStart: dayjs.Dayjs,
  rangeEnd: dayjs.Dayjs,
  shiftOverrides: Record<string, DriverShift>,
): DriverAvailabilityWindow[] => {
  const windows: DriverAvailabilityWindow[] = [];
  let cursor = rangeStart.startOf("day").subtract(1, "day");
  const lastDay = rangeEnd.startOf("day").add(1, "day");

  while (cursor.isBefore(lastDay) || cursor.isSame(lastDay, "day")) {
    const dayKey = cursor.format("dddd").toLowerCase();
    const shift =
      shiftOverrides[getShiftOverrideKey(team.id, dayKey)] ||
      getDriverShiftForDay(team, dayKey);
    if (shift) {
      windows.push({
        start: cursor.add(shift.startMinutes, "minute"),
        end: cursor.add(shift.endMinutes, "minute"),
        dayKey,
        shift,
      });
    }
    cursor = cursor.add(1, "day");
  }

  return windows.sort((a, b) => a.start.valueOf() - b.start.valueOf());
};

const deriveDriverShiftFromRoutes = (
  driverRoutes: Array<{ route: { stops?: TimelineCompletionStop[] } }>,
  scheduledDay: dayjs.Dayjs,
): DriverShift => {
  let earliest: dayjs.Dayjs | null = null;
  let latest: dayjs.Dayjs | null = null;

  driverRoutes.forEach(({ route }) => {
    (route.stops || []).forEach((stop) => {
      if (!stop.arrival_time) return;
      const arrival = dayjs(stop.arrival_time);
      const completion = stop.departure_time
        ? dayjs(stop.departure_time)
        : arrival.add(stop.service_duration_minutes || 0, "minute");
      if (!arrival.isValid() || !completion.isValid()) return;
      if (!earliest || arrival.isBefore(earliest)) earliest = arrival;
      if (!latest || completion.isAfter(latest)) latest = completion;
    });
  });

  if (!earliest || !latest) {
    return { startMinutes: 8 * 60, endMinutes: 17 * 60 };
  }

  const paddedStart = (earliest as dayjs.Dayjs).subtract(30, "minute");
  const paddedEnd = (latest as dayjs.Dayjs).add(30, "minute");
  const rawStart = Math.floor(
    paddedStart.diff(scheduledDay, "minute", true) / SHIFT_SNAP_MINUTES,
  ) * SHIFT_SNAP_MINUTES;
  const startMinutes = ((rawStart % 1440) + 1440) % 1440;
  const durationMinutes = Math.max(
    MIN_SHIFT_MINUTES,
    Math.ceil(
      paddedEnd.diff(paddedStart, "minute", true) / SHIFT_SNAP_MINUTES,
    ) * SHIFT_SNAP_MINUTES,
  );

  return {
    startMinutes,
    endMinutes: startMinutes + Math.min(MAX_SHIFT_MINUTES, durationMinutes),
  };
};

const formatMinutesAsDuration = (minutes: number): string => {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
};

const getVehicleCapacity = (v?: Vehicle): number | null => {
  if (!v) return null;
  if (Array.isArray(v.load_constraints)) {
    for (const c of v.load_constraints as any[]) {
      if (c && typeof c === "object") {
        // Mirror the backend seat parser: only seat-like rows count as seats.
        // weight/volume/distance/duration rows are cargo limits, never seats.
        const ctype = String(c.constraint_type || "").toLowerCase();
        const label = String((c as any).label || "").toLowerCase();
        const unit = String(c.unit || "").toLowerCase();
        const isSeatRow =
          ["seats", "seat", "passengers", "passenger", "capacity", "item_count",
           "seating_capacity", "passenger_capacity", "pax"].includes(ctype) ||
          ["seat", "passenger", "pax"].some((k) => label.includes(k) || unit.includes(k));
        if (isSeatRow) {
          const val = Number(c.max_value);
          if (val > 0) return val;
        }
      }
    }
  }
  const vtype = String(v.type || "").toLowerCase();
  const typeCaps: Record<string, number> = {
    car: 4, van: 8, bus: 30, small_truck: 2, truck: 2, scooter: 1, bike: 1, foot: 1,
  };
  return typeCaps[vtype] || null;
};

const TimelineView: React.FC<TimelineViewProps> = ({
  routes,
  planId,
  jobs = [],
  teams = [],
  scheduledDate,
  showDriverWorkingTime = true,
  onDriverWorkingHoursChange,
  templateType,
  vehicles = [],
  selectedMarkerId = null,
  onStopClick,
  onAddStop,
  onShareDriver,
  onMessageDriver,
  sharingDisabled = false,
  sharingDriverId = null,
  onEditWaiting,
  onMergeRoutes,
  onSwapDriver,
  onChangeVehicle,
  onSwapVehicles,
  onReverseRoute,
  onReOptimize,
  pendingRouteIndices,
  onReorderStops,
  onSaveAndReOptimize,
  onRemoveStop,
  focusedRouteIndex = null,
  onFocusRoute,
  driverSearch: externalDriverSearch,
  onDriverSearchChange,
  exactMatch: externalExactMatch,
  onExactMatchChange,
  pendingDeletedJobIds = new Set<number>(),
  onDeleteJob,
  onUndoDeleteJob,
  reorderingRouteIndex = null,
  onAddUnassignedJob,
  onTransferStops,
  onMoveTrip,
  onMoveStops,
  layout = "stacked",
  onLayoutChange,
  leadingControls,
  onToggleWorkingTime,
}) => {
  const compactTimeline = useMediaQuery("(max-width: 639px)");
  const DRIVER_COLUMN_WIDTH = compactTimeline ? 168 : DESKTOP_DRIVER_COLUMN_WIDTH;
  const containerRef = useRef<HTMLDivElement>(null);
  const [shiftOverrides, setShiftOverrides] = useState<Record<string, DriverShift>>({});
  const [shiftDrag, setShiftDrag] = useState<ShiftDragState | null>(null);
  const shiftDragValueRef = useRef<DriverShift | null>(null);
  const [savingShiftTeamId, setSavingShiftTeamId] = useState<number | null>(null);
  const [confirmingShiftTeamId, setConfirmingShiftTeamId] = useState<number | null>(null);
  const [openStopTooltipKey, setOpenStopTooltipKey] = useState<string | null>(null);
  const [overlappingStops, setOverlappingStops] = useState<{ routeIndex: number; groups: GroupedStop[] } | null>(null);
  const [driverOrder, setDriverOrder] = useState<{ planId: number | string | undefined; keys: string[] }>({ planId, keys: [] });
  const [draggedDriver, setDraggedDriver] = useState<string | null>(null);
  const [driverDrop, setDriverDrop] = useState<{ key: string; side: "before" | "after" } | null>(null);
  const [orderAnnouncement, setOrderAnnouncement] = useState("");

  useEffect(() => {
    let keys: string[] = [];
    if (planId != null) {
      try {
        const stored = JSON.parse(localStorage.getItem(`syncnox.timeline.driver-order.${planId}`) || "[]");
        if (Array.isArray(stored)) keys = stored.filter((key): key is string => typeof key === "string");
      } catch { /* Storage can be unavailable or contain an older invalid value. */ }
    }
    setDriverOrder({ planId, keys });
    setDraggedDriver(null);
    setDriverDrop(null);
  }, [planId]);

  const { activeJobTemplate } = useIndexStore();

  const isWorkerShuttle = useMemo(() => {
    if (templateType === "worker_shuttle") return true;
    if (activeJobTemplate === "worker_shuttle") return true;
    if (routes?.some((r: any) => (r as any)?.leg !== undefined || (r as any)?.template_type === "worker_shuttle")) return true;
    if (jobs?.some((j: any) => j?.template_type === "worker_shuttle" || Boolean(j?.worker_shuttle_detail))) return true;
    if (
      routes?.some((r: any) =>
        r?.stops?.some(
          (s: any) =>
            Boolean(s?.worker_shuttle_detail) ||
            Boolean(s?.job?.worker_shuttle_detail) ||
            s?.job?.template_type === "worker_shuttle"
        )
      )
    ) {
      return true;
    }
    return false;
  }, [templateType, activeJobTemplate, routes, jobs]);

  // Dedicated Reorder Modal state
  const [reorderModalRouteIndex, setReorderModalRouteIndex] = useState<number | null>(null);

  // Dedicated Transfer Modal state
  const [transferModalRouteIndex, setTransferModalRouteIndex] = useState<number | null>(null);

  // Multi-stop selection state on timeline
  const [selectedStopJobIds, setSelectedStopJobIds] = useState<Set<number>>(new Set());
  const [selectionSourceRouteIndex, setSelectionSourceRouteIndex] = useState<number | null>(null);

  // Direct Timeline Drag and Drop state
  const [draggedTrip, setDraggedTrip] = useState<TripMoveSelection | null>(null);
  const [tripDropRouteIndex, setTripDropRouteIndex] = useState<number | null>(null);
  const [draggedStopInfo, setDraggedStopInfo] = useState<{
    routeIndex: number;
    rawIndex: number;
    rawIndices: number[];
    jobId: number | null;
    displayIndex: number;
    moveSelection?: StopMoveSelection;
  } | null>(null);

  const [dragOverStopInfo, setDragOverStopInfo] = useState<{
    routeIndex: number;
    targetFirstRawIndex: number;
    targetRawIndices: number[];
    side: "before" | "after";
    indicatorX?: number;
    targetStopIndex?: number;
    targetName?: string;
  } | null>(null);

  const dragOverSlotRef = useRef<{
    routeIndex: number;
    targetFirstRawIndex: number;
    side: "before" | "after";
    indicatorX: number;
  } | null>(null);

  const [isReordering, setIsReordering] = useState(false);

  // Global cleanup for drag and drop
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDraggedTrip(null);
      setTripDropRouteIndex(null);
      setDragOverStopInfo(null);
    };
    document.addEventListener("dragend", handleGlobalDragEnd);
    return () => document.removeEventListener("dragend", handleGlobalDragEnd);
  }, []);


  const handleTimelineStopDragStart = (
    e: React.DragEvent,
    routeIndex: number,
    rawIndex: number,
    rawIndices: number[],
    jobId: number | null,
    displayIndex: number
  ) => {
    e.stopPropagation();
    dragOverSlotRef.current = null;
    const jobIds = jobId && selectedStopJobIds.has(jobId) && selectionSourceRouteIndex === routeIndex
      ? [...selectedStopJobIds] : jobId ? [jobId] : [];
    const moveSelection: StopMoveSelection | undefined = onMoveStops && jobIds.length ? {
      sourceRouteIndex: routeIndex, sourceDriverId: routes[routeIndex].team_member_id,
      sourceLeg: routes[routeIndex].leg ?? null, jobIds, sourceStops: snapshotMoveStops(routes[routeIndex]),
    } : undefined;
    setDraggedStopInfo({ routeIndex, rawIndex, rawIndices, jobId, displayIndex, moveSelection });
    if (moveSelection) e.dataTransfer.setData("application/x-syncnox-booking", JSON.stringify(moveSelection));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify({ routeIndex, rawIndex, jobId }));
  };

  const [internalDriverSearch, setInternalDriverSearch] = useState("");
  const [internalExactMatch, setInternalExactMatch] = useState(false);

  const driverSearch = externalDriverSearch ?? internalDriverSearch;
  const exactMatch = externalExactMatch ?? internalExactMatch;

  const setDriverSearch = (val: string) => {
    if (onDriverSearchChange) {
      onDriverSearchChange(val);
    } else {
      setInternalDriverSearch(val);
    }
  };

  const setExactMatch = (val: boolean) => {
    if (onExactMatchChange) {
      onExactMatchChange(val);
    } else {
      setInternalExactMatch(val);
    }
  };


  const allDriverGroups = useMemo(() => {
    const groupsMap = new Map<string, DriverGroup>();

    routes.forEach((route, originalIndex) => {
      const key =
        route.team_member_id != null
          ? `driver-id-${route.team_member_id}`
          : route.team_member_name
          ? `driver-name-${route.team_member_name.toLowerCase().trim()}`
          : `driver-index-${originalIndex}`;

      const driverName =
        route.team_member_name || "Driver name unavailable";

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          driverKey: key,
          driverName,
          routes: [],
        });
      }

      groupsMap.get(key)!.routes.push({ route, originalIndex });
    });

    return orderDrivers(Array.from(groupsMap.values()), driverOrder.planId === planId ? driverOrder.keys : []);
  }, [routes, driverOrder, planId]);

  const driverGroups = useMemo(() => allDriverGroups.filter(group =>
    isDriverMatch(group.driverName, driverSearch, exactMatch)), [allDriverGroups, driverSearch, exactMatch]);

  const moveDriver = (source: string, target: string, side: "before" | "after") => {
    const keys = moveVisibleDriver(allDriverGroups.map(group => group.driverKey),
      driverGroups.map(group => group.driverKey), source, target, side);
    setDriverOrder({ planId, keys });
    if (planId != null) {
      try { localStorage.setItem(`syncnox.timeline.driver-order.${planId}`, JSON.stringify(keys)); }
      catch { /* Reordering still works for the current session. */ }
    }
    const name = allDriverGroups.find(group => group.driverKey === source)?.driverName || "Driver";
    setOrderAnnouncement(`${name} moved to position ${keys.indexOf(source) + 1} of ${keys.length}.`);
  };

  const baseTimeRange = useMemo(() => calculateTimeRange(routes), [routes]);

  const scheduleDay = useMemo(() => {
    const requestedDay = scheduledDate ? dayjs(scheduledDate) : null;
    return requestedDay?.isValid()
      ? requestedDay.startOf("day")
      : baseTimeRange.startTime.startOf("day");
  }, [scheduledDate, baseTimeRange.startTime]);

  const scheduleDayKey = scheduleDay.format("dddd").toLowerCase();

  const persistedShiftsByTeamId = useMemo(() => {
    const shifts = new Map<number, DriverShift>();
    if (!showDriverWorkingTime) return shifts;
    teams.forEach((team) => {
      const shift = getDriverShiftForDay(team, scheduleDayKey);
      if (shift) shifts.set(team.id, shift);
    });
    return shifts;
  }, [teams, scheduleDayKey, showDriverWorkingTime]);

  const { startTime, endTime } = useMemo(() => {
    // The timeline never extends past the previous day, the plan day and the
    // next day, matching the routes the backend returns for this plan.
    const hasScheduledDay = Boolean(scheduledDate) && dayjs(scheduledDate).isValid();
    // Never cut off this plan's own routes, even if they run past the window.
    const ownRoutes = routes.filter((r) => r.source_optimization_id == null);
    const ownRange = ownRoutes.length ? calculateTimeRange(ownRoutes) : null;
    let windowStart = scheduleDay.subtract(1, "day");
    let windowEnd = scheduleDay.add(2, "day");
    if (ownRange) {
      if (ownRange.startTime.isBefore(windowStart)) windowStart = ownRange.startTime;
      if (ownRange.endTime.isAfter(windowEnd)) windowEnd = ownRange.endTime;
    }
    const clampToWindow = (range: { startTime: dayjs.Dayjs; endTime: dayjs.Dayjs }) => {
      if (!hasScheduledDay) return range;
      const clampedStart = range.startTime.isBefore(windowStart) ? windowStart : range.startTime;
      const clampedEnd = range.endTime.isAfter(windowEnd) ? windowEnd : range.endTime;
      return clampedEnd.isAfter(clampedStart)
        ? { startTime: clampedStart, endTime: clampedEnd }
        : range;
    };
    if (!showDriverWorkingTime) return clampToWindow(baseTimeRange);
    let earliest = baseTimeRange.startTime;
    let latest = baseTimeRange.endTime;

    const firstRouteDay = (
      scheduleDay.isBefore(baseTimeRange.startTime.startOf("day"))
        ? scheduleDay
        : baseTimeRange.startTime.startOf("day")
    );
    const lastRouteDay = (
      scheduleDay.isAfter(baseTimeRange.endTime.startOf("day"))
        ? scheduleDay
        : baseTimeRange.endTime.startOf("day")
    );
    let dayCursor = firstRouteDay;
    while (dayCursor.isBefore(lastRouteDay) || dayCursor.isSame(lastRouteDay, "day")) {
      const dayKey = dayCursor.format("dddd").toLowerCase();
      teams.forEach((team) => {
        const shift = getDriverShiftForDay(team, dayKey);
        if (!shift) return;
        const shiftStart = dayCursor.add(shift.startMinutes, "minute");
        const shiftEnd = dayCursor.add(shift.endMinutes, "minute");
        if (shiftStart.subtract(30, "minute").isBefore(earliest)) {
          earliest = shiftStart.subtract(30, "minute");
        }
        if (shiftEnd.add(60, "minute").isAfter(latest)) {
          latest = shiftEnd.add(60, "minute");
        }
      });
      dayCursor = dayCursor.add(1, "day");
    }

    if (!shiftDrag) {
      const firstDay = earliest.startOf("day").subtract(1, "day");
      const lastDay = latest.startOf("day").add(1, "day");
      Object.entries(shiftOverrides).forEach(([overrideKey, shift]) => {
        const dayKey = overrideKey.split(":").pop();
        let cursor = firstDay;
        while (dayKey && (cursor.isBefore(lastDay) || cursor.isSame(lastDay, "day"))) {
          if (cursor.format("dddd").toLowerCase() === dayKey) {
            const shiftStart = cursor.add(shift.startMinutes, "minute");
            const shiftEnd = cursor.add(shift.endMinutes, "minute");
            if (shiftStart.subtract(30, "minute").isBefore(earliest)) {
              earliest = shiftStart.subtract(30, "minute");
            }
            if (shiftEnd.add(60, "minute").isAfter(latest)) {
              latest = shiftEnd.add(60, "minute");
            }
          }
          cursor = cursor.add(1, "day");
        }
      });
    }

    return clampToWindow({ startTime: earliest, endTime: latest });
  }, [
    baseTimeRange,
    persistedShiftsByTeamId,
    scheduleDay,
    scheduledDate,
    routes,
    shiftDrag,
    shiftOverrides,
    showDriverWorkingTime,
    teams,
  ]);

  const teamsById = useMemo(() => {
    const map = new Map<number, Team>();
    teams.forEach((team) => map.set(team.id, team));
    return map;
  }, [teams]);

  const teamsByName = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((team) => map.set(team.name.trim().toLowerCase(), team));
    return map;
  }, [teams]);

  const availabilityWindowsByTeamId = useMemo(() => {
    const map = new Map<number, DriverAvailabilityWindow[]>();
    if (!showDriverWorkingTime) return map;
    teams.forEach((team) => {
      map.set(
        team.id,
        buildAvailabilityWindows(
          team,
          startTime,
          endTime,
          shiftOverrides,
        ),
      );
    });
    return map;
  }, [teams, startTime, endTime, scheduleDay, shiftOverrides, showDriverWorkingTime]);

  const jobsMap = useMemo(() => {
    const map = new Map<number, string>();
    jobs.forEach(job => map.set(Number(job.id), job.status));
    return map;
  }, [jobs]);

  const jobsByIdMap = useMemo(() => {
    const map = new Map<number, Job>();
    jobs.forEach(job => map.set(Number(job.id), job));
    return map;
  }, [jobs]);

  /**
   * Does this passenger make their shift? Outbound: drop-off against the shift start, keeping the
   * "arrive N min before" rule. Return: pickup against the shift end. Only for jobs that carry a shift.
   */
  const getShiftCheck = (jobId: number, routeStops: any[], leg: string | undefined) => {
    const job: any = jobsByIdMap.get(jobId);
    if (!job) return null;
    const value = (key: string) => job?.[key] ?? job?.worker_shuttle_detail?.[key] ?? job?.custom_fields?.[key];
    const clock = (v: unknown) => { const m = String(v ?? "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const isReturn = String(leg ?? "").toUpperCase() === "RETURN";
    const target = clock(value(isReturn ? "end_hour" : "start_hour"));
    // A combined trip holds both directions of a round trip under one job id: match the direction too.
    const wanted = isReturn ? ["pickup", "pick_up"] : ["dropoff", "drop_off"];
    const candidates = routeStops.filter((x: any) => Number(x.job_id) === jobId && wanted.includes(x.stop_type));
    const legOf = (x: any) => String(x.leg ?? x.extra?.leg ?? "").toUpperCase();
    const stopOf = candidates.find((x: any) => legOf(x) === (isReturn ? "RETURN" : "GO")) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (target === null || !stopOf?.arrival_time) return null;
    const at = dayjs(stopOf.arrival_time).startOf("minute");
    let goal = at.startOf("day").add(target, "minute");
    if (goal.diff(at, "minute") > 720) goal = goal.subtract(1, "day");
    if (at.diff(goal, "minute") > 720) goal = goal.add(1, "day");
    const shift = goal.format("h:mm A");
    if (isReturn) {
      const after = at.diff(goal, "minute");
      return after >= 0
        ? { tone: "ok" as const, short: after === 0 ? "at shift end" : `${after} min after shift`, shift, label: `shift ends ${shift}` }
        : { tone: "bad" as const, short: `${-after} min before shift ends`, shift, label: `shift ends ${shift}` };
    }
    const early = goal.diff(at, "minute");
    const need = Number(value("reach_before_minutes")) || 0;
    if (early < 0) return { tone: "bad" as const, short: `${-early} min late`, shift, label: `shift ${shift}` };
    if (early < need) return { tone: "warn" as const, short: `${early} min early, needs ${need}`, shift, label: `shift ${shift}` };
    return { tone: "ok" as const, short: `${early} min early`, shift, label: `shift ${shift}` };
  };

  const getCandidateName = (rawStop: any): string | null => {
    const jobId = rawStop?.job_id;
    const fullJob: any = jobId ? jobsByIdMap.get(Number(jobId)) : null;
    const name =
      fullJob?.worker_shuttle_detail?.candidate_name ||
      fullJob?.candidate_name ||
      fullJob?.custom_fields?.candidate_name ||
      (fullJob?.first_name || fullJob?.last_name
        ? `${fullJob.first_name || ""} ${fullJob.last_name || ""}`.trim()
        : null) ||
      rawStop?.candidate_name ||
      rawStop?.job?.candidate_name;
    return name ? String(name) : null;
  };

  /** Build a lookup map from vehicle_id → Vehicle for fast access. */
  const vehiclesMap = useMemo(() => {
    const map = new Map<number, Vehicle>();
    vehicles.forEach(v => map.set(v.id, v));
    return map;
  }, [vehicles]);

  const { intervalMinutes, changeInterval, skipSelectionScrollRef } = useTimelineZoom(
    containerRef, DRIVER_COLUMN_WIDTH, Boolean(shiftDrag || draggedStopInfo || draggedTrip || draggedDriver),
  );

  // Dynamic pixels per minute based on interval - smaller intervals get more spread
  const pixelsPerMinute = getPixelsPerMinute(intervalMinutes);

  const totalDurationMinutes = endTime.diff(startTime, "minute");
  const timelineWidth = totalDurationMinutes * pixelsPerMinute;
  const timeMarkers = useMemo(
    () =>
      generateTimeMarkers(startTime, endTime, intervalMinutes, pixelsPerMinute),
    [startTime, endTime, intervalMinutes, pixelsPerMinute],
  );

  // Calendar days the visible range touches (overnight and multi-day plans).
  const timelineDays = useMemo(() => {
    const days: dayjs.Dayjs[] = [];
    let day = startTime.startOf("day");
    while (day.isBefore(endTime)) { days.push(day); day = day.add(1, "day"); }
    return days;
  }, [startTime, endTime]);
  const [viewDayKey, setViewDayKey] = useState(() => startTime.format("YYYY-MM-DD"));
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      // The day under the first quarter of the visible track is "the day you are looking at".
      const visible = container.clientWidth - DRIVER_COLUMN_WIDTH;
      const minutes = (container.scrollLeft + Math.max(0, visible) * 0.25) / pixelsPerMinute;
      const key = startTime.add(minutes, "minute").format("YYYY-MM-DD");
      setViewDayKey(prev => prev === key ? prev : key);
    };
    update();
    container.addEventListener("scroll", update, { passive: true });
    return () => container.removeEventListener("scroll", update);
  }, [startTime, pixelsPerMinute, DRIVER_COLUMN_WIDTH]);
  const scrollToTime = useCallback((time: dayjs.Dayjs) => {
    const container = containerRef.current;
    if (!container) return;
    const minutes = Math.max(0, time.diff(startTime, "minute", true));
    container.scrollTo({ left: Math.max(0, minutes * pixelsPerMinute - 24), behavior: "smooth" });
  }, [startTime, pixelsPerMinute]);
  const [nowTick, setNowTick] = useState(() => dayjs());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(dayjs()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const nowPosition = nowTick.isAfter(startTime) && nowTick.isBefore(endTime)
    ? nowTick.diff(startTime, "minute", true) * pixelsPerMinute : null;
  const firstStopTime = useMemo(() => {
    let first: dayjs.Dayjs | null = null;
    routes.forEach(route => (route.stops || []).forEach((stop: any) => {
      if (!stop.job_id || !stop.arrival_time) return;
      const time = dayjs(stop.arrival_time);
      if (time.isValid() && (!first || time.isBefore(first))) first = time;
    }));
    return first as dayjs.Dayjs | null;
  }, [routes]);
  const openedAtFirstStopRef = useRef<string | number | null | undefined>(undefined);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !firstStopTime || selectedMarkerId) return;
    if (openedAtFirstStopRef.current === (planId ?? null)) return;
    openedAtFirstStopRef.current = planId ?? null;
    const minutes = Math.max(0, firstStopTime.diff(startTime, "minute", true) - 30);
    container.scrollLeft = minutes * pixelsPerMinute;
  }, [firstStopTime, planId, selectedMarkerId, startTime, pixelsPerMinute]);
  // Search sits as an icon until it is used; an active search stays open so the filter is never hidden.
  const [searchOpen, setSearchOpen] = useState(false);
  const intervalIndex = TIMELINE_INTERVALS.indexOf(intervalMinutes as (typeof TIMELINE_INTERVALS)[number]);

  useEffect(() => {
    setShiftOverrides({});
    setShiftDrag(null);
    shiftDragValueRef.current = null;
  }, [scheduledDate, scheduleDayKey, showDriverWorkingTime]);

  const persistDriverShift = useCallback(
    async (
      teamId: number,
      driverName: string,
      dayKey: string,
      nextShift: DriverShift,
      previousShift: DriverShift,
    ) => {
      const overrideKey = getShiftOverrideKey(teamId, dayKey);
      if (!onDriverWorkingHoursChange) {
        setShiftOverrides((current) => ({
          ...current,
          [overrideKey]: previousShift,
        }));
        message.warning("Working hours cannot be updated from this view.");
        return;
      }

      setSavingShiftTeamId(teamId);
      try {
        await onDriverWorkingHoursChange(
          teamId,
          dayKey,
          formatMinutesAsTime(nextShift.startMinutes),
          formatMinutesAsTime(nextShift.endMinutes),
        );
        message.success({
          content: driverName + " working hours on " + dayKey + " updated",
          key: `driver-shift-${teamId}`,
        });
      } catch (error: unknown) {
        setShiftOverrides((current) => ({
          ...current,
          [overrideKey]: previousShift,
        }));
        message.error({
          content:
            error instanceof Error
              ? error.message
              : "Unable to update the driver's working hours",
          key: `driver-shift-${teamId}`,
        });
      } finally {
        setSavingShiftTeamId((current) => (current === teamId ? null : current));
      }
    },
    [onDriverWorkingHoursChange],
  );

  const confirmDriverShiftChange = useCallback(
    (
      teamId: number,
      driverName: string,
      dayKey: string,
      nextShift: DriverShift,
      previousShift: DriverShift,
    ) => {
      const overrideKey = getShiftOverrideKey(teamId, dayKey);
      setConfirmingShiftTeamId(teamId);
      Modal.confirm({
        title: "Change " + dayKey.charAt(0).toUpperCase() + dayKey.slice(1) + " working hours?",
        content:
          driverName + "'s working hours in Team settings change from " +
          formatShiftRange(previousShift) + " to " + formatShiftRange(nextShift) +
          ". This applies to every " + dayKey.charAt(0).toUpperCase() + dayKey.slice(1) +
          ", not only this plan.",
        okText: "Change working hours",
        cancelText: "Keep current hours",
        maskClosable: true,
        okButtonProps: { style: { backgroundColor: "#003220" } },
        onOk: async () => {
          try {
            await persistDriverShift(teamId, driverName, dayKey, nextShift, previousShift);
          } finally {
            setConfirmingShiftTeamId((current) =>
              current === teamId ? null : current,
            );
          }
        },
        onCancel: () => {
          setShiftOverrides((current) => ({
            ...current,
            [overrideKey]: previousShift,
          }));
          setConfirmingShiftTeamId((current) =>
            current === teamId ? null : current,
          );
        },
      });
    },
    [persistDriverShift],
  );

  const beginShiftResize = (
    event: React.PointerEvent<HTMLButtonElement>,
    teamId: number,
    driverName: string,
    dayKey: string,
    dayStart: dayjs.Dayjs,
    edge: "start" | "end",
    shift: DriverShift,
  ) => {
    if (!showDriverWorkingTime || savingShiftTeamId === teamId || confirmingShiftTeamId === teamId) return;
    event.preventDefault();
    event.stopPropagation();
    const dragState: ShiftDragState = {
      teamId,
      driverName,
      edge,
      initialClientX: event.clientX,
      dayKey,
      dayStart,
      ...shift,
    };
    shiftDragValueRef.current = shift;
    setShiftDrag(dragState);
  };

  const adjustShiftWithKeyboard = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    teamId: number,
    driverName: string,
    dayKey: string,
    edge: "start" | "end",
    shift: DriverShift,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!showDriverWorkingTime || savingShiftTeamId === teamId || confirmingShiftTeamId === teamId) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const delta = direction * SHIFT_SNAP_MINUTES;
    const nextShift =
      edge === "start"
        ? {
            ...shift,
            startMinutes: Math.max(
              0,
              Math.min(
                1439,
                shift.endMinutes - MIN_SHIFT_MINUTES,
                shift.startMinutes + delta,
              ),
            ),
          }
        : {
            ...shift,
            endMinutes: Math.min(
              shift.startMinutes + MAX_SHIFT_MINUTES,
              Math.max(shift.startMinutes + MIN_SHIFT_MINUTES, shift.endMinutes + delta),
            ),
          };
    if (
      nextShift.startMinutes === shift.startMinutes &&
      nextShift.endMinutes === shift.endMinutes
    ) {
      return;
    }
    setShiftOverrides((current) => ({
      ...current,
      [getShiftOverrideKey(teamId, dayKey)]: nextShift,
    }));
    confirmDriverShiftChange(teamId, driverName, dayKey, nextShift, shift);
  };

  useEffect(() => {
    if (!showDriverWorkingTime || !shiftDrag) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      event.preventDefault();
      const deltaMinutes =
        Math.round(
          (event.clientX - shiftDrag.initialClientX) /
            pixelsPerMinute /
            SHIFT_SNAP_MINUTES,
        ) * SHIFT_SNAP_MINUTES;

      const nextShift =
        shiftDrag.edge === "start"
          ? {
              startMinutes: Math.max(
                0,
                Math.min(
                  1439,
                  shiftDrag.endMinutes - MIN_SHIFT_MINUTES,
                  shiftDrag.startMinutes + deltaMinutes,
                ),
              ),
              endMinutes: shiftDrag.endMinutes,
            }
          : {
              startMinutes: shiftDrag.startMinutes,
              endMinutes: Math.min(
                shiftDrag.startMinutes + MAX_SHIFT_MINUTES,
                Math.max(
                  shiftDrag.startMinutes + MIN_SHIFT_MINUTES,
                  shiftDrag.endMinutes + deltaMinutes,
                ),
              ),
            };

      shiftDragValueRef.current = nextShift;
      setShiftOverrides((current) => ({
        ...current,
        [getShiftOverrideKey(shiftDrag.teamId, shiftDrag.dayKey)]: nextShift,
      }));
    };

    const handlePointerUp = () => {
      const nextShift = shiftDragValueRef.current || {
        startMinutes: shiftDrag.startMinutes,
        endMinutes: shiftDrag.endMinutes,
      };
      const previousShift = {
        startMinutes: shiftDrag.startMinutes,
        endMinutes: shiftDrag.endMinutes,
      };
      setShiftDrag(null);
      shiftDragValueRef.current = null;
      if (
        nextShift.startMinutes !== previousShift.startMinutes ||
        nextShift.endMinutes !== previousShift.endMinutes
      ) {
        confirmDriverShiftChange(
          shiftDrag.teamId,
          shiftDrag.driverName,
          shiftDrag.dayKey,
          nextShift,
          previousShift,
        );
      }
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [shiftDrag, pixelsPerMinute, confirmDriverShiftChange, showDriverWorkingTime]);

  /** Precompute grouped stops, occupancy maps, and non-depot groupings per route once,
   * avoiding re-computation during 60Hz drag operations. */
  const routeDataMap = useMemo(() => {
    const map = new Map<
      number,
      {
        groupedStops: GroupedStop[];
        occupancyMap: Map<number, number>;
        routeColor: string;
        nonDepotGroups: GroupedStop[];
        startPosition: number | null;
        endPosition: number | null;
        simultaneous: ReturnType<typeof getSimultaneousStopLayout>;
      }
    >();

    routes.forEach((route, routeIndex) => {
      const grouped = getRouteStopDisplay(route).groups;
      const occMap = new Map<number, number>();
      let runningLoad = 0;
      (route.stops || []).forEach((s: any, idx: number) => {
        const isPickup = s.stop_type === "pickup";
        const isDropoff =
          s.stop_type === "dropoff" || s.stop_type === "drop_off";
        if (isPickup) {
          runningLoad += s.passenger_count || 1;
        } else if (isDropoff) {
          runningLoad = Math.max(
            0,
            runningLoad - (s.passenger_count || 1),
          );
        }
        occMap.set(idx, runningLoad);
      });

      const nonDepot = grouped.filter((g) => {
        const st = g.representative?.stop_type;
        return st !== "depot" && st !== "depot_start" && st !== "depot_end";
      });

      const positions = (route.stops || []).flatMap((stop: { arrival_time?: string }) =>
        stop.arrival_time && dayjs(stop.arrival_time).isValid()
          ? [getPosition(stop.arrival_time, startTime, pixelsPerMinute)] : [],
      );

      map.set(routeIndex, {
        groupedStops: grouped,
        occupancyMap: occMap,
        routeColor: getRouteColor(routeIndex),
        nonDepotGroups: nonDepot,
        startPosition: positions.length ? Math.min(...positions) : null,
        endPosition: positions.length ? Math.max(...positions) : null,
        simultaneous: getSimultaneousStopLayout(grouped),
      });
    });

    return map;
  }, [routes, startTime, pixelsPerMinute]);

  const getDriverDropRouteIndex = (e: React.DragEvent, driverRoutes: DriverGroup["routes"]) => {
    if (
      draggedStopInfo &&
      driverRoutes.some(({ originalIndex }) => originalIndex === draggedStopInfo.routeIndex)
    ) {
      return draggedStopInfo.routeIndex;
    }
    const mouseX = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let closestIndex = driverRoutes[0].originalIndex;
    let closestDistance = Infinity;
    for (const { originalIndex } of driverRoutes) {
      const data = routeDataMap.get(originalIndex);
      if (data?.startPosition == null || data.endPosition == null) continue;
      const distance = Math.max(data.startPosition - mouseX, mouseX - data.endPosition, 0);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = originalIndex;
      }
    }
    return closestIndex;
  };

  const handleTripDragStart = (event: React.DragEvent, routeIndex: number, startIndex: number) => {
    event.stopPropagation();
    const selected = selectTripToMove(routes[routeIndex], routeIndex, startIndex);
    if (!onMoveTrip || !selected) {
      event.preventDefault();
      message.warning("Choose a complete optimized trip. Trips with pending changes or team-leader work must be optimized first.");
      return;
    }
    setOpenStopTooltipKey(null);
    setDraggedStopInfo(null);
    setDragOverStopInfo(null);
    dragOverSlotRef.current = null;
    setDraggedTrip(selected);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-syncnox-trip", JSON.stringify(selected));
  };

  const handleTimelineTrackDragOver = (
    e: React.DragEvent,
    routeIndex: number
  ) => {
    if (draggedTrip || e.dataTransfer.types.includes("application/x-syncnox-trip")) {
      e.preventDefault();
      e.stopPropagation();
      const allowed = Boolean(onMoveTrip && draggedTrip && routes[routeIndex]?.team_member_id !== draggedTrip.sourceDriverId);
      e.dataTransfer.dropEffect = allowed ? "move" : "none";
      setTripDropRouteIndex(allowed ? routeIndex : null);
      return;
    }
    if (
      e.dataTransfer.types.includes("application/x-syncnox-booking") &&
      routes[routeIndex]?.team_member_id !== draggedStopInfo?.moveSelection?.sourceDriverId
    ) {
      e.preventDefault();
      e.stopPropagation();
      const allowed = Boolean(onMoveStops && draggedStopInfo?.moveSelection);
      e.dataTransfer.dropEffect = allowed ? "move" : "none";
      setTripDropRouteIndex(allowed ? routeIndex : null);
      if (dragOverSlotRef.current) {
        dragOverSlotRef.current = null;
        setDragOverStopInfo(null);
      }
      return;
    }
    setTripDropRouteIndex(null);
    if (!draggedStopInfo && !e.dataTransfer.types.includes("application/json")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const routeData = routeDataMap.get(routeIndex);
    if (!routeData) return;

    const trackRect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - trackRect.left;

    const nonDepotGroups = routeData.nonDepotGroups;
    if (nonDepotGroups.length === 0) {
      dragOverSlotRef.current = {
        routeIndex,
        targetFirstRawIndex: 0,
        side: "after",
        indicatorX: Math.max(20, mouseX),
      };
      setDragOverStopInfo({
        routeIndex,
        targetFirstRawIndex: 0,
        targetRawIndices: [0],
        side: "after",
        indicatorX: Math.max(20, mouseX),
        targetStopIndex: 1,
        targetName: routes[routeIndex]?.team_member_name || "Driver",
      });
      return;
    }

    let closestGroup = nonDepotGroups[0];
    let minDistance = Infinity;
    let targetSide: "before" | "after" = "before";
    let indicatorX = 0;
    let targetStopIndex = 1;

    let runningStopCounter = 1;
    for (let i = 0; i < nonDepotGroups.length; i++) {
      const g = nonDepotGroups[i];
      const gPos = getPosition(
        g.representative.arrival_time || startTime.toISOString(),
        startTime,
        pixelsPerMinute
      );
      const gWidth = Math.max(
        g.representative?.service_duration_minutes
          ? g.representative.service_duration_minutes * pixelsPerMinute
          : 32,
        28
      );
      const midX = gPos + gWidth / 2;
      const dist = Math.abs(mouseX - midX);

      if (dist < minDistance) {
        minDistance = dist;
        closestGroup = g;
        targetSide = mouseX < midX ? "before" : "after";
        indicatorX = targetSide === "before" ? gPos - 3 : gPos + gWidth + 3;
        targetStopIndex = runningStopCounter;
      }
      runningStopCounter++;
    }

    if (
      draggedStopInfo &&
      draggedStopInfo.routeIndex === routeIndex &&
      draggedStopInfo.rawIndices.includes(closestGroup.firstRawIndex)
    ) {
      if (dragOverSlotRef.current) {
        dragOverSlotRef.current = null;
        setDragOverStopInfo(null);
      }
      return;
    }

    const prev = dragOverSlotRef.current;
    if (
      prev &&
      prev.routeIndex === routeIndex &&
      prev.targetFirstRawIndex === closestGroup.firstRawIndex &&
      prev.side === targetSide &&
      Math.abs(prev.indicatorX - indicatorX) < 2
    ) {
      // Slot hasn't changed at all! Skip re-rendering!
      return;
    }

    dragOverSlotRef.current = {
      routeIndex,
      targetFirstRawIndex: closestGroup.firstRawIndex,
      side: targetSide,
      indicatorX,
    };

    const targetRawIndices = closestGroup.rawStops.map(
      (_, i) => closestGroup.firstRawIndex + i
    );

    const targetName =
      getCandidateName(closestGroup.representative) ||
      closestGroup.representative?.address_formatted ||
      `Stop ${targetStopIndex}`;

    setDragOverStopInfo({
      routeIndex,
      targetFirstRawIndex: closestGroup.firstRawIndex,
      targetRawIndices,
      side: targetSide,
      indicatorX,
      targetStopIndex,
      targetName,
    });
  };

  const handleTimelineDrop = async (
    e: React.DragEvent,
    routeIndex: number
  ) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.types.includes("application/x-syncnox-trip")) {
      try {
        const selection: TripMoveSelection = JSON.parse(e.dataTransfer.getData("application/x-syncnox-trip"));
        if (onMoveTrip && selection.sourceDriverId !== routes[routeIndex]?.team_member_id) onMoveTrip(selection, routeIndex);
      } catch {
        message.error("Could not read the selected trip. Please drag it again.");
      } finally {
        setDraggedTrip(null);
        setTripDropRouteIndex(null);
      }
      return;
    }

    if (e.dataTransfer.types.includes("application/x-syncnox-booking")) {
      try {
        const selection: StopMoveSelection = JSON.parse(e.dataTransfer.getData("application/x-syncnox-booking"));
        if (selection.sourceDriverId !== routes[routeIndex]?.team_member_id) {
          if (onMoveStops) onMoveStops(selection, routeIndex);
          setDraggedStopInfo(null);
          setTripDropRouteIndex(null);
          setDragOverStopInfo(null);
          dragOverSlotRef.current = null;
          setSelectedStopJobIds(new Set());
          setSelectionSourceRouteIndex(null);
          return;
        }
      } catch {
        message.error("Could not read the selected booking. Drag it again.");
        setDraggedStopInfo(null);
        setTripDropRouteIndex(null);
        setDragOverStopInfo(null);
        dragOverSlotRef.current = null;
        setSelectedStopJobIds(new Set());
        setSelectionSourceRouteIndex(null);
        return;
      }
    }

    try {
      const dataStr = e.dataTransfer.getData("application/json");
      if (dataStr) {
        const data = JSON.parse(dataStr);
        if (data.type === "unassigned_job" && data.jobId) {
          if (onAddUnassignedJob) {
             const targetFirstIndex = dragOverSlotRef.current?.targetFirstRawIndex ?? 0;
             await onAddUnassignedJob(routeIndex, data.jobId, targetFirstIndex);
          }
          dragOverSlotRef.current = null;
          setDragOverStopInfo(null);
          return;
        }
      }
    } catch (err) {
      // Ignore JSON parse error
    }

    const currentSlot = dragOverSlotRef.current;
    if (!draggedStopInfo || !currentSlot) {
      dragOverSlotRef.current = null;
      setDraggedStopInfo(null);
      setDragOverStopInfo(null);
      return;
    }

    // ── Cross-Driver Drop (Transfer Stop to Another Driver) ───────────────
    if (draggedStopInfo.routeIndex !== routeIndex) {
      const jobsToTransfer =
        selectedStopJobIds.has(draggedStopInfo.jobId!) &&
        selectionSourceRouteIndex === draggedStopInfo.routeIndex
          ? Array.from(selectedStopJobIds)
          : draggedStopInfo.jobId ? [draggedStopInfo.jobId] : [];

      if (jobsToTransfer.length > 0 && onTransferStops) {
        await onTransferStops(draggedStopInfo.routeIndex, routeIndex, jobsToTransfer);
      }
      setSelectedStopJobIds(new Set());
      setSelectionSourceRouteIndex(null);
      dragOverSlotRef.current = null;
      setDraggedStopInfo(null);
      setDragOverStopInfo(null);
      return;
    }

    const targetRoute = routes[routeIndex];
    if (!targetRoute || !targetRoute.stops) {
      dragOverSlotRef.current = null;
      setDraggedStopInfo(null);
      setDragOverStopInfo(null);
      return;
    }

    // Collect non-depot items with their original index in targetRoute.stops
    const nonDepotItems: { originalIndex: number; stop: any }[] = [];
    targetRoute.stops.forEach((s: any, idx: number) => {
      const isDepot =
        s.stop_type === "depot" ||
        s.stop_type === "depot_start" ||
        s.stop_type === "depot_end";
      if (!isDepot && s.job_id) {
        nonDepotItems.push({ originalIndex: idx, stop: s });
      }
    });

    const draggedIndices = draggedStopInfo.rawIndices;
    const targetFirstIndex = currentSlot.targetFirstRawIndex;
    const side = currentSlot.side;

    const sourceItems = nonDepotItems.filter((item) =>
      draggedIndices.includes(item.originalIndex)
    );
    if (sourceItems.length === 0) {
      dragOverSlotRef.current = null;
      setDraggedStopInfo(null);
      setDragOverStopInfo(null);
      return;
    }

    const remainingItems = nonDepotItems.filter(
      (item) => !draggedIndices.includes(item.originalIndex)
    );
    const targetIdx = remainingItems.findIndex((item) =>
      item.originalIndex === targetFirstIndex
    );

    if (targetIdx === -1) {
      dragOverSlotRef.current = null;
      setDraggedStopInfo(null);
      setDragOverStopInfo(null);
      return;
    }

    // Determine target group's raw indices
    const targetGroup = routeDataMap.get(routeIndex)?.groupedStops.find(
      (g) => g.firstRawIndex === targetFirstIndex
    );
    const targetIndices = targetGroup
      ? targetGroup.rawStops.map((_, i) => targetGroup.firstRawIndex + i)
      : [targetFirstIndex];

    let insertIdx = targetIdx;
    if (side === "after") {
      let lastTargetIdx = targetIdx;
      for (let i = targetIdx; i < remainingItems.length; i++) {
        if (targetIndices.includes(remainingItems[i].originalIndex)) {
          lastTargetIdx = i;
        }
      }
      insertIdx = lastTargetIdx + 1;
    }

    remainingItems.splice(insertIdx, 0, ...sourceItems);

    // Validate: no candidate's drop-off stop may be positioned before their pickup stop
    const stopPositions = new Map<number, { pickup?: number; dropoff?: number; name?: string }>();
    for (let i = 0; i < remainingItems.length; i++) {
      const s = remainingItems[i].stop;
      const jid = Number(s.job_id);
      if (!jid) continue;
      if (!stopPositions.has(jid)) {
        stopPositions.set(jid, { name: s.candidate_name });
      }
      const entry = stopPositions.get(jid)!;
      if (s.stop_type === "pickup") {
        entry.pickup = i;
      } else if (s.stop_type === "dropoff" || s.stop_type === "drop_off") {
        entry.dropoff = i;
      }
    }

    for (const [jid, entry] of stopPositions.entries()) {
      if (entry.pickup !== undefined && entry.dropoff !== undefined) {
        if (entry.pickup > entry.dropoff) {
          message.warning({
            content: `Cannot drop off ${entry.name || `Job #${jid}`} before their pickup stop.`,
            key: "reorder_warn",
          });
          dragOverSlotRef.current = null;
          setDraggedStopInfo(null);
          setDragOverStopInfo(null);
          return;
        }
      }
    }

    const orderedStopIndices = remainingItems.map((item) => item.originalIndex);
    const orderedStops = remainingItems.map((item) => ({
      job_id: Number(item.stop.job_id),
      stop_type: item.stop.stop_type,
    }));
    const orderedJobIds = remainingItems.map((item) => Number(item.stop.job_id));

    dragOverSlotRef.current = null;
    setDraggedStopInfo(null);
    setDragOverStopInfo(null);

    if (isReordering) return;
    setIsReordering(true);
    try {
      if (onReorderStops) {
        await onReorderStops(routeIndex, orderedJobIds, orderedStopIndices, orderedStops);
      }
    } finally {
      setIsReordering(false);
    }
  };

  const handleTimelineStopDragEnd = () => {
    setDraggedTrip(null);
    setTripDropRouteIndex(null);
    dragOverSlotRef.current = null;
    setDraggedStopInfo(null);
    setDragOverStopInfo(null);
  };

  // Auto-scroll timeline to selected marker / stop position whenever selectedMarkerId changes
  useEffect(() => {
    if (skipSelectionScrollRef.current) {
      skipSelectionScrollRef.current = false;
      return;
    }
    if (!selectedMarkerId || !containerRef.current) return;

    const [rIdxStr, sIdxStr] = String(selectedMarkerId).split("-");
    const rIdx = Number(rIdxStr);
    const sIdx = Number(sIdxStr);

    if (isNaN(rIdx) || isNaN(sIdx) || !routes[rIdx]) return;

    const targetRoute = routes[rIdx];
    const targetStop = targetRoute.stops?.[sIdx];
    if (!targetStop?.arrival_time) return;

    const container = containerRef.current;

    // Calculate horizontal X position of the stop
    const stopX = getPosition(targetStop.arrival_time, startTime, pixelsPerMinute);
    const visibleTimelineWidth = container.clientWidth - DRIVER_COLUMN_WIDTH;

    // Only scroll horizontally if the stop is outside the visible timeline view window
    const currentLeft = container.scrollLeft;
    const currentRight = currentLeft + visibleTimelineWidth;

    let targetScrollLeft = currentLeft;
    if (stopX < currentLeft + 40 || stopX > currentRight - 40) {
      targetScrollLeft = Math.max(0, stopX - visibleTimelineWidth / 2);
    }

    // Calculate vertical Y scroll offset to bring driver row into view if needed
    let targetScrollTop = container.scrollTop;
    const rowEl =
      container.querySelector<HTMLElement>(`[data-route-index="${rIdx}"]`) ||
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-route-indices]"),
      ).find((el) =>
        (el.getAttribute("data-route-indices") || "")
          .split(",")
          .includes(String(rIdx)),
      );

    if (rowEl) {
      const rowTop = rowEl.offsetTop;
      const rowHeight = rowEl.offsetHeight;
      const containerHeight = container.clientHeight;
      const currentTop = container.scrollTop;
      const currentBottom = currentTop + containerHeight;

      // Only scroll vertically if the driver row is outside the visible container height
      if (rowTop < currentTop || rowTop + rowHeight > currentBottom) {
        targetScrollTop = Math.max(
          0,
          rowTop - containerHeight / 2 + rowHeight / 2,
        );
      }
    }

    if (
      targetScrollLeft !== container.scrollLeft ||
      targetScrollTop !== container.scrollTop
    ) {
      container.scrollTo({
        left: targetScrollLeft,
        top: targetScrollTop,
        behavior: "smooth",
      });
    }
  }, [selectedMarkerId, routes, startTime, pixelsPerMinute, skipSelectionScrollRef, DRIVER_COLUMN_WIDTH]);

  const getRouteMenuItems = (routeIndex: number): MenuProps["items"] => [
    ...(onShareDriver ? [{ key: "share-driver", icon: sharingDriverId === routes[routeIndex]?.team_member_id ? <LoadingOutlined /> : <ShareAltOutlined />,
      label: sharingDriverId === routes[routeIndex]?.team_member_id ? "Sharing…" : "Share",
      disabled: sharingDisabled || !routes[routeIndex]?.team_member_id,
      onClick: () => onShareDriver(routeIndex) }] : []),
    ...(onMessageDriver ? [{ key: "message-driver", icon: <MessageOutlined />, label: "Send WhatsApp…",
      disabled: !routes[routeIndex]?.team_member_id, onClick: () => onMessageDriver(routeIndex) }] : []),
    ...((onShareDriver || onMessageDriver) ? [{ type: "divider" as const, key: "group-share" }] : []),
    ...(onMergeRoutes ? [{ key: "merge-waiting", icon: <ClockCircleOutlined />, label: "Merge routes with waiting…", onClick: () => onMergeRoutes(routeIndex) }] : []),
    ...(onEditWaiting ? routes.flatMap((route, index) => route.team_member_id !== routes[routeIndex]?.team_member_id ? []
      : (route.stops || []).flatMap((stop: any, stopIndex: number) => stop.stop_type === "depot_end" && route.stops[stopIndex + 1]?.stop_type === "depot_start" ? [{
        key: `merge-trips-${index}-${stopIndex}`, icon: <ClockCircleOutlined />,
        label: `Merge trips at ${dayjs(route.stops[stopIndex + 1].arrival_time).format("h:mm A")}…`,
        onClick: () => onEditWaiting(index, stopIndex),
      }] : [])) : []),
    ...((onMergeRoutes || onEditWaiting) && isWorkerShuttle && (onSwapVehicles || onChangeVehicle) ? [{ type: "divider" as const, key: "group-vehicle" }] : []),
    ...(isWorkerShuttle && onSwapVehicles ? [{
      key: "swap-vehicles",
      icon: <SwapOutlined />,
      label: "Swap vehicles…",
      onClick: () => onSwapVehicles(routeIndex),
    }] : []),
    ...(isWorkerShuttle && onChangeVehicle ? [{
      key: "change-vehicle",
      icon: <CarOutlined />,
      label: "Change vehicle…",
      onClick: () => onChangeVehicle(routeIndex),
    }] : []),
    ...((onMergeRoutes || onEditWaiting || (isWorkerShuttle && (onSwapVehicles || onChangeVehicle))) ? [{ type: "divider" as const, key: "group-stops" }] : []),
    {
      key: "add-stop",
      icon: <PlusOutlined />,
      label: "Add job…",
      onClick: () => onAddStop?.(routeIndex),
    },
    {
      key: "transfer-stops",
      icon: <SwapOutlined />,
      label: "Move stops to another driver…",
      onClick: () => {
        setSelectionSourceRouteIndex(routeIndex);
        setTransferModalRouteIndex(routeIndex);
      },
    },
    {
      key: "reorder-stops",
      icon: <MenuOutlined />,
      label: "Reorder stops…",
      onClick: () => setReorderModalRouteIndex(routeIndex),
    },
    // {
    //   key: "swap-driver",
    //   icon: <SwapOutlined />,
    //   label: "Swap Route with Driver",
    //   onClick: () => onSwapDriver?.(routeIndex),
    // },
    // {
    //   key: "reverse-route",
    //   icon: <RetweetOutlined />,
    //   label: "Reverse Route Order",
    //   onClick: () => onReverseRoute?.(routeIndex),
    // },
    { type: "divider" as const },
    {
      key: "re-optimize",
      icon: <ThunderboltOutlined />,
      label: "Reoptimize route",
      onClick: () => onReOptimize?.(routeIndex),
    },
  ];

  return (
    <TimelineTooltipProvider leftInset={DRIVER_COLUMN_WIDTH} topInset={HEADER_HEIGHT + TIMELINE_TOOLBAR_HEIGHT}>
    <div 
      className="relative flex flex-col h-full bg-white select-none"
      onDragOver={(e) => {
        // Since tracks stop propagation, this only fires when dragging over non-track areas
        e.preventDefault();
        setDragOverStopInfo(null);
        setTripDropRouteIndex(null);
      }}
      onDragLeave={(e) => {
        const relatedTarget = e.relatedTarget as Node | null;
        if (relatedTarget === null || !e.currentTarget.contains(relatedTarget)) {
          setDragOverStopInfo(null);
          setTripDropRouteIndex(null);
        }
      }}
    >
      <span className="sr-only" aria-live="polite">{orderAnnouncement}</span>
      <div className="timeline-toolbar timeline-compact-controls lang @container flex items-center gap-2 px-4 border-b border-[#E3E8E5] bg-white shrink-0 min-w-0"
        style={{ height: TIMELINE_TOOLBAR_HEIGHT }}>
        {leadingControls}
        <div role="group" aria-label="Days on the timeline"
          className="hidden sm:flex items-stretch self-stretch min-w-0 overflow-x-auto ml-2 [scrollbar-width:none]">
          {timelineDays.length > 1 ? timelineDays.map(day => {
            const key = day.format("YYYY-MM-DD");
            const active = key === viewDayKey;
            const isPlanDay = day.isSame(scheduleDay, "day");
            return (
              <button key={key} type="button" aria-current={active ? "date" : undefined}
                onClick={() => scrollToTime(day.isBefore(startTime) ? startTime : day)}
                title={`Go to ${day.format("dddd, MMMM D")}${isPlanDay ? " (plan day)" : ""}`}
                className={`px-2 text-[12px] whitespace-nowrap bg-transparent cursor-pointer border-0 border-b-2 ${active
                  ? "border-[#003220] text-[#12211A] font-medium" : "border-transparent text-[#4A5750] hover:text-[#12211A]"}`}>
                <span className="@max-[720px]:hidden">{day.format("ddd")} </span>{day.format("D")}
                {isPlanDay && <span className="ml-1 text-[10px] uppercase tracking-wide text-[#626E67] @max-[640px]:hidden">plan</span>}
              </button>
            );
          }) : (
            <span className="self-center text-[12px] text-[#4A5750] whitespace-nowrap">{startTime.format("ddd, MMM D")}</span>
          )}
        </div>
        {nowPosition !== null && (
          <button type="button" onClick={() => scrollToTime(nowTick)} title="Go to the current time"
            className="hidden sm:inline-flex items-center gap-1.5 px-2 h-8 text-[12px] text-[#12211A] bg-transparent border-0 cursor-pointer hover:bg-[#F3F6F4]">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#C9372C]" />Now
          </button>
        )}
        <div className="flex items-center shrink-0 pl-2 border-l border-[#E3E8E5]" role="group" aria-label="Timeline zoom">
          <button type="button" aria-label="Zoom out" data-tip="Zoom out (Ctrl + wheel)" className="tip hidden sm:inline-flex h-8 w-8 items-center justify-center bg-transparent border-0 cursor-pointer text-[#4A5750] hover:bg-[#F3F6F4] disabled:opacity-40 disabled:cursor-default"
            disabled={intervalIndex < 0 || intervalIndex >= TIMELINE_INTERVALS.length - 1}
            onClick={() => changeInterval(TIMELINE_INTERVALS[Math.min(TIMELINE_INTERVALS.length - 1, intervalIndex + 1)])}>
            <Minus size={14} />
          </button>
          <Select aria-label="Timeline zoom interval" title="Grid step. Zoom with Ctrl + mouse wheel" value={intervalMinutes}
            onChange={value => changeInterval(value)} options={INTERVAL_OPTIONS} style={{ width: 82 }} className="shrink-0" />
          <button type="button" aria-label="Zoom in" data-tip="Zoom in (Ctrl + wheel)" className="tip hidden sm:inline-flex h-8 w-8 items-center justify-center bg-transparent border-0 cursor-pointer text-[#4A5750] hover:bg-[#F3F6F4] disabled:opacity-40 disabled:cursor-default"
            disabled={intervalIndex <= 0}
            onClick={() => changeInterval(TIMELINE_INTERVALS[Math.max(0, intervalIndex - 1)])}>
            <Plus size={14} />
          </button>
        </div>
        {!compactTimeline && (
          <Dropdown trigger={["click"]} placement="bottomRight" popupRender={() => (
            <div className="lang bg-white border border-[#D5DCD8] p-3 w-[264px] text-[12px] text-[#12211A] space-y-2.5 shadow-[0_8px_24px_rgba(18,33,26,0.12)]">
              {onLayoutChange && (
                <>
                  <div className="text-[11px] uppercase tracking-wide text-[#626E67]">Map position</div>
                  <div role="group" aria-label="Map position" className="flex gap-1">
                    {([
                      { value: "stacked", label: "Above", Icon: PanelTop },
                      { value: "side", label: "Beside", Icon: PanelRight },
                    ] as const).map(({ value, label, Icon }) => (
                      <button key={value} type="button" aria-pressed={layout === value}
                        onClick={() => layout !== value && onLayoutChange(value)}
                        className={`flex h-8 flex-1 items-center justify-center gap-1.5 border-0 text-[12px] cursor-pointer ${layout === value
                          ? "bg-[#E7F3ED] text-[#003220] font-medium" : "bg-[#F3F6F4] text-[#4A5750] hover:text-[#12211A]"}`}>
                        <Icon size={15} />{label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-[#E3E8E5]" />
                </>
              )}
              {onToggleWorkingTime && (
                <>
                  <button type="button" role="switch" aria-checked={Boolean(showDriverWorkingTime)}
                    onClick={() => onToggleWorkingTime(!showDriverWorkingTime)}
                    className="flex w-full items-center justify-between gap-3 border-0 bg-transparent p-0 text-left text-[12px] text-[#12211A] cursor-pointer">
                    <span>
                      <span className="block">Working time</span>
                      <span className="block text-[11px] text-[#626E67]">Grey band behind each row; drag its edges to change hours</span>
                    </span>
                    <span aria-hidden="true" className={`relative h-4 w-7 shrink-0 transition-colors ${showDriverWorkingTime ? "bg-[#003220]" : "bg-[#C4CCC7]"}`}>
                      <span className={`absolute top-0.5 h-3 w-3 bg-white transition-[left] ${showDriverWorkingTime ? "left-3.5" : "left-0.5"}`} />
                    </span>
                  </button>
                  <div className="border-t border-[#E3E8E5]" />
                </>
              )}
              <div className="text-[11px] uppercase tracking-wide text-[#626E67]">Stops</div>
              {[
                { label: "Pickup", node: <StopArrowSvg isPickup displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /> },
                { label: "Drop-off", node: <StopArrowSvg isPickup={false} displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /> },
                { label: "Pickup and drop-off at one visit", node: <StopArrowSvg isPickup isMixed displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /> },
                { label: "Several jobs at one stop (count on the corner)", node: <span className="relative inline-flex"><StopArrowSvg isPickup displayIndex="" jobCount={3} fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /><span className="absolute -top-3 -right-3 flex h-[18px] min-w-[18px] items-center justify-center bg-[#12211A] px-1 text-[11px] font-semibold text-white">3</span></span> },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="inline-flex w-8 justify-center scale-[0.7] origin-center">{item.node}</span>{item.label}
                </div>
              ))}
              <div className="text-[11px] uppercase tracking-wide text-[#626E67]">Progress</div>
              {[
                { label: "To do", node: <StopArrowSvg isPickup displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /> },
                { label: "Some passengers done", node: <StopArrowSvg isPickup displayIndex="" fill="#0B5D3B40" stroke="#0B5D3B" textColor="#0B5D3B" /> },
                { label: "Done", node: <StopArrowSvg isPickup displayIndex="" fill="#0B5D3B" stroke="#0B5D3B" textColor="#fff" /> },
                { label: "No-show or failed", node: <StopArrowSvg isPickup displayIndex="" fill="#fef2f2" stroke="#dc2626" textColor="#dc2626" /> },
                { label: "Skipped", node: <StopArrowSvg isPickup displayIndex="" fill="#f8fafc" stroke="#94a3b8" textColor="#64748b" /> },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="inline-flex w-8 justify-center scale-[0.7] origin-center">{item.node}</span>{item.label}
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="inline-flex w-8 justify-center"><span className="h-5 w-5 bg-[#0B5D3B] inline-flex items-center justify-center"><Home size={11} color="#fff" /></span></span>
                Trip starts
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex w-8 justify-center"><span className="h-5 w-5 bg-[#0B5D3B] inline-flex items-center justify-center"><Flag size={11} color="#fff" /></span></span>
                Trip ends
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex w-8 justify-center"><EditedMark size={14} /></span>
                Edited by hand (time or details)
              </div>
              <div className="pt-1 text-[11px] uppercase tracking-wide text-[#626E67]">Line between stops</div>
              {[
                { label: "Driving with load", style: { backgroundColor: "#0B5D3B", opacity: 0.6 } },
                { label: "Driving empty", style: { backgroundColor: "#fff", border: "1px solid #0B5D3B", opacity: 0.6, boxSizing: "border-box" as const } },
                { label: "Waiting", style: { backgroundColor: "#cbd5e1", backgroundImage: hatch } },
                { label: "Gap between trips", style: { backgroundColor: "#fff", border: "1px dotted #64748b", boxSizing: "border-box" as const } },
                ...(isWorkerShuttle ? [{ label: "Team leader working", style: { backgroundColor: "#64748b", opacity: 0.6 } }] : []),
              ].map(item => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="inline-flex w-8 justify-center"><span className="block h-[5px] w-7" style={item.style} /></span>{item.label}
                </div>
              ))}
              <div className="flex items-center gap-3">
                <span className="inline-flex w-8 justify-center text-[10px] text-[#626E67] tabular-nums">2/4</span>On board / capacity
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex w-8 justify-center"><span className="block h-5 w-px bg-[#C9372C]" /></span>Current time
              </div>
            </div>
          )}>
            <button type="button" className="h-8 px-2 text-[12px] text-[#4A5750] bg-transparent border-0 cursor-pointer hover:bg-[#F3F6F4] hover:text-[#12211A]">
              View
            </button>
          </Dropdown>
        )}
        {/* Controls stay left-aligned: the floating jobs panel can cover the right edge. */}
        <div className="flex-1" />
      </div>
      <div
        className="flex-1 min-h-0 overflow-auto relative custom-scrollbar"
        ref={containerRef}
      >
        <div className="min-w-full inline-block">
          {/* Header Row */}
          <div
            className="sticky top-0 z-40 bg-gray-50 border-b border-gray-200 flex"
            style={{ height: HEADER_HEIGHT, minWidth: "100%" }}
          >
            {/* Sticky Driver Column Header */}
            <div
              className="timeline-compact-controls sticky left-0 top-0 z-50 bg-gray-50 border-r border-gray-200 px-4 flex items-center justify-between font-medium text-gray-500 shadow-sm"
              style={{ width: DRIVER_COLUMN_WIDTH, minWidth: DRIVER_COLUMN_WIDTH }}
            >
              {searchOpen || driverSearch ? (
                <Input size="small" aria-label="Search driver" placeholder="Search team" value={driverSearch} autoFocus={searchOpen && !driverSearch}
                  onChange={event => setDriverSearch(event.target.value)} allowClear
                  onBlur={() => { if (!driverSearch) setSearchOpen(false); }}
                  onKeyDown={event => { if (event.key === "Escape") { setDriverSearch(""); setSearchOpen(false); } }}
                  prefix={<SearchOutlined className="text-[#626E67]" />}
                  suffix={compactTimeline ? undefined : (
                    <button type="button" aria-pressed={exactMatch} onMouseDown={event => event.preventDefault()} onClick={() => setExactMatch(!exactMatch)}
                      title={exactMatch ? "Exact match is on: whole words only" : "Exact match is off: matches part of a name"}
                      className={`px-1 text-[10px] font-medium leading-4 cursor-pointer border-none ${exactMatch ? "bg-[#003220] text-white" : "bg-transparent text-[#626E67] hover:text-[#12211A]"}`}>
                      Exact
                    </button>
                  )}
                  className="!w-full !min-w-0" />
              ) : (
                <div className="flex w-full items-center gap-1.5">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[#626E67]">Team</span>
                  <button type="button" aria-label="Search team" data-tip="Search team" onClick={() => setSearchOpen(true)}
                    className="tip inline-flex h-6 w-6 items-center justify-center border-0 bg-transparent text-[#626E67] cursor-pointer hover:bg-[#EAEFEC] hover:text-[#12211A]">
                    <SearchOutlined />
                  </button>
                  <span className="ml-auto text-[11px] text-[#626E67] tabular-nums">{allDriverGroups.length}</span>
                </div>
              )}
            </div>

            {/* Time Axis */}
            <div className="relative" style={{ width: timelineWidth }}>
              {nowPosition !== null && (
                <span className="absolute bottom-0 z-20 -translate-x-1/2 bg-[#C9372C] px-1 text-[10px] font-medium leading-4 text-white pointer-events-none"
                  style={{ left: nowPosition }}>
                  {nowTick.format("h:mm A")}
                </span>
              )}
              {timeMarkers.map((marker, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 select-none transition-colors border-l pl-1 text-xs flex items-center ${
                    marker.isNewDay
                      ? "border-l border-[#4A5750] text-[#12211A] z-10"
                      : i === 0 && marker.dateLabel
                        ? "border-emerald-300 font-bold text-[#003220] z-10"
                        : "border-gray-200 text-gray-400"
                  }`}
                  style={{ left: marker.position, height: "100%" }}
                >
                  {marker.isNewDay || (i === 0 && marker.dateLabel) ? (
                    <TimelineTooltip
                      popupScope="viewport"
                      trigger={["hover", "focus", "click"]}
                      color="#ffffff"
                      overlayInnerStyle={{
                        padding: "6px 12px",
                        borderRadius: "6px",
                        color: "#1e293b",
                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)",
                        border: "1px solid #cbd5e1",
                      }}
                      title={
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 select-none">
                          <Calendar size={14} className="text-[#003220] shrink-0" />
                          <span className="font-bold text-slate-900">{marker.time.format("dddd, MMMM D, YYYY")}</span>
                          <span className="text-slate-500 font-mono text-[11px]">({marker.label})</span>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        aria-label={`${marker.time.format("dddd, MMMM D, YYYY")} at ${marker.label}`}
                        className="inline-flex h-6 px-1 shrink-0 items-center justify-center text-[#003220] cursor-pointer bg-transparent border-0 hover:bg-[#F3F6F4] focus-visible:outline-2 focus-visible:outline-primary transition-colors"
                      >
                        <span className="text-[11px] font-medium text-[#12211A] whitespace-nowrap">{marker.time.format("ddd, MMM D")}</span>
                      </button>
                    </TimelineTooltip>
                  ) : (
                    <TimelineTooltip
                      popupScope="viewport"
                      color="#ffffff"
                      overlayInnerStyle={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        color: "#1e293b",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
                        border: "1px solid #e2e8f0",
                        fontSize: "11px",
                      }}
                      title={`${marker.time.format("dddd, MMMM D, YYYY")} at ${marker.label}`}
                    >
                      <span className="cursor-default whitespace-nowrap flex items-center gap-1">
                        {i === 0 && marker.dateLabel ? (
                          <span className="text-[11px] font-medium text-[#12211A] mr-1">{marker.time.format("ddd, MMM D")} ·</span>
                        ) : null}
                        <span className={marker.time.minute() === 0 ? "text-[#12211A] font-medium" : "text-[#626E67]"}>{formatAxisTime(marker.time)}</span>
                      </span>
                    </TimelineTooltip>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="relative">
            {/* Vertical Grid Lines (Background) */}
            <div
              className="absolute inset-0 z-0 pointer-events-none"
              style={{ marginLeft: DRIVER_COLUMN_WIDTH, width: timelineWidth }}
            >
              {timeMarkers.map((marker, i) =>
                marker.isNewDay ? (
                  <TimelineTooltip
                    key={i}
                    color="#ffffff"
                    overlayInnerStyle={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      color: "#1e293b",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)",
                      border: "1px solid #cbd5e1",
                    }}
                    title={
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 select-none">
                        <Calendar size={14} className="text-[#003220] shrink-0" />
                        <span className="font-bold text-slate-900">{marker.dateLabel || "New Day"}</span>
                        <span className="text-slate-500 font-mono text-[11px]">({marker.label})</span>
                      </div>
                    }
                    placement="right"
                  >
                    <div
                      className="absolute top-0 bottom-0 border-l border-[#4A5750] z-0 pointer-events-auto cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                      style={{ left: marker.position }}
                    />
                  </TimelineTooltip>
                ) : (
                  <div
                    key={i}
                    className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
                    style={{ left: marker.position }}
                  />
                )
              )}
              {nowPosition !== null && (
                <div aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-[#C9372C] z-[6]" style={{ left: nowPosition }} />
              )}
            </div>

            {driverGroups.length === 0 ? (
              <div
                className="p-8 text-center text-gray-400 text-sm flex items-center justify-center font-medium"
                style={{ minHeight: 120 }}
              >
                No drivers found matching "{driverSearch}"
              </div>
            ) : (
              driverGroups.map((driverGroup, driverIndex) => {
                const driverRowHeight = ROW_HEIGHT;
                const activeGroupRoute =
                  (focusedRouteIndex !== null
                    ? driverGroup.routes.find((r) => r.originalIndex === focusedRouteIndex)
                    : undefined) || driverGroup.routes[0];
                const primaryRoute = activeGroupRoute.route;
                const primaryIndex = activeGroupRoute.originalIndex;
                const pendingDriverRoute = driverGroup.routes.find(({ route, originalIndex }) =>
                  pendingRouteIndices?.has(originalIndex) || routeNeedsOptimization(route)
                );

                const isGroupFocused =
                  focusedRouteIndex !== null &&
                  driverGroup.routes.some((r) => r.originalIndex === focusedRouteIndex);
                const isDimmed = focusedRouteIndex !== null && !isGroupFocused;

                const totalDistanceMeters = driverGroup.routes.reduce(
                  (sum, r) => sum + (r.route.total_distance_meters || 0),
                  0,
                );

                let totalGroupedStopsCount = 0;
                driverGroup.routes.forEach((r) => {
                  const gStops = routeDataMap.get(r.originalIndex)?.groupedStops || [];
                  totalGroupedStopsCount += gStops.filter(
                    (g) =>
                      g.representative.stop_type !== "depot" &&
                      g.representative.stop_type !== "depot_start" &&
                      g.representative.stop_type !== "depot_end",
                  ).length;
                });

                // vehicleLabels removed — vehicle is now shown per-route on the timeline bar chip

                const totalDurationSeconds = driverGroup.routes.reduce(
                  (sum, r) => sum + (r.route.total_duration_seconds || 0),
                  0,
                );
                const durationStr =
                  totalDurationSeconds > 0
                    ? formatDurationSeconds(totalDurationSeconds)
                    : getRouteDurationStr(primaryRoute);

                const routeIndicesStr = driverGroup.routes
                  .map((r) => r.originalIndex)
                  .join(",");

                const routeTeamId = Number(primaryRoute.team_member_id);
                const matchedTeam =
                  (Number.isFinite(routeTeamId)
                    ? teamsById.get(routeTeamId)
                    : undefined) ||
                  teamsByName.get(driverGroup.driverName.trim().toLowerCase());
                const teamId = matchedTeam?.id ?? routeTeamId;
                const persistedShift = Number.isFinite(teamId)
                  ? persistedShiftsByTeamId.get(teamId)
                  : undefined;
                const fallbackShift = showDriverWorkingTime && matchedTeam && !persistedShift
                  ? deriveDriverShiftFromRoutes(driverGroup.routes, scheduleDay)
                  : undefined;
                const selectedDayOverrideKey = getShiftOverrideKey(teamId, scheduleDayKey);
                const activeShift = showDriverWorkingTime && Number.isFinite(teamId)
                  ? shiftOverrides[selectedDayOverrideKey] || persistedShift || fallbackShift
                  : undefined;
                const driverAvailabilityWindows = Number.isFinite(teamId)
                  ? availabilityWindowsByTeamId.get(teamId) || []
                  : [];
                const shiftStartTime = activeShift
                  ? scheduleDay.add(activeShift.startMinutes, "minute")
                  : null;
                const shiftEndTime = activeShift
                  ? scheduleDay.add(activeShift.endMinutes, "minute")
                  : null;
                const baseAvailabilityWindows: DriverAvailabilityWindow[] =
                  driverAvailabilityWindows.length > 0
                    ? driverAvailabilityWindows
                    : shiftStartTime && shiftEndTime
                      ? [{
                          start: shiftStartTime,
                          end: shiftEndTime,
                          dayKey: scheduleDayKey,
                          shift: activeShift,
                        }]
                      : [];
                // When the timeline runs past the last shift (e.g. a route that
                // continues into the next day), extend the shaded background to the
                // end of the timeline instead of leaving it white.
                const displayedAvailabilityWindows: DriverAvailabilityWindow[] =
                  baseAvailabilityWindows.length > 0 && showDriverWorkingTime
                    ? baseAvailabilityWindows.map((window, windowIndex, all) =>
                        windowIndex === all.length - 1 && window.end.isBefore(endTime)
                          ? { ...window, end: endTime }
                          : window,
                      )
                    : baseAvailabilityWindows;
                const availabilityLeft = shiftStartTime
                  ? Math.max(
                      0,
                      Math.min(
                        timelineWidth,
                        shiftStartTime.diff(startTime, "minute", true) * pixelsPerMinute,
                      ),
                    )
                  : 0;
                const availabilityRight = shiftEndTime
                  ? Math.max(
                      availabilityLeft,
                      Math.min(
                        timelineWidth,
                        shiftEndTime.diff(startTime, "minute", true) * pixelsPerMinute,
                      ),
                    )
                  : 0;

                const isDraggingShift = shiftDrag?.teamId === teamId;
                const liveShift =
                  Number.isFinite(teamId) && shiftDrag?.teamId === teamId
                    ? shiftOverrides[
                        getShiftOverrideKey(teamId, shiftDrag.dayKey)
                      ] || shiftDrag
                    : activeShift;
                const dragDeltaMinutes =
                  isDraggingShift && liveShift && shiftDrag
                    ? shiftDrag.edge === "start"
                      ? liveShift.startMinutes - shiftDrag.startMinutes
                      : liveShift.endMinutes - shiftDrag.endMinutes
                    : 0;

                return (
                  <div
                    key={driverGroup.driverKey}
                    data-driver-key={driverGroup.driverKey}
                    data-route-indices={routeIndicesStr}
                    data-route-index={primaryIndex}
                    onDragOver={event => {
                      if (
                        event.dataTransfer.types.includes("application/x-syncnox-trip") ||
                        (event.dataTransfer.types.includes("application/x-syncnox-booking") &&
                          routes[primaryIndex]?.team_member_id !== draggedStopInfo?.moveSelection?.sourceDriverId)
                      ) {
                        handleTimelineTrackDragOver(event, primaryIndex);
                      }
                    }}
                    onDrop={event => {
                      if (
                        event.dataTransfer.types.includes("application/x-syncnox-trip") ||
                        (event.dataTransfer.types.includes("application/x-syncnox-booking") &&
                          routes[primaryIndex]?.team_member_id !== draggedStopInfo?.moveSelection?.sourceDriverId)
                      ) {
                        void handleTimelineDrop(event, primaryIndex);
                      }
                    }}
                    className={`flex border-b border-gray-100 hover:bg-gray-50 transition-colors ${tripDropRouteIndex != null && routes[tripDropRouteIndex]?.team_member_id === routes[primaryIndex]?.team_member_id ? "bg-emerald-50 ring-2 ring-inset ring-emerald-500" : ""}`}
                    style={{ height: driverRowHeight }}
                  >
                    {/* Sticky Driver Info */}
                    <div
                      className={`sticky left-0 z-20 bg-white border-r border-gray-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] cursor-pointer ${driverDrop?.key === driverGroup.driverKey ? driverDrop.side === "before" ? "border-t-2 border-t-emerald-600" : "border-b-2 border-b-emerald-600" : ""}`}
                      style={{
                        width: DRIVER_COLUMN_WIDTH,
                        minWidth: DRIVER_COLUMN_WIDTH,
                      }}
                      onClick={() => onFocusRoute?.(primaryIndex)}
                      onDragOver={event => {
                        if (!event.dataTransfer.types.includes("application/x-syncnox-driver-order")) return;
                        event.preventDefault(); event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                        const bounds = event.currentTarget.getBoundingClientRect();
                        setDriverDrop({ key: driverGroup.driverKey, side: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" });
                      }}
                      onDragLeave={event => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDriverDrop(null);
                      }}
                      onDrop={event => {
                        if (!event.dataTransfer.types.includes("application/x-syncnox-driver-order")) return;
                        event.preventDefault(); event.stopPropagation();
                        const source = event.dataTransfer.getData("application/x-syncnox-driver-order");
                        const bounds = event.currentTarget.getBoundingClientRect();
                        moveDriver(source, driverGroup.driverKey, event.clientY < bounds.top + bounds.height / 2 ? "before" : "after");
                        setDraggedDriver(null); setDriverDrop(null);
                      }}
                      title={
                        isGroupFocused
                          ? "Showing this driver's route — press Esc to show all"
                          : "Show only this driver's route"
                      }
                    >
                      <div
                        className="h-full px-2.5 flex items-center gap-2 transition-opacity"
                        style={{ opacity: isDimmed ? 0.4 : 1 }}
                      >
                        <div className="flex items-center gap-0.5 shrink-0" onClick={event => event.stopPropagation()}>
                          <button type="button" draggable={driverGroups.length > 1} aria-label={`Reorder ${driverGroup.driverName}`}
                            title={`Drag or use arrow keys to reorder ${driverGroup.driverName}`}
                            disabled={driverGroups.length <= 1}
                            className={`hidden sm:inline-flex items-center text-gray-400 ${driverGroups.length > 1 ? "cursor-grab active:cursor-grabbing" : ""} ${draggedDriver === driverGroup.driverKey ? "opacity-50" : ""}`}
                            onKeyDown={event => {
                              if (event.key === "ArrowUp" && driverIndex > 0) {
                                event.preventDefault(); event.stopPropagation();
                                moveDriver(driverGroup.driverKey, driverGroups[driverIndex - 1].driverKey, "before");
                              } else if (event.key === "ArrowDown" && driverIndex < driverGroups.length - 1) {
                                event.preventDefault(); event.stopPropagation();
                                moveDriver(driverGroup.driverKey, driverGroups[driverIndex + 1].driverKey, "after");
                              }
                            }}
                            onDragStart={event => {
                              event.stopPropagation();
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("application/x-syncnox-driver-order", driverGroup.driverKey);
                              setDraggedDriver(driverGroup.driverKey);
                            }}
                            onDragEnd={() => { setDraggedDriver(null); setDriverDrop(null); }}>
                            <GripVertical size={14} />
                          </button>
                        </div>
                        {/* Initials on the driver's route color: the same color as their stops here and their pins on the map */}
                        <span aria-hidden="true"
                          className="hidden sm:inline-flex h-8 w-8 shrink-0 items-center justify-center text-[11px] font-semibold leading-none text-[#172B4D]"
                          style={{ background: `${getRouteColor(primaryIndex)}26`, borderLeft: `3px solid ${getRouteColor(primaryIndex)}` }}>
                          {String(driverGroup.driverName || "").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                        </span>
                        <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span title={driverGroup.driverName} className="font-semibold truncate text-[#172B4D] text-[13px]">
                              {driverGroup.driverName}
                            </span>
                            <DriverPresenceIndicator driverId={Number.isFinite(routeTeamId) && routeTeamId > 0 ? routeTeamId : matchedTeam?.id} />
                            {reorderingRouteIndex === primaryIndex && (
                              <span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 shrink-0 animate-pulse">
                                <LoadingOutlined className="text-[9px] animate-spin" /> Recalculating
                              </span>
                            )}
                          </div>
                          {/* Vehicle is shown per-route on the timeline bar, not here */}
                          <span className="text-[11px] text-[#626F86] truncate tabular-nums"
                            title={`${Math.round(totalDistanceMeters / 1000)} km${durationStr ? ` · ${durationStr}` : ""} · ${totalGroupedStopsCount} stop${totalGroupedStopsCount !== 1 ? "s" : ""}${driverGroup.routes.length > 1 ? ` across ${driverGroup.routes.length} trips` : ""}`}>
                            {Math.round(totalDistanceMeters / 1000)} km
                            {durationStr ? ` · ${durationStr}` : ""}
                            {totalGroupedStopsCount === 0 ? " · No trips yet" : ` · ${totalGroupedStopsCount} stop${
                              totalGroupedStopsCount !== 1 ? "s" : ""
                            }`}
                          </span>
                          {pendingDriverRoute && onReOptimize && (
                            <button type="button"
                              className="mt-0.5 inline-flex w-fit items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900"
                              aria-label={`Optimize pending route for ${driverGroup.driverName}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                onReOptimize(pendingDriverRoute.originalIndex);
                              }}>
                              <ThunderboltOutlined /> Pending · Optimize
                            </button>
                          )}
                        </div>

                        {/* Quick Transfer Button */}
                        {/* <TimelineTooltip title="Transfer stops to another driver">
                          <div
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors text-gray-400 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectionSourceRouteIndex(primaryIndex);
                              setTransferModalRouteIndex(primaryIndex);
                            }}
                          >
                            <SwapOutlined className="text-xs" />
                          </div>
                        </TimelineTooltip> */}

                        {/* Quick Reorder Button */}
                        {/* <TimelineTooltip title="Reorder stops (Drag & Drop)">
                          <div
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer transition-colors text-gray-400 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setReorderModalRouteIndex(primaryIndex);
                            }}
                          >
                            <MenuOutlined className="text-xs" />
                          </div>
                        </TimelineTooltip> */}

                        {/* ••• Menu */}
                        <Dropdown
                          menu={{ items: getRouteMenuItems(primaryIndex) }}
                          trigger={["click"]}
                          placement="bottomRight"
                        >
                          <button
                            type="button"
                            aria-label={`Actions for ${driverGroup.driverName}`}
                            aria-haspopup="menu"
                            className="w-11 h-11 sm:w-7 sm:h-7 flex items-center justify-center rounded-md hover:bg-gray-100 cursor-pointer transition-colors shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreOutlined className="text-gray-500 text-base" />
                          </button>
                        </Dropdown>
                      </div>
                    </div>

                    {/* Timeline Track */}
                    <div
                      className="relative z-10"
                      data-timeline-driver-track={driverGroup.driverKey}
                      style={{
                        width: timelineWidth,
                      }}
                      onDragOver={(e) => handleTimelineTrackDragOver(e, getDriverDropRouteIndex(e, driverGroup.routes))}
                      onDrop={(e) => {
                        const routeIndex = getDriverDropRouteIndex(e, driverGroup.routes);
                        handleTimelineTrackDragOver(e, routeIndex);
                        void handleTimelineDrop(e, routeIndex);
                      }}
                    >
                      {tripDropRouteIndex != null && routes[tripDropRouteIndex]?.team_member_id === routes[primaryIndex]?.team_member_id && (
                        <div className="absolute left-3 top-1 z-40 pointer-events-none rounded bg-emerald-800 px-2 py-1 text-[10px] font-semibold text-white shadow">
                          Move {draggedTrip ? "complete trip" : "booking"} to {driverGroup.driverName} · passenger times kept
                        </div>
                      )}
                      {draggedTrip && driverGroup.routes.some(item => item.originalIndex === draggedTrip.sourceRouteIndex) && (
                        <div className="absolute top-2 bottom-2 z-30 border-2 border-dashed border-emerald-600 bg-emerald-100/30 pointer-events-none rounded"
                          style={{ left: getPosition(draggedTrip.stops[0].arrival_time, startTime, pixelsPerMinute),
                            width: Math.max(32, getPosition(draggedTrip.stops.at(-1)!.arrival_time, startTime, pixelsPerMinute) - getPosition(draggedTrip.stops[0].arrival_time, startTime, pixelsPerMinute)) }} />
                      )}
                      {showDriverWorkingTime && Number.isFinite(teamId) &&
                        (displayedAvailabilityWindows.length > 0 || activeShift) && (
                        <div className="absolute inset-0 pointer-events-none">
                          {displayedAvailabilityWindows.map((window, windowIndex) => {
                            const left = Math.max(
                              0,
                              Math.min(
                                timelineWidth,
                                window.start.diff(startTime, "minute", true) * pixelsPerMinute,
                              ),
                            );
                            const right = Math.max(
                              left,
                              Math.min(
                                timelineWidth,
                                window.end.diff(startTime, "minute", true) * pixelsPerMinute,
                              ),
                            );
                            if (right <= left) return null;
                            return (
                              <React.Fragment
                                key={"availability-" + teamId + "-" + windowIndex}
                              >
                                <div
                                  className={
                                    "absolute top-2 bottom-2 border transition-[left,width,background-color,border-color] duration-75 " +
                                    (isDraggingShift && shiftDrag?.dayKey === window.dayKey
                                      ? "border-[#B9C2BD] bg-[#E6EAE8]"
                                      : "working-time-band border-[#DDE2DF] bg-[#EEF1EF]")
                                  }
                                  style={{ left, width: right - left }}
                                />
                                {window.dayKey && window.shift &&
                                  window.dayKey !== scheduleDayKey && (
                                    <>
                                      <button
                                        type="button"
                                        aria-label={"Change " + driverGroup.driverName + " " + window.dayKey + " shift start"}
                                        title="Drag to change this day shift start."
                                        className="absolute top-1.5 bottom-1.5 z-30 w-5 -translate-x-1/2 border-0 bg-transparent p-0 cursor-ew-resize pointer-events-auto touch-none group outline-none"
                                        style={{ left: Math.max(10, Math.min(timelineWidth - 10, left)) }}
                                        onPointerDown={(event) => beginShiftResize(
                                          event, teamId, driverGroup.driverName,
                                          window.dayKey!, window.start.startOf("day"), "start", window.shift!,
                                        )}
                                        onKeyDown={(event) => adjustShiftWithKeyboard(
                                          event, teamId, driverGroup.driverName,
                                          window.dayKey!, "start", window.shift!,
                                        )}
                                      >
                                        <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-[#9AA59F] transition-colors group-hover:bg-[#003220] group-focus-visible:bg-[#003220]" />
                                      </button>
                                      <button
                                        type="button"
                                        aria-label={"Change " + driverGroup.driverName + " " + window.dayKey + " shift end"}
                                        title="Drag to change this day shift end."
                                        className="absolute top-1.5 bottom-1.5 z-30 w-5 -translate-x-1/2 border-0 bg-transparent p-0 cursor-ew-resize pointer-events-auto touch-none group outline-none"
                                        style={{ left: Math.max(10, Math.min(timelineWidth - 10, right)) }}
                                        onPointerDown={(event) => beginShiftResize(
                                          event, teamId, driverGroup.driverName,
                                          window.dayKey!, window.start.startOf("day"), "end", window.shift!,
                                        )}
                                        onKeyDown={(event) => adjustShiftWithKeyboard(
                                          event, teamId, driverGroup.driverName,
                                          window.dayKey!, "end", window.shift!,
                                        )}
                                      >
                                        <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-[#9AA59F] transition-colors group-hover:bg-[#003220] group-focus-visible:bg-[#003220]" />
                                      </button>
                                    </>
                                  )}
                              </React.Fragment>
                            );
                          })}

                          {activeShift && (
                            <>
                          <button
                            type="button"
                            aria-label={`Change ${driverGroup.driverName} shift start. Current start ${formatMinutesAsTime(activeShift.startMinutes)}`}
                            title="Drag to change shift start. Use arrow keys for 15-minute adjustments."
                            className="absolute top-1.5 bottom-1.5 z-30 w-5 -translate-x-1/2 border-0 bg-transparent p-0 cursor-ew-resize pointer-events-auto touch-none group outline-none"
                            style={{ left: Math.max(10, Math.min(timelineWidth - 10, availabilityLeft)) }}
                            onPointerDown={(event) =>
                              beginShiftResize(
                                event,
                                teamId,
                                driverGroup.driverName,
                                scheduleDayKey,
                                scheduleDay,
                                "start",
                                activeShift,
                              )
                            }
                            onKeyDown={(event) =>
                              adjustShiftWithKeyboard(
                                event,
                                teamId,
                                driverGroup.driverName,
                                scheduleDayKey,
                                "start",
                                activeShift,
                              )
                            }
                          >
                            <span className="absolute left-1/2 top-2 bottom-2 w-1 -translate-x-1/2 rounded-full border border-emerald-800 bg-white shadow-sm transition-all group-hover:w-1.5 group-focus-visible:w-1.5 group-focus-visible:ring-2 group-focus-visible:ring-emerald-400 group-focus-visible:ring-offset-1">
                              <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-[#9AA59F] transition-colors group-hover:bg-[#003220] group-focus-visible:bg-[#003220]" />
                            </span>
                          </button>

                          <button
                            type="button"
                            aria-label={`Change ${driverGroup.driverName} shift end. Current end ${formatMinutesAsTime(activeShift.endMinutes)}`}
                            title="Drag to change shift end. Use arrow keys for 15-minute adjustments."
                            className="absolute top-1.5 bottom-1.5 z-30 w-5 -translate-x-1/2 border-0 bg-transparent p-0 cursor-ew-resize pointer-events-auto touch-none group outline-none"
                            style={{ left: Math.max(10, Math.min(timelineWidth - 10, availabilityRight)) }}
                            onPointerDown={(event) =>
                              beginShiftResize(
                                event,
                                teamId,
                                driverGroup.driverName,
                                scheduleDayKey,
                                scheduleDay,
                                "end",
                                activeShift,
                              )
                            }
                            onKeyDown={(event) =>
                              adjustShiftWithKeyboard(
                                event,
                                teamId,
                                driverGroup.driverName,
                                scheduleDayKey,
                                "end",
                                activeShift,
                              )
                            }
                          >
                            <span className="absolute left-1/2 top-2 bottom-2 w-1 -translate-x-1/2 rounded-full border border-emerald-800 bg-white shadow-sm transition-all group-hover:w-1.5 group-focus-visible:w-1.5 group-focus-visible:ring-2 group-focus-visible:ring-emerald-400 group-focus-visible:ring-offset-1">
                              <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-6 w-[3px] -translate-x-1/2 -translate-y-1/2 bg-[#9AA59F] transition-colors group-hover:bg-[#003220] group-focus-visible:bg-[#003220]" />
                            </span>
                          </button>

                          {isDraggingShift && liveShift && shiftDrag && (
                            <div
                              className="absolute z-50 -translate-x-1/2 rounded-md bg-slate-900 px-2.5 py-1 text-[10px] font-semibold text-white shadow-lg whitespace-nowrap"
                              style={{
                                left:
                                  shiftDrag.edge === "start"
                                    ? Math.max(
                                        0,
                                        Math.min(
                                          timelineWidth,
                                          shiftDrag.dayStart
                                            .add(liveShift.startMinutes, "minute")
                                            .diff(startTime, "minute", true) * pixelsPerMinute,
                                        ),
                                      )
                                    : Math.max(
                                        0,
                                        Math.min(
                                          timelineWidth,
                                          shiftDrag.dayStart
                                            .add(liveShift.endMinutes, "minute")
                                            .diff(startTime, "minute", true) * pixelsPerMinute,
                                        ),
                                      ),
                                top: driverRowHeight - 3,
                              }}
                            >
                              {shiftDrag.edge === "start" ? "Starts" : "Ends"}{" "}
                              {formatMinutesAsTime(
                                shiftDrag.edge === "start"
                                  ? liveShift.startMinutes
                                  : liveShift.endMinutes,
                              )}
                              {dragDeltaMinutes !== 0 && (
                                <span className="ml-1 text-emerald-300">
                                  · {dragDeltaMinutes > 0 ? "+" : "−"}
                                  {formatMinutesAsDuration(Math.abs(dragDeltaMinutes))}
                                </span>
                              )}
                            </div>
                          )}
                            </>
                          )}
                        </div>
                      )}

                      {driverGroup.routes.map(({ route, originalIndex: routeIndex }) => {
                        const routeData = routeDataMap.get(routeIndex);
                        const routeColor = routeData?.routeColor || getRouteColor(routeIndex);
                        const groupedStops = routeData?.groupedStops || [];
                        const occupancyMap = routeData?.occupancyMap || new Map<number, number>();

                        const routeStops = route.stops || [];
                        // Find the index of the last job (non-depot) stop
                        const lastJobStopIndex = routeStops.reduce(
                          (last: number, s: any, idx: number) => {
                            const isDepot =
                              s.stop_type === "depot" ||
                              s.stop_type === "depot_start" ||
                              s.stop_type === "depot_end";
                            return !isDepot ? idx : last;
                          },
                          -1
                        );
                        const lastJobStop =
                          lastJobStopIndex !== -1 ? routeStops[lastJobStopIndex] : null;
                        const lastJobCompletionTime = lastJobStop
                          ? (lastJobStop.departure_time
                              ? dayjs(lastJobStop.departure_time)
                              : dayjs(lastJobStop.arrival_time).add(
                                  lastJobStop.service_duration_minutes || 0,
                                  "minute"
                                ))
                          : null;
                        const lastRouteStop = routeStops[routeStops.length - 1];
                        const routeCompletionTime = lastRouteStop?.arrival_time
                          ? dayjs(lastRouteStop.arrival_time)
                          : lastJobCompletionTime;

                        // ── Resolve vehicle label for segment hover tooltips ───────────────
                        const routeVehicleObj = route.vehicle_id
                          ? vehiclesMap.get(Number(route.vehicle_id))
                          : undefined;
                        const routeVehicleName =
                          (route as any).vehicle_name ||
                          routeVehicleObj?.name ||
                          (route.vehicle_id
                            ? `Vehicle #${route.vehicle_id}`
                            : null);
                        const routeVehicleCap =
                          (route as any).vehicle_capacity ??
                          getVehicleCapacity(routeVehicleObj);

                        const isTrackBeingDraggedOver =
                          dragOverStopInfo && dragOverStopInfo.routeIndex === routeIndex;
                        const isReorderingThisRoute = reorderingRouteIndex === routeIndex;

                        return (
                          <div
                            key={`route-${routeIndex}`}
                            role="group"
                            aria-label={`${driverGroup.driverName} ${route.leg || "route"}`}
                            // Share a row origin without letting empty track overlays
                            // intercept stops and drop targets on another trip.
                            style={{ height: driverRowHeight, pointerEvents: "none" }}
                            className={`absolute inset-0 z-10 [&>*]:pointer-events-auto transition-colors duration-150 ${
                              isTrackBeingDraggedOver
                                ? "bg-emerald-50/25 ring-1 ring-emerald-400/40 rounded-sm"
                                : ""
                            }`}
                            onDragOver={(e) => handleTimelineTrackDragOver(e, routeIndex)}
                            onDrop={(e) => handleTimelineDrop(e, routeIndex)}
                          >
                            {/* Shimmer loading accent when recalculating ETAs */}
                            {isReorderingThisRoute && (
                              <div style={{ pointerEvents: "none" }} className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 animate-pulse z-40" />
                            )}

                            {/* Track-level High-Precision Drag & Drop Insertion Guide */}
                            {isTrackBeingDraggedOver &&
                              typeof dragOverStopInfo.indicatorX === "number" && (
                                <div
                                  className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
                                  style={{
                                    left: dragOverStopInfo.indicatorX,
                                    transform: "translateX(-50%)",
                                    pointerEvents: "none",
                                  }}
                                >
                                  {/* Top floating pill badge */}
                                  <div className="absolute -top-7 px-2.5 py-0.5 bg-slate-900/95 text-white text-[10px] font-semibold rounded-full shadow-lg border border-emerald-500/50 flex items-center gap-1.5 whitespace-nowrap z-50 backdrop-blur-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
                                    <span>
                                      Drop {dragOverStopInfo.side === "before" ? "before" : "after"} Stop {dragOverStopInfo.targetStopIndex}
                                      {dragOverStopInfo.targetName ? ` (${dragOverStopInfo.targetName.slice(0, 24)})` : ""}
                                    </span>
                                  </div>

                                  {/* Top bead */}
                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs shrink-0 -mt-1" />

                                  {/* Vertical guide line */}
                                  <div className="w-0.5 flex-1 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.85)]" />

                                  {/* Bottom bead */}
                                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-xs shrink-0 -mb-1" />
                                </div>
                            )}

                            {/* Keep merge controls clear of the visible endpoint icons. Narrow gaps use the route menu. */}
                            {onMergeRoutes && waitingMergeCandidates(routes, routeIndex).map(targetIndex => {
                              const target = routes[targetIndex];
                              const end = routeStops[routeStops.length - 1];
                              const beginning = target.stops[0];
                              if (!end || Date.parse(beginning.arrival_time) < Date.parse(end.arrival_time)) return null;
                              const left = getPosition(end.arrival_time, startTime, pixelsPerMinute);
                              const right = getPosition(beginning.arrival_time, startTime, pixelsPerMinute);
                              const targetGroups = routeDataMap.get(targetIndex)?.groupedStops;
                              const nextTime = targetGroups?.[1]?.representative.arrival_time;
                              const layout = waitingMergeButtonLayout(left, right,
                                nextTime ? getPosition(nextTime, startTime, pixelsPerMinute) : undefined);
                              if (!layout) return null;
                              return <TimelineTooltip key={`merge-${routeIndex}-${targetIndex}`} title="Merge these trips with travel and waiting time">
                                <button type="button" aria-label="Merge routes with waiting time" onClick={event => { event.stopPropagation(); onMergeRoutes(routeIndex, targetIndex); }}
                                  className="absolute top-1/2 -translate-y-1/2 h-6 flex items-center justify-center rounded border border-emerald-600 bg-white text-emerald-800 text-sm hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
                                  style={{ ...layout, zIndex: 5 }}><span aria-hidden="true">+</span></button>
                              </TimelineTooltip>;
                            })}

                            {/* Connection Lines (Segments) */}
                            {route.stops?.map((stop: any, index: number) => {
                              if (index === route.stops.length - 1) return null;
                              if (isRedundantLeaderClientStart(route, index)) return null;

                              const nextStop = route.stops[index + 1];
                              let startPos = getPosition(
                                stop.arrival_time,
                                startTime,
                                pixelsPerMinute,
                              );
                              const endPos = getPosition(
                                nextStop.arrival_time,
                                startTime,
                                pixelsPerMinute,
                              );

                              // If stop is depot_start and next stop is at the same position or within 36px,
                              // ensure startPos is placed to the left so the segment is clearly drawn.
                              if (stop.stop_type === "depot_start" && endPos - startPos < 36) {
                                startPos = Math.max(0, endPos - 36);
                              }

                              const width = endPos - startPos;

                              if (width < 0 || (width === 0 && stop.stop_type !== "depot_end")) return null;

                              const segment = getTimelineSegment(stop, nextStop);
                              const timeMin = Math.round(segment.elapsedSeconds / 60);

                              if (stop.stop_type === "depot_end") {
                                if (!onEditWaiting || nextStop.stop_type !== "depot_start") return null;
                                const startGroupIndex = groupedStops.findIndex(group => group.firstRawIndex === index + 1);
                                const nextTime = startGroupIndex >= 0 ? groupedStops[startGroupIndex + 1]?.representative.arrival_time : undefined;
                                const layout = waitingMergeButtonLayout(startPos, endPos,
                                  nextTime ? getPosition(nextTime, startTime, pixelsPerMinute) : undefined);
                                if (!layout) return null;
                                return <TimelineTooltip key={`join-${routeIndex}-${index}`} title="Merge these trips with travel and waiting time">
                                  <button type="button" aria-label="Merge consecutive trips with waiting time" onClick={event => { event.stopPropagation(); onEditWaiting(routeIndex, index); }}
                                    className="absolute top-1/2 -translate-y-1/2 h-6 flex items-center justify-center rounded border border-emerald-600 bg-white text-emerald-800 text-sm hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-600"
                                    style={{ ...layout, zIndex: 5 }}>+</button>
                                </TimelineTooltip>;
                              }

                              // A long interval can include valid travel/waiting. Only an
                              // explicit depot_end above separates shifts, not its length.
                              const isWaiting = segment.isWaiting && (segment.serviceSeconds ?? 0) === 0;

                              // Do not draw waiting time or zero-distance lines after the route is already completed
                              const isAfterRouteCompleted =
                                (lastJobStopIndex !== -1 && index >= lastJobStopIndex) ||
                                (nextStop.stop_type === "depot" && index === routeStops.length - 2);

                              if (isWaiting && isAfterRouteCompleted && !stop.manual_waiting) return null;

                              if (segment.isWorking) {
                                return (
                                  <TimelineTooltip key={`work-${routeIndex}-${index}`} title={`Working at client · ${timeMin} min · vehicle stays with the team leader`}>
                                    <div
                                      className="absolute top-1/2 cursor-pointer"
                                      style={{ left: startPos, width, height: 5, transform: "translateY(-50%)", backgroundColor: "#64748b", opacity: isDimmed ? 0.15 : 0.6, pointerEvents: draggedStopInfo ? "none" : undefined }}
                                    />
                                  </TimelineTooltip>
                                );
                              }

                              return <TimelineTravelSegment
                                key={`link-${routeIndex}-${index}`}
                                segment={segment}
                                left={startPos}
                                width={width}
                                pixelsPerMinute={pixelsPerMinute}
                                routeColor={routeColor}
                                vehicleName={routeVehicleName}
                                vehicleCapacity={routeVehicleCap}
                                isDimmed={isDimmed}
                                isDragging={Boolean(draggedStopInfo)}
                                load={occupancyMap.get(index)}
                                onEditWaiting={onEditWaiting && !route.needs_optimization && !pendingRouteIndices?.has(routeIndex) ? () => onEditWaiting(routeIndex, index) : undefined}
                                editBlockedReason={onEditWaiting && (route.needs_optimization || pendingRouteIndices?.has(routeIndex))
                                  ? "This trip changed since it was optimized, so its times are out of date. Optimize it (next to the driver's name), then change the wait." : undefined}
                              />;
                            })}

                            {/* Break Time Block */}
                            {route.break_info &&
                              (() => {
                                const breakStartPos = getPosition(
                                  route.break_info.start_time,
                                  startTime,
                                  pixelsPerMinute,
                                );
                                const breakEndPos = getPosition(
                                  route.break_info.end_time,
                                  startTime,
                                  pixelsPerMinute,
                                );
                                const breakWidth = breakEndPos - breakStartPos;

                                if (breakWidth <= 0) return null;

                                return (
                                  <TimelineTooltip
                                    key={`break-${routeIndex}`}
                                    title={
                                      <div>
                                        <div className="font-semibold">
                                          ☕ Break
                                        </div>
                                        <div>
                                          Duration:{" "}
                                          {route.break_info.duration_minutes}{" "}
                                          min
                                        </div>
                                        {route.break_info.location
                                          ?.address_formatted && (
                                          <div className="text-xs">
                                            📍{" "}
                                            {
                                              route.break_info.location
                                                .address_formatted
                                            }
                                          </div>
                                        )}
                                      </div>
                                    }
                                  >
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 h-6 border border-gray-400 cursor-pointer hover:opacity-100 transition-opacity flex items-center justify-center"
                                      style={{
                                        left: breakStartPos,
                                        width: breakWidth,
                                        backgroundColor: "#8c8c8c",
                                        opacity: isDimmed ? 0.3 : 0.8,
                                        minWidth: 24,
                                        pointerEvents: draggedStopInfo ? "none" : undefined,
                                      }}
                                    >
                                      <span className="text-white text-xs">
                                        ☕
                                      </span>
                                    </div>
                                  </TimelineTooltip>
                                );
                              })()}

                            {/* Idle Time Blocks */}
                            {route.idle_blocks?.map(
                              (idle: any, idleIndex: number) => {
                                // Do not display any idle / waiting time after the route is already completed
                                if (
                                  lastJobStopIndex !== -1 &&
                                  typeof idle.after_stop_index === "number" &&
                                  idle.after_stop_index >= lastJobStopIndex
                                ) {
                                  return null;
                                }

                                if (
                                  lastJobCompletionTime &&
                                  dayjs(idle.start_time).valueOf() >=
                                    lastJobCompletionTime.valueOf() - 30000
                                ) {
                                  return null;
                                }

                                if (
                                  routeCompletionTime &&
                                  dayjs(idle.start_time).valueOf() >=
                                    routeCompletionTime.valueOf() - 30000
                                ) {
                                  return null;
                                }

                                const idleStartPos = getPosition(
                                  idle.start_time,
                                  startTime,
                                  pixelsPerMinute,
                                );
                                const idleEndPos = getPosition(
                                  idle.end_time,
                                  startTime,
                                  pixelsPerMinute,
                                );
                                const idleWidth = idleEndPos - idleStartPos;

                                if (idleWidth <= 0) return null;

                                return (
                                  <TimelineTooltip
                                    key={`idle-${routeIndex}-${idleIndex}`}
                                    title={
                                      <div>
                                        <div className="font-semibold">
                                          ⏳ Idle Time
                                        </div>
                                        <div>
                                          Waiting: {idle.duration_minutes} min
                                        </div>
                                        {idle.location?.address_formatted && (
                                          <div className="text-xs">
                                            📍 {idle.location.address_formatted}
                                          </div>
                                        )}
                                      </div>
                                    }
                                  >
                                    <div
                                      className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
                                      role={onEditWaiting && typeof idle.after_stop_index === "number" ? "button" : undefined}
                                      tabIndex={onEditWaiting && typeof idle.after_stop_index === "number" ? 0 : undefined}
                                      aria-label="Edit waiting time"
                                      onClick={event => { if (onEditWaiting && typeof idle.after_stop_index === "number") { event.stopPropagation(); onEditWaiting(routeIndex, idle.after_stop_index); } }}
                                      onKeyDown={event => { if (onEditWaiting && typeof idle.after_stop_index === "number" && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.stopPropagation(); onEditWaiting(routeIndex, idle.after_stop_index); } }}
                                      style={{
                                        left: idleStartPos,
                                        width: idleWidth,
                                        height: 5,
                                        backgroundColor: "#cbd5e1",
                                        opacity: isDimmed ? 0.15 : 1,
                                        pointerEvents: draggedStopInfo ? "none" : undefined,
                                        backgroundImage: `repeating-linear-gradient(
                                            45deg,
                                            transparent,
                                            transparent 3px,
                                            rgba(0,0,0,0.12) 3px,
                                            rgba(0,0,0,0.12) 6px
                                          )`,
                                      }}
                                    />
                                  </TimelineTooltip>
                                );
                              },
                            )}

                            {/* Stops — rendered from grouped stops */}
                            {(() => {
                              return groupedStops.map((group, groupIndex) => {
                                const stop = group.representative;
                                const simultaneousOffset = routeData?.simultaneous.offsets.get(groupIndex);
                                const count = group.candidateCount;
                                const isMixed = group.hasPickup && group.hasDropoff;
                                
                                const fallbackArrivalTime = groupIndex > 0
                                  ? dayjs(groupedStops[groupIndex - 1].representative.arrival_time || startTime.toISOString()).add(30, 'minute')
                                  : startTime;
                                  
                                const arrivalTime = stop.arrival_time
                                  ? dayjs(stop.arrival_time)
                                  : fallbackArrivalTime;
                                
                                // Service is charged once per visit; it may be recorded on its last event.
                                const serviceDuration = group.rawStops.reduce((duration: number, s: any) =>
                                  Math.max(duration, s.service_duration_minutes ?? (s.service_duration_seconds ?? 0) / 60), 0,
                                );
                                
                                const finalEvent = group.rawStops[group.rawStops.length - 1];
                                const waitingAfterStop = finalEvent?.waiting_position === "left"
                                  ? (finalEvent.waiting_time_to_next_stop_seconds || 0) / 60 : 0;
                                const departureTime = arrivalTime.add(
                                  serviceDuration + waitingAfterStop,
                                  "minute",
                                );
                                const driverArrival = stop.driver_arrival_time ? dayjs(stop.driver_arrival_time) : null;

                                const computedArrivalTimeString = stop.arrival_time || arrivalTime.toISOString();

                                let left = getPosition(
                                  computedArrivalTimeString,
                                  startTime,
                                  pixelsPerMinute,
                                );

                                // Safeguard: If depot_start is followed by a stop at the exact same arrival time (or within 36px),
                                // shift depot_start leftward by 36px so the depot house icon is never obscured by the pickup box.
                                if (stop.stop_type === "depot_start" && groupIndex + 1 < groupedStops.length) {
                                  const nextGroup = groupedStops[groupIndex + 1];
                                  const nextTime = nextGroup.representative?.arrival_time;
                                  if (nextTime) {
                                    const nextLeft = getPosition(nextTime, startTime, pixelsPerMinute);
                                    if (nextLeft <= left || nextLeft - left < 36) {
                                      left = Math.max(0, nextLeft - 36);
                                    }
                                  }
                                }

                                const blockWidth =
                                  serviceDuration * pixelsPerMinute;

                                const isDepot =
                                  stop.stop_type === "depot" ||
                                  stop.stop_type === "depot_start" ||
                                  stop.stop_type === "depot_end";

                                const depotLabel = isDepot
                                  ? stop.stop_type === "depot_start"
                                    ? "Start"
                                    : stop.stop_type === "depot_end"
                                      ? "End"
                                      : "Depot"
                                  : null;

                                const displayIndex = group.displayStopNumber;

                                const isPickup = stop.stop_type === "pickup";
                                const isDropoff =
                                  stop.stop_type === "dropoff" ||
                                  stop.stop_type === "drop_off";
                                const isJob =
                                  stop.stop_type === "job" ||
                                  isPickup ||
                                  isDropoff;
                                const stopTypeLabel = isPickup
                                  ? "Pickup"
                                  : isDropoff
                                    ? "Drop-off"
                                    : null;
                                const stopLeg = isJob && isWorkerShuttle
                                  ? getJobLeg(
                                      jobsByIdMap.get(Number(stop.job_id || stop.job?.id)) || stop.job,
                                      stop.leg || stop.extra?.leg,
                                      route.leg,
                                    )
                                  : undefined;

                                let jobStatus = "assigned";
                                if (isJob) {
                                  const mapStatus = stop.job_id
                                    ? jobsMap.get(Number(stop.job_id))
                                    : undefined;
                                  jobStatus =
                                    mapStatus ||
                                    stop.job?.status ||
                                    stop.status ||
                                    "assigned";
                                }
                                // Each passenger at this stop is done, failed, skipped or still open. The stop's own
                                // status (from the driver app or the web) wins over the job's, because a job's
                                // status covers both of its stops. Pickups count as done once the job is in transit,
                                // whichever spelling the server uses for the stop type.
                                const passengerState = (s: any): "done" | "failed" | "skipped" | "open" => {
                                  const own = String(s.status || "").toLowerCase();
                                  // The job's status speaks for this stop only for one-direction jobs, or when the stop
                                  // carries no status of its own (legacy combined jobs hold both legs).
                                  const jobType = String(jobsByIdMap.get(Number(s.job_id))?.job_type || "").toLowerCase();
                                  const trustJob = !own || ["one_way", "return_only", "go_only"].includes(jobType);
                                  const job = trustJob ? String(jobsMap.get(Number(s.job_id)) || s.job?.status || "").toLowerCase() : "";
                                  const type = String(s.stop_type || "").toLowerCase();
                                  const isPickupStop = type === "pickup" || type === "pick_up";
                                  if (own === "completed" || job === "completed" || job === "success" || (isPickupStop && job === "in_transit")) return "done";
                                  if (own === "failed" || job === "failed") return "failed";
                                  if (own === "skipped" || job === "skipped" || job === "cancelled") return "skipped";
                                  return "open";
                                };
                                const stopStates = isJob ? group.rawStops.map(passengerState) : [];
                                const doneCount = stopStates.filter((state: string) => state === "done").length;
                                const openCount = stopStates.filter((state: string) => state === "open").length;
                                const isStopDone = isJob && stopStates.length > 0 && doneCount === stopStates.length;
                                // Some passengers done, some still to do: shown as a light fill, never as untouched.
                                const isStopPartlyDone = isJob && doneCount > 0 && openCount > 0;
                                if (isJob && !isStopDone && openCount === 0 && stopStates.length > 0) {
                                  jobStatus = stopStates.includes("failed") ? "failed" : "skipped";
                                }

                                let blockBgColor = routeColor;
                                let blockBorderColor = routeColor;
                                let blockTextColor = "white";

                                if (isJob) {
                                  if (isStopDone) {
                                    blockBgColor = routeColor;
                                    blockBorderColor = routeColor;
                                    blockTextColor = "white";
                                  } else if (isStopPartlyDone) {
                                    blockBgColor = `${routeColor}40`;
                                    blockBorderColor = routeColor;
                                    blockTextColor = routeColor;
                                  } else if (jobStatus === "failed") {
                                    blockBgColor = "#f5222d";
                                    blockBorderColor = "#f5222d";
                                    blockTextColor = "white";
                                  } else if (jobStatus === "skipped") {
                                    blockBgColor = "#8c8c8c";
                                    blockBorderColor = "#8c8c8c";
                                    blockTextColor = "white";
                                  } else {
                                    blockBgColor = "white";
                                    blockBorderColor = routeColor;
                                    blockTextColor = routeColor;
                                  }
                                }

                                const routeVehicle = route.vehicle_id
                                  ? vehiclesMap.get(Number(route.vehicle_id))
                                  : undefined;
                                // Prefer backend-resolved capacity (seat parser); fall
                                // back to the local vehicles list only for old results.
                                const vehicleCapacity =
                                  (route as any).vehicle_capacity ??
                                  getVehicleCapacity(routeVehicle);
                                const stopVehicleName =
                                  (route as any).vehicle_name ||
                                  routeVehicle?.name ||
                                  (route.vehicle_id ? `Vehicle #${route.vehicle_id}` : null);

                                const lastRawIndex =
                                  group.firstRawIndex +
                                  group.rawStops.length -
                                  1;
                                const currentOccupancy =
                                  occupancyMap.get(lastRawIndex) ?? 0;

                                const formattedAddr = isDepot
                                  ? stop.address_formatted ||
                                    (stop.stop_type === "depot_start"
                                      ? "Depot (Start)"
                                      : stop.stop_type === "depot_end"
                                        ? "Depot (End)"
                                        : "Depot")
                                  : stop.address_formatted || `#${stop.job_id}`;

                                const isStopNew = Boolean(stop.is_new || group.rawStops.some((s: any) => s.is_new));
                                const isTimeEdited = Boolean(stop.time_edited || group.rawStops.some((s: any) => s.time_edited));
                                const isStopEdited = Boolean(
                                  stop.is_edited ||
                                  stop.time_edited ||
                                  group.rawStops.some((s: any) => s.is_edited || s.time_edited)
                                );

                                const hm = (value: dayjs.Dayjs | null | undefined) => value?.isValid() ? value.format("h:mm A") : "--:--";
                                const dayNote = (value: dayjs.Dayjs) => {
                                  if (!value.isValid() || value.isSame(scheduleDay, "day")) return null;
                                  const diff = value.startOf("day").diff(scheduleDay, "day");
                                  return diff === 1 ? "next day" : diff === -1 ? "day before" : value.format("ddd, MMM D");
                                };
                                const legWord = stopLeg === "GO" ? "Outbound" : stopLeg === "RETURN" ? "Return" : null;
                                const isEnd = stop.stop_type === "depot_end" || depotLabel === "End";
                                const kindWord = isMixed ? "Drop-off + pickup" : isPickup ? "Pickup" : isDropoff ? "Drop-off" : isDepot ? (isEnd ? "Trip ends" : "Trip starts") : "Stop";
                                const waitsMinutes = driverArrival?.isValid() && driverArrival.isBefore(arrivalTime) ? Math.round(arrivalTime.diff(driverArrival, "minute", true)) : 0;
                                const seats = Number(vehicleCapacity) || 0;
                                const overCapacity = seats > 0 && currentOccupancy > seats;
                                const boarding = group.rawStops.filter((x: any) => x.stop_type === "pickup" || x.stop_type === "pick_up").length;
                                const alighting = group.rawStops.filter((x: any) => x.stop_type === "dropoff" || x.stop_type === "drop_off").length;
                                const people = isJob ? getStopTooltipStops(group) : [];
                                const checks = people.map((x: any) => x.job_id ? getShiftCheck(Number(x.job_id), route.stops || [], stopLeg) : null);
                                const checked = checks.filter(Boolean) as NonNullable<ReturnType<typeof getShiftCheck>>[];
                                const late = checked.filter(c => c.tone === "bad").length;
                                const tight = checked.filter(c => c.tone === "warn").length;
                                const shifts = [...new Set(checked.map(c => c.label))];
                                const verdict = !checked.length ? null
                                  : late ? { tone: "bad", text: `${late} of ${checked.length} ${stopLeg === "RETURN" ? "picked up before their shift ends" : "late for their shift"}` }
                                  : tight ? { tone: "warn", text: `${tight} of ${checked.length} ${tight === 1 ? "arrives" : "arrive"} with less margin than required` }
                                  : { tone: "ok", text: `${checked.length === 1 ? "On time" : `All ${checked.length} on time`} · ${shifts.length === 1 ? shifts[0] : "mixed shifts"}` };
                                const toneColor = (tone?: string) => tone === "bad" ? "#C9372C" : tone === "warn" ? "#B38600" : "#1F845A";
                                const SHOWN = 4;
                                const stopTooltipKey = `${routeIndex}-${groupIndex}`;
                                const tooltipContent = (
                                  <div className="lang pointer-events-auto select-text w-[300px] text-[#12211A]">
                                    {simultaneousOffset !== undefined && <p className="m-0 mb-2 text-[12px] text-[#626E67]">Several stops share this time. Click to choose one.</p>}

                                    {/* 1 · When and what */}
                                    <div className="flex items-center gap-2.5">
                                      <span aria-hidden="true" className="inline-flex h-[30px] w-6 shrink-0 items-center justify-center">
                                        {isDepot ? <span className="inline-flex h-5 w-5 items-center justify-center text-white" style={{ backgroundColor: routeColor }}>
                                          {isEnd ? <Flag size={12} /> : <House size={12} />}</span>
                                          : <span className="inline-flex scale-[0.7]"><StopArrowSvg isPickup={isPickup || isMixed} isMixed={isMixed} displayIndex={displayIndex} fill="#fff" stroke={routeColor} textColor={routeColor} /></span>}
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-[17px] font-medium leading-none tabular-nums">{hm(arrivalTime)}</span>
                                          {dayNote(arrivalTime) && <span className="text-[11px] text-[#626E67]">{dayNote(arrivalTime)}</span>}
                                        </div>
                                        <div className="mt-1 text-[12px] text-[#4A5750]">{[kindWord, legWord, !isDepot ? `stop ${displayIndex}` : null].filter(Boolean).join(" · ")}</div>
                                      </div>
                                      {isStopEdited && <span className="shrink-0" title={isTimeEdited ? "Time changed by hand" : "Edited by hand"}><EditedMark size={14} /></span>}
                                    </div>

                                    {/* 2 · Where */}
                                    {!isMixed && <div className="mt-2 flex items-center gap-2 text-[12px]">
                                      <span className="min-w-0 flex-1 truncate text-[#4A5750]" title={formattedAddr}>{formattedAddr}</span>
                                      {formattedAddr && <button type="button" title="Copy address" aria-label="Copy address"
                                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(formattedAddr); message.success("Address copied"); }}
                                        className="inline-flex shrink-0 border-0 bg-transparent p-0 text-[#626E67] cursor-pointer hover:text-[#0B5D3B]"><CopyOutlined className="text-[12px]" /></button>}
                                    </div>}

                                    {/* 3 · The answer: is everyone on time */}
                                    {verdict && <div className="mt-2.5 flex items-center gap-2 px-2 py-1.5 text-[12px]"
                                      style={{ backgroundColor: verdict.tone === "bad" ? "#FDECEA" : verdict.tone === "warn" ? "#FFF8E6" : "#F1F8F4", color: toneColor(verdict.tone) }}>
                                      <span aria-hidden="true" className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium text-white" style={{ backgroundColor: toneColor(verdict.tone) }}>
                                        {verdict.tone === "ok" ? "✓" : "!"}
                                      </span>
                                      <span className="min-w-0 truncate">{verdict.text}</span>
                                    </div>}
                                    {isStopNew && <p className="m-0 mt-2 text-[12px] text-[#0B5D3B]">New since the last optimization</p>}

                                    {/* 4 · Who */}
                                    {people.length > 0 && <ul className="m-0 mt-2.5 list-none border-t border-[#E3E8E5] p-0" aria-label="Passengers at this stop">
                                      {people.slice(0, SHOWN).map((x: any, i: number) => {
                                        const candName = getCandidateName(x);
                                        const numJobId = Number(x.job_id || x.id || x.job?.id) || null;
                                        const isPendingDelete = numJobId ? pendingDeletedJobIds.has(numJobId) : false;
                                        // Same rule as the marker: a boarded passenger (job in transit) counts as done here too.
                                        const personState = passengerState(x);
                                        const status = personState === "done" ? "COMPLETED" : personState === "failed" ? "FAILED" : personState === "skipped" ? "SKIPPED" : "";
                                        const isFinished = personState !== "open";
                                        const check = checks[i];
                                        return <li key={i} className="group/jobrow flex items-center gap-2 border-b border-[#E3E8E5] py-1.5 text-[12px] last:border-b-0">
                                          <User size={13} className="shrink-0 text-[#626E67]" aria-hidden="true" />
                                          {isMixed && <span className="shrink-0 text-[11px] text-[#626E67]">{x.stop_type === "pickup" ? "on" : "off"}</span>}
                                          <button type="button" onClick={(e) => { e.stopPropagation(); onStopClick?.(x, routeIndex, displayIndex); }}
                                            className={`min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-left text-[12px] cursor-pointer hover:text-[#0B5D3B] hover:underline ${isPendingDelete ? "text-[#C9372C] line-through" : "text-[#12211A]"}`}
                                            title={`${candName || "Job"} · #${numJobId} · open details`}>
                                            {candName || `Job #${numJobId}`}
                                          </button>
                                          {isPendingDelete ? (onUndoDeleteJob && numJobId ? <button type="button" onClick={(e) => { e.stopPropagation(); onUndoDeleteJob(numJobId); }}
                                            className="shrink-0 border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline">Undo removal</button> : null)
                                            : isFinished ? <span className={`shrink-0 text-[11px] ${status === "COMPLETED" ? "text-[#1F845A]" : status === "SKIPPED" ? "text-[#626E67]" : "text-[#C9372C]"}`}>{status === "COMPLETED" ? (x.stop_type === "pickup" || x.stop_type === "pick_up" ? "On board" : "Done") : status === "SKIPPED" ? "Skipped" : (x.stop_type === "pickup" || x.stop_type === "pick_up" ? "No-show" : "Failed")}</span>
                                            : check ? <span className="shrink-0 text-[11px] tabular-nums group-hover/jobrow:hidden" style={{ color: toneColor(check.tone) }} title={check.label}>{check.short}</span>
                                            : <span className="shrink-0 text-[11px] text-[#626E67] tabular-nums group-hover/jobrow:hidden">#{numJobId}</span>}
                                          {!isPendingDelete && !isFinished && onRemoveStop && numJobId && (
                                            <button type="button" title="Remove job from route" aria-label={`Remove job ${numJobId} from route`}
                                              onClick={(e) => { e.stopPropagation(); setOpenStopTooltipKey(null); onRemoveStop(routeIndex, numJobId, x.stop_type); }}
                                              className="hidden h-5 shrink-0 items-center gap-1 border-0 bg-transparent p-0 text-[11px] text-[#C9372C] cursor-pointer hover:underline group-hover/jobrow:inline-flex">
                                              <DeleteOutlined className="text-[11px]" />Remove
                                            </button>
                                          )}
                                        </li>;
                                      })}
                                      {people.length > SHOWN && <li className="pt-1.5 text-[12px] text-[#626E67]">+{people.length - SHOWN} more · click the stop to see all</li>}
                                    </ul>}

                                    {/* 5 · Facts: one labelled line each, same icon column, values aligned */}
                                    <dl className="m-0 mt-2.5 grid grid-cols-[16px_84px_1fr] items-center gap-x-2 gap-y-1.5 border-t border-[#E3E8E5] pt-2.5 text-[12px] tabular-nums">
                                      {isJob && (boarding > 0 || alighting > 0) && <>
                                        <Users size={13} className="text-[#626E67]" aria-hidden="true" />
                                        <dt className="text-[#626E67]">{boarding && alighting ? "On / off" : boarding ? "Getting on" : "Getting off"}</dt>
                                        <dd className="m-0 text-[#12211A]">{boarding && alighting ? `${boarding} on · ${alighting} off` : `${boarding || alighting} ${(boarding || alighting) === 1 ? "person" : "people"}`}</dd>
                                      </>}
                                      {isJob && <>
                                        <span aria-hidden="true" className="relative block h-2 w-3.5 bg-[#E3E8E5]">
                                          <span className="absolute inset-y-0 left-0 block" style={{ width: `${seats ? Math.min(100, currentOccupancy / seats * 100) : 0}%`, backgroundColor: overCapacity ? "#C9372C" : routeColor }} />
                                        </span>
                                        <dt className="text-[#626E67]">Then on board</dt>
                                        <dd className={`m-0 ${overCapacity ? "text-[#C9372C]" : "text-[#12211A]"}`}>{currentOccupancy === 0 ? <>Empty{seats ? <span className="text-[#626E67]"> · {seats} seats free</span> : null}</> : <>{currentOccupancy}{seats ? ` of ${seats} seats` : ""}{overCapacity ? " · over capacity" : ""}</>}</dd>
                                      </>}
                                      {!isDepot && (waitsMinutes > 0 || serviceDuration > 0 || waitingAfterStop > 0) && <>
                                        <Clock size={13} className="text-[#626E67]" aria-hidden="true" />
                                        <dt className="text-[#626E67]">At the stop</dt>
                                        <dd className="m-0 text-[#12211A]">{hm(waitsMinutes > 0 ? driverArrival : arrivalTime)} – {hm(departureTime)}
                                          <span className="text-[#626E67]"> · {[waitsMinutes > 0 ? `waits ${waitsMinutes} min` : null, serviceDuration > 0 ? `${Math.round(serviceDuration)} min ${isPickup ? "boarding" : isDropoff ? "getting off" : "service"}` : null, waitingAfterStop > 0 ? `then waits ${Math.round(waitingAfterStop)} min` : null].filter(Boolean).join(", ")}</span>
                                        </dd>
                                      </>}
                                      {stopVehicleName && <>
                                        <Truck size={13} className="text-[#626E67]" aria-hidden="true" />
                                        <dt className="text-[#626E67]">Vehicle</dt>
                                        <dd className="m-0 truncate text-[#12211A]" title={stopVehicleName}>{stopVehicleName}</dd>
                                      </>}
                                    </dl>

                                    {isJob && Boolean(group.rawStops[0]?.job_id) && <p className="m-0 mt-2 text-[11px] text-[#626E67] select-none">Click for details · drag to move (pickup and drop-off move together)</p>}
                                  </div>
                                );

                                  const isGroupPendingDelete =
                                    isJob &&
                                    group.rawStops.length > 0 &&
                                    group.rawStops.every((s: any) => {
                                      const rawId = s.job_id || s.id || s.job?.id;
                                      return rawId && pendingDeletedJobIds.has(Number(rawId));
                                    });

                                  const firstJobId = group.rawStops[0]?.job_id ? Number(group.rawStops[0].job_id) : null;
                                  const isStopSelected = Boolean(
                                    firstJobId &&
                                    selectedStopJobIds.has(firstJobId) &&
                                    selectionSourceRouteIndex === routeIndex
                                  );

                                  // Markers are also reachable by keyboard (Tab, then Enter or Space), not only by mouse.
                                  const stopAriaLabel = isDepot ? `Trip ${stop.stop_type === "depot_end" ? "end" : "start"}, ${hm(arrivalTime)}`
                                    : `Stop ${displayIndex}, ${isPickup ? "pickup" : stop.stop_type === "dropoff" || stop.stop_type === "drop_off" ? "drop-off" : "stop"}, ${hm(arrivalTime)}`;
                                  const handleStopItemKey = (e: React.KeyboardEvent) => {
                                    if (e.key !== "Enter" && e.key !== " ") return;
                                    e.preventDefault();
                                    handleStopItemClick(e as unknown as React.MouseEvent);
                                  };
                                  const handleStopItemClick = (e: React.MouseEvent) => {
                                    // The hover card would otherwise stay open on top of the stop card that opens now.
                                    setOpenStopTooltipKey(null);
                                    if (e.shiftKey || e.metaKey || e.ctrlKey) {
                                      e.stopPropagation();
                                      if (firstJobId) {
                                        if (selectionSourceRouteIndex !== null && selectionSourceRouteIndex !== routeIndex) {
                                          setSelectionSourceRouteIndex(routeIndex);
                                          setSelectedStopJobIds(new Set([firstJobId]));
                                        } else {
                                          setSelectionSourceRouteIndex(routeIndex);
                                          setSelectedStopJobIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(firstJobId)) {
                                              next.delete(firstJobId);
                                              if (next.size === 0) setSelectionSourceRouteIndex(null);
                                            } else {
                                              next.add(firstJobId);
                                            }
                                            return next;
                                          });
                                        }
                                      }
                                      return;
                                    }
                                    if (simultaneousOffset !== undefined) {
                                      const time = Date.parse(stop.arrival_time);
                                      const groups = groupedStops.filter(candidate =>
                                        candidate.representative.arrival_time && Date.parse(candidate.representative.arrival_time) === time
                                      );
                                      setOpenStopTooltipKey(null);
                                      setOverlappingStops({ routeIndex, groups });
                                      return;
                                    }
                                    // The details card opens beside the timeline: close the hover card so it does not sit on top of it.
                                    setOpenStopTooltipKey(null);
                                    onStopClick?.(
                                      group.rawStops[0],
                                      routeIndex,
                                      displayIndex,
                                    );
                                  };
                                  const groupRawIndices = group.rawStops.map((_, i) => group.firstRawIndex + i);
                                  const isDraggingThis = Boolean(
                                    draggedStopInfo &&
                                    draggedStopInfo.routeIndex === routeIndex &&
                                    draggedStopInfo.rawIndices.includes(group.firstRawIndex)
                                  );
                                  const isDropTarget = Boolean(
                                    dragOverStopInfo &&
                                    dragOverStopInfo.routeIndex === routeIndex &&
                                    dragOverStopInfo.targetFirstRawIndex === group.firstRawIndex
                                  );

                                  if (!isWorkerShuttle && isJob && serviceDuration > 0) {
                                    return (
                                      <TimelineTooltip
                                        popupScope="viewport"
                                      key={`stop-${routeIndex}-${groupIndex}`}
                                        title={tooltipContent}
                                        color="#ffffff"
                                        open={openStopTooltipKey === stopTooltipKey}
                                        onOpenChange={(open) =>
                                          setOpenStopTooltipKey(open ? stopTooltipKey : null)
                                        }
                                        overlayStyle={{ maxWidth: "none" }}
                                        overlayInnerStyle={{
                                          maxWidth: "none",
                                          pointerEvents: "auto",
                                          padding: "10px",
                                          borderRadius: "0px",
                                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                                          border: "1px solid #cbd5e1",
                                        }}
                                      >
                                        <div
                                          draggable={!isDepot && Boolean(firstJobId)}
                                          onDragStart={(e) => firstJobId && handleTimelineStopDragStart(e, routeIndex, group.firstRawIndex, groupRawIndices, firstJobId, displayIndex)}
                                          onDragEnd={handleTimelineStopDragEnd}
                                          className={`absolute top-1/2 -translate-y-1/2 h-8 flex items-center justify-center shadow-md z-10 border-2 bg-white transition-[transform,box-shadow,opacity] duration-150 ${
                                            !isDepot ? "cursor-grab active:cursor-grabbing hover:scale-105 hover:shadow-lg" : "cursor-pointer"
                                          } ${
                                            isDraggingThis ? "opacity-30 border-2 border-dashed border-emerald-500 bg-emerald-50/50 scale-95 shadow-inner" : ""
                                          } ${
                                            isDropTarget ? "ring-2 ring-emerald-400 ring-offset-1" : ""
                                          } ${
                                            isStopNew ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg" : ""
                                          } ${
                                            isStopSelected
                                              ? "ring-2 ring-emerald-500 ring-offset-2 scale-105 z-30 shadow-lg"
                                              : isStopNew
                                              ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg"
                                              : ""
                                          } ${
                                            isGroupPendingDelete ? "opacity-35 border-dashed border-red-500 bg-red-100" : ""
                                          }`}
                                          style={{
                                            left: left,
                                            width: Math.max(blockWidth, 28),
                                            boxShadow: isStopEdited && !isStopSelected && !isStopNew && !isDropTarget && !isDraggingThis ? "none" : undefined,
                                            backgroundColor: isGroupPendingDelete ? undefined : blockBgColor,
                                            borderColor: isGroupPendingDelete ? undefined : isStopSelected || isStopNew ? "#059669" : blockBorderColor,
                                            opacity: isDimmed ? 0.4 : isDraggingThis ? 0.3 : 1,
                                          }}
                                          onClick={handleStopItemClick} onKeyDown={handleStopItemKey} role="button" tabIndex={0} aria-label={stopAriaLabel}
                                          title={!isDepot ? "Drag to move booking to another driver / Shift+Click to select" : undefined}
                                        >

                                          {/* Selected Check Badge */}
                                          {isStopSelected && (
                                            <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-[#003220] text-white rounded-none flex items-center justify-center shadow-md z-30 pointer-events-none">
                                              <CheckOutlined className="text-[10px] font-black" />
                                            </div>
                                          )}

                                          {/* Newly Added Job Badge */}
                                          {isStopNew && !isStopSelected && (
                                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-[#003220] text-white text-[8px] font-black uppercase rounded-none shadow-xs flex items-center gap-0.5 tracking-tight animate-bounce z-30 select-none pointer-events-none whitespace-nowrap">
                                              <SparklesIcon size={8} /> NEW
                                            </div>
                                          )}

                                          <span
                                            className="text-xs font-bold"
                                            style={{ color: isGroupPendingDelete ? "#dc2626" : blockTextColor }}
                                          >
                                            {displayIndex}
                                          </span>

                                          {/* Pickup / Drop-off corner badge */}
                                          {isPickup ? (
                                            <div 
                                              className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 bg-white rounded-none border border-emerald-500 shadow-sm z-20"
                                              title="Pickup"
                                            >
                                              <ArrowDown size={12} strokeWidth={3} className="text-emerald-500" />
                                            </div>
                                          ) : isDropoff ? (
                                            <div 
                                              className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 bg-white rounded-none border border-blue-500 shadow-sm z-20"
                                              title="Drop-off"
                                            >
                                              <ArrowUp size={12} strokeWidth={3} className="text-blue-500" />
                                            </div>
                                          ) : null}

                                          {/* Corner edited indicator */}
                                          {!isDepot && isStopEdited && !isStopNew && (
                                            <EditedMark title="Edited by hand" className="absolute -bottom-2 -right-2.5 z-20 pointer-events-none" />
                                          )}
                                        </div>
                                      </TimelineTooltip>
                                    );
                                  }

                                  // Dedicated Arrow-shaped stops for Worker Shuttle template
                                  const isShuttleArrow = isWorkerShuttle && !isDepot && (isPickup || isDropoff);

                                  if (isShuttleArrow) {
                                    return (
                                      <TimelineTooltip
                                        popupScope="viewport"
                                      key={`stop-${routeIndex}-${groupIndex}`}
                                        title={tooltipContent}
                                        color="#ffffff"
                                        open={openStopTooltipKey === stopTooltipKey}
                                        onOpenChange={(open) =>
                                          setOpenStopTooltipKey(open ? stopTooltipKey : null)
                                        }
                                        overlayStyle={{ maxWidth: "none" }}
                                        overlayInnerStyle={{
                                          maxWidth: "none",
                                          pointerEvents: "auto",
                                          padding: "10px",
                                          borderRadius: "0px",
                                          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                                          border: "1px solid #cbd5e1",
                                        }}
                                      >
                                        <TimelineStopArrow
                                          isPickup={isPickup}
                                          isMixed={isMixed}
                                          aria-label={`Stop ${displayIndex}: ${isMixed ? "Drop-off and pickup" : stopTypeLabel}${count > 1 ? `, ${count} jobs` : ""}`}
                                          displayIndex={displayIndex}
                                          jobCount={count}
                                          routeColor={routeColor}
                                          isStopDone={isStopDone}
                                          isStopPartlyDone={isStopPartlyDone}
                                          doneLabel={stopStates.length > 1 ? `${doneCount} of ${stopStates.length} passengers done` : undefined}
                                          jobStatus={jobStatus}
                                          isStopSelected={isStopSelected}
                                          isStopNew={isStopNew}
                                          isStopEdited={isStopEdited}
                                          isGroupPendingDelete={isGroupPendingDelete}
                                          isDraggingThis={isDraggingThis}
                                          isDropTarget={isDropTarget}
                                          isDimmed={isDimmed}
                                          left={left}
                                          onClick={handleStopItemClick} onKeyDown={handleStopItemKey} role="button" tabIndex={0}
                                          draggable={!isDepot && Boolean(firstJobId)}
                                          onDragStart={(e) =>
                                            firstJobId &&
                                            handleTimelineStopDragStart(
                                              e,
                                              routeIndex,
                                              group.firstRawIndex,
                                              groupRawIndices,
                                              firstJobId,
                                              displayIndex
                                            )
                                          }
                                          onDragEnd={handleTimelineStopDragEnd}
                                        />
                                      </TimelineTooltip>
                                    );
                                  }

                                  return (
                                    <TimelineTooltip
                                      popupScope="viewport"
                                      key={`stop-${routeIndex}-${groupIndex}`}
                                      title={tooltipContent}
                                      color="#ffffff"
                                      open={openStopTooltipKey === stopTooltipKey}
                                      onOpenChange={(open) =>
                                        setOpenStopTooltipKey(open ? stopTooltipKey : null)
                                      }
                                      overlayStyle={{ maxWidth: "none" }}
                                      overlayInnerStyle={{
                                        maxWidth: "none",
                                        pointerEvents: "auto",
                                        padding: "10px",
                                        borderRadius: "0px",
                                        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
                                        border: "1px solid #cbd5e1",
                                      }}
                                    >
                                      <div
                                        draggable={Boolean((stop.stop_type === "depot_start" && onMoveTrip) || (!isDepot && firstJobId))}
                                        onDragStart={(e) => stop.stop_type === "depot_start"
                                          ? handleTripDragStart(e, routeIndex, group.firstRawIndex)
                                          : firstJobId && handleTimelineStopDragStart(e, routeIndex, group.firstRawIndex, groupRawIndices, firstJobId, displayIndex)}
                                        onDragEnd={handleTimelineStopDragEnd}
                                        className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center border-2 z-10 transition-[transform,box-shadow,opacity] duration-150 ${
                                          !isDepot || (stop.stop_type === "depot_start" && onMoveTrip) ? "cursor-grab active:cursor-grabbing hover:scale-110" : "cursor-pointer"
                                        } ${
                                          isDraggingThis ? "w-8 h-8 opacity-30 border-2 border-dashed border-emerald-500 bg-emerald-50/50 scale-95 shadow-inner" : "w-8 h-8 bg-white"
                                        } ${
                                          isDropTarget ? "ring-2 ring-emerald-400 ring-offset-1" : ""
                                        } ${
                                          isStopSelected
                                            ? "ring-2 ring-emerald-500 ring-offset-2 scale-105 z-30 shadow-lg"
                                            : isStopNew
                                            ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg"
                                            : ""
                                        } ${
                                          isGroupPendingDelete
                                            ? "opacity-35 border-dashed border-red-500 bg-red-100"
                                            : ""
                                        }`}
                                        style={{
                                          left: left - 14,
                                          boxShadow: isStopEdited && !isStopSelected && !isStopNew && !isDropTarget && !isDraggingThis ? "none" : undefined,
                                          backgroundColor: isGroupPendingDelete
                                            ? undefined
                                            : isDepot && !isDraggingThis
                                              ? routeColor
                                              : "#ffffff",
                                          borderColor: isGroupPendingDelete
                                            ? undefined
                                            : isStopSelected || isStopNew
                                            ? "#059669"
                                            : blockBorderColor,
                                          opacity: isDimmed ? 0.4 : isDraggingThis ? 0.3 : 1,
                                        }}
                                        onClick={handleStopItemClick} onKeyDown={handleStopItemKey} role="button" tabIndex={0} aria-label={stopAriaLabel}
                                        title={stop.stop_type === "depot_start" && onMoveTrip ? "Drag home to move this complete trip to another driver" : !isDepot ? "Drag to move booking to another driver / Shift+Click to select" : undefined}
                                      >

                                        {/* Selected Check Badge */}
                                        {isStopSelected && (
                                          <div className="absolute -top-2.5 -left-2.5 w-5 h-5 bg-emerald-600 text-white rounded-full flex items-center justify-center shadow-md z-30 pointer-events-none">
                                            <CheckOutlined className="text-[10px] font-black" />
                                          </div>
                                        )}

                                        {/* Newly Added Job Badge */}
                                        {isStopNew && !isDepot && !isStopSelected && (
                                          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-emerald-600 text-white text-[8px] font-black uppercase rounded shadow-xs flex items-center gap-0.5 tracking-tight animate-bounce z-30 select-none pointer-events-none whitespace-nowrap">
                                            <SparklesIcon size={8} /> NEW
                                          </div>
                                        )}

                                        {isDepot ? (
                                          depotLabel === "End" ? (
                                            <Flag size={16} color="#ffffff" className="shrink-0" />
                                          ) : (
                                            <Home size={16} color="#ffffff" className="shrink-0" />
                                          )
                                        ) : (
                                          <>
                                            <span
                                              className="text-xs font-bold pointer-events-none"
                                              style={{ color: isGroupPendingDelete ? "#dc2626" : blockTextColor }}
                                            >
                                              {displayIndex}
                                            </span>
                                            {isPickup ? (
                                              <div 
                                                className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 bg-white rounded-full border border-emerald-500 shadow-sm z-20 pointer-events-none"
                                                title="Pickup"
                                              >
                                                <ArrowDown size={12} strokeWidth={3} className="text-emerald-500" />
                                              </div>
                                            ) : isDropoff ? (
                                              <div 
                                                className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 bg-white rounded-full border border-blue-500 shadow-sm z-20 pointer-events-none"
                                                title="Drop-off"
                                              >
                                                <ArrowUp size={12} strokeWidth={3} className="text-blue-500" />
                                              </div>
                                            ) : null}
                                            {!isDepot && isStopEdited && !isStopNew && (
                                              <EditedMark title="Edited by hand" className="absolute -bottom-2 -right-2.5 z-20 pointer-events-none" />
                                            )}
                                          </>
                                        )}
                                      </div>
                                    </TimelineTooltip>
                                  );
                              });
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Reorder Stops Dedicated Drawer/Modal */}
      <ReorderStopsModal
        open={reorderModalRouteIndex !== null}
        routeIndex={reorderModalRouteIndex}
        routeData={
          reorderModalRouteIndex !== null ? routes[reorderModalRouteIndex] : null
        }
        jobs={jobs}
        onClose={() => setReorderModalRouteIndex(null)}
        onSave={async (rIdx, orderedJobIds, orderedStopIndices, orderedStops) => {
          if (onReorderStops) {
            await onReorderStops(rIdx, orderedJobIds, orderedStopIndices, orderedStops);
          }
        }}
        onSaveAndReOptimize={onSaveAndReOptimize}
        onRemoveStop={onRemoveStop}
      />

      {/* Transfer Stops Dedicated Modal */}
      <TransferStopsModal
        open={transferModalRouteIndex !== null}
        sourceRouteIndex={transferModalRouteIndex}
        routes={routes}
        jobs={jobs}
        initialSelectedJobIds={
          selectionSourceRouteIndex === transferModalRouteIndex
            ? Array.from(selectedStopJobIds)
            : []
        }
        onClose={() => {
          setTransferModalRouteIndex(null);
          setSelectedStopJobIds(new Set());
          setSelectionSourceRouteIndex(null);
        }}
        onTransfer={async (srcIdx, tgtIdx, jobIds, pos, reopt, selection) => {
          if (onTransferStops) {
            await onTransferStops(srcIdx, tgtIdx, jobIds, pos, reopt, selection);
          }
          setSelectedStopJobIds(new Set());
          setSelectionSourceRouteIndex(null);
        }}
      />

      <Modal title="Choose a stop" open={overlappingStops !== null} onCancel={() => setOverlappingStops(null)} footer={null}>
        <p className="text-sm text-slate-500 mb-3">These stops share the same scheduled time.</p>
        <div className="flex flex-col gap-2">
          {overlappingStops?.groups.map((group) => {
            const stop = group.representative;
            const label = group.displayStopNumber ? `Stop ${group.displayStopNumber}` : "Depot";
            return (
              <button key={group.firstRawIndex} type="button" className="w-full text-left border border-slate-200 bg-white hover:bg-slate-50 px-3 py-2 cursor-pointer"
                onClick={() => {
                  onStopClick?.(group.rawStops[0], overlappingStops.routeIndex, group.displayStopNumber);
                  setOverlappingStops(null);
                }}>
                <span className="font-semibold">{label}</span>
                <span className="text-slate-500"> · {stop.stop_type === "drop_off" ? "dropoff" : stop.stop_type} · {stop.address_formatted || `Job #${stop.job_id ?? "—"}`}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* Floating Bulk Action Bar when Stops are Selected on Timeline */}
      {selectedStopJobIds.size > 0 && selectionSourceRouteIndex !== null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#003220] text-white px-5 py-3 rounded-none shadow-2xl border border-emerald-800 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-none bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-white">
              {selectedStopJobIds.size} Job(s) Selected
            </span>
            <span className="text-[11px] text-emerald-200">
              from {routes[selectionSourceRouteIndex]?.team_member_name || "the selected driver"}
            </span>
          </div>

          <div className="h-4 w-px bg-emerald-800" />

          <button
            type="button"
            onClick={() => setTransferModalRouteIndex(selectionSourceRouteIndex)}
            className="px-3 py-1.5 bg-white text-[#003220] hover:bg-emerald-50 text-xs font-bold rounded-none border-none cursor-pointer transition-colors shadow-sm flex items-center gap-1.5"
          >
            <SwapOutlined /> Transfer to Driver...
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedStopJobIds(new Set());
              setSelectionSourceRouteIndex(null);
            }}
            className="text-emerald-200 hover:text-white text-xs bg-transparent border-none cursor-pointer outline-none ml-1 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
    </TimelineTooltipProvider>
  );
};

export default TimelineView;
