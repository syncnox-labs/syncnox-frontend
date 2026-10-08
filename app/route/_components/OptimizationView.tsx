"use client";
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import apiClient from "@/config/apiClient.config";
import { Panel, PanelGroup, ImperativePanelHandle } from "react-resizable-panels";
import {
  Typography,
  Button,
  Tooltip,
  Input,
  message,
  Modal,
  Spin,
  Alert,
  Drawer,
  Switch,
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
import { X, Maximize2, Minimize2, ChevronUp, ChevronDown, Map as MapIcon, Building2, MapPin, Milestone } from "lucide-react";
import MapSearch from "./MapSearch";
import TimelineView from "./TimelineView";
import AddJobsModal from "@/app/plan/AddJobsModal";
import JobForm from "@/components/Jobs/JobForm";
import SwapDriverDrawer from "./SwapDriverDrawer";
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
import { LOCATION_TYPE_COLORS } from "@/utils/customMapMarker";
import RouteInfoWindow from "./RouteInfoWindow";
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
  removeStopFromRoute,
  reorderRouteStops,
  editStopTime,
  swapRouteDriver,
  reverseRoute,
  reOptimizeRoute,
  transferRouteStops,
  shareOptimizationRoutes,
  type ShareRouteResponse,
} from "@/apis/routes.api";

import JobDetailsCard from "./JobDetailsCard";

const { Title, Text } = Typography;

const MAP_OVERLAYS_STORAGE_KEY = "syncnox_map_overlays_visibility";

interface MapOverlaysState {
  stops: boolean;
  depots: boolean;
  additionalLocations: boolean;
}

const DEFAULT_MAP_OVERLAYS: MapOverlaysState = {
  stops: true,
  depots: false,
  additionalLocations: false,
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
    };
  } catch {
    return DEFAULT_MAP_OVERLAYS;
  }
};

interface OptimizationViewProps {
  route: Route;
}

