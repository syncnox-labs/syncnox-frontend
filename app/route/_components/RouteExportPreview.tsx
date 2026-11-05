"use client";
import React, { useRef, useMemo, useEffect, useState } from "react";
import { Alert, Empty, Modal, Typography, Button, Divider, Select, Spin, message } from "antd";
import { PrinterOutlined } from "@ant-design/icons";
import { useReactToPrint } from "react-to-print";
import GoogleMaps from "@/components/GoogleMaps";
import DriverSummaryTable from "./DriverSummaryTable";
import RouteStopsTable from "./RouteStopsTable";
import { Route } from "@/types/routes.type";
import { Job } from "@/types/job.type";
import { useVehicleStore } from "@/store/vehicle.store";
import { fetchJobs } from "@/apis/jobs.api";
import { isShuttleRoute, loadManifestJobs, manifestDate, manifestDriverOptions, prepareShuttleManifestLocations, selectManifestRoutes,
  type ManifestDriverSelection } from "@/utils/shuttleManifest.utils";
import ShuttleManifestSection from "./ShuttleManifestSection";
import styles from "./RouteExportPreview.module.css";
import {
  prepareDriverSummary,
  prepareStopsData,
} from "@/utils/exportPreview.utils";
import {
  generateRoutePolylines,
  generateMapMarkers,
} from "./optimizationView.utils";

const { Title, Text } = Typography;

interface RouteExportPreviewProps {
  open: boolean;
  onClose: () => void;
  route: Route;
  jobs: Job[];
}

