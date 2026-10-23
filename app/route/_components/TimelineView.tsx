import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { Truck, Calendar, Home, Flag, ArrowUp, ArrowDown, House } from "lucide-react";
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
  LockOutlined,
  MenuOutlined,
  LoadingOutlined,
  CheckOutlined,
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
import TimelineStopArrow from "./TimelineStopArrow";
import TimelineTravelSegment from "./TimelineTravelSegment";
import TimelineTooltip, { TimelineTooltipProvider } from "./TimelineTooltip";
import { getTimelineSegment } from "./timelineSegment.utils";
import { isRedundantLeaderClientStart } from "./leaderRoute.utils";
import { getRouteStopDisplay, type GroupedStop as DisplayStopGroup } from "./stopDisplay.utils";
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
}

const INTERVAL_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 25, label: "25 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
];

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

const DRIVER_COLUMN_WIDTH = 265;

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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [shiftOverrides, setShiftOverrides] = useState<Record<string, DriverShift>>({});
  const [shiftDrag, setShiftDrag] = useState<ShiftDragState | null>(null);
  const shiftDragValueRef = useRef<DriverShift | null>(null);
  const [savingShiftTeamId, setSavingShiftTeamId] = useState<number | null>(null);
  const [confirmingShiftTeamId, setConfirmingShiftTeamId] = useState<number | null>(null);
  const [openStopTooltipKey, setOpenStopTooltipKey] = useState<string | null>(null);

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

  const [isSearchOpen, setIsSearchOpen] = useState(Boolean(driverSearch));

  useEffect(() => {
    if (driverSearch) {
      setIsSearchOpen(true);
    }
  }, [driverSearch]);

  const filteredRoutes = useMemo(() => {
    const indexed = routes.map((route, originalIndex) => ({
      route,
      originalIndex,
    }));
    if (!driverSearch.trim()) return indexed;
    return indexed.filter(({ route, originalIndex }) => {
      const driverName = String(
        route.team_member_name || `Driver ${originalIndex + 1}`
      );
      return isDriverMatch(driverName, driverSearch, exactMatch);
    });
  }, [routes, driverSearch, exactMatch]);

  const driverGroups = useMemo(() => {
    const groupsMap = new Map<string, DriverGroup>();

    filteredRoutes.forEach(({ route, originalIndex }) => {
      const key =
        route.team_member_id != null
          ? `driver-id-${route.team_member_id}`
          : route.team_member_name
          ? `driver-name-${route.team_member_name.toLowerCase().trim()}`
          : `driver-index-${originalIndex}`;

      const driverName =
        route.team_member_name || `Driver ${route.team_member_id || originalIndex + 1}`;

      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          driverKey: key,
          driverName,
          routes: [],
        });
      }

      groupsMap.get(key)!.routes.push({ route, originalIndex });
    });

    return Array.from(groupsMap.values());
  }, [filteredRoutes]);

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
    if (!showDriverWorkingTime) return baseTimeRange;
    let earliest = baseTimeRange.startTime;
    let latest = baseTimeRange.endTime;

    persistedShiftsByTeamId.forEach((shift) => {
      const shiftStart = scheduleDay.add(shift.startMinutes, "minute");
      const shiftEnd = scheduleDay.add(shift.endMinutes, "minute");
      if (shiftStart.subtract(30, "minute").isBefore(earliest)) {
        earliest = shiftStart.subtract(30, "minute");
      }
      if (shiftEnd.add(60, "minute").isAfter(latest)) {
        latest = shiftEnd.add(60, "minute");
      }
    });

    if (!shiftDrag) {
      const firstDay = baseTimeRange.startTime.startOf("day").subtract(1, "day");
      const lastDay = baseTimeRange.endTime.startOf("day").add(1, "day");
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

    return { startTime: earliest, endTime: latest };
  }, [
    baseTimeRange,
    persistedShiftsByTeamId,
    scheduleDay,
    shiftDrag,
    shiftOverrides,
    showDriverWorkingTime,
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

  // Dynamic pixels per minute based on interval - smaller intervals get more spread
  const pixelsPerMinute = getPixelsPerMinute(intervalMinutes);

  const totalDurationMinutes = endTime.diff(startTime, "minute");
  const timelineWidth = totalDurationMinutes * pixelsPerMinute;
  const timeMarkers = useMemo(
    () =>
      generateTimeMarkers(startTime, endTime, intervalMinutes, pixelsPerMinute),
    [startTime, endTime, intervalMinutes, pixelsPerMinute],
  );

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
        title: "Confirm Working Hours Change",
        content:
          driverName + " working hours on " + dayKey +
          " will change from " +
          formatMinutesAsTime(previousShift.startMinutes) + "–" +
          formatMinutesAsTime(previousShift.endMinutes) + " to " +
          formatMinutesAsTime(nextShift.startMinutes) + "–" +
          formatMinutesAsTime(nextShift.endMinutes) + ".",
        okText: "Update Working Hours",
        cancelText: "Keep Existing Hours",
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
  }, [selectedMarkerId, routes, startTime, pixelsPerMinute]);

  const getRouteMenuItems = (routeIndex: number): MenuProps["items"] => [
    ...(isWorkerShuttle && onSwapVehicles ? [{
      key: "swap-vehicles",
      icon: <SwapOutlined />,
      label: "Swap vehicles...",
      onClick: () => onSwapVehicles(routeIndex),
    }] : []),
    ...(isWorkerShuttle && onChangeVehicle ? [{
      key: "change-vehicle",
      icon: <CarOutlined />,
      label: "Change vehicle...",
      onClick: () => onChangeVehicle(routeIndex),
    }] : []),
    {
      key: "add-stop",
      icon: <PlusOutlined />,
      label: "Add Job",
      onClick: () => onAddStop?.(routeIndex),
    },
    {
      key: "transfer-stops",
      icon: <SwapOutlined />,
      label: "Transfer Stops to Driver...",
      onClick: () => {
        setSelectionSourceRouteIndex(routeIndex);
        setTransferModalRouteIndex(routeIndex);
      },
    },
    {
      key: "reorder-stops",
      icon: <MenuOutlined />,
      label: "Reorder Stops (Drag & Drop)",
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
      label: "Reoptimize Route",
      onClick: () => onReOptimize?.(routeIndex),
    },
  ];

  return (
    <TimelineTooltipProvider leftInset={DRIVER_COLUMN_WIDTH} topInset={HEADER_HEIGHT}>
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
      <div
        className="flex-1 overflow-auto relative custom-scrollbar"
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
              className="sticky left-0 top-0 z-50 bg-gray-50 border-r border-gray-200 px-3 flex items-center justify-between font-medium text-gray-500 shadow-sm"
              style={{ width: DRIVER_COLUMN_WIDTH, minWidth: DRIVER_COLUMN_WIDTH }}
            >
              {isSearchOpen ? (
                <div className="flex items-center gap-1 flex-1 min-w-0 mr-1.5">
                  <Input
                    size="small"
                    placeholder="Search driver..."
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    autoFocus
                    prefix={<SearchOutlined className="text-gray-400 text-xs" />}
                    suffix={
                      <div className="flex items-center gap-1 shrink-0">
                        <Tooltip
                          title={
                            exactMatch
                              ? "Exact match: ON (click to match partial)"
                              : "Exact match: OFF (click to match exact word)"
                          }
                        >
                          <button
                            type="button"
                            onClick={() => setExactMatch(!exactMatch)}
                            className={`px-1.5 py-0.5 text-[10px] font-semibold rounded transition-all cursor-pointer border-none outline-none select-none ${
                              exactMatch
                                ? "bg-[#003220] text-white shadow-xs"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            }`}
                          >
                            Exact
                          </button>
                        </Tooltip>
                        <button
                          type="button"
                          onClick={() => {
                            setDriverSearch("");
                            setIsSearchOpen(false);
                          }}
                          className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-0.5 transition-colors cursor-pointer border-none outline-none flex items-center justify-center"
                          title="Clear search"
                        >
                          <CloseOutlined className="text-[11px]" />
                        </button>
                      </div>
                    }
                    className="text-xs w-full rounded-md border-gray-300 hover:border-emerald-600 focus:border-emerald-700"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0 mr-1.5">
                  <span className="text-xs font-semibold text-gray-600 shrink-0">
                    Driver
                  </span>
                  <Tooltip title="Search driver">
                    <button
                      type="button"
                      className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200/60 transition-colors flex items-center justify-center border-none bg-transparent cursor-pointer"
                      onClick={() => setIsSearchOpen(true)}
                    >
                      <SearchOutlined className="text-xs" />
                    </button>
                  </Tooltip>
                  {driverSearch && (
                    <div
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-pointer flex items-center gap-1 truncate max-w-[120px] transition-colors hover:bg-emerald-100"
                      onClick={() => setIsSearchOpen(true)}
                      title={`Filtered by: "${driverSearch}"${
                        exactMatch ? " (Exact match)" : ""
                      }`}
                    >
                      <span className="truncate">{driverSearch}</span>
                      {exactMatch && (
                        <span className="text-[8px] font-bold bg-[#003220] text-white px-1 rounded-full shrink-0">
                          Exact
                        </span>
                      )}
                      <CloseOutlined
                        className="text-[9px] text-emerald-600 hover:text-emerald-900 shrink-0 ml-0.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDriverSearch("");
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              <Select
                value={intervalMinutes}
                onChange={setIntervalMinutes}
                options={INTERVAL_OPTIONS}
                size="small"
                style={{ width: 78 }}
                className="text-xs shrink-0"
              />
            </div>

            {/* Time Axis */}
            <div className="relative" style={{ width: timelineWidth }}>
              {timeMarkers.map((marker, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 select-none transition-colors border-l pl-1 text-xs flex items-center ${
                    marker.isNewDay
                      ? "border-l-2 border-dashed border-[#003220] font-bold text-[#003220] z-10"
                      : "border-gray-200 text-gray-400"
                  }`}
                  style={{ left: marker.position, height: "100%" }}
                >
                  {marker.isNewDay ? (
                    <TimelineTooltip
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
                    >
                      <div className="flex items-center gap-1 whitespace-nowrap bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-300 text-[#003220] shadow-2xs cursor-pointer hover:bg-emerald-100 transition-colors">
                        <Calendar size={11} className="shrink-0 text-[#003220]" />
                        <span className="text-[10px] font-black uppercase tracking-wide">{marker.dateLabel}</span>
                        <span className="text-[11px] font-bold ml-0.5">{marker.label}</span>
                      </div>
                    </TimelineTooltip>
                  ) : (
                    <TimelineTooltip
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
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 bg-slate-100 px-1 py-0.2 rounded border border-slate-200 mr-0.5">
                            <Calendar size={10} className="text-slate-500" />
                          </span>
                        ) : null}
                        <span>{marker.label}</span>
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
                      className="absolute top-0 bottom-0 border-l-2 border-dashed border-[#003220] z-0 pointer-events-auto cursor-pointer hover:border-emerald-600 hover:opacity-100 transition-all opacity-85"
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
            </div>

            {driverGroups.length === 0 ? (
              <div
                className="p-8 text-center text-gray-400 text-sm flex items-center justify-center font-medium"
                style={{ minHeight: 120 }}
              >
                No drivers found matching "{driverSearch}"
              </div>
            ) : (
              driverGroups.map((driverGroup) => {
                const primaryRoute = driverGroup.routes[0].route;
                const primaryIndex = driverGroup.routes[0].originalIndex;
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
                const displayedAvailabilityWindows: DriverAvailabilityWindow[] =
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
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Sticky Driver Info */}
                    <div
                      className="sticky left-0 z-20 bg-white border-r border-gray-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] cursor-pointer"
                      style={{
                        width: DRIVER_COLUMN_WIDTH,
                        minWidth: DRIVER_COLUMN_WIDTH,
                      }}
                      onClick={() => onFocusRoute?.(primaryIndex)}
                      title={
                        isGroupFocused
                          ? "Showing this driver's route — press Esc to show all"
                          : "Show only this driver's route"
                      }
                    >
                      <div
                        className="h-full px-3 flex items-center gap-2.5 transition-opacity"
                        style={{ opacity: isDimmed ? 0.4 : 1 }}
                      >
                        <Avatar
                          icon={<UserOutlined />}
                          className="bg-gray-100 text-gray-500 shrink-0"
                          size="default"
                        />
                        <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold truncate text-gray-800 text-xs">
                              {driverGroup.driverName}
                            </span>
                            {reorderingRouteIndex === primaryIndex && (
                              <span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200 shrink-0 animate-pulse">
                                <LoadingOutlined className="text-[9px] animate-spin" /> Recalculating
                              </span>
                            )}
                          </div>
                          {/* Vehicle is shown per-route on the timeline bar, not here */}
                          <span className="text-[11px] text-gray-400 truncate">
                            {Math.round(totalDistanceMeters / 1000)} km
                            {durationStr ? ` • ${durationStr}` : ""}
                            {` • ${totalGroupedStopsCount} stop${
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
                          <div
                            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 cursor-pointer transition-colors shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreOutlined className="text-gray-500 text-base" />
                          </div>
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
                                    "absolute top-2 bottom-2 border shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-[left,width,background-color,border-color] duration-75 " +
                                    (isDraggingShift && shiftDrag?.dayKey === window.dayKey
                                      ? "border-emerald-300/80 bg-emerald-100/65"
                                      : "border-emerald-200/80 bg-emerald-50/50")
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
                                        <span className="absolute left-1/2 top-1/2 flex h-5 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-emerald-700 bg-white text-emerald-800 shadow-sm">
                                          <GripVertical size={10} />
                                        </span>
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
                                        <span className="absolute left-1/2 top-1/2 flex h-5 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-emerald-700 bg-white text-emerald-800 shadow-sm">
                                          <GripVertical size={10} />
                                        </span>
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
                              <span className="absolute left-1/2 top-1/2 flex h-5 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-emerald-700 bg-white text-emerald-800 shadow-sm">
                                <GripVertical size={10} />
                              </span>
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
                              <span className="absolute left-1/2 top-1/2 flex h-5 w-3 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-emerald-700 bg-white text-emerald-800 shadow-sm">
                                <GripVertical size={10} />
                              </span>
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
                                top: ROW_HEIGHT - 3,
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
                            style={{ height: ROW_HEIGHT, pointerEvents: "none" }}
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

                              if (width <= 0) return null;

                              const segment = getTimelineSegment(stop, nextStop);
                              const timeMin = Math.round(segment.elapsedSeconds / 60);

                              // Do not draw a connection line between shifts after depot_end
                              if (stop.stop_type === "depot_end") return null;

                              // A long interval can include valid travel/waiting. Only an
                              // explicit depot_end above separates shifts, not its length.
                              const isWaiting = segment.isWaiting && (segment.serviceSeconds ?? 0) === 0;

                              // Do not draw waiting time or zero-distance lines after the route is already completed
                              const isAfterRouteCompleted =
                                (lastJobStopIndex !== -1 && index >= lastJobStopIndex) ||
                                (nextStop.stop_type === "depot" && index === routeStops.length - 2);

                              if (isWaiting && isAfterRouteCompleted) return null;

                              if (segment.isWorking) {
                                return (
                                  <TimelineTooltip key={`work-${routeIndex}-${index}`} title={`Working at client · ${timeMin} min · vehicle stays with the team leader`}>
                                    <div
                                      className="absolute top-1/2 border-y border-slate-300 bg-slate-100 cursor-pointer"
                                      style={{ left: startPos, width, height: 8, transform: "translateY(-50%)", opacity: isDimmed ? 0.15 : 0.85, pointerEvents: draggedStopInfo ? "none" : undefined }}
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
                                      className="absolute top-1/2 -translate-y-1/2 h-6 border border-gray-300 cursor-pointer hover:opacity-100 transition-opacity"
                                      style={{
                                        left: idleStartPos,
                                        width: idleWidth,
                                        backgroundColor: "#f5f5f5",
                                        opacity: isDimmed ? 0.3 : 0.6,
                                        pointerEvents: draggedStopInfo ? "none" : undefined,
                                        backgroundImage: `repeating-linear-gradient(
                                            45deg,
                                            transparent,
                                            transparent 3px,
                                            rgba(0,0,0,0.08) 3px,
                                            rgba(0,0,0,0.08) 6px
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
                                const count = group.candidateCount;
                                
                                const fallbackArrivalTime = groupIndex > 0
                                  ? dayjs(groupedStops[groupIndex - 1].representative.arrival_time || startTime.toISOString()).add(30, 'minute')
                                  : startTime;
                                  
                                const arrivalTime = stop.arrival_time
                                  ? dayjs(stop.arrival_time)
                                  : fallbackArrivalTime;
                                
                                const serviceDuration =
                                  stop.service_duration_minutes || 0;
                                
                                const departureTime = arrivalTime.add(
                                  serviceDuration,
                                  "minute",
                                );

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

                                let blockBgColor = routeColor;
                                let blockBorderColor = routeColor;
                                let blockTextColor = "white";

                                if (isJob) {
                                  const isStopDone = isPickup
                                    ? jobStatus === "in_transit" ||
                                      jobStatus === "completed" ||
                                      jobStatus === "success"
                                    : jobStatus === "completed" ||
                                      jobStatus === "success";

                                  if (isStopDone) {
                                    blockBgColor = routeColor;
                                    blockBorderColor = routeColor;
                                    blockTextColor = "white";
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
                                  group.candidateCount -
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

                                const stopTooltipKey = `${routeIndex}-${groupIndex}`;
                                const tooltipContent = (
                                  <div className="pointer-events-auto select-text p-1 space-y-2.5 w-[310px] text-slate-800">
                                    {/* Header Badge Row */}
                                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 select-none">
                                      {isPickup ? (
                                        <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-400">
                                          <UserAddOutlined className="text-emerald-700 font-bold" />
                                          PICKUP
                                        </span>
                                      ) : isDropoff ? (
                                        <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-400">
                                          <UserDeleteOutlined className="text-blue-700 font-bold" />
                                          DROP-OFF
                                        </span>
                                      ) : isDepot ? (
                                        <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-400">
                                          {stop.stop_type === "depot_end" ? (
                                            <Flag size={13} className="text-amber-700" />
                                          ) : (
                                            <House size={13} className="text-amber-700" />
                                          )}
                                          DEPOT {stop.stop_type === "depot_start" ? "(START)" : stop.stop_type === "depot_end" ? "(END)" : ""}
                                        </span>
                                      ) : null}

                                      {stopLeg && (
                                        <span
                                          className="inline-flex shrink-0 items-center border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-extrabold text-slate-700"
                                          aria-label={`Leg: ${stopLeg}`}
                                        >
                                          {stopLeg}
                                        </span>
                                      )}

                                      {stopVehicleName && (
                                        <span
                                          className="ml-auto inline-flex min-w-0 items-center gap-1 text-[10.5px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 border border-slate-300 rounded"
                                          title={`Vehicle: ${stopVehicleName}${vehicleCapacity ? ` (${vehicleCapacity} seats)` : ""}`}
                                        >
                                          <Truck size={12} className="text-slate-600 shrink-0" />
                                          <span className="truncate max-w-[110px]">{stopVehicleName}</span>
                                          {vehicleCapacity ? (
                                            <span className="text-[9.5px] font-extrabold text-slate-500 bg-white px-1 rounded border border-slate-200 shrink-0 ml-0.5">
                                              {vehicleCapacity}s
                                            </span>
                                          ) : null}
                                        </span>
                                      )}
                                    </div>

                                    {/* Highlights Row for New / Edited Stop */}
                                    {(isStopNew || isStopEdited) && (
                                      <div className="flex items-center gap-1.5 py-0.5 select-none">
                                        {isStopNew && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-400 px-2 py-0.5 rounded shadow-xs animate-pulse">
                                            <SparklesIcon size={11} className="text-emerald-700" />
                                            NEWLY ADDED STOP
                                          </span>
                                        )}
                                        {isStopEdited && (
                                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded shadow-xs">
                                            <ClockCircleOutlined className="text-purple-600" />
                                            EDITED STOP
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Location / Address Row */}
                                    <div className="flex items-start gap-2.5 py-0.5">
                                      {isDepot ? (
                                        stop.stop_type === "depot_end" ? (
                                          <Flag className="text-amber-600 text-base shrink-0 mt-0.5" />
                                        ) : (
                                          <House className="text-amber-600 text-base shrink-0 mt-0.5" />
                                        )
                                      ) : isPickup ? (
                                        <EnvironmentOutlined className="text-emerald-600 text-base shrink-0 mt-0.5" />
                                      ) : (
                                        <EnvironmentOutlined className="text-blue-600 text-base shrink-0 mt-0.5" />
                                      )}
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 select-none">
                                            {isDepot
                                              ? stop.stop_type === "depot_start"
                                                ? "Driver Start Location"
                                                : stop.stop_type === "depot_end"
                                                  ? "Driver End Location"
                                                  : "Depot Location"
                                              : isPickup
                                                ? "Pickup Address"
                                                : isDropoff
                                                  ? "Drop-off Address"
                                                  : "Address"}
                                          </span>
                                          {formattedAddr && (
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                navigator.clipboard.writeText(formattedAddr);
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
                                        <span
                                          className="text-xs font-bold text-slate-900 leading-snug select-text cursor-text break-words"
                                          title={formattedAddr}
                                        >
                                          {formattedAddr}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Passengers / Job List */}
                                    {isJob && group.rawStops.length > 0 && (
                                      <div className="pt-2 border-t border-slate-200">
                                        <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                                          <div className="flex items-center gap-1.5">
                                            <UserOutlined className="text-slate-400" /> Passenger / Job(s)
                                          </div>
                                          {count > 1 && (
                                            <span className="inline-flex items-center justify-center text-[10px] font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 border border-slate-300 rounded select-none">
                                              ×{count} candidates
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs max-h-36 overflow-y-auto space-y-1.5 custom-scrollbar pr-0.5">
                                          {group.rawStops.map((s: any, i: number) => {
                                            const candName = getCandidateName(s);
                                            const rawJobId = s.job_id || s.id || s.job?.id;
                                            const numJobId = rawJobId ? Number(rawJobId) : null;
                                            const isPendingDelete = numJobId ? pendingDeletedJobIds.has(numJobId) : false;
                                            const isFinished = s.status === "COMPLETED" || s.status === "FAILED" || s.status === "completed" || s.status === "failed";

                                            if (isPendingDelete) {
                                              return (
                                                <div
                                                  key={i}
                                                  className="bg-red-50 text-red-800 border border-dashed border-red-300 px-2 py-1.5 transition-all flex items-center justify-between text-xs font-semibold overflow-hidden opacity-75"
                                                >
                                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    <FileTextOutlined className="text-red-500 text-xs shrink-0" />
                                                    <span className="font-bold text-red-900 shrink-0">#{s.job_id || numJobId}</span>
                                                    {candName && (
                                                      <span className="text-red-700 font-medium truncate shrink" title={candName}>({candName})</span>
                                                    )}
                                                    <span className="ml-1 text-[10px] font-extrabold uppercase bg-red-100 text-red-700 px-1 py-0.2 border border-red-300 shrink-0">
                                                      Pending Delete
                                                    </span>
                                                  </div>
                                                  {onUndoDeleteJob && numJobId && (
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        onUndoDeleteJob(numJobId);
                                                      }}
                                                      className="ml-2 text-xs font-bold text-red-700 hover:text-red-900 hover:bg-red-100 px-1.5 py-0.5 border border-red-300 transition-colors flex items-center gap-1 shrink-0 cursor-pointer bg-white"
                                                      title="Undo staged deletion"
                                                    >
                                                      <UndoOutlined /> Undo
                                                    </button>
                                                  )}
                                                </div>
                                              );
                                            }

                                            return (
                                              <div
                                                key={i}
                                                className="cursor-pointer bg-slate-50 hover:bg-emerald-50 text-slate-800 hover:text-emerald-900 border border-slate-200 hover:border-emerald-400 px-2 py-1.5 transition-all flex items-center justify-between text-xs font-semibold overflow-hidden group/jobrow"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onStopClick?.(s, routeIndex, displayIndex);
                                                }}
                                              >
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                  <FileTextOutlined className="text-slate-500 text-xs shrink-0" />
                                                  <span className="font-bold text-slate-900 shrink-0">#{s.job_id || numJobId}</span>
                                                  {candName && (
                                                    <span className="text-slate-600 font-medium truncate shrink" title={candName}>({candName})</span>
                                                  )}
                                                  {Boolean(s.is_edited || s.time_edited) && (
                                                    <span className="ml-1 text-[10px] font-bold uppercase bg-purple-100 text-purple-800 px-1 py-0.2 border border-purple-300 shrink-0 flex items-center gap-0.5">
                                                      <ClockCircleOutlined className="text-[9px]" /> Edited
                                                    </span>
                                                  )}
                                                  {isFinished && (
                                                    <span className="ml-1 text-[10px] font-extrabold uppercase bg-slate-200 text-slate-700 px-1 py-0.2 border border-slate-300 shrink-0 flex items-center gap-1">
                                                      <LockOutlined className="text-[10px]" /> Finished
                                                    </span>
                                                  )}
                                                </div>
                                                {!isFinished && onRemoveStop && numJobId && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setOpenStopTooltipKey(null);
                                                      onRemoveStop(routeIndex, numJobId, s.stop_type);
                                                    }}
                                                    className="ml-2 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors border-none bg-transparent flex items-center shrink-0 cursor-pointer opacity-80 group-hover/jobrow:opacity-100"
                                                    title="Remove job from route"
                                                  >
                                                    <DeleteOutlined className="text-xs" />
                                                  </button>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}

                                    {/* Footer Info (Occupancy & ETA) */}
                                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                                      {isJob && (
                                        <div className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 text-[11px] text-center font-medium min-w-0">
                                          <CarOutlined className="text-emerald-700 text-xs shrink-0" />
                                          <span className="truncate">
                                            Occupancy: <strong className="text-emerald-800 font-bold">{currentOccupancy}</strong>
                                            {vehicleCapacity ? ` / ${vehicleCapacity}` : ""}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-50 border border-slate-200 text-slate-900 text-[11px] text-center font-medium min-w-0">
                                        <ClockCircleOutlined className="text-slate-600 text-xs shrink-0" />
                                        <span className="truncate">
                                          {isDepot && (stop.stop_type === "depot_start" || depotLabel === "Start")
                                            ? "Start Time: "
                                            : isDepot && (stop.stop_type === "depot_end" || depotLabel === "End")
                                              ? "End Time: "
                                              : "ETA: "}
                                          <strong className="text-slate-900 font-extrabold">{arrivalTime.isValid() ? arrivalTime.format("hh:mm A") : "--:--"}</strong>
                                          {arrivalTime.isValid() && arrivalTime.format("YYYY-MM-DD") !== startTime.format("YYYY-MM-DD") && (
                                            <span className="text-[10px] text-slate-500 font-semibold ml-1">
                                              ({arrivalTime.format("ddd, MMM D")})
                                            </span>
                                          )}
                                        </span>
                                      </div>
                                    </div>

                                    {serviceDuration > 0 && (
                                      <div className="text-[11px] text-slate-500 text-center pt-1 space-y-0.5 border-t border-slate-100">
                                        <div>Departure: {departureTime.isValid() ? departureTime.format("hh:mm A") : "--:--"}</div>
                                        <div>Service Duration: {serviceDuration} min</div>
                                      </div>
                                    )}
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

                                  const handleStopItemClick = (e: React.MouseEvent) => {
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
                                            isStopNew ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg" : isStopEdited ? "ring-2 ring-purple-500 ring-offset-1 shadow-lg" : ""
                                          } ${
                                            isStopSelected
                                              ? "ring-2 ring-emerald-500 ring-offset-2 scale-105 z-30 shadow-lg"
                                              : isStopNew
                                              ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg"
                                              : isStopEdited
                                              ? "ring-2 ring-purple-500 ring-offset-1 shadow-lg"
                                              : ""
                                          } ${
                                            isGroupPendingDelete ? "opacity-35 border-dashed border-red-500 bg-red-100" : ""
                                          }`}
                                          style={{
                                            left: left,
                                            width: Math.max(blockWidth, 28),
                                            backgroundColor: isGroupPendingDelete ? undefined : blockBgColor,
                                            borderColor: isGroupPendingDelete ? undefined : isStopSelected || isStopNew ? "#059669" : isStopEdited ? "#9333ea" : blockBorderColor,
                                            opacity: isDimmed ? 0.4 : isDraggingThis ? 0.3 : 1,
                                          }}
                                          onClick={handleStopItemClick}
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

                                          {/* Edited Job Badge */}
                                          {!isStopNew && isStopEdited && !isStopSelected && (
                                            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-purple-600 text-white text-[8px] font-black uppercase rounded-none shadow-xs flex items-center gap-0.5 tracking-tight z-30 select-none pointer-events-none whitespace-nowrap">
                                              <ClockCircleOutlined className="text-[8px]" /> EDITED
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
                                            <div 
                                              className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 bg-purple-600 text-white rounded-none border border-white shadow-xs z-20"
                                              title="Job edited"
                                            >
                                              <ClockCircleOutlined className="text-[7.5px]" />
                                            </div>
                                          )}
                                        </div>
                                      </TimelineTooltip>
                                    );
                                  }

                                  // Dedicated Arrow-shaped stops for Worker Shuttle template
                                  const isShuttleArrow = isWorkerShuttle && !isDepot && (isPickup || isDropoff);

                                  if (isShuttleArrow) {
                                    const isStopDone = isPickup
                                      ? jobStatus === "in_transit" ||
                                        jobStatus === "completed" ||
                                        jobStatus === "success"
                                      : jobStatus === "completed" ||
                                        jobStatus === "success";

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
                                          displayIndex={displayIndex}
                                          routeColor={routeColor}
                                          isStopDone={isStopDone}
                                          jobStatus={jobStatus}
                                          isStopSelected={isStopSelected}
                                          isStopNew={isStopNew}
                                          isStopEdited={isStopEdited}
                                          isGroupPendingDelete={isGroupPendingDelete}
                                          isDraggingThis={isDraggingThis}
                                          isDropTarget={isDropTarget}
                                          isDimmed={isDimmed}
                                          left={left}
                                          onClick={handleStopItemClick}
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
                                          title="Drag to move this booking's pickup and drop-off together at their scheduled times"
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
                                        className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center border-2 shadow-md z-10 transition-[transform,box-shadow,opacity] duration-150 ${
                                          !isDepot || (stop.stop_type === "depot_start" && onMoveTrip) ? "cursor-grab active:cursor-grabbing hover:scale-110 hover:shadow-lg" : "cursor-pointer"
                                        } ${
                                          isDraggingThis ? "w-8 h-8 opacity-30 border-2 border-dashed border-emerald-500 bg-emerald-50/50 scale-95 shadow-inner" : "w-8 h-8 bg-white"
                                        } ${
                                          isDropTarget ? "ring-2 ring-emerald-400 ring-offset-1" : ""
                                        } ${
                                          isStopSelected
                                            ? "ring-2 ring-emerald-500 ring-offset-2 scale-105 z-30 shadow-lg"
                                            : isStopNew
                                            ? "ring-2 ring-emerald-500 ring-offset-1 shadow-lg"
                                            : isStopEdited
                                            ? "ring-2 ring-purple-500 ring-offset-1 shadow-lg"
                                            : ""
                                        } ${
                                          isGroupPendingDelete
                                            ? "opacity-35 border-dashed border-red-500 bg-red-100"
                                            : ""
                                        }`}
                                        style={{
                                          left: left - 14,
                                          backgroundColor: isGroupPendingDelete
                                            ? undefined
                                            : "#ffffff",
                                          borderColor: isGroupPendingDelete
                                            ? undefined
                                            : isStopSelected || isStopNew
                                            ? "#059669"
                                            : isStopEdited
                                            ? "#9333ea"
                                            : blockBorderColor,
                                          opacity: isDimmed ? 0.4 : isDraggingThis ? 0.3 : 1,
                                        }}
                                        onClick={handleStopItemClick}
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

                                        {/* Edited Job Badge */}
                                        {!isStopNew && isStopEdited && !isDepot && !isStopSelected && (
                                          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-1.5 py-0.2 bg-purple-600 text-white text-[8px] font-black uppercase rounded shadow-xs flex items-center gap-0.5 tracking-tight z-30 select-none pointer-events-none whitespace-nowrap">
                                            <ClockCircleOutlined className="text-[8px]" /> EDITED
                                          </div>
                                        )}

                                        {isDepot ? (
                                          depotLabel === "End" ? (
                                            <Flag size={16} color={routeColor} className="shrink-0" />
                                          ) : (
                                            <Home size={16} color={routeColor} className="shrink-0" />
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
                                              <div 
                                                className="absolute -bottom-1 -right-1 flex items-center justify-center w-4 h-4 bg-purple-600 text-white rounded-full border border-white shadow-xs z-20"
                                                title="Job edited"
                                              >
                                                <ClockCircleOutlined className="text-[7.5px]" />
                                              </div>
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

      {/* Floating Bulk Action Bar when Stops are Selected on Timeline */}
      {selectedStopJobIds.size > 0 && selectionSourceRouteIndex !== null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#003220] text-white px-5 py-3 rounded-none shadow-2xl border border-emerald-800 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-none bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold text-white">
              {selectedStopJobIds.size} Job(s) Selected
            </span>
            <span className="text-[11px] text-emerald-200">
              from {routes[selectionSourceRouteIndex]?.team_member_name || `Driver #${selectionSourceRouteIndex + 1}`}
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
