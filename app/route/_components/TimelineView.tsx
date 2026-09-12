import React, { useMemo, useRef, useState, useEffect } from "react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import type { Vehicle } from "@/types/vehicle.type";
import { Avatar, Tooltip, Select, Dropdown, Input } from "antd";
import type { MenuProps } from "antd";
import { isDriverMatch } from "./optimizationView.utils";
import {
  UserOutlined,
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

    // Calculate horizontal X scroll offset to center stop on timeline
    const stopX = getPosition(targetStop.arrival_time, startTime, pixelsPerMinute);
    const visibleTimelineWidth = container.clientWidth - DRIVER_COLUMN_WIDTH;
    const targetScrollLeft = Math.max(0, stopX - visibleTimelineWidth / 2);

    // Calculate vertical Y scroll offset to bring driver row into view
    let targetScrollTop = container.scrollTop;
    const rowEl = container.querySelector(`[data-route-index="${rIdx}"]`) as HTMLElement;
    if (rowEl) {
      const rowTop = rowEl.offsetTop;
      const rowHeight = rowEl.offsetHeight;
      const containerHeight = container.clientHeight;
      targetScrollTop = Math.max(0, rowTop - containerHeight / 2 + rowHeight / 2);
    }

    container.scrollTo({
      left: targetScrollLeft,
      top: targetScrollTop,
      behavior: "smooth",
    });
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
      label: "Re-optimize",
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
                  className="absolute top-0 bottom-0 border-l border-gray-200 pl-1 text-xs text-gray-400"
                  style={{ left: marker.position, height: "100%" }}
                >
                  {marker.label}
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
              {timeMarkers.map((marker, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-dashed border-gray-200"
                  style={{ left: marker.position }}
                />
              ))}
            </div>

            {filteredRoutes.length === 0 ? (
              <div
                className="py-12 text-center text-xs text-gray-400 flex flex-col items-center justify-center gap-1.5"
                style={{ marginLeft: DRIVER_COLUMN_WIDTH }}
              >
                <span>No drivers matching "{driverSearch}"</span>
                <button
                  className="text-blue-500 hover:underline text-xs font-medium"
                  onClick={() => setDriverSearch("")}
                >
                  Clear filter
                </button>
              </div>
            ) : (
              filteredRoutes.map(({ route, originalIndex: routeIndex }) => {
              const routeColor = getRouteColor(routeIndex);
              const durationStr = getRouteDurationStr(route);
              // Compute grouped stops once for stop count and rendering
              const groupedStops = groupStopsByLocation(route.stops || []);
              const totalGroupedStopsCount = groupedStops.filter(
                (g) => g.representative.stop_type !== "depot" &&
                        g.representative.stop_type !== "depot_start" &&
                        g.representative.stop_type !== "depot_end"
              ).length;
              // Rows outside the focus fade back but stay clickable, so the
              // dispatcher can hop straight from one driver to another.
              const isDimmed =
                focusedRouteIndex !== null && focusedRouteIndex !== routeIndex;

              // Look up vehicle details for this route
              const routeVehicle = route.vehicle_id
                ? vehiclesMap.get(Number(route.vehicle_id))
                : undefined;

              const getVehicleCapacity = (v?: Vehicle): number | null => {
                if (!v) return null;
                if (Array.isArray(v.load_constraints)) {
                  for (const c of v.load_constraints as any[]) {
                    if (c && typeof c === "object") {
                      const ctype = String(c.constraint_type || "").toLowerCase();
                      const unit = String(c.unit || "").toLowerCase();
                      if (ctype === "capacity" || ctype === "seats" || unit.includes("seat")) {
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

              const vehicleCapacity = getVehicleCapacity(routeVehicle);

              const vehicleLabel = routeVehicle
                ? [
                    routeVehicle.name,
                    routeVehicle.type ? `(${routeVehicle.type.replace("_", " ")})` : null,
                    vehicleCapacity ? `· ${vehicleCapacity} seats` : null,
                    routeVehicle.license_plate ? `· ${routeVehicle.license_plate}` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : null;

              // Pre-calculate cumulative running occupancy per stop in route
              const occupancyMap = new Map<number, number>();
              let runningLoad = 0;
              (route.stops || []).forEach((s: any, idx: number) => {
                const isPickup = s.stop_type === "pickup";
                const isDropoff = s.stop_type === "dropoff" || s.stop_type === "drop_off";
                if (isPickup) {
                  runningLoad += (s.passenger_count || 1);
                } else if (isDropoff) {
                  runningLoad = Math.max(0, runningLoad - (s.passenger_count || 1));
                }
                occupancyMap.set(idx, runningLoad);
              });

              return (
                <div
                  key={routeIndex}
                  data-route-index={routeIndex}
                  className="flex border-b border-gray-100 hover:bg-gray-50 transition-colors"
                  style={{ height: ROW_HEIGHT }}
                >
                  {/* Sticky Driver Info */}
                  <div
                    className="sticky left-0 z-10 bg-white border-r border-gray-200 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] cursor-pointer"
                    style={{ width: DRIVER_COLUMN_WIDTH, minWidth: DRIVER_COLUMN_WIDTH }}
                    onClick={() => onFocusRoute?.(routeIndex)}
                    title={
                      focusedRouteIndex === routeIndex
                        ? "Showing only this route — press Esc to show all"
                        : "Show only this driver's route"
                    }
                  >
                    {/* Opacity lives on an inner wrapper so the sticky column
                        stays opaque over the timeline when scrolled sideways. */}
                    <div
                      className="h-full px-3 flex items-center gap-2.5 transition-opacity"
                      style={{ opacity: isDimmed ? 0.4 : 1 }}
                    >
                      <Avatar
                        icon={<UserOutlined />}
                        style={{ backgroundColor: routeColor }}
                        className="text-white shrink-0"
                        size="default"
                      />
                      <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                        <span className="font-semibold truncate text-gray-800 text-xs">
                          {route.team_member_name ||
                            `Driver ${route.team_member_id}`}
                        </span>
                        {vehicleLabel && (
                          <span className="text-[10px] text-gray-900 font-medium truncate">
                            {vehicleLabel}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-400 truncate">
                          {Math.round(route.total_distance_meters / 1000)} km
                          {durationStr ? ` • ${durationStr}` : ""}
                          {` • ${totalGroupedStopsCount} stop${totalGroupedStopsCount !== 1 ? "s" : ""}`}
                        </span>
                      </div>

                      {/* ••• Menu */}
                      <Dropdown
                        menu={{ items: getRouteMenuItems(routeIndex) }}
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
                    className="relative z-0 transition-opacity"
                    style={{
                      width: timelineWidth,
                      opacity: isDimmed ? 0.3 : 1,
                    }}
                  >
                    {/* Connection Lines (Segments) */}
                    {route.stops?.map((stop: any, index: number) => {
                      if (index === route.stops.length - 1) return null; // Skip last stop

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

                      const distanceKm =
                        (stop.distance_to_next_stop_meters ?? 0) / 1000;
                      const timeMin = Math.round(
                        (stop.time_to_next_stop_seconds ?? 0) / 60,
                      );

                      return (
                        <Tooltip
                          key={`link-${index}`}
                          title={`${timeMin} min, ${distanceKm.toFixed(2)} km`}
                        >
                          <div
                            className="absolute top-1/2 left-0 h-0.5 hover:opacity-100 transition-opacity cursor-pointer"
                            style={{
                              height: "5px",
                              backgroundColor: routeColor,
                              opacity: 0.3,
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
                            title={
                              <div>
                                <div className="font-semibold">☕ Break</div>
                                <div>
                                  Duration: {route.break_info.duration_minutes}{" "}
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
                              className="absolute top-1/2 -translate-y-1/2 h-6 border border-gray-400 cursor-pointer opacity-80 hover:opacity-100 transition-opacity flex items-center justify-center"
                              style={{
                                left: breakStartPos,
                                width: breakWidth,
                                backgroundColor: "#8c8c8c",
                                minWidth: 24,
                              }}
                            >
                              <span className="text-white text-xs">☕</span>
                            </div>
                          </Tooltip>
                        );
                      })()}

                    {/* Idle Time Blocks */}
                    {route.idle_blocks?.map((idle: any, idleIndex: number) => {
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
                          key={`idle-${idleIndex}`}
                          title={
                            <div>
                              <div className="font-semibold">⏳ Idle Time</div>
                              <div>Waiting: {idle.duration_minutes} min</div>
                              {idle.location?.address_formatted && (
                                <div className="text-xs">
                                  📍 {idle.location.address_formatted}
                                </div>
                              )}
                            </div>
                          }
                        >
                          <div
                            className="absolute top-1/2 -translate-y-1/2 h-6 border border-gray-300 cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                            style={{
                              left: idleStartPos,
                              width: idleWidth,
                              backgroundColor: "#f5f5f5",
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
                    })}

                    {/* Stops — rendered from grouped stops to collapse co-located candidates */}
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

                        // Calculate block width based on service duration
                        const blockWidth = serviceDuration * pixelsPerMinute;

                        const isDepot = stop.stop_type === "depot" ||
                                        stop.stop_type === "depot_start" ||
                                        stop.stop_type === "depot_end";

                        let displayIndex = 0;
                        if (!isDepot) {
                          displayIndex = jobStopCounter++;
                        }

                        // Worker-shuttle routes use "pickup"/"dropoff" instead of
                        // the generic "job" stop type.
                        const isPickup = stop.stop_type === "pickup";
                        const isDropoff =
                          stop.stop_type === "dropoff" ||
                          stop.stop_type === "drop_off";
                        const isJob =
                          stop.stop_type === "job" || isPickup || isDropoff;
                        const stopTypeLabel = isPickup
                          ? "Pickup"
                          : isDropoff
                            ? "Drop-off"
                            : null;

                        let jobStatus = "assigned";
                        if (isJob) {
                          const mapStatus = stop.job_id ? jobsMap.get(Number(stop.job_id)) : undefined;
                          jobStatus = mapStatus || stop.job?.status || stop.status || "assigned";
                        }

                        let blockBgColor = routeColor;
                        let blockBorderColor = routeColor;
                        let blockTextColor = "white";

                        if (isJob) {
                          const isStopDone = isPickup
                            ? (jobStatus === "in_transit" || jobStatus === "completed" || jobStatus === "success")
                            : (jobStatus === "completed" || jobStatus === "success");

                          if (isStopDone) {
                            blockBgColor = routeColor;
                            blockBorderColor = routeColor;
                            blockTextColor = "white";
                          } else if (jobStatus === "failed") {
                            blockBgColor = "#f5222d"; // Red
                            blockBorderColor = "#f5222d";
                            blockTextColor = "white";
                          } else if (jobStatus === "skipped") {
                            blockBgColor = "#8c8c8c"; // Gray
                            blockBorderColor = "#8c8c8c";
                            blockTextColor = "white";
                          } else {
                            blockBgColor = "white";
                            blockBorderColor = routeColor;
                            blockTextColor = routeColor;
                          }
                        }

                        const lastRawIndex = group.firstRawIndex + group.candidateCount - 1;
                        const currentOccupancy = occupancyMap.get(lastRawIndex) ?? 0;

                        // Build tooltip content — show all candidates if grouped with clickable links
                        const tooltipContent = (
                          <div className="pointer-events-auto select-none space-y-1">
                            <div className="font-semibold flex items-center gap-1.5">
                              {isDepot ? (
                                <HomeFilled className="text-amber-400 text-sm shrink-0" />
                              ) : (
                                <EnvironmentOutlined className="text-red-400 text-sm shrink-0" />
                              )}
                              <span>
                                {isDepot
                                  ? (stop.stop_type === "depot_start" ? "Depot (Start)" : stop.stop_type === "depot_end" ? "Depot (End)" : "Depot")
                                  : (stop.address_formatted || `#${stop.job_id}`)}
                              </span>
                            </div>
                            {stopTypeLabel && (
                              <div className="text-xs font-semibold uppercase opacity-80 flex items-center gap-1.5">
                                <UserOutlined className="text-xs shrink-0" />
                                <span>{stopTypeLabel}</span>
                                {count > 1 && (
                                  <span className="bg-white/20 rounded px-1 lowercase">
                                    ×{count} candidates
                                  </span>
                                )}
                              </div>
                            )}
                            {isJob && (
                              <div className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                                <CarOutlined className="text-xs shrink-0" />
                                <span>Occupancy: {currentOccupancy} {vehicleCapacity ? `/ ${vehicleCapacity}` : ""} seats</span>
                              </div>
                            )}
                            {isJob && group.rawStops.length > 0 && (
                              <div className="text-xs max-h-36 overflow-y-auto space-y-1 custom-scrollbar pr-1 pt-0.5">
                                {group.rawStops.map((s: any, i: number) => {
                                  const candName = getCandidateName(s);
                                  return (
                                    <div
                                      key={i}
                                      className="cursor-pointer text-sky-200 hover:text-white hover:underline transition-colors py-0.5 flex items-center gap-1.5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onStopClick?.(s, routeIndex, displayIndex);
                                      }}
                                    >
                                      <FileTextOutlined className="text-sky-300 text-xs shrink-0" />
                                      <span>#{s.job_id} {candName ? `(${candName})` : ""}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            <div className="text-xs text-white font-bold flex items-center gap-1.5 pt-0.5">
                              <ClockCircleOutlined className="text-amber-300 text-xs shrink-0" />
                              <span>ETA: {arrivalTime.isValid() ? arrivalTime.format("HH:mm") : "--:--"}</span>
                            </div>
                            {serviceDuration > 0 && (
                              <div className="text-xs text-gray-200 pl-5 space-y-0.5">
                                <div>
                                  Departure:{" "}
                                  {departureTime.isValid()
                                    ? departureTime.format("HH:mm")
                                    : "--:--"}
                                </div>
                                <div>Service: {serviceDuration} min</div>
                              </div>
                            )}
                          </div>
                        );

                        // For jobs with service duration, show as a bar
                        if (isJob && serviceDuration > 0) {
                          return (
                            <Tooltip
                              key={groupIndex}
                              title={tooltipContent}
                              overlayInnerStyle={{ pointerEvents: "auto" }}
                            >
                              <div
                                className="absolute top-1/2 -translate-y-1/2 h-8 flex items-center justify-center shadow-md transition-all hover:scale-105 cursor-pointer z-10 border-2"
                                style={{
                                  left: left,
                                  width: Math.max(blockWidth, 28),
                                  backgroundColor: blockBgColor,
                                  borderColor: blockBorderColor,
                                }}
                                onClick={() =>
                                  onStopClick?.(
                                    group.rawStops[0],
                                    routeIndex,
                                    displayIndex,
                                  )
                                }
                              >
                                <span className="text-xs font-bold" style={{ color: blockTextColor }}>
                                  {displayIndex}
                                </span>
                              </div>
                            </Tooltip>
                          );
                        }

                        // For depot and jobs without service duration, show as marker
                        return (
                          <Tooltip
                            key={groupIndex}
                            title={tooltipContent}
                            overlayInnerStyle={{ pointerEvents: "auto" }}
                          >
                            <div
                              className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center border-2 shadow-md transition-all hover:scale-110 cursor-pointer ${
                                isDepot
                                  ? "w-8 h-8 rounded-lg bg-linear-to-br from-slate-700 to-slate-900 border-slate-600 z-10 shadow-lg text-white"
                                  : "w-8 h-8 rounded z-0"
                              }`}
                              style={{
                                left: left - 14,
                                backgroundColor: isDepot ? undefined : blockBgColor,
                                borderColor: isDepot ? undefined : blockBorderColor,
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
                                <HomeFilled className="text-white text-base" />
                              ) : (
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: blockTextColor }}
                                >
                                  {displayIndex}
                                </span>
                              )}
                            </div>
                          </Tooltip>
                        );
                      });
                    })()}
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