const OptimizationView = ({ route }: OptimizationViewProps) => {
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
  const { teams, initializeTeams } = useTeamStore();
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

  // Undo Stack (up to 5 ops)
  const [undoStack, setUndoStack] = useState<Array<{ label: string; action: () => Promise<void> }>>([]);
  const pushUndo = useCallback((label: string, action: () => Promise<void>) => {
    setUndoStack(prev => {
      const newStack = [...prev, { label, action }];
      if (newStack.length > 5) newStack.shift(); // keep max 5
      return newStack;
    });
  }, []);
  const handleUndo = useCallback(async () => {
    const lastOp = undoStack[undoStack.length - 1];
    if (!lastOp) return;
    try {
      message.loading({ content: `Undoing: ${lastOp.label}...`, key: "undo" });
      await lastOp.action();
      message.success({ content: `Undone: ${lastOp.label}`, key: "undo" });
      setUndoStack(prev => prev.slice(0, -1));
    } catch (err: any) {
      message.error({ content: err?.message || "Failed to undo", key: "undo" });
    }
  }, [undoStack]);

  // Job Details Floating Card state
  const [selectedDrawerJob, setSelectedDrawerJob] = useState<{
    stopData: any;
    job: Job | null;
    driverName?: string;
    leg?: string;
    routeIndex?: number;
    stopIndex?: number;
  } | null>(null);

  const [selectedMarkerId, setSelectedMarkerId] = useState<
    string | number | null
  >(null);

  // ── Depots & Additional Locations store state & visibility ──
  const { depots, initializeDepots } = useDepotStore();
  const { locationMappings, initializeLocationMappings } = useLocationMappingStore();

  useEffect(() => {
    initializeDepots();
  }, [initializeDepots]);

  useEffect(() => {
    initializeLocationMappings();
  }, [initializeLocationMappings]);

  // ── Depots, Additional Locations & Stops visibility state (persisted to localStorage) ──
  const [showStops, setShowStops] = useState<boolean>(DEFAULT_MAP_OVERLAYS.stops);
  const [showDepots, setShowDepots] = useState<boolean>(DEFAULT_MAP_OVERLAYS.depots);
  const [showAdditionalLocations, setShowAdditionalLocations] = useState<boolean>(DEFAULT_MAP_OVERLAYS.additionalLocations);

  useEffect(() => {
    const stored = getStoredMapOverlays();
    setShowStops(stored.stops);
    setShowDepots(stored.depots);
    setShowAdditionalLocations(stored.additionalLocations);
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

  const handleToggleAdditionalLocations = useCallback((checked: boolean) => {
    setShowAdditionalLocations(checked);
    try {
      const current = getStoredMapOverlays();
      localStorage.setItem(
        MAP_OVERLAYS_STORAGE_KEY,
        JSON.stringify({ ...current, additionalLocations: checked })
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

  // Extract all searchable candidates across all routes & stops
  const candidateIndex = useMemo(() => {
    if (!route.result?.routes) return [];

    const jobsMap = new Map(jobs.map((j) => [j.id, j]));
    const results: Array<{
      id: string;
      candidateName: string;
      candidatePhone: string;
      candidateId: string;
      pickupAddress: string;
      dropoffAddress: string;
      driverName: string;
      leg?: string;
      routeIndex: number;
      stopIndex: number;
      /** 1-based stop number counting only non-depot stops — matches timeline display */
      displayStopNumber: number;
      stop: any;
      job: Job | null;
      searchableText: string;
    }> = [];

    route.result.routes.forEach((routeItem, routeIdx) => {
      const driverName = routeItem.team_member_name || `Driver ${routeIdx + 1}`;
      // Per-route counter that only increments for visible (non-depot) stops — same
      // logic as jobStopCounter in TimelineView so the number always matches.
      let displayStopCounter = 0;
      routeItem.stops?.forEach((stop: any, stopIdx: number) => {
        if (stop.stop_type === "depot" || stop.stop_type === "depot_start" || stop.stop_type === "depot_end") {
          return;
        }
        displayStopCounter++;

        const jobId = stop.job_id || stop.id;
        const matchedJob =
          (jobId
            ? jobsMap.get(Number(jobId)) || jobsMap.get(jobId as any)
            : null) ||
          stop.job ||
          null;
        const custom = matchedJob?.custom_fields || {};

        const candName =
          custom.candidate_name ||
          matchedJob?.candidate_name ||
          (matchedJob?.first_name || matchedJob?.last_name
            ? `${matchedJob.first_name || ""} ${matchedJob.last_name || ""}`.trim()
            : null) ||
          stop.candidate_name ||
          "Unknown Candidate";

        const candPhone =
          custom.candidate_phone ||
          matchedJob?.candidate_phone ||
          custom.client_phone ||
          matchedJob?.phone_number ||
          stop.candidate_phone ||
          "";

        const candId =
          custom.candidate_id ||
          matchedJob?.candidate_id ||
          custom.client_id ||
          matchedJob?.client_id ||
          custom.quant_id ||
          custom.quart_id ||
          "";

        const pickup =
          stop.address_formatted ||
          matchedJob?.pick_up_address ||
          custom.candidate_address ||
          "";

        const dropoff =
          matchedJob?.drop_off_address ||
          custom.client_address ||
          "";

        const searchStr = `${candName} ${candPhone} ${candId} ${pickup} ${dropoff} ${driverName}`.toLowerCase();

        results.push({
          id: `${routeIdx}-${stopIdx}-${jobId || stopIdx}`,
          candidateName: candName,
          candidatePhone: candPhone,
          candidateId: candId,
          pickupAddress: pickup,
          dropoffAddress: dropoff,
          driverName,
          leg: routeItem.leg,
          routeIndex: routeIdx,
          stopIndex: stopIdx,
          displayStopNumber: displayStopCounter,
          stop,
          job: matchedJob,
          searchableText: searchStr,
        });
      });
    });

    return results;
  }, [route.result?.routes, jobs]);

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

  // Additional Locations map markers
  const additionalLocationMarkers = useMemo<MarkerData[]>(() => {
    if (!showAdditionalLocations) return [];
    return locationMappings
      .filter((m) => {
        const lat = Number(m.latitude);
        const lng = Number(m.longitude);
        return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
      })
      .map((m) => {
        const raw = (m.type || m.location_type || "other").toLowerCase().replace(/\s+/g, "_");
        const typeKey = LOCATION_TYPE_COLORS[raw] ? raw : "other";
        const matchedOpt = LOCATION_TYPE_OPTIONS.find(
          (opt) => opt.value === raw || opt.label.toLowerCase() === raw
        );
        const typeLabel = matchedOpt ? matchedOpt.label : raw;
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
          locationType: typeKey,
          color: LOCATION_TYPE_COLORS[typeKey],
          zIndex: 99999,
          jobData: {
            id: m.id,
            name: m.name,
            type: typeKey,
            location_type: typeLabel,
            address: addr,
            city: m.city,
            aliases: m.aliases,
            is_location_mapping: true,
          },
        };
      });
  }, [locationMappings, showAdditionalLocations]);

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
          
          pushUndo(`Add Job #${job.id}`, async () => {
            await removeStopFromRoute(route.id, targetRouteIndex, job.id);
            await fetchOptimization(route.id);
            setHasUnsavedJobEdits(true);
          });

          await fetchOptimization(route.id);
        }
      } catch (error: any) {
        message.error(error?.response?.data?.detail || "Failed to add job");
      }
    },
    [route.id, addStopRouteIndex, fetchOptimization, pushUndo, route.result?.routes],
  );

  const handleRemoveJob = useCallback(
    (routeIndex: number, jobId: number, driverName?: string) => {
      const routeData = route.result?.routes?.[routeIndex];
      const dName = driverName || routeData?.team_member_name || "Driver";
      
      const stopCount = routeData?.stops?.filter(s => s.job_id === jobId).length || 1;
      const isRoundTrip = stopCount > 1;

      Modal.confirm({
        title: isRoundTrip ? "Remove Round-Trip Job" : "Remove Job",
        content: isRoundTrip 
          ? `Remove Job #${jobId} from ${dName}'s route? This is a round-trip job, so BOTH the pickup and drop-off legs will be removed and moved back to Unassigned.`
          : `Remove Job #${jobId} from ${dName}'s route? It will be moved back to Unassigned.`,
        okText: "Remove",
        okButtonProps: {
          style: { backgroundColor: "#dc2626", borderColor: "#dc2626" },
        },
        onOk: async () => {
          try {
            const jobStops = routeData?.stops?.filter(s => s.stop_type !== "depot_start" && s.stop_type !== "depot_end") || [];
            const originalPosition = jobStops.findIndex(s => s.job_id === jobId);

            const res = await removeStopFromRoute(route.id, routeIndex, jobId);
            if (res.success) {
              message.success(res.message || "Job removed from route");
              setHasUnsavedJobEdits(true);
              
              pushUndo(`Remove Job #${jobId}`, async () => {
                await addStopToRoute(route.id, routeIndex, jobId, originalPosition >= 0 ? originalPosition : undefined);
                await fetchOptimization(route.id);
                setHasUnsavedJobEdits(true);
              });

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
    [route.id, route.result?.routes, fetchOptimization],
  );

  const handleReorderStops = useCallback(
    async (
      routeIndex: number,
      orderedJobIds: number[],
      orderedStopIndices?: number[],
      orderedStops?: any[],
    ) => {
      const originalStops = route.result?.routes?.[routeIndex]?.stops || [];
      const originalOrder = originalStops
        .filter((s: any) => s.job_id)
        .map((s: any) => s.job_id) || [];
      const originalIndices = originalStops
        .map((s: any, idx: number) => ({ s, idx }))
        .filter(({ s }: any) => s.job_id && s.stop_type !== "depot_start" && s.stop_type !== "depot_end")
        .map(({ idx }: any) => idx);

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
          
          pushUndo("Reorder Stops", async () => {
            await reorderRouteStops(route.id, routeIndex, originalOrder, originalIndices);
            await fetchOptimization(route.id);
            setHasUnsavedJobEdits(true);
          });
          
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
    [route, fetchOptimization, pushUndo],
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
      const originalStops = route.result?.routes?.[routeIndex]?.stops || [];
      const originalOrder = originalStops
        .filter((s: any) => s.job_id)
        .map((s: any) => s.job_id) || [];
      const originalIndices = originalStops
        .map((s: any, idx: number) => ({ s, idx }))
        .filter(({ s }: any) => s.job_id && s.stop_type !== "depot_start" && s.stop_type !== "depot_end")
        .map(({ idx }: any) => idx);
        
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
          pushUndo("Save and Re-optimize Route", async () => {
             await reorderRouteStops(route.id, routeIndex, originalOrder, originalIndices);
             await fetchOptimization(route.id);
          });

          // Perform bulk delete for staged deletions if any
          if (pendingDeletedJobIds.size > 0) {
            const deletePromises = Array.from(pendingDeletedJobIds).map((jobId) =>
              apiClient.delete(`/jobs/${jobId}`)
            );
            await Promise.all(deletePromises);
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
    [route.id, route.result, fetchOptimization, pushUndo, setOptimizationResult, pendingDeletedJobIds, pollUntilComplete],
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
            const originalOrder = route.result?.routes?.[routeIndex]?.stops
              ?.filter((s: any) => s.job_id)
              .map((s: any) => s.job_id) || [];
              
            const res = await reverseRoute(route.id, routeIndex);
            if (res.success) {
              message.success(res.message);
              
              pushUndo(`Reverse Route`, async () => {
                await reverseRoute(route.id, routeIndex);
                await fetchOptimization(route.id);
              });
              
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
            // Perform bulk delete for staged deletions so the backend doesn't re-include them
            if (pendingDeletedJobIds.size > 0) {
              const deletePromises = Array.from(pendingDeletedJobIds).map((jobId) =>
                apiClient.delete(`/jobs/${jobId}`)
              );
              await Promise.all(deletePromises);
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
    [route.id, route.result?.routes, setOptimizationResult, pendingDeletedJobIds, pollUntilComplete],
  );

  const handleSwapSuccess = useCallback(() => {
    setOptimizationResult("processing");
    // Poll until the async swap-driver worker finishes
    pollUntilComplete(route.id).catch(() => {
      // Error already set in store
    });
  }, [setOptimizationResult, pollUntilComplete, route.id]);

  const handleAddUnassignedJob = useCallback(
    async (targetRouteIndex: number, jobId: number, position?: number) => {
      try {
        message.loading({ content: "Adding job to route...", key: "add-unassigned" });
        await addStopToRoute(route.id, targetRouteIndex, jobId, position);
        message.success({ content: "Job assigned successfully!", key: "add-unassigned" });
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
      const sourceDriverName = sourceRoute?.team_member_name || `Driver #${sourceRouteIndex + 1}`;
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

          pushUndo(`Transfer Stops to ${targetDriverName}`, async () => {
            await transferRouteStops(route.id, targetRouteIndex, sourceRouteIndex, jobIds);
            await fetchOptimization(route.id);
            setHasUnsavedJobEdits(true);
          });

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
    [route, fetchOptimization, pushUndo, pollUntilComplete, setOptimizationResult],
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

  const handleReOptimizeAll = useCallback(async () => {
    Modal.confirm({
      title: "Reoptimize All Routes",
      content:
        pendingDeletedJobIds.size > 0
          ? `${pendingDeletedJobIds.size} job(s) will be deleted and all routes re-optimized. Continue?`
          : "This will re-run the full optimization with updated job data. Old routes will be replaced. Continue?",
      okText: "Reoptimize All Routes",
      okButtonProps: { style: { backgroundColor: "#003220", borderColor: "#003220" } },
      onOk: async () => {
        try {
          // Perform bulk delete for staged deletions
          if (pendingDeletedJobIds.size > 0) {
            const deletePromises = Array.from(pendingDeletedJobIds).map((jobId) =>
              apiClient.delete(`/jobs/${jobId}`)
            );
            await Promise.all(deletePromises);
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
  }, [reOptimize, route.id, route.result?.routes, pendingDeletedJobIds, pollUntilComplete]);

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
    if (undoStack.length > 0) return true;
    if (!route.result?.routes) return false;
    return route.result.routes.some((r) =>
      r.stops?.some((s: any) => s.is_new || s.time_edited || s.is_edited)
    );
  }, [hasUnsavedJobEdits, undoStack.length, route.result?.routes]);

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
            {undoStack.length > 0 && (
              <Button
                onClick={handleUndo}
                className="border-slate-300 text-slate-700 bg-white font-semibold flex items-center gap-2 mr-2"
                icon={
                  <Icon component={() => (
                    <svg width="1em" height="1em" fill="currentColor" viewBox="0 0 1024 1024">
                      <path d="M793 242H366v-74c0-6.7-7.7-10.4-12.9-6.3l-142 112a8 8 0 0 0 0 12.6l142 112c5.2 4.1 12.9.4 12.9-6.3v-74h415v470H175c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h618c35.3 0 64-28.7 64-64V306c0-35.3-28.7-64-64-64z"/>
                    </svg>
                  )} />
                }
              >
                Undo {undoStack[undoStack.length - 1].label}
              </Button>
            )}

            {/* Reoptimize All Routes button — highlighted when job edits are pending */}
            {route.status === "completed" && (
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReOptimizeAll}
                className={hasPendingOptimization
                  ? "border-amber-400 text-amber-700 bg-amber-50 font-semibold"
                  : ""}
              >
                Reoptimize All Routes
              </Button>
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
                showInfoWindow={(m) => Boolean(m.isDepot || m.isAdditionalLocation)}
                layersDropdownExtra={
                  <div className="flex flex-col gap-2.5 text-xs font-sans">
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
                    <div className="flex items-center justify-between py-0.5">
                      <span className="font-semibold text-gray-700 flex items-center gap-2">
                        <MapPin size={14} className="text-[#003220]" />
                        <span>Additional Locations</span>
                        {locationMappings.length > 0 && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded-none font-bold">
                            {locationMappings.length}
                          </span>
                        )}
                      </span>
                      <Switch
                        size="small"
                        checked={showAdditionalLocations}
                        onChange={handleToggleAdditionalLocations}
                        className={showAdditionalLocations ? "!bg-[#003220]" : ""}
                      />
                    </div>
                  </div>
                }
              />

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
                  vehicles={vehicles}
                  selectedMarkerId={selectedMarkerId}
                  onStopClick={handleStopClick}
                  onAddStop={(idx) => {
                    targetRouteIndexRef.current = idx;
                    setAddStopRouteIndex(idx);
                  }}
                  onAddUnassignedJob={handleAddUnassignedJob}
                  onSwapDriver={(idx) => setSwapDriverRouteIndex(idx)}
                  onReverseRoute={handleReverseRoute}
                  onReOptimize={handleReOptimize}
                  onReorderStops={handleReorderStops}
                  onSaveAndReOptimize={handleSaveAndReOptimize}
                  onRemoveStop={(rIdx, jId) => handleRemoveJob(rIdx, jId)}
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
            isFullscreen={mapViewState === "fullscreen"}
            onClose={() => {
              setSelectedDrawerJob(null);
              setSelectedMarkerId(null);
            }}
            onJobSaved={async ({ requiresReOptimization, timeChanged, startTime, endTime, oldStartTime, oldEndTime }) => {
              if (route?.id && selectedDrawerJob.routeIndex !== undefined && selectedDrawerJob.job?.id) {
                if (timeChanged) {
                  try {
                    await editStopTime(
                      route.id,
                      selectedDrawerJob.routeIndex,
                      selectedDrawerJob.job.id,
                      startTime,
                      endTime
                    );
                    
                    pushUndo(`Edit Job #${selectedDrawerJob.job.id} Time`, async () => {
                      await editStopTime(
                        route.id,
                        selectedDrawerJob.routeIndex!,
                        selectedDrawerJob.job!.id,
                        oldStartTime,
                        oldEndTime
                      );
                      await fetchOptimization(route.id);
                    });
                    
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

              if (timeChanged && route?.id && selectedDrawerJob?.routeIndex !== undefined && selectedDrawerJob.job?.id === updatedJob.id) {
                try {
                  await editStopTime(
                    route.id,
                    selectedDrawerJob.routeIndex,
                    updatedJob.id,
                    newStart,
                    newEnd
                  );
                  
                  pushUndo(`Edit Job #${updatedJob.id} Time`, async () => {
                    await editStopTime(
                      route.id,
                      selectedDrawerJob.routeIndex!,
                      updatedJob.id,
                      oldStart,
                      oldEnd
                    );
                    await fetchOptimization(route.id);
                  });
                  
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
