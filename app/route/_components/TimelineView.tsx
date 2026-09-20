import React, { useMemo, useRef, useState, useEffect } from "react";
import { Truck, Calendar } from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import type { Vehicle } from "@/types/vehicle.type";
import { Avatar, Tooltip, Select, Dropdown, Input, message } from "antd";
import type { MenuProps } from "antd";
import { isDriverMatch } from "./optimizationView.utils";
import {
  UserOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  HomeFilled,
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
} from "@ant-design/icons";
import {
  calculateTimeRange,
  generateTimeMarkers,
  getPosition,
  getPixelsPerMinute,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  getRouteColor,
} from "@/utils/timeline.utils";

// ─── Grouped stop type ────────────────────────────────────────────────────────
/** A stop as rendered on the timeline — may represent 1 or more raw stops at
 * the same location / stop_type. `rawStops` keeps the original items so the
 * click handler can still target individual jobs. */
interface GroupedStop {
  /** Representative stop used for position / colour / tooltip. */
  representative: any;
  /** All raw stops collapsed into this group. */
  rawStops: any[];
  /** How many individual candidates share this location + type. */
  candidateCount: number;
  /** Index of the FIRST raw stop in the original stops array (used for click). */
  firstRawIndex: number;
}

/**
 * Collapse consecutive stops that share the same location and stop_type into
 * a single GroupedStop.  This reduces visual clutter for shuttle routes where
 * multiple workers are picked up / dropped off at the same coordinates.
 *
 * Two stops are merged when ALL of the following match:
 *   • stop_type
 *   • latitude  (rounded to 4 dp ≈ 11 m)
 *   • longitude (rounded to 4 dp ≈ 11 m)
 */
function groupStopsByLocation(stops: any[]): GroupedStop[] {
  if (!stops || stops.length === 0) return [];

  const grouped: GroupedStop[] = [];

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const lat  = typeof stop.latitude  === "number" ? stop.latitude.toFixed(4)  : null;
    const lon  = typeof stop.longitude === "number" ? stop.longitude.toFixed(4) : null;
    const type = stop.stop_type;

    // Check if this stop can be merged with the previous group
    const prev = grouped[grouped.length - 1];
    if (
      prev &&
      lat !== null &&
      lon !== null &&
      lat === (typeof prev.representative.latitude  === "number" ? prev.representative.latitude.toFixed(4)  : null) &&
      lon === (typeof prev.representative.longitude === "number" ? prev.representative.longitude.toFixed(4) : null) &&
      type === prev.representative.stop_type
    ) {
      // Merge into the existing group
      prev.rawStops.push(stop);
      prev.candidateCount++;
    } else {
      // Start a new group
      grouped.push({
        representative: stop,
        rawStops: [stop],
        candidateCount: 1,
        firstRawIndex: i,
      });
    }
  }

  return grouped;
}

interface TimelineViewProps {
  routes: any[];
  jobs?: Job[];
  /** Vehicle list from vehicle store — used to show vehicle info per route. */
  vehicles?: Vehicle[];
  /** Selected marker ID `${routeIndex}-${stopIndex}` from map click or stop selection */
  selectedMarkerId?: string | number | null;
  onStopClick?: (stop: any, routeIndex: number, stopIndex: number) => void;
  onAddStop?: (routeIndex: number) => void;
  onSwapDriver?: (routeIndex: number) => void;
  onReverseRoute?: (routeIndex: number) => void;
  onReOptimize?: (routeIndex: number) => void;
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
  vehicles = [],
  selectedMarkerId = null,
  onStopClick,
  onAddStop,
  onSwapDriver,
  onReverseRoute,
  onReOptimize,
  focusedRouteIndex = null,
  onFocusRoute,
  driverSearch: externalDriverSearch,
  onDriverSearchChange,
  exactMatch: externalExactMatch,
  onExactMatchChange,
  pendingDeletedJobIds = new Set<number>(),
  onDeleteJob,
  onUndoDeleteJob,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [intervalMinutes, setIntervalMinutes] = useState(30);

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

