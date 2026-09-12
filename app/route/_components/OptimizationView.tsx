"use client";
import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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

import GoogleMaps from "@/components/GoogleMaps";
import { X, Maximize2, Minimize2, ChevronUp, ChevronDown, Map as MapIcon } from "lucide-react";
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
  swapRouteDriver,
  reverseRoute,
  reOptimizeRoute,
  shareOptimizationRoutes,
  type ShareRouteResponse,
} from "@/apis/routes.api";

import JobDetailsCard from "./JobDetailsCard";

const { Title, Text } = Typography;

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
    pollOptimizationStatus,
    stopPolling,
    isPolling,
    error,
    reOptimize,
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

  // Route operations modal state
  const [addStopRouteIndex, setAddStopRouteIndex] = useState<number | null>(
    null,
  );
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

  const allMarkers = useMemo(() => {
    return generateMapMarkers(route, jobs, allowedRouteIndices);
  }, [route, jobs, allowedRouteIndices]);

  // While a route is focused only its own stops stay on the map.
  const markers = useMemo(() => {
    if (focusedRouteIndex === null) return allMarkers;
    return allMarkers.filter((m) => m.routeIndex === focusedRouteIndex);
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

    // Find 0-based raw index of this stop in routeItem.stops
    let rawIndex = routeItem?.stops ? routeItem.stops.indexOf(stop) : -1;
    if (rawIndex === -1 && routeItem?.stops) {
      rawIndex = routeItem.stops.findIndex(
        (s: any) =>
          s === stop ||
          (stop.job_id != null && s.job_id === stop.job_id && s.stop_type === stop.stop_type) ||
          (stop.id != null && s.id === stop.id) ||
          (s.latitude === stop.latitude &&
            s.longitude === stop.longitude &&
            s.arrival_time === stop.arrival_time),
      );
    }

    // Find matching map marker ID generated by generateMapMarkers
    const targetMarker = allMarkers.find((m) => {
      if (m.routeIndex !== routeIndex) return false;
      const rawIdx = Number(String(m.id).split("-")[1]);
      if (rawIdx === rawIndex) return true;
      const routeStop = routeItem?.stops?.[rawIdx];
      return (
        routeStop === stop ||
        (stop.job_id != null &&
          routeStop?.job_id === stop.job_id &&
          routeStop?.stop_type === stop.stop_type) ||
        (stop.id != null && routeStop?.id === stop.id)
      );
    });

    const markerId = targetMarker
      ? String(targetMarker.id)
      : rawIndex >= 0
      ? `${routeIndex}-${rawIndex}`
      : `${routeIndex}-0`;

    if (
      typeof stop.latitude === "number" &&
      typeof stop.longitude === "number"
    ) {
      setCenter({ lat: stop.latitude, lng: stop.longitude });
    }

    // Reset temporarily then set selectedMarkerId to ensure animation triggers
    setSelectedMarkerId(null);
    setTimeout(() => {
      setSelectedMarkerId(markerId);
    }, 0);

    // Find corresponding job object
    const jobId = stop.job_id || stop.id;
    const matchedJob = jobs.find((j) => j.id === jobId) || stop.job || null;
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

    // Marker ids are `${routeIndex}-${stopIndex}`. Resolving the stop by index
    // (rather than searching by job_id) keeps pickup and drop-off apart for
    // shuttle jobs, which appear twice in the same route.
    const [routeIndexStr, stopIndexStr] = String(markerId).split("-");
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

  const startOperationPolling = useCallback(() => {
    pollOptimizationStatus(route.id);
  }, [pollOptimizationStatus, route.id]);

  const handleJobCreatedForRoute = useCallback(
    async (job: Job) => {
      if (addStopRouteIndex === null) return;
      try {
        const res = await addStopToRoute(route.id, addStopRouteIndex, job.id);
        if (res.success) {
          message.success(res.message);
          startOperationPolling();
        }
      } catch (error: any) {
        message.error(error?.response?.data?.detail || "Failed to add job");
      }
    },
    [route.id, addStopRouteIndex, startOperationPolling],
  );

  const handleRemoveJob = useCallback(
    (routeIndex: number, jobId: number, driverName: string) => {
      Modal.confirm({
        title: "Remove Job",
        content: `Remove job from ${driverName}'s route? It will be moved back to Unassigned.`,
        okText: "Remove",
        okButtonProps: {
          style: { backgroundColor: "#dc2626", borderColor: "#dc2626" },
        },
        onOk: async () => {
          try {
            const res = await removeStopFromRoute(route.id, routeIndex, jobId);
            if (res.success) {
              message.success(res.message);
              startOperationPolling();
            }
          } catch (error: any) {
            message.error(
              error?.response?.data?.detail || "Failed to remove job",
            );
          }
        },
      });
    },
    [route.id, startOperationPolling],
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
        title: "Re-optimize Route",
        content: `Re-optimize ${driverName}'s route? This will re-run the optimization.`,
        okText: "Re-optimize",
        okButtonProps: { style: { backgroundColor: "#003220" } },
        onOk: async () => {
          try {
            const res = await reOptimizeRoute(route.id, routeIndex);
            if (res.success) {
              message.success(res.message);
              startOperationPolling();
            }
          } catch (error: any) {
            message.error(
              error?.response?.data?.detail || "Failed to re-optimize route",
            );
          }
        },
      });
    },
    [route.id, route.result?.routes, startOperationPolling],
  );

  const handleSwapSuccess = useCallback(() => {
    startOperationPolling();
  }, [startOperationPolling]);

  const handleReOptimizeAll = useCallback(async () => {
    Modal.confirm({
      title: "Re-Optimize Entire Route",
      content:
        "This will re-run the full optimization with updated job data. Old routes will be replaced. Continue?",
      okText: "Re-Optimize",
      okButtonProps: { style: { backgroundColor: "#003220", borderColor: "#003220" } },
      onOk: async () => {
        try {
          await reOptimize(route.id);
          setHasUnsavedJobEdits(false);
          // Polling auto-starts inside reOptimize()
        } catch (err: any) {
          message.error(
            err?.message || "Failed to re-optimize. Please try again.",
          );
        }
      },
    });
  }, [reOptimize, route.id]);

  const getRouteData = (index: number | null) =>
    index !== null ? route.result?.routes?.[index] : null;

  const totalStops =
    route.result?.routes?.reduce((acc, r) => acc + (r.stops?.length || 0), 0) ||
    0;
  const totalVehicles = route.result?.routes?.length || 0;

  const handleBackToPlanRoutes = () => {
    setCurrentTab("routes");
    router.push("/plan");
  };

  return (
    <div className="flex flex-col h-full absolute inset-0">
      {/* Full-screen loading overlay */}
      {isPolling && (
        <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Spin
              indicator={
                <LoadingOutlined
                  style={{ fontSize: 48, color: "#003220" }}
                  spin
                />
              }
            />
            <div className="text-center">
              <p className="text-lg font-medium text-gray-800 m-0">
                Optimizing Route...
              </p>
              <p className="text-sm text-gray-500 mt-1">
                This may take a few seconds
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Header - matching NavBar height */}
      <nav className="bg-white border-b border-gray-200 px-3 shrink-0">
        <div className="flex items-center justify-between h-14 relative">
          {/* Left: Back Button + Route Name */}
          <div className="flex items-center gap-3">
            <Icon
              component={ArrowLeftOutlined}
              style={{ color: "#003220" }}
              onClick={handleBackToPlanRoutes}
            />

            <div style={{ width: "200px" }}>
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
                  style={{ width: "100%" }}
                />
              ) : (
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={handleNameClick}
                  title="Click to edit route name"
                >
                  <Title
                    level={5}
                    className="mt-2 group-hover:text-primary transition-colors truncate"
                  >
                    {route.route_name}
                  </Title>
                  <EditOutlined className="text-gray-400 shrink-0" />
                </div>
              )}
            </div>
          </div>

          {/* Center: Stats */}
          <div className="flex items-center gap-4">
            <Text type="secondary">
              <CalendarOutlined /> {route.scheduled_date}
            </Text>
            <Text type="secondary">
              <TeamOutlined /> {totalVehicles}{" "}
              {totalVehicles === 1 ? "route" : "routes"}
            </Text>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex gap-2">
            {/* Re-Optimize button — highlighted when job edits are pending */}
            {route.status === "completed" && (
              <Button
                icon={<ReloadOutlined />}
                onClick={handleReOptimizeAll}
                className={hasUnsavedJobEdits
                  ? "border-amber-400 text-amber-700 bg-amber-50 font-semibold"
                  : ""}
              >
                Re-Optimize
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

                {/* In-map expandable candidate search */}
                <MapSearch
                  candidates={candidateIndex}
                  onSelect={handleSelectCandidate}
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
                  onAddStop={(idx) => setAddStopRouteIndex(idx)}
                  onSwapDriver={(idx) => setSwapDriverRouteIndex(idx)}
                  onReverseRoute={handleReverseRoute}
                  onReOptimize={handleReOptimize}
                  focusedRouteIndex={focusedRouteIndex}
                  onFocusRoute={handleFocusRoute}
                  driverSearch={driverSearch}
                  onDriverSearchChange={setDriverSearch}
                  exactMatch={exactMatch}
                  onExactMatchChange={setExactMatch}
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
            onJobSaved={async (requiresReOptimization: boolean) => {
              if (requiresReOptimization && route?.id) {
                message.loading({
                  content: "Parameters changed. Auto re-optimizing route...",
                  key: "auto_reopt",
                });
                try {
                  await reOptimize(route.id);
                  message.success({
                    content: "Route re-optimized successfully!",
                    key: "auto_reopt",
                  });
                  setHasUnsavedJobEdits(false);
                } catch (err: any) {
                  message.error({
                    content: err?.message || "Failed to auto re-optimize route",
                    key: "auto_reopt",
                  });
                  setHasUnsavedJobEdits(true);
                }
              } else {
                message.success("Job updated successfully");
                setHasUnsavedJobEdits(true);
              }
            }}
            onEditJob={(jobToEdit) => setEditJobData(jobToEdit)}
            onRemoveJob={
              selectedDrawerJob.routeIndex !== undefined &&
              selectedDrawerJob.routeIndex >= 0 &&
              selectedDrawerJob.job?.id
                ? () =>
                    handleRemoveJob(
                      selectedDrawerJob.routeIndex!,
                      selectedDrawerJob.job!.id,
                      selectedDrawerJob.driverName || "Driver",
                    )
                : undefined
            }
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
          if (!open) setAddStopRouteIndex(null);
        }}
        onJobCreated={handleJobCreatedForRoute}
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
          onSubmit={(updatedJob) => {
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
