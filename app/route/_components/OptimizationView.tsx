"use client";
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import { Panel, PanelGroup, ImperativePanelHandle } from "react-resizable-panels";
import {
  Typography,
  Button,
  Tooltip,
  Popover,
  Input,
  message,
  Modal,
  Spin,
  Alert,
  Drawer,
  Switch,
  Checkbox,
  Select,
} from "antd";
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  TeamOutlined,
  ExportOutlined,
  ShareAltOutlined,
  EditOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import GoogleMaps, { MarkerData } from "@/components/GoogleMaps";
import { X, Maximize2, Minimize2, ChevronUp, ChevronDown, ChevronRight, Map as MapIcon, Building2, MapPin, Milestone, Search, PenTool, Trash2, ArrowRightLeft, Settings, Pencil } from "lucide-react";
import DrawingStatusTip from "@/app/team/_components/DrawingStatusTip";
import MapSearch from "./MapSearch";
import { buildMapSearchIndex } from "./mapSearch.utils";
import TimelineView from "./TimelineView";
import AddJobsModal from "@/app/plan/AddJobsModal";
import JobForm from "@/components/Jobs/JobForm";
import SwapDriverDrawer from "./SwapDriverDrawer";
import ChangeVehicleModal from "./ChangeVehicleModal";
import { Route } from "@/types/routes.type";
import type { Job } from "@/types/job.type";
import { useJobsStore } from "@/store/jobs.store";
import { useOptimizationStore } from "@/store/optimization.store";
import { useRouteStore } from "@/store/routes.store";
import { useIndexStore } from "@/store/index.store";
import { useTeamStore } from "@/store/team.store";
import { useVehicleStore } from "@/store/vehicle.store";
import { useDepotStore } from "@/store/depots.store";
import { useLocationMappingStore } from "@/store/location-mapping.store";
import { LOCATION_TYPE_OPTIONS } from "@/apis/location-mapping.api";
import { LOCATION_TYPE_COLORS, getLocationTypeColor } from "@/utils/customMapMarker";
import RouteInfoWindow from "./RouteInfoWindow";
import { findRoundTripPartner, getTripRemovalTargets } from "./tripRemoval.utils";
import RouteExportPreview from "./RouteExportPreview";
import {
  generateRoutePolylines,
  generateMapMarkers,
  getGroupedStopsCount,
  isDriverMatch,
} from "./optimizationView.utils";
import { getRouteColor } from "@/utils/timeline.utils";
import ResizeHandle from "@/components/ResizeHandle";
import Icon from "@ant-design/icons";
import {
  addStopToRoute,
  getOptimizationHistory,
  undoOptimizationRevision,
  removeStopFromRoute,
  reorderRouteStops,
  swapRouteDriver,
  reverseRoute,
  reOptimizeRoute,
  transferRouteStops,
  shareOptimizationRoutes,
  type ShareRouteResponse,
} from "@/apis/routes.api";

import JobDetailsCard from "./JobDetailsCard";

const { Title, Text } = Typography;

// Ray-casting point-in-polygon test (lat/lng treated as planar; fine at city scale).
const isPointInPolygon = (
  point: google.maps.LatLngLiteral,
  polygon: google.maps.LatLngLiteral[],
): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    const crosses =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
};

const MAP_OVERLAYS_STORAGE_KEY = "syncnox_map_overlays_visibility";

interface MapOverlaysState {
  stops: boolean;
  depots: boolean;
  additionalLocations: boolean;
  driverWorkingTime: boolean;
  visibleLocationTypes?: string[];
}

const DEFAULT_MAP_OVERLAYS: MapOverlaysState = {
  stops: true,
  depots: false,
  additionalLocations: false,
  driverWorkingTime: true,
  visibleLocationTypes: undefined,
};

const getStoredMapOverlays = (): MapOverlaysState => {
  if (typeof window === "undefined") return DEFAULT_MAP_OVERLAYS;
  try {
    const raw = localStorage.getItem(MAP_OVERLAYS_STORAGE_KEY);
    if (!raw) return DEFAULT_MAP_OVERLAYS;
    const parsed = JSON.parse(raw);
    return {
      stops: typeof parsed?.stops === "boolean" ? parsed.stops : DEFAULT_MAP_OVERLAYS.stops,
      depots: typeof parsed?.depots === "boolean" ? parsed.depots : DEFAULT_MAP_OVERLAYS.depots,
      additionalLocations:
        typeof parsed?.additionalLocations === "boolean"
          ? parsed.additionalLocations
          : DEFAULT_MAP_OVERLAYS.additionalLocations,
      driverWorkingTime:
        typeof parsed?.driverWorkingTime === "boolean"
          ? parsed.driverWorkingTime
          : DEFAULT_MAP_OVERLAYS.driverWorkingTime,
      visibleLocationTypes: Array.isArray(parsed?.visibleLocationTypes)
        ? parsed.visibleLocationTypes
        : undefined,
    };
  } catch {
    return DEFAULT_MAP_OVERLAYS;
  }
};

interface OptimizationViewProps {
  route: Route;
  requestedJobDetailsId?: number | null;
  onRequestedJobDetailsOpened?: () => void;
}

interface UndoOperation {
  id: number;
  label: string;
}