  const { startTime, endTime } = useMemo(
    () => calculateTimeRange(routes),
    [routes],
  );

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
    {
      key: "add-stop",
      icon: <PlusOutlined />,
      label: "Add Job",
      onClick: () => onAddStop?.(routeIndex),
    },
    {
      key: "swap-driver",
      icon: <SwapOutlined />,
      label: "Swap Route with Driver",
      onClick: () => onSwapDriver?.(routeIndex),
    },
    { type: "divider" as const },
    {
      key: "re-optimize",
      icon: <ThunderboltOutlined />,
      label: "Reoptimize Route",
      onClick: () => onReOptimize?.(routeIndex),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-white select-none">
      <div
        className="flex-1 overflow-auto relative custom-scrollbar"
        ref={containerRef}
      >
        <div className="min-w-full inline-block">
          {/* Header Row */}
          <div
            className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 flex"
            style={{ height: HEADER_HEIGHT, minWidth: "100%" }}
          >
            {/* Sticky Driver Column Header */}
            <div
              className="sticky left-0 z-30 bg-gray-50 border-r border-gray-200 px-3 flex items-center justify-between font-medium text-gray-500 shadow-sm"
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
                  className={`absolute top-0 bottom-0 select-none transition-colors border-l pl-1 text-xs ${
                    marker.isNewDay
                      ? "border-l-2 border-dashed border-[#003220] font-bold text-[#003220] z-10"
                      : "border-gray-200 text-gray-400"
                  }`}
                  style={{ left: marker.position, height: "100%" }}
                >
                  {marker.isNewDay ? (
                    <Tooltip
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
                      <span className="cursor-pointer hover:underline">{marker.label}</span>
                    </Tooltip>
                  ) : (
                    marker.label
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
                  <Tooltip
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
                  </Tooltip>
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
                  const gStops = groupStopsByLocation(r.route.stops || []);
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

                return (
                  <div
                    key={driverGroup.driverKey}
                    data-driver-key={driverGroup.driverKey}
                    data-route-indices={routeIndicesStr}
                    data-route-index={primaryIndex}
                    className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors"
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
                          <span className="font-semibold truncate text-gray-800 text-xs">
                            {driverGroup.driverName}
                          </span>
                          {/* Vehicle is shown per-route on the timeline bar, not here */}
                          <span className="text-[11px] text-gray-400 truncate">
                            {Math.round(totalDistanceMeters / 1000)} km
                            {durationStr ? ` • ${durationStr}` : ""}
                            {` • ${totalGroupedStopsCount} stop${
                              totalGroupedStopsCount !== 1 ? "s" : ""
                            }`}
                          </span>
                        </div>

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
                      style={{
                        width: timelineWidth,
                      }}
                    >
                      {driverGroup.routes.map(({ route, originalIndex: routeIndex }) => {
                        const routeColor = getRouteColor(routeIndex);
                        const groupedStops = groupStopsByLocation(
                          route.stops || [],
                        );

                        const occupancyMap = new Map<number, number>();
                        let runningLoad = 0;
                        (route.stops || []).forEach((s: any, idx: number) => {
                          const isPickup = s.stop_type === "pickup";
                          const isDropoff =
                            s.stop_type === "dropoff" ||
                            s.stop_type === "drop_off";
                          if (isPickup) {
                            runningLoad += s.passenger_count || 1;
                          } else if (isDropoff) {
                            runningLoad = Math.max(
                              0,
                              runningLoad - (s.passenger_count || 1),
                            );
                          }
                          occupancyMap.set(idx, runningLoad);
                        });

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

                        return (
                          <React.Fragment key={`route-${routeIndex}`}>
                            {/* Connection Lines (Segments) */}
                            {route.stops?.map((stop: any, index: number) => {
                              if (index === route.stops.length - 1) return null;

                              const nextStop = route.stops[index + 1];
                              const startPos = getPosition(
                                stop.arrival_time,
                                startTime,
                                pixelsPerMinute,
                              );
                              const endPos = getPosition(
                                nextStop.arrival_time,
                                startTime,
                                pixelsPerMinute,
                              );
                              const width = endPos - startPos;

                              if (width <= 0) return null;

                              const distanceKm =
                                (stop.distance_to_next_stop_meters ?? 0) /
                                1000;
                              const timeMin = Math.round(
                                (stop.time_to_next_stop_seconds ?? 0) / 60,
                              );

                              const isWaiting = distanceKm === 0 && timeMin > 0;

                              return (
                                <Tooltip
                                  key={`link-${routeIndex}-${index}`}
                                  color="#ffffff"
                                  overlayStyle={{ maxWidth: "none" }}
                                  overlayInnerStyle={{
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    color: "#1e293b",
                                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.06)",
                                    border: "1px solid #cbd5e1",
                                  }}
                                  title={
                                    <div className="flex flex-col gap-1.5 text-xs text-slate-800 pointer-events-auto select-none min-w-[140px]">
                                      {routeVehicleName && (
                                        <div className="flex items-center gap-1.5 pb-1 border-b border-slate-200 font-bold text-slate-900">
                                          <Truck size={13} style={{ color: routeColor }} className="shrink-0" />
                                          <span className="truncate">{routeVehicleName}</span>
                                          {routeVehicleCap ? (
                                            <span className="inline-flex items-center text-[10px] font-extrabold text-slate-600 bg-slate-100 px-1.5 py-0.2 border border-slate-200 rounded shrink-0">
                                              {routeVehicleCap} seats
                                            </span>
                                          ) : null}
                                        </div>
                                      )}
                                      <div className="flex items-center gap-3 text-[11px] font-medium text-slate-600">
                                        {isWaiting ? (
                                          <span className="flex items-center gap-1 font-semibold text-amber-700">
                                            <ClockCircleOutlined className="text-amber-600 text-xs" />
                                            <span>Waiting: <strong className="text-amber-900">{timeMin} min</strong></span>
                                          </span>
                                        ) : (
                                          <span className="flex items-center gap-1">
                                            <ClockCircleOutlined className="text-slate-400 text-xs" />
                                            <strong className="text-slate-800">{timeMin} min</strong>
                                          </span>
                                        )}
                                        <span className="flex items-center gap-1">
                                          <EnvironmentOutlined className="text-slate-400 text-xs" />
                                          <strong className="text-slate-800">{distanceKm.toFixed(2)} km</strong>
                                        </span>
                                      </div>
                                    </div>
                                  }
                                >
                                  <div
                                    className="absolute top-1/2 left-0 transition-opacity cursor-pointer border-t border-b border-slate-300 rounded-xs"
                                    style={{
                                      height: isWaiting ? "6px" : "5px",
                                      backgroundColor: isWaiting ? "#e2e8f0" : routeColor,
                                      backgroundImage: isWaiting
                                        ? `repeating-linear-gradient(
                                            45deg,
                                            transparent,
                                            transparent 3px,
                                            rgba(0, 0, 0, 0.12) 3px,
                                            rgba(0, 0, 0, 0.12) 6px
                                          )`
                                        : undefined,
                                      opacity: isDimmed ? 0.15 : isWaiting ? 0.85 : 0.35,
                                      left: startPos,
                                      width: width,
                                      transform: "translateY(-50%)",
                                    }}
                                  />
                                </Tooltip>
                              );
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
                                  <Tooltip
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
                                        backgroundColor: isDimmed ? "#cbd5e1" : "#8c8c8c",
                                        opacity: isDimmed ? 0.3 : 0.8,
                                        minWidth: 24,
                                      }}
                                    >
                                      <span className="text-white text-xs">
                                        ☕
                                      </span>
                                    </div>
                                  </Tooltip>
                                );
                              })()}

                            {/* Idle Time Blocks */}
                            {route.idle_blocks?.map(
                              (idle: any, idleIndex: number) => {
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
                                  <Tooltip
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
                                        backgroundImage: `repeating-linear-gradient(
                                            45deg,
                                            transparent,
                                            transparent 3px,
                                            rgba(0,0,0,0.08) 3px,
                                            rgba(0,0,0,0.08) 6px
                                          )`,
                                      }}
                                    />
                                  </Tooltip>
                                );
                              },
                            )}

                            {/* Stops — rendered from grouped stops */}
                            {(() => {
                              let jobStopCounter = 1;

                              return groupedStops.map((group, groupIndex) => {
                                const stop = group.representative;
                                const count = group.candidateCount;
                                const arrivalTime = dayjs(stop.arrival_time);
                                const serviceDuration =
                                  stop.service_duration_minutes || 0;
                                const departureTime = arrivalTime.add(
                                  serviceDuration,
                                  "minute",
                                );

                                const left = getPosition(
                                  stop.arrival_time,
                                  startTime,
                                  pixelsPerMinute,
                                );

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

                                let displayIndex = 0;
                                if (!isDepot) {
                                  displayIndex = jobStopCounter++;
                                }

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
                                  ? stop.stop_type === "depot_start"
                                    ? "Depot (Start)"
                                    : stop.stop_type === "depot_end"
                                      ? "Depot (End)"
                                      : "Depot"
                                  : stop.address_formatted || `#${stop.job_id}`;

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
                                          <HomeFilled className="text-amber-700" />
                                          DEPOT {stop.stop_type === "depot_start" ? "(START)" : stop.stop_type === "depot_end" ? "(END)" : ""}
                                        </span>
                                      ) : null}

                                      {stopVehicleName && (
                                        <span
                                          className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 border border-slate-300 rounded shrink-0"
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

                                    {/* Location / Address Row */}
                                    <div className="flex items-start gap-2.5 py-0.5">
                                      {isDepot ? (
                                        <HomeFilled className="text-amber-500 text-base shrink-0 mt-0.5" />
                                      ) : isPickup ? (
                                        <EnvironmentOutlined className="text-emerald-600 text-base shrink-0 mt-0.5" />
                                      ) : (
                                        <EnvironmentOutlined className="text-blue-600 text-base shrink-0 mt-0.5" />
                                      )}
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 select-none">
                                            {isDepot ? "Station" : isPickup ? "Pickup Address" : isDropoff ? "Drop-off Address" : "Address"}
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
                                                  {isFinished && (
                                                    <span className="ml-1 text-[10px] font-extrabold uppercase bg-slate-200 text-slate-700 px-1 py-0.2 border border-slate-300 shrink-0 flex items-center gap-1">
                                                      <LockOutlined className="text-[10px]" /> Finished
                                                    </span>
                                                  )}
                                                </div>
                                                {!isFinished && onDeleteJob && numJobId && (
                                                  <button
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      onDeleteJob(numJobId);
                                                    }}
                                                    className="ml-2 text-slate-400 hover:text-red-600 hover:bg-red-50 p-1 rounded transition-colors border-none bg-transparent flex items-center shrink-0 cursor-pointer opacity-80 group-hover/jobrow:opacity-100"
                                                    title="Stage job for deletion"
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
                                          ETA: <strong className="text-slate-900 font-extrabold">{arrivalTime.isValid() ? arrivalTime.format("hh:mm A") : "--:--"}</strong>
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

                                  if (isJob && serviceDuration > 0) {
                                    return (
                                      <Tooltip
                                        key={`stop-${routeIndex}-${groupIndex}`}
                                        title={tooltipContent}
                                        color="#ffffff"
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
                                          className={`absolute top-1/2 -translate-y-1/2 h-8 flex items-center justify-center shadow-md transition-all hover:scale-105 cursor-pointer z-10 border-2 bg-white ${
                                            isGroupPendingDelete ? "opacity-35 border-dashed border-red-500 bg-red-100" : ""
                                          }`}
                                          style={{
                                            left: left,
                                            width: Math.max(blockWidth, 28),
                                            backgroundColor: isGroupPendingDelete ? undefined : isDimmed ? "#ffffff" : blockBgColor,
                                            borderColor: isGroupPendingDelete ? undefined : isDimmed ? "#cbd5e1" : blockBorderColor,
                                          }}
                                          onClick={() =>
                                            onStopClick?.(
                                              group.rawStops[0],
                                              routeIndex,
                                              displayIndex,
                                            )
                                          }
                                        >
                                          <span
                                            className="text-xs font-bold"
                                            style={{ color: isGroupPendingDelete ? "#dc2626" : isDimmed ? "#94a3b8" : blockTextColor }}
                                          >
                                            {displayIndex}
                                          </span>
                                        </div>
                                      </Tooltip>
                                    );
                                  }

                                  return (
                                    <Tooltip
                                      key={`stop-${routeIndex}-${groupIndex}`}
                                      title={tooltipContent}
                                      color="#ffffff"
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
                                        className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center border-2 shadow-md transition-all hover:scale-110 cursor-pointer bg-white ${
                                          isGroupPendingDelete
                                            ? "w-8 h-8 z-10 opacity-35 border-dashed border-red-500 bg-red-100"
                                            : isDepot
                                              ? "px-2 h-6 bg-slate-900 border-slate-700 z-10 shadow-lg text-white"
                                              : "w-8 h-8 z-10 bg-white"
                                        }`}
                                        style={{
                                          left: left - 14,
                                          backgroundColor: isGroupPendingDelete
                                            ? undefined
                                            : isDepot
                                              ? (isDimmed ? "#94a3b8" : undefined)
                                              : "#ffffff",
                                          borderColor: isGroupPendingDelete
                                            ? undefined
                                            : isDepot
                                              ? undefined
                                              : (isDimmed ? "#cbd5e1" : blockBorderColor),
                                        }}
                                        onClick={() =>
                                          onStopClick?.(
                                            group.rawStops[0],
                                            routeIndex,
                                            displayIndex,
                                          )
                                        }
                                      >
                                        {isDepot ? (
                                          <span className="flex items-center gap-1 text-[10px] font-bold text-white">
                                            <HomeFilled className="text-white text-xs" />
                                            {depotLabel}
                                          </span>
                                        ) : (
                                          <span
                                            className="text-xs font-bold"
                                            style={{ color: isGroupPendingDelete ? "#dc2626" : isDimmed ? "#94a3b8" : blockTextColor }}
                                          >
                                            {displayIndex}
                                          </span>
                                        )}
                                      </div>
                                    </Tooltip>
                                  );
                              });
                            })()}
                          </React.Fragment>
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
    </div>
  );
};

export default TimelineView;