const RouteExportPreviewContent: React.FC<RouteExportPreviewProps> = ({
  open,
  onClose,
  route,
  jobs,
}) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { vehicles } = useVehicleStore();
  const [snapshot, setSnapshot] = useState<{
    key: string; jobs: Job[]; routes: Route["result"]["routes"]; sourceJobs: Job[]; error?: string;
  } | null>(null);
  const [retry, setRetry] = useState(0);
  const [driverId, setDriverId] = useState<ManifestDriverSelection>("all");
  const driverOptions = useMemo(() => manifestDriverOptions(route.result?.routes || []), [route.result?.routes]);
  const selectedDriver = driverOptions.find(option => option.value === driverId);
  const manifestRoutes = useMemo(() => selectManifestRoutes(route.result?.routes || [], driverId), [route.result?.routes, driverId]);
  const existingJobs = useMemo(() => new Map(jobs.map(job => [job.id, job])), [jobs]);
  const hasShuttle = manifestRoutes.some(item => isShuttleRoute(item, existingJobs));
  const jobIds = useMemo(() => [...new Set(manifestRoutes.flatMap(item => item.stops.flatMap(stop => stop.job_id == null ? [] : [stop.job_id])))], [manifestRoutes]);
  const jobKey = `${route.id}:${jobIds.join(",")}:${retry}`;
  const currentSnapshot = snapshot?.key === jobKey && snapshot.routes === manifestRoutes && snapshot.sourceJobs === jobs ? snapshot : null;
  const manifestJobs = useMemo(() => new Map((hasShuttle && currentSnapshot && !currentSnapshot.error ? currentSnapshot.jobs : jobs)
    .map(job => [job.id, job])), [hasShuttle, currentSnapshot, jobs]);
  const loading = hasShuttle && !currentSnapshot;
  const loadError = currentSnapshot?.error || null;
  const ready = !loading && !loadError;
  const processing = route.status === "processing" || route.status === "queued";
  const exportRoute = useMemo(() => ({ ...route, job_ids: jobIds,
    team_member_ids: [...new Set(manifestRoutes.map(item => item.team_member_id))],
    result: { ...route.result, routes: manifestRoutes, unassigned_jobs: [],
      total_distance_meters: manifestRoutes.reduce((total, item) => total + (item.total_distance_meters || 0), 0),
      total_duration_seconds: manifestRoutes.reduce((total, item) => total + (item.total_duration_seconds || 0), 0) },
  }), [route, jobIds, manifestRoutes]);

  useEffect(() => {
    if (!open || !hasShuttle) return;
    let active = true;
    loadManifestJobs(jobIds, fetchJobs)
      .then(result => { if (active) setSnapshot({ key: jobKey, jobs: result, routes: manifestRoutes, sourceJobs: jobs }); })
      .catch(() => { if (active) setSnapshot({ key: jobKey, jobs: [], routes: manifestRoutes, sourceJobs: jobs,
        error: "Booking details could not be fully loaded. Retry before printing the manifest." }); });
    return () => { active = false; };
  }, [open, hasShuttle, jobIds, jobKey, manifestRoutes, jobs]);

  const vehiclesMap = useMemo(() => {
    const map = new Map<number, (typeof vehicles)[number]>();
    vehicles.forEach((v) => map.set(v.id, v));
    return map;
  }, [vehicles]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `${route.route_name}_${selectedDriver?.label || "Driver"}_Manifest`.replace(/[\\/:*?"<>|]/g, "-"),
    onPrintError: () => { message.error("The manifest could not be printed. Please try again."); },
    pageStyle: `
      @page {
        size: A4 ${hasShuttle ? "landscape" : "portrait"};
        margin: 8mm;
        @bottom-right {
          content: "Page " counter(page) " of " counter(pages);
          font-family: Arial, sans-serif;
          font-size: 8pt;
          color: #6b7280;
        }
      }
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .ant-modal-header {
          display: none !important;
        }
        .print-header {
          margin-bottom: 8px !important;
        }
        .print-header h4 {
          font-size: 16px !important;
          margin-bottom: 0 !important;
        }
        .print-header .ant-typography {
          font-size: 12px !important;
        }
        .print-map {
          height: 280px !important;
          page-break-inside: avoid;
          margin-bottom: 8px !important;
        }
        .ant-divider {
          margin: 8px 0 !important;
        }
        .driver-section {
          margin-top: 8px !important;
        }
        .driver-section h5 {
          font-size: 14px !important;
          margin-bottom: 6px !important;
        }
        .driver-summary-table,
        .route-stops-table {
          page-break-inside: avoid;
          margin-bottom: 8px !important;
        }
        .driver-summary-table table,
        .route-stops-table table {
          font-size: 11px !important;
        }
        .driver-summary-table th,
        .driver-summary-table td,
        .route-stops-table th,
        .route-stops-table td {
          padding: 4px 6px !important;
        }
        .ant-table-cell {
          font-size: 11px !important;
        }
      }
    `,
  });

  const routePolylines = useMemo(() => {
    return generateRoutePolylines(exportRoute);
  }, [exportRoute]);

  const markers = useMemo(() => {
    return generateMapMarkers(exportRoute, [...manifestJobs.values()]);
  }, [exportRoute, manifestJobs]);

  const initialCenter = useMemo<google.maps.LatLngLiteral>(() => {
    return markers[0]?.position ?? { lat: 37.7749, lng: -122.4194 };
  }, [markers]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={hasShuttle ? 1200 : 900}
      style={{ maxWidth: "calc(100vw - 32px)" }}
      centered
      footer={
        <div className={styles.exportControls}>
          <div className={styles.driverSelection}>
            <label htmlFor="manifest-driver">Export for</label>
            <Select<ManifestDriverSelection> id="manifest-driver" aria-label="Driver to export" value={driverId}
              options={driverOptions} onChange={setDriverId} showSearch optionFilterProp="label" />
          </div>
        <Button
          size="small"
          type="primary"
          icon={<PrinterOutlined />}
          onClick={handlePrint}
          loading={loading}
          disabled={!ready || Boolean(loadError) || processing || !manifestRoutes.length}
        >
          Print / Save as PDF
        </Button>
        </div>
      }
      destroyOnHidden
      styles={{ body: { padding: 0, height: "70vh" } }}
      title={
        <div className="flex justify-between items-center px-1 py-3">
          <Title level={5} className="m-0">
            {hasShuttle ? "Shuttle manifest" : "Route Export Preview"}
          </Title>
        </div>
      }
    >
      <div
        ref={printRef}
        className={`custom-scrollbar ${styles.printContent}`}
      >
        {/* Header */}
        <div className={`print-header ${styles.header}`}>
          <Title level={4}>{route.route_name}</Title>
          <Text type="secondary" className="text-base">
            Scheduled Date: {manifestDate(route.scheduled_date)}
          </Text>
          {hasShuttle && <Text type="secondary">{route.sharing_status === "shared" ? "Shared manifest" : "Draft · Pending share"}</Text>}
          {driverId !== "all" && selectedDriver && <Text strong>Driver: {selectedDriver.label}</Text>}
        </div>

        {loading && <div className={styles.loading}><Spin size="small" /><span>Loading complete booking details…</span></div>}
        {loadError && <Alert className={styles.notice} type="error" showIcon title={loadError}
          action={<Button size="small" onClick={() => setRetry(value => value + 1)}>Retry</Button>} />}
        {processing && <Alert className={styles.notice} type="info" showIcon title="Wait for optimization to finish before printing." />}
        {!manifestRoutes.length && <Empty description="No assigned journeys to include in the manifest" />}

        {/* Map Section */}
        <div>
          <div
            className="print-map"
            style={{
              height: "350px",
              width: "100%",
              overflow: "hidden",
            }}
          >
            <GoogleMaps
              polylines={routePolylines}
              markers={markers}
              center={initialCenter}
              zoom={12}
              showDirectionArrows={true}
            />
          </div>
        </div>

        <Divider />

        {/* Driver Routes Sections */}
        {manifestRoutes.map((routeItem, index) => {
          const vehicleObj = routeItem.vehicle_id
            ? vehiclesMap.get(Number(routeItem.vehicle_id))
            : undefined;
          const driverSummary = prepareDriverSummary(
            routeItem,
            routeItem.source_scheduled_date || route.scheduled_date,
            vehicleObj
          );
          if (isShuttleRoute(routeItem, manifestJobs)) return (
            <ShuttleManifestSection key={index} summary={driverSummary}
              locations={prepareShuttleManifestLocations(routeItem, manifestJobs, routeItem.source_scheduled_date || route.scheduled_date)}
              sourcePlan={routeItem.source_route_name}
              pending={routeItem.needs_optimization || routeItem.stops.some(stop => stop.needs_optimization)} />
          );
          const stopsData = prepareStopsData(routeItem.stops, [...manifestJobs.values()]);

          return (
            <div
              key={index}
              className={`driver-section ${index > 0 ? "mt-6" : ""}`}
            >
              <Title level={5} className="mb-3">
                Driver: {routeItem.team_member_name || "Unassigned"}
              </Title>

              {/* Driver Summary Table */}
              <DriverSummaryTable driverSummary={driverSummary} />

              {/* Stops Table */}
              <div className="mt-4">
                <Text strong className="block mb-2">
                  Stop Details
                </Text>
                <RouteStopsTable stops={stopsData} />
              </div>

              {index < (route.result?.routes?.length || 0) - 1 && (
                <Divider className="my-6" />
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
};

// Reopening starts a fresh booking read and cannot reuse a previous print snapshot.
const RouteExportPreview = (props: RouteExportPreviewProps) => props.open ? <RouteExportPreviewContent {...props} /> : null;

export default RouteExportPreview;