const OptimizationView = ({
  route,
  requestedJobDetailsId,
  onRequestedJobDetailsOpened,
}: OptimizationViewProps) => {
  const router = useRouter();
  const { setCurrentTab } = useIndexStore();
  const {
    updateOptimization,
    clearOptimization,
    fetchOptimization,
    setOptimizationResult,
    isOptimizing,
    error,
    reOptimize,
    pollUntilComplete,
  } = useOptimizationStore();
  const { jobs, fetchJobsByDate, fetchJobsByIds } = useJobsStore();
  const { updateRoute } = useRouteStore();
  const { teams, initializeTeams, updateTeamAction } = useTeamStore();
  const { vehicles, initializeVehicles } = useVehicleStore();

  useEffect(() => {
    if (route.job_ids && route.job_ids.length > 0) {
      fetchJobsByIds(route.job_ids);
    } else if (route.scheduled_date) {
      fetchJobsByDate(route.scheduled_date);
    }
  }, [route.job_ids, route.scheduled_date, fetchJobsByIds, fetchJobsByDate]);

  // Ensure team list is loaded for swap driver
  useEffect(() => {
    initializeTeams();
  }, [initializeTeams]);

  // Ensure vehicles are loaded for route vehicle info display
  useEffect(() => {
    initializeVehicles();
  }, [initializeVehicles]);

  const handleDriverWorkingHoursChange = useCallback(
    async (
      teamId: number,
      dayKey: string,
      startTime: string,
      endTime: string,
    ) => {
      const team = teams.find((member) => member.id === teamId);
      if (!team) {
        throw new Error("Driver details are unavailable. Refresh and try again.");
      }

      await updateTeamAction({
        ...team,
        day_schedules: {
          ...(team.day_schedules || {}),
          [dayKey]: {
            enabled: true,
            start_time: startTime,
            end_time: endTime,
          },
        },
      });
    },
    [teams, updateTeamAction],
  );

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempRouteName, setTempRouteName] = useState(route.route_name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [shareResult, setShareResult] = useState<ShareRouteResponse | null>(
    null,
  );
  // Tracks whether any job edits have been saved but re-optimization not yet run
  const [hasUnsavedJobEdits, setHasUnsavedJobEdits] = useState(false);
  const [editJobData, setEditJobData] = useState<Job | null>(null);
  const [pendingDeletedJobIds, setPendingDeletedJobIds] = useState<Set<number>>(new Set());
  const [isAddJobOpen, setIsAddJobOpen] = useState(false);
  const [reorderingRouteIndex, setReorderingRouteIndex] = useState<number | null>(null);
  const [removeJobTarget, setRemoveJobTarget] = useState<{
    routeIndex: number;
    jobId: number;
    partnerJobId: number;
    tripLabel: string;
    driverName: string;
  } | null>(null);
  const [isRemovingJob, setIsRemovingJob] = useState(false);

  const applyStagedRemovals = useCallback(async () => {
    for (const jobId of pendingDeletedJobIds) {
      for (const [routeIndex, driverRoute] of (route.result?.routes || []).entries()) {
        if (driverRoute.stops?.some((stop) => Number(stop.job_id) === jobId)) {
          await removeStopFromRoute(route.id, routeIndex, jobId);
        }
      }
    }
    await fetchOptimization(route.id);
  }, [pendingDeletedJobIds, route.id, route.result?.routes, fetchOptimization]);

  const [undoStep, setUndoStep] = useState<UndoOperation | null>(null);
  const historyRequestRef = useRef(0);
  const undoInProgressRef = useRef(false);
  const [isUndoing, setIsUndoing] = useState(false);

  const refreshUndoHistory = useCallback(async () => {
    const requestNumber = ++historyRequestRef.current;
    try {
      const saved = await getOptimizationHistory(route.id);
      if (requestNumber !== historyRequestRef.current) return;
      const entry = saved.entries.find((item) => item.id === saved.next_undo_revision);
      setUndoStep(saved.next_undo_revision ? {
        id: saved.next_undo_revision,
        label: entry?.operation.replaceAll("_", " ") || "route change",
      } : null);
    } catch {
      if (requestNumber === historyRequestRef.current) setUndoStep(null);
    }
  }, [route.id]);

  useEffect(() => {
    setUndoStep(null);
    return () => { historyRequestRef.current += 1; };
  }, [route.id]);

  useEffect(() => {
    void refreshUndoHistory();
  }, [route.result, route.status, refreshUndoHistory]);

  const handleUndo = useCallback(async () => {
    if (undoInProgressRef.current || !undoStep) return;
    undoInProgressRef.current = true;
    setIsUndoing(true);
    try {
      message.loading({ content: `Undoing: ${undoStep.label}...`, key: "undo", duration: 0 });
      await undoOptimizationRevision(route.id, undoStep.id);
      const restored = await fetchOptimization(route.id);
      await fetchJobsByDate(route.scheduled_date);
      setHasUnsavedJobEdits(restored.result?.routes?.some((driverRoute) =>
        driverRoute.stops?.some((stop) => stop.is_new || stop.time_edited)
      ) || false);
      message.success({ content: `Undone: ${undoStep.label}`, key: "undo" });
    } catch (err: unknown) {
      const detail = isAxiosError<{ detail?: string }>(err) ? err.response?.data?.detail : undefined;
      message.error({ content: detail || (err instanceof Error ? err.message : "Failed to undo"), key: "undo" });
    } finally {
      await refreshUndoHistory();
      undoInProgressRef.current = false;
      setIsUndoing(false);
    }
  }, [undoStep, route.id, route.scheduled_date, fetchOptimization, fetchJobsByDate, refreshUndoHistory]);

  // Job Details Floating Card state
  const [selectedDrawerJob, setSelectedDrawerJob] = useState<{
    stopData: any;
    job: Job | null;
    driverName?: string;
    leg?: string;
    routeIndex?: number;
    stopIndex?: number;
    isUnassigned?: boolean;
  } | null>(null);

  const [selectedMarkerId, setSelectedMarkerId] = useState<
    string | number | null
  >(null);

  useEffect(() => {
    if (!requestedJobDetailsId) return;

    const matchedJob = jobs.find((job) => job.id === requestedJobDetailsId);
    if (!matchedJob) return;

    setSelectedMarkerId(null);
    setSelectedDrawerJob({
      stopData: {
        ...matchedJob,
        job_id: matchedJob.id,
        stop_type: "unassigned",
        address_formatted:
          matchedJob.pick_up_address ||
          matchedJob.worker_shuttle_detail?.pick_up_address ||
          matchedJob.address_formatted ||
          matchedJob.pickup_delivery_detail?.address_formatted,
      },
      job: matchedJob,
      isUnassigned: true,
    });
    onRequestedJobDetailsOpened?.();
  }, [jobs, requestedJobDetailsId, onRequestedJobDetailsOpened]);

  // ── Depots & Additional Locations store state & visibility ──
  const { depots, initializeDepots } = useDepotStore();
  const {
    locationMappings,
    locationTypes,
    initializeLocationMappings,
    fetchLocationTypes,
  } = useLocationMappingStore();

  useEffect(() => {
    initializeDepots();
  }, [initializeDepots]);

  useEffect(() => {
    initializeLocationMappings();
    fetchLocationTypes();
  }, [initializeLocationMappings, fetchLocationTypes]);

  // ── Depots, Additional Locations & Stops visibility state (persisted to localStorage) ──
  const [showStops, setShowStops] = useState<boolean>(DEFAULT_MAP_OVERLAYS.stops);
  const [showDepots, setShowDepots] = useState<boolean>(DEFAULT_MAP_OVERLAYS.depots);
  const [showAdditionalLocations, setShowAdditionalLocations] = useState<boolean>(DEFAULT_MAP_OVERLAYS.additionalLocations);
  const [visibleLocationTypes, setVisibleLocationTypes] = useState<string[] | undefined>(undefined);
  const [isAdditionalTypesExpanded, setIsAdditionalTypesExpanded] = useState<boolean>(true);
  const [locationTypeSearch, setLocationTypeSearch] = useState("");
  const [isMapSettingsOpen, setIsMapSettingsOpen] = useState(false);
  const [showDriverWorkingTime, setShowDriverWorkingTime] = useState(DEFAULT_MAP_OVERLAYS.driverWorkingTime);

  useEffect(() => {
    const stored = getStoredMapOverlays();
    setShowStops(stored.stops);
    setShowDepots(stored.depots);
    setShowAdditionalLocations(stored.additionalLocations);
    setVisibleLocationTypes(stored.visibleLocationTypes);
    setShowDriverWorkingTime(stored.driverWorkingTime);
  }, []);

  const handleToggleDriverWorkingTime = useCallback((checked: boolean) => {
    setShowDriverWorkingTime(checked);
    try {
      const current = getStoredMapOverlays();
      localStorage.setItem(
        MAP_OVERLAYS_STORAGE_KEY,
        JSON.stringify({ ...current, driverWorkingTime: checked }),
      );
    } catch {}
  }, []);

  const handleToggleStops = useCallback((checked: boolean) => {
    setShowStops(checked);
    try {
      const current = getStoredMapOverlays();
      localStorage.setItem(
        MAP_OVERLAYS_STORAGE_KEY,
        JSON.stringify({ ...current, stops: checked })
      );
    } catch {}
  }, []);

  const handleToggleDepots = useCallback((checked: boolean) => {
    setShowDepots(checked);
    try {
      const current = getStoredMapOverlays();
      localStorage.setItem(
        MAP_OVERLAYS_STORAGE_KEY,
        JSON.stringify({ ...current, depots: checked })
      );
    } catch {}
  }, []);

  // Distinct location types aggregated from store options + active locations
  const availableLocationTypes = useMemo(() => {
    const typeMap = new Map<
      string,
      { value: string; label: string; count: number; color: string }
    >();

    const baseTypes =
      locationTypes.length > 0 ? locationTypes : LOCATION_TYPE_OPTIONS;
    baseTypes.forEach((t) => {
      const val = t.value.toLowerCase().replace(/\s+/g, "_");
      typeMap.set(val, {
        value: val,
        label:
          t.label ||
          val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        count: 0,
        color: getLocationTypeColor(val),
      });
    });

    locationMappings.forEach((m) => {
      const raw = (m.type || m.location_type || "metro_station")
        .toLowerCase()
        .replace(/\s+/g, "_");
      if (!typeMap.has(raw)) {
        const matchedOpt = baseTypes.find(
          (opt) => opt.value === raw || opt.label.toLowerCase() === raw
        );
        typeMap.set(raw, {
          value: raw,
          label: matchedOpt
            ? matchedOpt.label
            : raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          count: 0,
          color: getLocationTypeColor(raw),
        });
      }
      const entry = typeMap.get(raw)!;
      entry.count += 1;
    });

    return Array.from(typeMap.values()).sort((a, b) => {
      if (a.value === "metro_station") return -1;
      if (b.value === "metro_station") return 1;
      if (b.count !== a.count) return b.count - a.count;
      return a.label.localeCompare(b.label);
    });
  }, [locationTypes, locationMappings]);

  const isTypeVisible = useCallback(
    (typeValue: string) => {
      if (visibleLocationTypes === undefined) return true;
      return visibleLocationTypes.includes(typeValue.toLowerCase());
    },
    [visibleLocationTypes]
  );

  const activeTypesCount = useMemo(() => {
    if (visibleLocationTypes === undefined) return availableLocationTypes.length;
    return availableLocationTypes.filter((t) => visibleLocationTypes.includes(t.value))
      .length;
  }, [availableLocationTypes, visibleLocationTypes]);

  const filteredLocationTypes = useMemo(() => {
    const query = locationTypeSearch.trim().toLowerCase();
    if (!query) return availableLocationTypes;

    return availableLocationTypes.filter((type) => {
      const normalizedValue = type.value.replace(/_/g, " ");
      return (
        type.label.toLowerCase().includes(query) ||
        normalizedValue.includes(query)
      );
    });
  }, [availableLocationTypes, locationTypeSearch]);

  const handleToggleAdditionalLocations = useCallback((checked: boolean) => {
    setShowAdditionalLocations(checked);
    if (checked) {
      setIsAdditionalTypesExpanded(true);
      setVisibleLocationTypes((prev) => {
        if (prev !== undefined && prev.length === 0) {
          const allVals = availableLocationTypes.map((t) => t.value);
          try {
            const current = getStoredMapOverlays();
            localStorage.setItem(
              MAP_OVERLAYS_STORAGE_KEY,
              JSON.stringify({
                ...current,
                additionalLocations: checked,
                visibleLocationTypes: allVals,
              })
            );
          } catch {}
          return allVals;
        }
        try {
          const current = getStoredMapOverlays();
          localStorage.setItem(
            MAP_OVERLAYS_STORAGE_KEY,
            JSON.stringify({ ...current, additionalLocations: checked })
          );
        } catch {}
        return prev;
      });
    } else {
      setLocationTypeSearch("");
      try {
        const current = getStoredMapOverlays();
        localStorage.setItem(
          MAP_OVERLAYS_STORAGE_KEY,
          JSON.stringify({ ...current, additionalLocations: checked })
        );
      } catch {}
    }
  }, [availableLocationTypes]);

  const handleToggleType = useCallback(
    (typeValue: string) => {
      const norm = typeValue.toLowerCase();
      setVisibleLocationTypes((prev) => {
        const currentList =
          prev !== undefined ? prev : availableLocationTypes.map((t) => t.value);
        const nextList = currentList.includes(norm)
          ? currentList.filter((v) => v !== norm)
          : [...currentList, norm];

        try {
          const current = getStoredMapOverlays();
          localStorage.setItem(
            MAP_OVERLAYS_STORAGE_KEY,
            JSON.stringify({ ...current, visibleLocationTypes: nextList })
          );
        } catch {}

        return nextList;
      });

      setShowAdditionalLocations((prevMaster) => {
        if (!prevMaster) {
          try {
            const current = getStoredMapOverlays();
            localStorage.setItem(
              MAP_OVERLAYS_STORAGE_KEY,
              JSON.stringify({ ...current, additionalLocations: true })
            );
          } catch {}
          return true;
        }
        return prevMaster;
      });
    },
    [availableLocationTypes]
  );

  const handleSelectAllTypes = useCallback(() => {
    const allVals = availableLocationTypes.map((t) => t.value);
    setVisibleLocationTypes(allVals);
    setShowAdditionalLocations(true);
    try {
      const current = getStoredMapOverlays();
      localStorage.setItem(
        MAP_OVERLAYS_STORAGE_KEY,
        JSON.stringify({
          ...current,
          additionalLocations: true,
          visibleLocationTypes: allVals,
        })
      );
    } catch {}
  }, [availableLocationTypes]);

  const handleDeselectAllTypes = useCallback(() => {
    setVisibleLocationTypes([]);
    try {
      const current = getStoredMapOverlays();
      localStorage.setItem(
        MAP_OVERLAYS_STORAGE_KEY,
        JSON.stringify({
          ...current,
          visibleLocationTypes: [],
        })
      );
    } catch {}
  }, []);

  // Map panel layout state & imperative refs
  const [mapViewState, setMapViewState] = useState<"normal" | "fullscreen" | "collapsed">("normal");
  const mapPanelRef = useRef<ImperativePanelHandle>(null);
  const timelinePanelRef = useRef<ImperativePanelHandle>(null);

  const triggerMapResize = useCallback(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (mapViewState === "fullscreen") {
      mapPanelRef.current?.resize(60);
      timelinePanelRef.current?.resize(40);
      setMapViewState("normal");
    } else {
      mapPanelRef.current?.resize(100);
      timelinePanelRef.current?.resize(0);
      setMapViewState("fullscreen");
    }
    triggerMapResize();
  }, [mapViewState, triggerMapResize]);

  const handleToggleCollapse = useCallback(() => {
    if (mapViewState === "collapsed") {
      mapPanelRef.current?.resize(60);
      timelinePanelRef.current?.resize(40);
      setMapViewState("normal");
    } else {
      mapPanelRef.current?.resize(0);
      timelinePanelRef.current?.resize(100);
      setMapViewState("collapsed");
    }
    triggerMapResize();
  }, [mapViewState, triggerMapResize]);

  const handlePanelLayout = useCallback((sizes: number[]) => {
    if (!sizes || sizes.length < 2) return;
    const mapSize = sizes[0];
    if (mapSize >= 95) {
      setMapViewState("fullscreen");
    } else if (mapSize <= 5) {
      setMapViewState("collapsed");
    } else {
      setMapViewState("normal");
    }
  }, []);

  const [addStopRouteIndex, setAddStopRouteIndex] = useState<number | null>(
    null,
  );
  const targetRouteIndexRef = useRef<number | null>(null);
  const [changeVehicleRouteIndex, setChangeVehicleRouteIndex] = useState<number | null>(null);
  const [swapDriverRouteIndex, setSwapDriverRouteIndex] = useState<
    number | null
  >(null);

  // Route focus: with 300+ stops across a dozen drivers the map is unreadable
  // when everything is drawn at full strength. Clicking any stop (or a driver
  // row) isolates that driver's route until focus is cleared.
  const [focusedRouteIndex, setFocusedRouteIndex] = useState<number | null>(
    null,
  );

  // Driver search & exact match state — filters both Timeline and Map routes
  const [driverSearch, setDriverSearch] = useState("");
  const [exactMatch, setExactMatch] = useState(false);

  const allowedRouteIndices = useMemo(() => {
    if (!route.result?.routes) return null;
    if (!driverSearch.trim()) return null;

    const indices = new Set<number>();
    route.result.routes.forEach((routeItem, index) => {
      const driverName = routeItem.team_member_name || `Driver ${index + 1}`;
      if (isDriverMatch(driverName, driverSearch, exactMatch)) {
        indices.add(index);
      }
    });
    return indices;
  }, [route.result?.routes, driverSearch, exactMatch]);

  // Global Candidate & Job Search State — search UI is now inside the map (MapSearch component)

  // Index job details once per route/job update for the in-map search.
  const candidateIndex = useMemo(
    () => buildMapSearchIndex(route.result?.routes || [], jobs),
    [route.result?.routes, jobs],
  );

  const handleSelectCandidate = (item: (typeof candidateIndex)[0]) => {
    setFocusedRouteIndex(item.routeIndex);
    if (typeof item.stop.latitude === "number" && typeof item.stop.longitude === "number") {
      setCenter({ lat: item.stop.latitude, lng: item.stop.longitude });
    }
    const markerId = `${item.routeIndex}-${item.stopIndex}`;
    setSelectedMarkerId(markerId);
    setSelectedDrawerJob({
      stopData: item.stop,
      job: item.job,
      driverName: item.driverName,
      leg: item.leg,
      routeIndex: item.routeIndex,
      // Use the timeline-matching display number for the job details card header
      stopIndex: item.displayStopNumber,
    });
  };

  const clearFocus = useCallback(() => {
    setFocusedRouteIndex(null);
    setSelectedDrawerJob(null);
    setSelectedMarkerId(null);
  }, []);

  // Escape clears focus or exits fullscreen.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (mapViewState === "fullscreen") {
          handleToggleFullscreen();
        } else if (focusedRouteIndex !== null) {
          clearFocus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mapViewState, focusedRouteIndex, clearFocus, handleToggleFullscreen]);

  // Focus indices point into route.result.routes — drop focus if the route set
  // changes underneath us (re-optimize, driver swap, stop add/remove).
  useEffect(() => {
    const routeCount = route.result?.routes?.length ?? 0;
    if (focusedRouteIndex !== null && focusedRouteIndex >= routeCount) {
      clearFocus();
    }
  }, [route.result?.routes, focusedRouteIndex, clearFocus]);

  useEffect(() => {
    setTempRouteName(route.route_name);
  }, [route.route_name]);

  const handleNameClick = () => {
    setIsEditingName(true);
  };

  const handleNameSave = async () => {
    if (tempRouteName.trim() === "" || tempRouteName === route.route_name) {
      setIsEditingName(false);
      setTempRouteName(route.route_name);
      return;
    }

    try {
      setIsSavingName(true);
      const updatedRoute = await updateOptimization(route.id, {
        route_name: tempRouteName,
      });
      updateRoute(updatedRoute);
      message.success("Route name updated successfully");
      setIsEditingName(false);
    } catch (error) {
      message.error("Failed to update route name");
      setTempRouteName(route.route_name);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  const handleShareToApp = async () => {
    setIsSharing(true);
    try {
      const result = await shareOptimizationRoutes(route.id);
      setShareResult(result);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ??
        "Failed to share routes. Please try again.";
      message.error(detail);
    } finally {
      setIsSharing(false);
    }
  };

  // Clear route focus if the focused route gets filtered out by driver search
  useEffect(() => {
    if (
      focusedRouteIndex !== null &&
      allowedRouteIndices !== null &&
      !allowedRouteIndices.has(focusedRouteIndex)
    ) {
      clearFocus();
    }
  }, [focusedRouteIndex, allowedRouteIndices, clearFocus]);

  const routePolylines = useMemo(() => {
    return generateRoutePolylines(route, focusedRouteIndex, allowedRouteIndices);
  }, [route, focusedRouteIndex, allowedRouteIndices]);

  // Registered Depots map markers
  const registeredDepotMarkers = useMemo<MarkerData[]>(() => {
    if (!showDepots) return [];
    return depots
      .filter((d) => {
        const lat = Number(d.location?.lat ?? (d as any).latitude);
        const lng = Number(d.location?.lng ?? (d as any).longitude);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      })
      .map((d) => {
        const lat = Number(d.location?.lat ?? (d as any).latitude);
        const lng = Number(d.location?.lng ?? (d as any).longitude);
        const addr =
          typeof d.address === "string"
            ? d.address
            : d.address?.formatted_address ||
              [d.address?.street, d.address?.city].filter(Boolean).join(", ") ||
              "Operational Base";
        return {
          id: `depot-${d.id}`,
          position: { lat, lng },
          title: `${d.name} (Depot)`,
          description: addr,
          isDepot: true,
          color: "#003220",
          zIndex: 99999,
          jobData: {
            id: d.id,
            name: d.name,
            address: addr,
            is_depot: true,
          },
        };
      });
  }, [depots, showDepots]);

  // Additional Locations map markers (filtered by enabled types)
  const additionalLocationMarkers = useMemo<MarkerData[]>(() => {
    if (!showAdditionalLocations) return [];
    return locationMappings
      .filter((m) => {
        const lat = Number(m.latitude);
        const lng = Number(m.longitude);
        if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return false;
        const raw = (m.type || m.location_type || "metro_station")
          .toLowerCase()
          .replace(/\s+/g, "_");
        return isTypeVisible(raw);
      })
      .map((m) => {
        const raw = (m.type || m.location_type || "metro_station")
          .toLowerCase()
          .replace(/\s+/g, "_");
        const matchedType = availableLocationTypes.find((t) => t.value === raw);
        const typeLabel = matchedType
          ? matchedType.label
          : raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        const markerColor = getLocationTypeColor(raw);
        const addr =
          m.address ||
          [m.address, m.city].filter(Boolean).join(", ") ||
          "No address set";
        return {
          id: `loc-${m.id}`,
          position: { lat: Number(m.latitude), lng: Number(m.longitude) },
          title: `${m.name} (${typeLabel})`,
          description: addr,
          isAdditionalLocation: true,
          locationType: raw,
          color: markerColor,
          zIndex: 99999,
          jobData: {
            id: m.id,
            name: m.name,
            type: raw,
            location_type: typeLabel,
            address: addr,
            city: m.city,
            aliases: m.aliases,
            is_location_mapping: true,
          },
        };
      });
  }, [
    locationMappings,
    showAdditionalLocations,
    isTypeVisible,
    availableLocationTypes,
  ]);

  // Total non-depot stops count across all routes
  const totalStopsCount = useMemo(() => {
    if (!route?.result?.routes) return 0;
    return route.result.routes.reduce(
      (acc, r) => acc + getGroupedStopsCount(r.stops),
      0
    );
  }, [route]);

  // Route stop markers (accounting for depot & stops visibility)
  const routeMarkers = useMemo<MarkerData[]>(() => {
    const rawMarkers = generateMapMarkers(route, jobs, allowedRouteIndices, pendingDeletedJobIds);
    return rawMarkers.filter((m) => {
      if (m.isDepot) {
        if (!showDepots) return false;
      } else {
        if (!showStops) return false;
      }
      return true;
    });
  }, [route, jobs, allowedRouteIndices, pendingDeletedJobIds, showDepots, showStops]);

  const allMarkers = useMemo<MarkerData[]>(() => {
    return [...routeMarkers, ...registeredDepotMarkers, ...additionalLocationMarkers];
  }, [routeMarkers, registeredDepotMarkers, additionalLocationMarkers]);

  // While a route is focused only its own stops stay on the map, along with depots and additional locations
  const markers = useMemo<MarkerData[]>(() => {
    if (focusedRouteIndex === null) return allMarkers;
    return allMarkers.filter((m) => {
      if (m.routeIndex !== undefined) {
        return m.routeIndex === focusedRouteIndex;
      }
      return true;
    });
  }, [allMarkers, focusedRouteIndex]);

  // Derived from the full marker set so focusing a route doesn't yank the map
  // to a new default centre.
  const initialCenter = useMemo<google.maps.LatLngLiteral>(() => {
    return allMarkers[0]?.position ?? { lat: 37.7749, lng: -122.4194 };
  }, [allMarkers]);

  const [center, setCenter] =
    useState<google.maps.LatLngLiteral>(initialCenter);

  useEffect(() => {
    setCenter(initialCenter);
  }, [initialCenter]);

  const focusedRoute =
    focusedRouteIndex !== null
      ? route.result?.routes?.[focusedRouteIndex]
      : undefined;

  // Focusing from the timeline recenters the map on that route, otherwise the
  // dispatcher can end up staring at an empty area with everything else gray.
  const handleFocusRoute = (routeIndex: number) => {
    setFocusedRouteIndex(routeIndex);
    const firstStop = route.result?.routes?.[routeIndex]?.stops?.find(
      (s) => typeof s.latitude === "number" && typeof s.longitude === "number",
    );
    if (firstStop) {
      setCenter({ lat: firstStop.latitude, lng: firstStop.longitude });
    }
  };

  const handleStopClick = (
    stop: any,
    routeIndex: number,
    displayStopNumber: number,
  ) => {
    setFocusedRouteIndex(routeIndex);

    const routeItem = route.result?.routes?.[routeIndex];

    // 1. First search targetMarker by routeIndex and sequenceNumber (displayStopNumber)
    let targetMarker = allMarkers.find(
      (m) =>
        m.routeIndex === routeIndex &&
        m.sequenceNumber === displayStopNumber,
    );

    // 2. If not found by sequenceNumber, search by coordinates & routeIndex
    if (!targetMarker) {
      targetMarker = allMarkers.find((m) => {
        if (m.routeIndex !== routeIndex) return false;
        const latStr = typeof stop.latitude === "number" ? stop.latitude.toFixed(4) : null;
        const lngStr = typeof stop.longitude === "number" ? stop.longitude.toFixed(4) : null;
        const mLatStr = m.position.lat.toFixed(4);
        const mLngStr = m.position.lng.toFixed(4);
        return (
          latStr !== null &&
          lngStr !== null &&
          latStr === mLatStr &&
          lngStr === mLngStr
        );
      });
    }

    const markerId = targetMarker
      ? String(targetMarker.id)
      : `${routeIndex}-0`;

    const lat = targetMarker?.position.lat ?? stop.latitude;
    const lng = targetMarker?.position.lng ?? stop.longitude;

    if (typeof lat === "number" && typeof lng === "number") {
      setCenter({ lat, lng });
    }

    // Reset temporarily then set selectedMarkerId to ensure animation triggers and map highlights the marker
    setSelectedMarkerId(null);
    setTimeout(() => {
      setSelectedMarkerId(markerId);
    }, 0);

    // Find corresponding job object
    const jobId = stop.job_id || stop.id;
    const matchedJob = jobs.find((j) => j.id === jobId) || stop.job || (targetMarker?.jobData as Job) || null;
    const driverName = routeItem?.team_member_name || `Driver ${routeIndex + 1}`;

    setSelectedDrawerJob({
      stopData: stop,
      job: matchedJob,
      driverName,
      leg: routeItem?.leg,
      routeIndex,
      stopIndex: displayStopNumber,
    });
  };

  const handleMarkerSelect = (markerId: string | number | null) => {
    setSelectedMarkerId(markerId);
    if (!markerId) {
      setSelectedDrawerJob(null);
      return;
    }

    const markerIdStr = String(markerId);
    if (markerIdStr.startsWith("depot-") || markerIdStr.startsWith("loc-")) {
      setSelectedDrawerJob(null);
      return;
    }

    // Marker ids are `${routeIndex}-${stopIndex}`. Resolving the stop by index
    // (rather than searching by job_id) keeps pickup and drop-off apart for
    // shuttle jobs, which appear twice in the same route.
    const [routeIndexStr, stopIndexStr] = markerIdStr.split("-");
    const routeIndex = Number(routeIndexStr);
    const stopIndex = Number(stopIndexStr);
    const routeItem = route.result?.routes?.[routeIndex];
    const stop = routeItem?.stops?.[stopIndex];
    if (!routeItem || !stop) return;

    setFocusedRouteIndex(routeIndex);

    const foundMarker = allMarkers.find(
      (m) => String(m.id) === String(markerId),
    );
    const matchedJob =
      jobs.find((j) => j.id === stop.job_id) ||
      (foundMarker?.jobData as Job) ||
      null;

    const displayStopNumber =
      foundMarker?.sequenceNumber ?? (stopIndex + 1);

    setSelectedDrawerJob({
      stopData: stop,
      job: matchedJob,
      driverName: routeItem.team_member_name || `Driver ${routeIndex + 1}`,
      leg: routeItem.leg,
      routeIndex,
      stopIndex: displayStopNumber,
    });
  };

  const handleExportRoutes = () => {
    setShowPreview(true);
  };

  // ── Route Operations handlers ──

  const handleJobCreatedForRoute = useCallback(
    async (job: Job) => {
      const targetRouteIndex = targetRouteIndexRef.current ?? addStopRouteIndex;
      if (targetRouteIndex === null) return;
      try {
        const res = await addStopToRoute(route.id, targetRouteIndex, job.id);
        if (res.success) {
          const routeData = route.result?.routes?.[targetRouteIndex];
          const driverName = routeData?.team_member_name || "Driver";
          message.success(res.message || `Job #${job.id} added to ${driverName}'s route! Newly added stop is highlighted.`);
          setHasUnsavedJobEdits(true);

          await fetchOptimization(route.id);
        }
      } catch (error: any) {
        message.error(error?.response?.data?.detail || "Failed to add job");
      }
    },
    [route.id, addStopRouteIndex, fetchOptimization, route.result?.routes],
  );

  const handleRemoveJob = useCallback(
    (routeIndex: number, jobId: number, _stopType?: string, driverName?: string) => {
      setSelectedDrawerJob(null);
      const routeData = route.result?.routes?.[routeIndex];
      const dName = driverName || routeData?.team_member_name || "Driver";

      const selectedJob = jobs.find((job) => job.id === jobId);
      const partner = findRoundTripPartner(selectedJob, jobs);

      if (partner) {
        setRemoveJobTarget({
          routeIndex,
          jobId,
          partnerJobId: partner.id,
          tripLabel: selectedJob?.job_type === "return_only" ? "return" : "outbound",
          driverName: dName,
        });
        return;
      }

      Modal.confirm({
        title: "Remove Job",
        content: `Remove Job #${jobId} from ${dName}'s route? It will be moved back to Unassigned.`,
        okText: "Remove",
        maskClosable: true,
        okButtonProps: {
          style: { backgroundColor: "#dc2626", borderColor: "#dc2626" },
        },
        onOk: async () => {
          try {
            if (!routeData) return;

            const res = await removeStopFromRoute(route.id, routeIndex, jobId);
            if (res.success) {
              message.success(res.message || "Job removed from route");
              setHasUnsavedJobEdits(true);

              await fetchOptimization(route.id);
            }
          } catch (error: any) {
            message.error(
              error?.response?.data?.detail || "Failed to remove job",
            );
          }
        },
      });
    },
    [route.id, route.result?.routes, jobs, fetchOptimization],
  );

  const handleRoundTripRemoval = useCallback(
    async (removeAllLegs: boolean) => {
      const target = removeJobTarget;
      if (!target || isRemovingJob) return;
      const targets = getTripRemovalTargets(
        route.result?.routes || [], target.routeIndex, target.jobId,
        removeAllLegs ? target.partnerJobId : undefined,
      );
      setIsRemovingJob(true);
      try {
        const protectedTarget = targets.find((item) => {
          const job = jobs.find((entry) => entry.id === item.jobId);
          return job && ["in_progress", "in_transit", "completed"].includes(job.status);
        });
        if (protectedTarget) {
          throw new Error(`Job #${protectedTarget.jobId} is in progress or completed and cannot be removed`);
        }
        let currentOptimization = route;
        for (const item of targets) {
          const routeData = currentOptimization.result?.routes?.[item.routeIndex];
          if (!routeData) throw new Error("Route details are unavailable");
          // Omitting stop_type removes both pickup and drop-off for this trip.
          const response = await removeStopFromRoute(route.id, item.routeIndex, item.jobId);
          if (!response.success) throw new Error(response.message || "Failed to remove trip");

          currentOptimization = await fetchOptimization(route.id);
        }
        message.success(removeAllLegs ? "Both round-trip jobs removed from routes" : "Pickup and drop-off removed for the current trip");
        setRemoveJobTarget(null);
      } catch (error: any) {
        message.error(error?.response?.data?.detail || error?.message || "Failed to remove job");
      } finally {

        setIsRemovingJob(false);
      }
    },
    [removeJobTarget, isRemovingJob, route, jobs, fetchOptimization],
  );

  const handleReorderStops = useCallback(
    async (
      routeIndex: number,
      orderedJobIds: number[],
      orderedStopIndices?: number[],
      orderedStops?: any[],
    ) => {

      const originalSnapshot = route;

      // ── Instant Optimistic Update ─────────────────────────────────────────
      // Immediately reflect the new stop sequence so the UI updates with 0 latency!
      if (orderedStopIndices && orderedStopIndices.length > 0 && route.result?.routes) {
        try {
          const targetRoute = route.result.routes[routeIndex];
          if (targetRoute && targetRoute.stops) {
            const depotStart = targetRoute.stops.find(
              (s: any) => s.stop_type === "depot_start" || (s.stop_type === "depot" && s === targetRoute.stops[0])
            );
            const lastStop = targetRoute.stops[targetRoute.stops.length - 1];
            const depotEnd = targetRoute.stops.length > 1 && (lastStop.stop_type === "depot_end" || lastStop.stop_type === "depot")
              ? lastStop
              : null;

            const reorderedStops = [
              ...(depotStart ? [depotStart] : []),
              ...orderedStopIndices.map((idx) => targetRoute.stops[idx]).filter(Boolean),
              ...(depotEnd ? [depotEnd] : []),
            ];

            const updatedRoutes = [...route.result.routes];
            updatedRoutes[routeIndex] = {
              ...targetRoute,
              stops: reorderedStops,
            };

            const updatedResult = {
              ...route.result,
              routes: updatedRoutes,
            };

            useOptimizationStore.setState({
              currentOptimization: {
                ...route,
                result: updatedResult,
              },
            });
          }
        } catch (e) {
          console.warn("Optimistic update error:", e);
        }
      }

      setReorderingRouteIndex(routeIndex);

      try {
        const res = await reorderRouteStops(
          route.id,
          routeIndex,
          orderedJobIds,
          orderedStopIndices,
          orderedStops,
        );
        if (res.success) {
          message.success(res.message || "Stops reordered successfully!");
          setHasUnsavedJobEdits(true);

          await fetchOptimization(route.id);
        }
      } catch (error: any) {
        // Rollback optimistic update on failure
        useOptimizationStore.setState({
          currentOptimization: originalSnapshot,
        });
        message.error(
          error?.response?.data?.detail || "Failed to reorder stops",
        );
      } finally {
        setReorderingRouteIndex(null);
      }
    },
    [route, fetchOptimization],
  );

  const handleSaveAndReOptimize = useCallback(
    async (
      routeIndex: number,
      orderedJobIds: number[],
      orderedStopIndices?: number[],
      orderedStops?: any[],
    ) => {
      const driverName =
        route.result?.routes?.[routeIndex]?.team_member_name || "Driver";

      try {
        message.loading({ content: "Saving stop order…", key: "save_reopt", duration: 0 });
        // Save the new stop order and recalculate ETAs & polylines
        const res = await reorderRouteStops(
          route.id,
          routeIndex,
          orderedJobIds,
          orderedStopIndices,
          orderedStops,
        );
        if (res.success) {
          // Save removals through route history before reoptimization.
          if (pendingDeletedJobIds.size > 0) {
            await applyStagedRemovals();

          }

          setOptimizationResult("processing");
          const reoptRes = await reOptimizeRoute(route.id, routeIndex);
          if (reoptRes.success) {
            message.loading({ content: `Re-optimizing ${driverName}'s route…`, key: "save_reopt", duration: 0 });
            setPendingDeletedJobIds(new Set());
            setHasUnsavedJobEdits(false);

            await pollUntilComplete(route.id);
            message.success({ content: `${driverName}'s route re-optimized successfully!`, key: "save_reopt" });
          } else {
            await fetchOptimization(route.id);
            message.success({ content: "Stop order saved!", key: "save_reopt" });
          }
        }
      } catch (error: any) {
        message.error({
          content: error?.response?.data?.detail || error?.message || "Failed to save & reoptimize route",
          key: "save_reopt",
        });
        setOptimizationResult("failed", undefined, error?.response?.data?.detail || "Failed to reoptimize route");
      }
    },
    [route.id, route.result, fetchOptimization, setOptimizationResult, pendingDeletedJobIds, applyStagedRemovals, pollUntilComplete],
  );

  const handleReverseRoute = useCallback(
    async (routeIndex: number) => {
      const driverName =
        route.result?.routes?.[routeIndex]?.team_member_name || "Driver";
      Modal.confirm({
        title: "Reverse Route",
        content: `Reverse the stop order for ${driverName}'s route?`,
        okText: "Reverse",
        okButtonProps: { style: { backgroundColor: "#003220" } },
        onOk: async () => {
          try {
            const res = await reverseRoute(route.id, routeIndex);
            if (res.success) {
              message.success(res.message);

              await fetchOptimization(route.id);
            }
          } catch (error: any) {
            message.error(
              error?.response?.data?.detail || "Failed to reverse route",
            );
          }
        },
      });
    },
    [route.id, route.result?.routes, fetchOptimization],
  );

  const handleReOptimize = useCallback(
    async (routeIndex: number) => {
      const driverName =
        route.result?.routes?.[routeIndex]?.team_member_name || "Driver";
      Modal.confirm({
        title: "Reoptimize Route",
        content: `Run the routing engine again just for ${driverName}'s route to find a better sequence?`,
        okText: "Reoptimize",
        okButtonProps: { style: { backgroundColor: "#003220" } },
        onOk: async () => {
          try {
          // Save removals through route history before reoptimization.
            if (pendingDeletedJobIds.size > 0) {
              await applyStagedRemovals();

            }

            setOptimizationResult("processing");
            const res = await reOptimizeRoute(route.id, routeIndex);
            if (res.success) {
              message.loading({ content: `Re-optimizing ${driverName}'s route…`, key: "reopt", duration: 0 });
              setPendingDeletedJobIds(new Set());
              setHasUnsavedJobEdits(false);
              // Poll until the async worker finishes

              await pollUntilComplete(route.id);
              message.success({ content: `${driverName}'s route re-optimized!`, key: "reopt" });
            }
          } catch (error: any) {
            message.error({ content: error?.response?.data?.detail || error?.message || "Failed to reoptimize route", key: "reopt" });
            setOptimizationResult("failed", undefined, error?.response?.data?.detail || "Failed to reoptimize route");
          }
        },
      });
    },
    [route.id, route.result?.routes, setOptimizationResult, pendingDeletedJobIds, applyStagedRemovals, pollUntilComplete],
  );

  const handleSwapSuccess = useCallback(() => {
    setOptimizationResult("processing");
    // Poll until the async swap-driver worker finishes

    pollUntilComplete(route.id)
      .catch(() => {
        // Error already set in store
      });
  }, [setOptimizationResult, pollUntilComplete, route.id]);

  const handleAddUnassignedJob = useCallback(
    async (targetRouteIndex: number, jobId: number, position?: number) => {
      try {
        message.loading({ content: "Adding job to route...", key: "add-unassigned" });
        await addStopToRoute(route.id, targetRouteIndex, jobId, position);
        message.success({ content: "Job assigned successfully!", key: "add-unassigned" });

        setHasUnsavedJobEdits(true);
        await fetchOptimization(route.id);
      } catch (err: any) {
        message.error({
          content: err?.response?.data?.detail || "Failed to assign job",
          key: "add-unassigned",
        });
      }
    },
    [route.id, fetchOptimization]
  );

  const handleTransferStops = useCallback(
    async (
      sourceRouteIndex: number,
      targetRouteIndex: number,
      jobIds: number[],
      targetPosition?: number,
      reoptimize?: boolean,
    ) => {
      if (sourceRouteIndex === targetRouteIndex || jobIds.length === 0) return;

      const sourceRoute = route.result?.routes?.[sourceRouteIndex];
      const targetRoute = route.result?.routes?.[targetRouteIndex];
      const targetDriverName = targetRoute?.team_member_name || `Driver #${targetRouteIndex + 1}`;

      const originalSnapshot = route;

      // ── Instant Optimistic Update ─────────────────────────────────────────
      try {
        if (route.result?.routes) {
          const jobIdsSet = new Set(jobIds);
          const movedStops = (sourceRoute?.stops || [])
            .filter((s: any) => s.job_id && jobIdsSet.has(s.job_id))
            .map((s: any) => ({ ...s, is_new: true }));

          const remainingSourceStops = (sourceRoute?.stops || []).filter(
            (s: any) => !s.job_id || !jobIdsSet.has(s.job_id)
          );

          const targetStops = [...(targetRoute?.stops || [])];
          const lastDepotEndIdx = targetStops.findIndex(
            (s: any, idx: number) => idx > 0 && (s.stop_type === "depot_end" || s.stop_type === "depot")
          );
          const insertIdx =
            targetPosition !== undefined
              ? Math.min(Math.max(0, targetPosition), targetStops.length)
              : lastDepotEndIdx >= 0
              ? lastDepotEndIdx
              : targetStops.length;

          targetStops.splice(insertIdx, 0, ...movedStops);

          const updatedRoutes = [...route.result.routes];
          updatedRoutes[sourceRouteIndex] = {
            ...sourceRoute,
            stops: remainingSourceStops,
          };
          updatedRoutes[targetRouteIndex] = {
            ...targetRoute,
            stops: targetStops,
          };

          useOptimizationStore.setState({
            currentOptimization: {
              ...route,
              result: {
                ...route.result,
                routes: updatedRoutes,
              },
            },
          });
        }
      } catch (e) {
        console.warn("Transfer optimistic update error:", e);
      }

      try {
        message.loading({
          content: `Transferring ${jobIds.length} stop(s) to ${targetDriverName}…`,
          key: "transfer_stops",
          duration: 0,
        });

        const res = await transferRouteStops(
          route.id,
          sourceRouteIndex,
          targetRouteIndex,
          jobIds,
          targetPosition,
          reoptimize,
        );

        if (res.success) {
          message.success({
            content: res.message || `Transferred ${jobIds.length} stop(s) to ${targetDriverName}!`,
            key: "transfer_stops",
          });
          setHasUnsavedJobEdits(true);

          if (reoptimize && res.is_async) {
            setOptimizationResult("processing");

            await pollUntilComplete(route.id);
          } else {
            await fetchOptimization(route.id);
          }
        }
      } catch (error: any) {
        // Rollback on failure
        useOptimizationStore.setState({
          currentOptimization: originalSnapshot,
        });
        message.error({
          content: error?.response?.data?.detail || error?.message || "Failed to transfer stops",
          key: "transfer_stops",
        });
      }
    },
    [route, fetchOptimization, pollUntilComplete, setOptimizationResult],
  );

  const handleStageDeleteJob = useCallback((jobId: number) => {
    const job = jobs.find((j) => j.id === jobId);
    const isShuttle = job?.template_type === 'worker_shuttle' || !!job?.worker_shuttle_detail;

    const doDelete = (ids: number[]) => {
      setPendingDeletedJobIds((prev) => {
        const next = new Set(prev);
        ids.forEach(id => next.add(id));
        return next;
      });
      setHasUnsavedJobEdits(true);
      if (ids.length > 1) {
        message.info(`Jobs #${ids.join(', #')} staged for deletion. Click 'Reoptimize All Routes' to apply.`);
      } else {
        message.info(`Job #${ids[0]} staged for deletion. Click 'Reoptimize All Routes' to apply globally, or use 'Reoptimize Route' on the specific route.`);
      }
    };

    if (isShuttle) {
      const shuttleValue = (keys: string[]) => {
        for (const key of keys) {
          const val = (job as any)?.[key] || (job?.worker_shuttle_detail as any)?.[key] || (job?.custom_fields as any)?.[key];
          if (val !== undefined && val !== null && val !== "") return String(val);
        }
        return undefined;
      };

      const tripType = job?.job_type || shuttleValue(["pickup_type", "job_type"]);

      // If it's part of a round trip, try to find the sister job
      if (tripType === 'round_trip' || tripType === 'one_way' || tripType === 'return_only') {
        const candidateName = shuttleValue(["candidate_name"]);
        const quantId = shuttleValue(["quant_id", "quart_id"]);
        const schedDate = job?.scheduled_date || shuttleValue(["scheduled_date"]);

        if (candidateName) {
          const sisterJob = jobs.find((j) => {
             if (j.id === jobId) return false;
             const isAlsoShuttle = j.template_type === 'worker_shuttle' || !!j.worker_shuttle_detail;
             if (!isAlsoShuttle) return false;

             const jShuttleValue = (keys: string[]) => {
                for (const key of keys) {
                  const val = (j as any)?.[key] || (j?.worker_shuttle_detail as any)?.[key] || (j?.custom_fields as any)?.[key];
                  if (val !== undefined && val !== null && val !== "") return String(val);
                }
                return undefined;
             };

             const jName = jShuttleValue(["candidate_name"]);
             const jQuant = jShuttleValue(["quant_id", "quart_id"]);
             const jDate = j.scheduled_date || jShuttleValue(["scheduled_date"]);

             return (jName === candidateName && jDate === schedDate && (jQuant === quantId || (!jQuant && !quantId)));
          });

          if (sisterJob && !pendingDeletedJobIds.has(sisterJob.id)) {
            Modal.confirm({
              title: "Round Trip Detected",
              content: "This job is part of a round trip. Would you like to delete the other leg's job as well?",
              okText: "Delete Both Legs",
              cancelText: "Delete Only This Leg",
              okButtonProps: { style: { backgroundColor: "#dc2626", borderColor: "#dc2626" } },
              onOk: () => doDelete([jobId, sisterJob.id]),
              onCancel: () => doDelete([jobId])
            });
            return;
          }
        }
      }
    }

    doDelete([jobId]);
  }, [jobs, pendingDeletedJobIds]);

  const handleUndoStageDeleteJob = useCallback((jobId: number) => {
    setPendingDeletedJobIds((prev) => {
      const next = new Set(prev);
      next.delete(jobId);
      if (next.size === 0) {
        setHasUnsavedJobEdits(false);
      }
      return next;
    });
    message.info(`Job #${jobId} deletion undone.`);
  }, []);

  // ── Area selection (draw a polygon → bulk move / delete jobs inside) ──
  const [isDrawingArea, setIsDrawingArea] = useState(false);
  const [selectionArea, setSelectionArea] = useState<google.maps.LatLngLiteral[] | null>(null);
  const [isMoveAreaModalOpen, setIsMoveAreaModalOpen] = useState(false);
  const [moveAreaTargetIndex, setMoveAreaTargetIndex] = useState<number | null>(null);
  const [isMovingAreaJobs, setIsMovingAreaJobs] = useState(false);
  const transferStopsRef = useRef(handleTransferStops);
  transferStopsRef.current = handleTransferStops;

  const areaSelectedJobs = useMemo(() => {
    if (!selectionArea || selectionArea.length < 3) return [];
    const found = new Map<string, { jobId: number; routeIndex: number }>();
    route.result?.routes?.forEach((r: any, routeIndex: number) => {
      if (allowedRouteIndices && !allowedRouteIndices.has(routeIndex)) return;
      if (focusedRouteIndex !== null && focusedRouteIndex !== routeIndex) return;
      (r.stops || []).forEach((stop: any) => {
        if (!stop.job_id || typeof stop.latitude !== "number" || typeof stop.longitude !== "number") return;
        if (["depot", "depot_start", "depot_end", "break"].includes(stop.stop_type)) return;
        if (pendingDeletedJobIds.has(Number(stop.job_id))) return;
        if (!isPointInPolygon({ lat: stop.latitude, lng: stop.longitude }, selectionArea)) return;
        found.set(`${routeIndex}-${stop.job_id}`, { jobId: Number(stop.job_id), routeIndex });
      });
    });
    return Array.from(found.values());
  }, [selectionArea, route.result?.routes, allowedRouteIndices, focusedRouteIndex, pendingDeletedJobIds]);

  const areaSelectedJobCount = useMemo(
    () => new Set(areaSelectedJobs.map((j) => j.jobId)).size,
    [areaSelectedJobs],
  );

  const clearAreaSelection = useCallback(() => {
    setSelectionArea(null);
    setIsDrawingArea(false);
    setIsMoveAreaModalOpen(false);
    setMoveAreaTargetIndex(null);
  }, []);

  const handleAreaDrawn = useCallback((path: google.maps.LatLngLiteral[]) => {
    setIsDrawingArea(false);
    if (path.length < 3) return;
    setSelectionArea(path);
  }, []);

  const handleToggleAreaDrawing = useCallback(() => {
    if (isDrawingArea) {
      setIsDrawingArea(false);
      return;
    }
    setSelectionArea(null);
    setIsDrawingArea(true);
  }, [isDrawingArea]);

  useEffect(() => {
    if (!isDrawingArea && !selectionArea) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isMoveAreaModalOpen) clearAreaSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDrawingArea, selectionArea, isMoveAreaModalOpen, clearAreaSelection]);

  const handleDeleteAreaJobs = useCallback(() => {
    const ids = Array.from(new Set(areaSelectedJobs.map((j) => j.jobId)));
    if (ids.length === 0) return;
    const protectedJob = ids.find((id) => {
      const job = jobs.find((j) => j.id === id);
      return job && ["in_progress", "in_transit", "completed"].includes(job.status);
    });
    if (protectedJob !== undefined) {
      message.error(`Job #${protectedJob} is in progress or completed and cannot be deleted`);
      return;
    }
    Modal.confirm({
      title: `Delete ${ids.length} job${ids.length > 1 ? "s" : ""}`,
      content: `Delete all ${ids.length} job(s) inside the selected area? They are staged for deletion until you click 'Reoptimize All Routes'.`,
      okText: "Delete All",
      maskClosable: true,
      okButtonProps: { style: { backgroundColor: "#dc2626", borderColor: "#dc2626" } },
      onOk: () => {
        setPendingDeletedJobIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.add(id));
          return next;
        });
        setHasUnsavedJobEdits(true);
        message.info(`${ids.length} job(s) staged for deletion. Click 'Reoptimize All Routes' to apply.`);
        clearAreaSelection();
      },
    });
  }, [areaSelectedJobs, jobs, clearAreaSelection]);

  const handleConfirmMoveAreaJobs = useCallback(async () => {
    if (moveAreaTargetIndex === null || isMovingAreaJobs) return;
    const bySource = new Map<number, number[]>();
    areaSelectedJobs.forEach(({ jobId, routeIndex }) => {
      if (routeIndex === moveAreaTargetIndex) return;
      bySource.set(routeIndex, [...(bySource.get(routeIndex) || []), jobId]);
    });
    if (bySource.size === 0) {
      message.info("All selected jobs are already on that route");
      return;
    }
    setIsMovingAreaJobs(true);
    try {
      for (const [sourceIndex, jobIds] of Array.from(bySource.entries())) {
        await transferStopsRef.current(sourceIndex, moveAreaTargetIndex, jobIds);
        // Let the re-rendered handler (fresh route state) land in the ref.
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      clearAreaSelection();
    } finally {
      setIsMovingAreaJobs(false);
    }
  }, [moveAreaTargetIndex, isMovingAreaJobs, areaSelectedJobs, clearAreaSelection]);

  const handleReOptimizeAll = useCallback(async () => {
    Modal.confirm({
      title: "Reoptimize All Routes",
      content:
        pendingDeletedJobIds.size > 0
          ? `${pendingDeletedJobIds.size} job(s) will be removed from routes and all routes re-optimized. Continue?`
          : "This will re-run the full optimization with updated job data. Old routes will be replaced. Continue?",
      okText: "Reoptimize All Routes",
      okButtonProps: { style: { backgroundColor: "#003220", borderColor: "#003220" } },
      onOk: async () => {
        try {
          // Save removals through route history before reoptimization.
          if (pendingDeletedJobIds.size > 0) {
            await applyStagedRemovals();

          }

          // Pre-optimization ETA & Driver snapshot for WhatsApp notification foundation
          const preOptimizationEtaMap = new Map<number, { driverName: string; arrivalTime: string }>();
          route.result?.routes?.forEach((r) => {
            const driver = r.team_member_name || "Driver";
            r.stops?.forEach((s: any) => {
              const jId = s.job_id || s.job?.id;
              if (jId && s.arrival_time) {
                preOptimizationEtaMap.set(Number(jId), { driverName: driver, arrivalTime: s.arrival_time });
              }
            });
          });

          message.loading({ content: "Re-optimization queued. Waiting for result…", key: "reopt_all", duration: 0 });
          await reOptimize(route.id);
          setPendingDeletedJobIds(new Set());
          setHasUnsavedJobEdits(false);
          // Poll until the global re-optimize worker finishes

          await pollUntilComplete(route.id);
          message.success({ content: "All routes re-optimized!", key: "reopt_all" });

          console.log(
            "[WhatsApp Notification Service] Staged re-optimization triggered successfully. Tracked pre-opt candidates:",
            preOptimizationEtaMap.size
          );
        } catch (err: any) {
          message.error({ content: err?.message || "Failed to re-optimize. Please try again.", key: "reopt_all" });
        }
      },
    });
  }, [reOptimize, route.id, route.result?.routes, pendingDeletedJobIds, applyStagedRemovals, pollUntilComplete]);

  const getRouteData = (index: number | null) =>
    index !== null ? route.result?.routes?.[index] : null;

  const totalStops =
    route.result?.routes?.reduce((acc, r) => acc + (r.stops?.length || 0), 0) ||
    0;
  const totalVehicles = route.result?.routes?.length || 0;

  const formattedRouteDate = useMemo(() => {
    if (!route?.scheduled_date) return "";
    const d = dayjs(route.scheduled_date);
    return d.isValid() ? d.format("ddd, MMM D") : route.scheduled_date;
  }, [route?.scheduled_date]);

  const isRouteOptimized =
    route?.status === "completed" ||
    route?.status === "success" ||
    Boolean(route?.result?.routes && route.result.routes.length > 0);

  const hasPendingOptimization = useMemo(() => {
    if (hasUnsavedJobEdits) return true;
    if (!route.result?.routes) return false;
    return route.result.routes.some((r) =>
      r.stops?.some((s: any) => s.is_new || s.time_edited || s.is_edited)
    );
  }, [hasUnsavedJobEdits, route.result?.routes]);

  const handleBackToPlanRoutes = () => {
    setCurrentTab("routes");
    router.push("/plan");
  };

  return (
    <div className="flex flex-col h-full absolute inset-0">
      {/* Full-screen loading overlay — shown during any async optimization op */}
      {(isOptimizing || route.status === "processing" || route.status === "queued") && (
        <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-10 py-8 flex flex-col items-center gap-4 min-w-[280px]">
            <div className="relative">
              <Spin size="large" />
              <div className="absolute inset-0 rounded-full animate-ping opacity-20 bg-emerald-400" style={{ animationDuration: "1.5s" }} />
            </div>
            <div className="text-center">
              <div className="font-bold text-gray-900 text-base">Optimizing Routes</div>
              <div className="text-xs text-gray-500 mt-1">
                {route.status === "processing" || route.status === "queued"
                  ? "The routing engine is running in the background. This usually takes 10–60 seconds."
                  : "Processing your request…"}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-4 py-1.5 font-semibold">
              <LoadingOutlined spin />
              <span>Auto-refreshing when complete</span>
            </div>
          </div>
        </div>
      )}

      {/* Header - matching NavBar height */}
      <nav className="bg-white border-b border-gray-200 px-3 shrink-0">
        <div className="flex items-center justify-between h-14 relative">
          {/* Left: Back Button + Route Name & Subtitle Stats */}
          <div className="flex items-center gap-3">
            <Icon
              component={ArrowLeftOutlined}
              style={{ color: "#003220" }}
              onClick={handleBackToPlanRoutes}
              className="cursor-pointer text-base hover:opacity-75 transition-opacity"
            />

            <div className="flex flex-col justify-center min-w-0">
              {isEditingName ? (
                <Input
                  size="small"
                  value={tempRouteName}
                  onChange={(e) => setTempRouteName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  autoFocus
                  disabled={isSavingName}
                  maxLength={50}
                  className="w-56 text-sm font-semibold rounded-none"
                />
              ) : (
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={handleNameClick}
                  title="Click to edit route name"
                >
                  <Title
                    level={5}
                    className="!m-0 group-hover:text-primary transition-colors truncate font-bold text-gray-900 leading-tight"
                    style={{ margin: 0 }}
                  >
                    {route.route_name}
                  </Title>
                  <EditOutlined className="text-gray-400 group-hover:text-primary transition-colors text-xs shrink-0" />
                </div>
              )}

              {/* Stats below Route Name (Sample UI style) */}
              <div className="flex items-center text-xs text-gray-500 font-normal leading-tight mt-0.5 select-none">
                {formattedRouteDate && <span>{formattedRouteDate}</span>}
                {formattedRouteDate && <span className="mx-1 text-gray-400">·</span>}
                <span>
                  {totalVehicles} {totalVehicles === 1 ? "route" : "routes"}
                </span>
                {hasPendingOptimization ? (
                  <>
                    <span className="mx-1 text-gray-400">·</span>
                    <Tooltip title="Changes were made (jobs added, edited, reordered, or transferred). Click to re-optimize routes.">
                      <span
                        onClick={handleReOptimizeAll}
                        className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 font-semibold cursor-pointer transition-colors"
                      >
                        <span className="w-1.5 h-1.5 rounded-none bg-amber-500 animate-pulse" />
                        Optimization Pending
                      </span>
                    </Tooltip>
                  </>
                ) : isRouteOptimized ? (
                  <>
                    <span className="mx-1 text-gray-400">·</span>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-none bg-emerald-600" />
                      Optimized
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex gap-2">
            {/* Undo Button */}
            {undoStep && (
              <Button
                onClick={handleUndo}
                className="border-slate-300 text-slate-700 bg-white font-semibold flex items-center gap-2 mr-2"
                loading={isUndoing}
                disabled={isUndoing || isRemovingJob || (route.status !== "completed" && route.status !== "failed")}
                icon={
                  <Icon component={() => (
                    <svg width="1em" height="1em" fill="currentColor" viewBox="0 0 1024 1024">
                      <path d="M793 242H366v-74c0-6.7-7.7-10.4-12.9-6.3l-142 112a8 8 0 0 0 0 12.6l142 112c5.2 4.1 12.9.4 12.9-6.3v-74h415v470H175c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h618c35.3 0 64-28.7 64-64V306c0-35.3-28.7-64-64-64z"/>
                    </svg>
                  )} />
                }
              >
                Undo {undoStep.label}
              </Button>
            )}

            {/* Reoptimize All Routes button — highlighted when job edits are pending */}
            {route.status === "completed" && (
              <Tooltip title="Reoptimize All Routes">
                <Button
                  aria-label="Reoptimize All Routes"
                  icon={<ReloadOutlined />}
                  onClick={handleReOptimizeAll}
                  className={hasPendingOptimization
                    ? "border-amber-400 text-amber-700 bg-amber-50 font-semibold"
                    : ""}
                />
              </Tooltip>
            )}
            <Button icon={<ExportOutlined />} onClick={handleExportRoutes}>
              Export
            </Button>
            <Button
              type="primary"
              icon={isSharing ? <LoadingOutlined /> : <ShareAltOutlined />}
              loading={isSharing}
              disabled={isSharing}
              onClick={handleShareToApp}
            >
              Share to App
            </Button>
          </div>
        </div>
      </nav>

      {/* Error Banner */}
      {error && (
        <div className="p-3 bg-red-50 shrink-0 border-b border-red-100">
          <Alert
            message="Optimization Issue"
            description={error}
            type="error"
            showIcon
          />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative">
        <PanelGroup direction="vertical" onLayout={handlePanelLayout}>
          {/* Map Panel */}
          <Panel ref={mapPanelRef} defaultSize={60} minSize={0} collapsible={true}>
            <div
              className={`h-full w-full ${
                mapViewState === "fullscreen"
                  ? "fixed inset-0 z-40 bg-white"
                  : "relative"
              }`}
            >
              <GoogleMaps
                polylines={routePolylines}
                markers={markers}
                center={center}
                zoom={12}
                selectedMarkerId={selectedMarkerId}
                onMarkerSelect={handleMarkerSelect}
                onMapClick={clearFocus}
                showDirectionArrows={true}
                onToggleFullscreen={handleToggleFullscreen}
                onToggleCollapse={handleToggleCollapse}
                mapViewState={mapViewState}
                InfoWindowModal={RouteInfoWindow}
                isDrawingArea={isDrawingArea}
                onAreaDrawn={handleAreaDrawn}
                selectionArea={selectionArea}
                mapToolbarExtra={
                  <Popover
                    title="Map settings"
                    trigger="click"
                    placement="bottomRight"
                    open={isMapSettingsOpen}
                    onOpenChange={setIsMapSettingsOpen}
                    content={
                      <div className="flex flex-col gap-3 min-w-[280px] max-w-[320px] text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setIsMapSettingsOpen(false);
                            handleToggleAreaDrawing();
                          }}
                          aria-pressed={isDrawingArea}
                          className="flex items-center gap-2 text-left py-1 text-gray-700 hover:text-[#003220] cursor-pointer"
                        >
                          <Pencil size={15} />
                          {isDrawingArea ? "Cancel drawing" : "Draw an area to select jobs"}
                        </button>
                        <div className="flex items-center justify-between gap-4 border-t border-gray-100 pt-3">
                          <span id="driver-working-time-label" className="text-gray-700">
                            Show driver working time in timeline
                          </span>
                          <Switch
                            size="small"
                            aria-labelledby="driver-working-time-label"
                            checked={showDriverWorkingTime}
                            onChange={handleToggleDriverWorkingTime}
                            className={showDriverWorkingTime ? "!bg-[#003220]" : ""}
                          />
                        </div>
                      </div>
                    }
                  >
                    <Button
                      type="text"
                      aria-label="Map settings"
                      aria-expanded={isMapSettingsOpen}
                      title="Map settings"
                      icon={<Settings size={16} />}
                      style={{
                        borderRadius: 0,
                        color: isDrawingArea || selectionArea ? "#E8834B" : undefined,
                      }}
                    />
                  </Popover>
                }
                showInfoWindow={(m) => Boolean(m.isDepot || m.isAdditionalLocation)}
                layersDropdownExtra={
                  <div className="flex flex-col gap-2.5 text-xs font-sans min-w-[240px] max-w-[280px]">
                    <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                      Map Overlays
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="font-semibold text-gray-700 flex items-center gap-2">
                        <Milestone size={14} className="text-[#003220]" />
                        <span>Stops</span>
                        {totalStopsCount > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-none font-bold">
                            {totalStopsCount}
                          </span>
                        )}
                      </span>
                      <Switch
                        size="small"
                        checked={showStops}
                        onChange={handleToggleStops}
                        className={showStops ? "!bg-[#003220]" : ""}
                      />
                    </div>
                    <div className="flex items-center justify-between py-0.5">
                      <span className="font-semibold text-gray-700 flex items-center gap-2">
                        <Building2 size={14} className="text-[#003220]" />
                        <span>Depots</span>
                        {depots.length > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-none font-bold">
                            {depots.length}
                          </span>
                        )}
                      </span>
                      <Switch
                        size="small"
                        checked={showDepots}
                        onChange={handleToggleDepots}
                        className={showDepots ? "!bg-[#003220]" : ""}
                      />
                    </div>

                    {/* Additional Locations with expandable type configuration */}
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between py-0.5">
                        <button
                          type="button"
                          disabled={!showAdditionalLocations}
                          aria-expanded={
                            showAdditionalLocations
                              ? isAdditionalTypesExpanded
                              : false
                          }
                          className={`flex items-center gap-1.5 select-none group bg-transparent border-none p-0 text-left ${
                            showAdditionalLocations
                              ? "cursor-pointer"
                              : "cursor-default"
                          }`}
                          onClick={() => setIsAdditionalTypesExpanded((prev) => !prev)}
                        >
                          <span
                            className={`text-gray-400 transition-transform duration-200 items-center justify-center w-4 h-4 -ml-0.5 ${
                              showAdditionalLocations
                                ? "inline-flex group-hover:text-gray-700"
                                : "hidden"
                            }`}
                            style={{
                              transform: isAdditionalTypesExpanded
                                ? "rotate(90deg)"
                                : "rotate(0deg)",
                            }}
                          >
                            <ChevronRight size={13} />
                          </span>
                          <span className="font-semibold text-gray-700 flex items-center gap-2">
                            <MapPin size={14} className="text-[#003220]" />
                            <span>Additional Locations</span>
                            {locationMappings.length > 0 && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-none font-bold">
                                {showAdditionalLocations &&
                                visibleLocationTypes !== undefined &&
                                visibleLocationTypes.length < availableLocationTypes.length
                                  ? `${additionalLocationMarkers.length}/${locationMappings.length}`
                                  : locationMappings.length}
                              </span>
                            )}
                          </span>
                        </button>
                        <Switch
                          size="small"
                          checked={showAdditionalLocations}
                          onChange={handleToggleAdditionalLocations}
                          className={showAdditionalLocations ? "!bg-[#003220]" : ""}
                        />
                      </div>

                      {/* Expandable Location Types breakdown */}
                      {showAdditionalLocations &&
                        isAdditionalTypesExpanded &&
                        availableLocationTypes.length > 0 && (
                        <div className="ml-5 pl-2.5 pr-1 py-1.5 border-l-2 border-[#003220]/25 bg-gray-50/80 rounded-sm flex flex-col gap-1.5 my-1">
                          <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium pb-1 border-b border-gray-200/60">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                              By Type ({activeTypesCount}/{availableLocationTypes.length})
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={handleSelectAllTypes}
                                className="text-[10px] font-semibold text-[#003220] hover:underline bg-transparent border-none cursor-pointer p-0"
                              >
                                All
                              </button>
                              <span className="text-gray-300">|</span>
                              <button
                                type="button"
                                onClick={handleDeselectAllTypes}
                                className="text-[10px] font-semibold text-gray-500 hover:underline bg-transparent border-none cursor-pointer p-0"
                              >
                                None
                              </button>
                            </div>
                          </div>

                          <Input
                            size="small"
                            allowClear
                            value={locationTypeSearch}
                            onChange={(event) =>
                              setLocationTypeSearch(event.target.value)
                            }
                            placeholder="Search location types"
                            aria-label="Search additional location types"
                            prefix={
                              <Search size={12} className="text-gray-400" />
                            }
                            className="!text-[11px]"
                          />

                          <div className="flex flex-col gap-1 max-h-[170px] overflow-y-auto pr-1 custom-scrollbar">
                            {filteredLocationTypes.map((type) => {
                              const checked = isTypeVisible(type.value);
                              return (
                                <div
                                  key={type.value}
                                  onClick={() => handleToggleType(type.value)}
                                  className={`flex items-center justify-between py-1 px-1.5 rounded cursor-pointer select-none transition-colors ${
                                    checked && showAdditionalLocations
                                      ? "hover:bg-gray-200/60"
                                      : "hover:bg-gray-200/40 opacity-70"
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 pr-2">
                                    <span
                                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                                      style={{ backgroundColor: type.color }}
                                    />
                                    <span
                                      className={`text-[11px] truncate ${
                                        checked && showAdditionalLocations
                                          ? "text-gray-800 font-medium"
                                          : "text-gray-500"
                                      }`}
                                      title={type.label}
                                    >
                                      {type.label}
                                    </span>
                                    {type.count > 0 && (
                                      <span className="text-[10px] font-mono px-1 py-0.1 bg-gray-200/70 text-gray-600 rounded text-center shrink-0">
                                        {type.count}
                                      </span>
                                    )}
                                  </div>
                                  <Checkbox
                                    checked={checked}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={() => handleToggleType(type.value)}
                                    className="!m-0 shrink-0"
                                  />
                                </div>
                              );
                            })}
                            {filteredLocationTypes.length === 0 && (
                              <div className="py-3 px-2 text-center text-[11px] text-gray-400">
                                No location types found
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                }
              />

              <DrawingStatusTip active={isDrawingArea} />
              {selectionArea && !isDrawingArea && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white border border-gray-200 shadow-md px-3 py-1.5">
                  <span className="text-xs font-semibold text-gray-800">
                    {areaSelectedJobCount} job{areaSelectedJobCount === 1 ? "" : "s"} selected
                  </span>
                  <Button
                    size="small"
                    disabled={areaSelectedJobCount === 0}
                    icon={<ArrowRightLeft size={13} />}
                    onClick={() => setIsMoveAreaModalOpen(true)}
                    style={{ borderRadius: 0 }}
                  >
                    Move
                  </Button>
                  <Button
                    size="small"
                    danger
                    disabled={areaSelectedJobCount === 0}
                    icon={<Trash2 size={13} />}
                    onClick={handleDeleteAreaJobs}
                    style={{ borderRadius: 0 }}
                  >
                    Delete
                  </Button>
                  <Tooltip title="Clear selection (Esc)">
                    <button
                      type="button"
                      onClick={clearAreaSelection}
                      aria-label="Clear area selection"
                      className="flex items-center justify-center w-5 h-5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer border-none outline-none bg-transparent"
                    >
                      <X size={13} />
                    </button>
                  </Tooltip>
                </div>
              )}

              <Modal
                open={isMoveAreaModalOpen}
                title={`Move ${areaSelectedJobCount} job${areaSelectedJobCount === 1 ? "" : "s"} to another route`}
                okText="Move"
                confirmLoading={isMovingAreaJobs}
                okButtonProps={{ disabled: moveAreaTargetIndex === null }}
                onOk={handleConfirmMoveAreaJobs}
                onCancel={() => {
                  if (!isMovingAreaJobs) setIsMoveAreaModalOpen(false);
                }}
                destroyOnClose
              >
                <Select
                  className="w-full"
                  placeholder="Select target route / driver"
                  value={moveAreaTargetIndex ?? undefined}
                  onChange={(value) => setMoveAreaTargetIndex(value)}
                  options={(route.result?.routes || []).map((r: any, idx: number) => ({
                    value: idx,
                    label: `${r.team_member_name || `Driver ${idx + 1}`} (${getGroupedStopsCount(r.stops)} stops)`,
                  }))}
                />
              </Modal>

              {/* Top-left overlay column: focus chip + in-map search stacked */}
              <div className="absolute top-3 left-3 z-40 flex flex-col gap-1.5" style={{ maxWidth: "calc(100% - 120px)" }}>
                {/* Clear-focus chip */}
                {focusedRouteIndex !== null && (
                  <div className="flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-none shadow-md pl-3 pr-1.5 py-1.5 self-start">
                    <span
                      className="w-2.5 h-2.5 rounded-none shrink-0"
                      style={{
                        backgroundColor: getRouteColor(focusedRouteIndex),
                      }}
                    />
                    <span className="text-xs font-semibold text-gray-800 max-w-[180px] truncate">
                      {focusedRoute?.team_member_name ||
                        `Driver ${focusedRouteIndex + 1}`}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {getGroupedStopsCount(focusedRoute?.stops)} stops
                    </span>
                    <Tooltip title="Clear focus (Esc)">
                      <button
                        type="button"
                        onClick={clearFocus}
                        aria-label="Clear route focus"
                        className="flex items-center justify-center w-5 h-5 rounded-none text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer border-none outline-none"
                      >
                        <X size={13} />
                      </button>
                    </Tooltip>
                  </div>
                )}

                {/* In-map expandable candidate search + Add Candidate button */}
                <MapSearch
                  candidates={candidateIndex}
                  onSelect={handleSelectCandidate}
                  onOpenAddJob={() => setIsAddJobOpen(true)}
                />
              </div>
            </div>
          </Panel>

          <ResizeHandle />

          <Panel ref={timelinePanelRef} defaultSize={40} minSize={0} collapsible={true}>
            <div className="flex flex-col h-full bg-gray-50 min-h-0 min-w-0">
              {mapViewState === "collapsed" && (
                <div className="bg-[#ecfdf5] text-[#003220] px-4 py-2 flex items-center justify-between border-b border-emerald-100 shrink-0 transition-all">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <MapIcon size={14} className="text-[#003220]" />
                    <span>Map view is currently collapsed</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCollapse}
                    className="px-3 py-1 bg-[#003220] hover:bg-[#002A00] text-white text-xs font-bold rounded-none border-none outline-none shadow-sm transition-all cursor-pointer"
                  >
                    Show Map
                  </button>
                </div>
              )}
              <div className="flex-1 min-h-0 min-w-0">
                <TimelineView
                  routes={route.result?.routes || []}
                  jobs={jobs}
                  teams={teams}
                  scheduledDate={route.scheduled_date}
                  showDriverWorkingTime={showDriverWorkingTime}
                  onDriverWorkingHoursChange={showDriverWorkingTime ? handleDriverWorkingHoursChange : undefined}
                  templateType={
                    route.result?.routes?.some((r: any) => (r as any).leg !== undefined) ||
                    jobs?.some((j: any) => j?.template_type === "worker_shuttle" || Boolean(j?.worker_shuttle_detail))
                      ? "worker_shuttle"
                      : undefined
                  }
                  vehicles={vehicles}
                  selectedMarkerId={selectedMarkerId}
                  onStopClick={handleStopClick}
                  onAddStop={(idx) => {
                    targetRouteIndexRef.current = idx;
                    setAddStopRouteIndex(idx);
                  }}
                  onAddUnassignedJob={handleAddUnassignedJob}
                  onSwapDriver={(idx) => setSwapDriverRouteIndex(idx)}
                  onChangeVehicle={route.status === "completed" || route.status === "failed"
                    ? setChangeVehicleRouteIndex : undefined}
                  onReverseRoute={handleReverseRoute}
                  onReOptimize={handleReOptimize}
                  onReorderStops={handleReorderStops}
                  onSaveAndReOptimize={handleSaveAndReOptimize}
                  onRemoveStop={(rIdx, jId, stopType) => handleRemoveJob(rIdx, jId, stopType)}
                  focusedRouteIndex={focusedRouteIndex}
                  onFocusRoute={handleFocusRoute}
                  driverSearch={driverSearch}
                  onDriverSearchChange={setDriverSearch}
                  exactMatch={exactMatch}
                  onExactMatchChange={setExactMatch}
                  pendingDeletedJobIds={pendingDeletedJobIds}
                  onDeleteJob={handleStageDeleteJob}
                  onUndoDeleteJob={handleUndoStageDeleteJob}
                  reorderingRouteIndex={reorderingRouteIndex}
                  onTransferStops={handleTransferStops}
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>

        {/* Upper-styled Floating Job Details Card Overlay (Over Map AND Timeline View!) */}
        {selectedDrawerJob && (
          <JobDetailsCard
            stopData={selectedDrawerJob.stopData}
            job={selectedDrawerJob.job}
            stopIndex={selectedDrawerJob.stopIndex}
            driverName={selectedDrawerJob.driverName}
            leg={selectedDrawerJob.leg}
            isUnassigned={selectedDrawerJob.isUnassigned}
            isFullscreen={mapViewState === "fullscreen"}
            onClose={() => {
              setSelectedDrawerJob(null);
              setSelectedMarkerId(null);
            }}
            onJobSaved={async ({ requiresReOptimization, timeChanged }) => {
              const editedRouteIndex = selectedDrawerJob.routeIndex;
              const editedJobId = selectedDrawerJob.job?.id;
              if (route?.id && editedRouteIndex !== undefined && editedJobId !== undefined) {
                if (timeChanged) {
                  try {

                    await fetchOptimization(route.id);
                    message.success("Stop time updated in route successfully");
                    setHasUnsavedJobEdits(true);
                  } catch (err: any) {
                    message.error(err?.message || "Failed to update stop time in route");
                  }
                } else if (requiresReOptimization) {
                  await fetchOptimization(route.id);
                  message.info("Job updated. Route parameters changed, please re-optimize when ready.");
                  setHasUnsavedJobEdits(true);
                } else {
                  await fetchOptimization(route.id);
                  message.success("Job updated successfully");
                }
              } else {
                if (route?.id) {
                  await fetchOptimization(route.id);
                }
                message.success("Job updated successfully");
              }
            }}
            onEditJob={(jobToEdit) => setEditJobData(jobToEdit)}
            // onRemoveJob={
            //   selectedDrawerJob.routeIndex !== undefined &&
            //   selectedDrawerJob.routeIndex >= 0 &&
            //   selectedDrawerJob.job?.id
            //     ? () =>
            //         handleRemoveJob(
            //           selectedDrawerJob.routeIndex!,
            //           selectedDrawerJob.job!.id,
            //           selectedDrawerJob.driverName || "Driver",
            //         )
            //     : undefined
            // }
          />
        )}
      </div>

      {/* Route Export Preview Modal */}
      <RouteExportPreview
        open={showPreview}
        onClose={() => setShowPreview(false)}
        route={route}
        jobs={jobs}
      />

      {/* Add Stop Modal — reuses the existing AddJobsModal / JobForm */}
      <AddJobsModal
        open={addStopRouteIndex !== null}
        setOpen={(open) => {
          if (!open) {
            setAddStopRouteIndex(null);
            targetRouteIndexRef.current = null;
          }
        }}
        onJobCreated={handleJobCreatedForRoute}
        defaultTemplate={route.result?.routes?.some(r => (r as any).leg !== undefined) ? "worker_shuttle" : undefined}
        defaultDate={route?.scheduled_date ? String(route.scheduled_date) : undefined}
        defaultJobType={
          addStopRouteIndex !== null && route.result?.routes?.[addStopRouteIndex]
            ? ((route.result.routes[addStopRouteIndex] as any).leg === "RETURN" ? "return_only" : "one_way")
            : undefined
        }
      />

      {/* Add New Candidate / Job Modal (from Map control overlay) */}
      <AddJobsModal
        open={isAddJobOpen}
        setOpen={setIsAddJobOpen}
        onCancel={() => setIsAddJobOpen(false)}
        defaultTemplate={route.result?.routes?.some(r => (r as any).leg !== undefined) ? "worker_shuttle" : undefined}
        onJobCreated={async (newJob) => {
          if (route.scheduled_date) {
            fetchJobsByDate(route.scheduled_date);
          }
          try {
            const currentJobIds = route.job_ids || [];
            if (newJob.id && !currentJobIds.includes(newJob.id)) {
              const updatedResult = { ...route.result };
              if (!updatedResult.unassigned_jobs) {
                updatedResult.unassigned_jobs = [];
              }
              updatedResult.unassigned_jobs.push({
                job_id: newJob.id,
                reason_code: "MANUALLY_ADDED",
                reason: "Added to unassigned pool manually"
              });

              await updateOptimization(route.id, {
                job_ids: [...currentJobIds, newJob.id],
                result: updatedResult
              });
              await fetchOptimization(route.id);
            }
            setHasUnsavedJobEdits(true);
            message.success("New job added to unassigned pool. Click 'Reoptimize All Routes' to re-run the global optimization, or assign it manually and use 'Reoptimize Route'.");
          } catch (err) {
            message.error("Failed to link new job to the optimization request.");
          }
        }}
      />

      {changeVehicleRouteIndex !== null && (
        <ChangeVehicleModal
          optimizationId={route.id}
          routeIndex={changeVehicleRouteIndex}
          routes={route.result?.routes || []}
          onClose={() => setChangeVehicleRouteIndex(null)}
          onSuccess={() => {
            void Promise.allSettled([
              fetchOptimization(route.id),
              fetchJobsByIds(route.job_ids || []),
              refreshUndoHistory(),
            ]);
          }}
        />
      )}

      {/* Swap Driver Modal */}
      {swapDriverRouteIndex !== null && (
        <SwapDriverDrawer
          open={true}
          onClose={() => setSwapDriverRouteIndex(null)}
          optimizationId={route.id}
          routeIndex={swapDriverRouteIndex}
          currentDriverId={
            getRouteData(swapDriverRouteIndex)?.team_member_id ?? 0
          }
          currentDriverName={
            getRouteData(swapDriverRouteIndex)?.team_member_name ||
            `Driver ${swapDriverRouteIndex + 1}`
          }
          allDrivers={teams}
          optimizationDriverIds={route.team_member_ids || []}
          onSuccess={handleSwapSuccess}
        />
      )}

      {/* Edit Job Drawer */}
      <Drawer
        title={`Edit Job #${editJobData?.id || ""}`}
        width={720}
        onClose={() => setEditJobData(null)}
        open={Boolean(editJobData)}
        destroyOnClose
      >
        <JobForm
          initialData={editJobData}
          onSubmit={async (updatedJob) => {
            if (updatedJob && editJobData) {
              const getWsTime = (j: any, key: string) => j?.worker_shuttle_detail?.[key] || j?.[key];
              const getPdTime = (j: any, key: string) => j?.pickup_delivery_detail?.[key] || j?.[key];

              const oldStart = getWsTime(editJobData, "start_hour") || getPdTime(editJobData, "time_window_start");
              const oldEnd = getWsTime(editJobData, "end_hour") || getPdTime(editJobData, "time_window_end");
              const newStart = getWsTime(updatedJob, "start_hour") || getPdTime(updatedJob, "time_window_start");
              const newEnd = getWsTime(updatedJob, "end_hour") || getPdTime(updatedJob, "time_window_end");

              const timeChanged = oldStart !== newStart || oldEnd !== newEnd;
              const editedRouteIndex = selectedDrawerJob?.routeIndex;
              const editedJobId = updatedJob.id;

              if (timeChanged && route?.id && editedRouteIndex !== undefined && selectedDrawerJob?.job?.id === editedJobId) {
                try {

                  await fetchOptimization(route.id);
                  message.success("Stop time updated in route successfully");
                } catch (err: any) {
                  message.error(err?.message || "Failed to update stop time in route");
                }
              } else if (route?.id) {
                await fetchOptimization(route.id);
              }
            }

            setEditJobData(null);
            setHasUnsavedJobEdits(true);
            if (selectedDrawerJob && updatedJob) {
              setSelectedDrawerJob((prev) =>
                prev ? { ...prev, job: updatedJob } : null
              );
            }
          }}
        />
      </Drawer>

      <Modal
        open={removeJobTarget !== null}
        title="Remove Round-Trip Job"
        onCancel={() => {
          if (!isRemovingJob) setRemoveJobTarget(null);
        }}
        maskClosable={!isRemovingJob}
        closable={!isRemovingJob}
        centered
        footer={[
          <Button
            key="current-leg"
            danger
            loading={isRemovingJob}
            onClick={() => handleRoundTripRemoval(false)}
          >
            Delete Current Leg
          </Button>,
          <Button
            key="all-legs"
            type="primary"
            danger
            loading={isRemovingJob}
            onClick={() => handleRoundTripRemoval(true)}
          >
            Delete All Jobs
          </Button>,
        ]}
      >
        {removeJobTarget && (
          <p className="m-0 text-gray-700">
            Delete both pickup and drop-off stops for the {removeJobTarget.tripLabel}{" "}
            trip (Job #{removeJobTarget.jobId}) on {removeJobTarget.driverName}&apos;s route,
            or delete both round-trip jobs (#{removeJobTarget.jobId} and #{removeJobTarget.partnerJobId}).
            Removed jobs will be moved back to Unassigned.
          </p>
        )}
      </Modal>

      <Modal
        open={shareResult !== null}
        onCancel={() => setShareResult(null)}
        onOk={() => setShareResult(null)}
        title={
          <span className="flex items-center gap-2">
            <ShareAltOutlined className="text-green-500" />
            Route Shared Successfully
          </span>
        }
        okText="Done"
        cancelButtonProps={{ style: { display: "none" } }}
        centered
      >
        {shareResult && (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-4 rounded-lg bg-green-50 border border-green-100">
              <span className="text-green-700 font-medium">
                Drivers notified
              </span>
              <span className="text-2xl font-bold text-green-600">
                {shareResult.shared_count}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {shareResult.online_drivers.length}
                </div>
                <div className="text-xs text-blue-500 mt-1">
                  Online — received instantly
                </div>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
                <div className="text-2xl font-bold text-gray-500">
                  {shareResult.shared_count - shareResult.online_drivers.length}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Offline — will receive on next login
                </div>
              </div>
            </div>

            {shareResult.shared_count === 0 && (
              <Alert
                type="warning"
                showIcon
                message="No drivers with assigned routes found. Make sure routes have drivers assigned before sharing."
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default OptimizationView;
