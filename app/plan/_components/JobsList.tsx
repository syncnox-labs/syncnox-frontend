"use client";

import { tableTheme } from "@/components/ui/tableTheme";
import { useEffect, useState } from "react";
import {
  Button,
  Drawer,
  Modal,
  message,
  Dropdown,
  Flex,
  Typography,
  Alert,
  type MenuProps,
} from "antd";
import {
  DeleteOutlined,
  ExclamationCircleFilled,
  DownOutlined,
  PlusOutlined,
  UploadOutlined,
  EnvironmentOutlined,
} from "@ant-design/icons";
import { Panel, PanelGroup } from "react-resizable-panels";
import ResizeHandle from "@/components/ResizeHandle";
import { UNSCHEDULED_JOBS_DATE, useJobsStore } from "@/store/jobs.store";
import { useTeamStore } from "@/store/team.store";
import { useIndexStore } from "@/store/index.store";
import { ColDef } from "ag-grid-community";
import { Job, JobStatus } from "@/types/job.type";
import { CustomFieldDefinition, getCustomFields } from "@/apis/custom-fields.api";
import dayjs from "dayjs";
import { formatPlanDate } from "@/utils/app.utils";

type JobTab = "all" | JobStatus;

import BaseTable from "@/components/Table/BaseTable";
import JobForm from "@/components/Jobs/JobForm";
import EditJobTitle from "@/components/Jobs/EditJobTitle";
import GoogleMaps from "@/components/GoogleMaps";
import MarkerTooltip from "@/components/MarkerTooltip";
import { createJobTableColumns, STANDARD_JOB_FIELD_KEYS } from "@/utils/jobs.utils";
import { createActionsColumn } from "@/components/Table/ActionsColumn";
import CreateRouteModal from "@/app/plan/_components/CreateRouteModal";
import JobsToolbar from "@/components/plan/JobsToolbar";
import AddJobsModal from "@/app/plan/AddJobsModal";
import BulkUploadModal from "@/components/BulkUploadModal";
import { jobsActionsClassName, jobsDateGroupClassName, jobsToolbarClassName } from "./planStyles";

const { Title } = Typography;

export default function JobsList() {
  const {
    jobs,
    isLoading: isJobsLoading,
    startJobsList,
    stopJobsList,
    loadJobsList,
    jobsListActive,
    jobsListStatus,
    jobsListDate,
    unscheduledJobsCount,
    error: jobsError,
    deleteJobAction,
    deleteJobsAction,
    resetAllJobs,
    selectedDate,
    setSelectedDate,
    draftJobDates,
  } = useJobsStore();

  const { getTeamsMap } = useTeamStore();

  // Tab / Status Filter Selection
  const [selectedJobTab, setSelectedJobTab] = useState<JobTab>("draft");

  // Custom Field definitions
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);

  // Selection & Modals
  const [editJobData, setEditJobData] = useState<Job | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [showCreateRouteModal, setShowCreateRouteModal] = useState(false);
  const [showAddJobModal, setShowAddJobModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);

  // Map state
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | string | null>(null);

  // Initialize jobs and load custom field definitions on mount
  useEffect(() => {
    void startJobsList();
    getCustomFields("job")
      .then((defs) => setCustomFields(defs.filter((d) => d.is_visible_in_list)))
      .catch((err) => console.error("Failed to fetch custom fields for jobs", err));
  }, [startJobsList]);

  const handleJobStatusChange = (e: any) => {
    const value = e.target.value as JobTab;
    setSelectedJobTab(value);
    setSelectedJobIds([]);
    void loadJobsList(jobsListDate || selectedDate || dayjs().format("YYYY-MM-DD"), value);
  };

  const handleDeleteJobsRequest = () => {
    if (selectedJobIds.length === 0) return;

    const count = selectedJobIds.length;

    Modal.confirm({
      title: "Delete Jobs",
      icon: <ExclamationCircleFilled />,
      content: `Are you sure you want to delete ${count} selected job(s)?`,
      okText: "Delete",
      okType: "danger",
      okButtonProps: { danger: true, style: { borderRadius: 0 } },
      cancelText: "Cancel",
      cancelButtonProps: { style: { borderRadius: 0 } },
      onOk: async () => {
        try {
          await deleteJobsAction(selectedJobIds, "draft");
          message.success(`Successfully deleted ${count} job(s)`);
          setSelectedJobIds([]);
        } catch (err: any) {
          message.error(typeof err?.detail === "string" ? err.detail : err?.message || "Failed to delete jobs");
          console.error(err);
        }
      },
    });
  };

  useEffect(() => {
    return () => {
      stopJobsList();
      resetAllJobs();
    };
  }, [resetAllJobs, stopJobsList]);

  // Status and Date Filtered Jobs
  const sourceJobs = jobs;

  const statusFilteredJobs =
    selectedJobTab === "all"
      ? sourceJobs
      : sourceJobs.filter((j) => j.status === selectedJobTab);

  const availableJobDates = jobsListActive ? draftJobDates : Array.from(
    new Set(
      statusFilteredJobs
        .map((j) => j.scheduled_date)
        .filter((d): d is string => Boolean(d))
    )
  );
  const displayedJobs = selectedDate
    ? statusFilteredJobs.filter((j) => j.scheduled_date === selectedDate)
    : statusFilteredJobs;

  // An empty table should say why it is empty and where the work is, not "No data available".
  const statusWord = selectedJobTab === "all" ? "" : `${String(selectedJobTab).replace(/_/g, " ")} `;
  const emptyMessage = selectedDate
    ? `No ${statusWord}jobs on ${formatPlanDate(selectedDate)}`
    : `No ${statusWord}jobs`;
  const todayKey = dayjs().format("YYYY-MM-DD");
  const otherDates = [...availableJobDates].filter((d) => d && d !== selectedDate).sort();
  const nearestDate = otherDates.find((d) => d >= todayKey) ?? otherDates.at(-1);
  const goToDate = (date: string) => { setSelectedJobIds([]); setSelectedMarkerId(null); setSelectedDate(date); };

  const activeMarkers = displayedJobs
    .map((job: Job, index: number) => {
      const loc = job?.location || job?.pick_up_location || job?.drop_off_location;
      if (
        !loc ||
        typeof loc.lat !== "number" ||
        typeof loc.lng !== "number" ||
        isNaN(loc.lat) ||
        isNaN(loc.lng)
      ) {
        return null;
      }
      return {
        id: job.id,
        position: { lat: loc.lat, lng: loc.lng },
        description:
          job.address_formatted ||
          job.pick_up_address ||
          job.drop_off_address ||
          "No address",
        duration: job.service_duration,
        timeWindowStart: job.time_window_start || job.client_pick_up_time,
        timeWindowEnd: job.time_window_end || job.client_pick_up_time,
        jobType: job.job_type,
        jobData: job,
        sequenceNumber: index + 1,
      };
    })
    .filter((marker): marker is NonNullable<typeof marker> => marker !== null);

  const additionalCustomFields = customFields.filter(
    (f) =>
      !STANDARD_JOB_FIELD_KEYS.has(f.field_key) &&
      f.surfaces?.disp !== false &&
      f.is_visible_in_list !== false
  );

  const customFieldColumns: ColDef<Job>[] = additionalCustomFields.map((f) => ({
    field: `custom_fields.${f.field_key}` as any,
    headerName: f.label,
    valueGetter: (params) => {
      const topVal = params.data?.[f.field_key as keyof Job];
      const shuttleVal = params.data?.worker_shuttle_detail?.[f.field_key as keyof NonNullable<typeof params.data.worker_shuttle_detail>];
      const pickupVal = params.data?.pickup_delivery_detail?.[f.field_key as keyof NonNullable<typeof params.data.pickup_delivery_detail>];
      const customData = params.data?.custom_fields;
      const customVal = customData?.[f.field_key];

      const val = topVal ?? shuttleVal ?? pickupVal ?? customVal;
      if (val === undefined || val === null || val === "") {
        return "-";
      }
      return String(val);
    },
    width: 150,
  }));

  const { activeJobTemplate, fetchTenant } = useIndexStore();

  useEffect(() => {
    // Fetch tenant on mount to ensure we have the latest template
    fetchTenant();
  }, [fetchTenant]);

  const baseColumns = createJobTableColumns({
    templateType: activeJobTemplate || "pickup_delivery_job",
    jobStatus: selectedJobTab === "all" ? undefined : selectedJobTab,
    viewColumnRenderer: (params: any) => (
      <button
        type="button"
        onClick={() => {
          const loc =
            params.data?.location ||
            params.data?.pick_up_location ||
            params.data?.drop_off_location;
          if (
            loc &&
            typeof loc.lat === "number" &&
            typeof loc.lng === "number" &&
            !isNaN(loc.lat) &&
            !isNaN(loc.lng)
          ) {
            setIsMapOpen(true);
            setMapCenter({
              lat: loc.lat,
              lng: loc.lng,
            });
            setSelectedMarkerId(params.data.id);
          }
        }}
        className="text-blue-600 hover:underline font-semibold cursor-pointer border-none bg-transparent p-0"
      >
        {params.value}
      </button>
    ),
    teamsMap: getTeamsMap(),
  });

  const actionsColumn = createActionsColumn<Job>({
    actions: [
      {
        key: "edit",
        label: "Edit",
        onClick: (record) => setEditJobData(record),
      },
      {
        key: "delete",
        label: "Delete",
        danger: true,
        onClick: (record) => {
          Modal.confirm({
            title: "Delete Job",
            icon: <ExclamationCircleFilled />,
            content: `Are you sure you want to delete job #${record.id}?`,
            okText: "Delete",
            okType: "danger",
            okButtonProps: { danger: true, style: { borderRadius: 0 } },
            cancelText: "Cancel",
            cancelButtonProps: { style: { borderRadius: 0 } },
            onOk: async () => {
              try {
                await deleteJobAction(record.id);
                message.success("Job deleted successfully");
              } catch (err: any) {
                message.error(typeof err?.detail === "string" ? err.detail : err?.message || "Failed to delete job");
                console.error(err);
              }
            },
          });
        },
      },
    ],
  });

  const deliveryColumns = [...baseColumns, ...customFieldColumns, actionsColumn];

  const addJobsMenuItems: MenuProps["items"] = [
    {
      key: "add_single",
      label: "Add Single Job",
      icon: <PlusOutlined />,
      onClick: () => setShowAddJobModal(true),
    },
    {
      key: "bulk_import",
      label: "Bulk Import Jobs",
      icon: <UploadOutlined />,
      onClick: () => setShowBulkUploadModal(true),
    },
  ];

  // Typing in the search box narrows the rows already loaded for this date
  const [search, setSearch] = useState("");

  const tableContent = (
    <div className="h-full w-full p-0 flex flex-col min-h-0 overflow-hidden">
      <BaseTable<Job>
        columnDefs={deliveryColumns}
        themeParams={tableTheme}
        rowData={displayedJobs}
        emptyMessage={emptyMessage}
        loading={isJobsLoading || !jobsListActive}
        pagination={true}
        paginationPageSize={100}
        rowSelection="multiple"
        quickFilterText={search}
        containerClassName="h-full w-full flex-1"
        containerStyle={{ height: "100%", width: "100%" }}
        onSelectionChanged={(event) => {
          if (event.api) {
            const selectedRows = event.api.getSelectedRows().map((r: Job) => r.id);
            setSelectedJobIds(selectedRows);
          }
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-[360px] min-w-0">
      <JobsToolbar
        count={jobsListActive && !isJobsLoading ? displayedJobs.length : undefined}
        search={search}
        onSearch={setSearch}
        date={selectedDate}
        onDateChange={date => { setSelectedJobIds([]); setSelectedMarkerId(null); setSelectedDate(date); }}
        datesWithJobs={availableJobDates}
        status={selectedJobTab}
        onStatusChange={value => handleJobStatusChange({ target: { value } })}
        showUnscheduled={jobsListActive && (unscheduledJobsCount > 0 || jobsListDate === UNSCHEDULED_JOBS_DATE)}
        unscheduledCount={unscheduledJobsCount}
        unscheduledActive={jobsListDate === UNSCHEDULED_JOBS_DATE}
        onShowUnscheduled={() => {
          setSelectedJobIds([]); setSelectedMarkerId(null);
          void loadJobsList(UNSCHEDULED_JOBS_DATE, selectedJobTab);
        }}
        selectedCount={selectedJobIds.length}
        onCreateRoute={() => setShowCreateRouteModal(true)}
        onDelete={handleDeleteJobsRequest}
        mapOpen={isMapOpen}
        onToggleMap={() => setIsMapOpen(!isMapOpen)}
        onAddSingle={() => setShowAddJobModal(true)}
        onBulkImport={() => setShowBulkUploadModal(true)}
      />

      {jobsListActive && jobsError && <Alert type="error" showIcon title="Unable to load jobs" description={jobsError}
        action={<Button size="small" onClick={() => void loadJobsList(jobsListDate || selectedDate || dayjs().format("YYYY-MM-DD"), jobsListStatus)}>Retry</Button>} />}

      {jobsListActive && !isJobsLoading && !jobsError && displayedJobs.length === 0 && nearestDate && (
        <div className="lang flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2 text-[13px] text-[#4A5750]" role="status">
          <span>{emptyMessage}.</span>
          <span>Next date with {statusWord}jobs:</span>
          <button type="button" onClick={() => goToDate(nearestDate)}
            className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-[#0B5D3B] underline underline-offset-2 hover:text-[#003220]">
            {formatPlanDate(nearestDate)}
          </button>
        </div>
      )}

      {/* ── Table & Map Area ── */}
      <div className="flex-1 min-h-0">
        {isMapOpen ? (
          <PanelGroup direction="vertical" className="h-full w-full">
            <Panel defaultSize={40} minSize={20} className="w-full">
              <div className="h-full w-full relative">
                <GoogleMaps
                  markers={activeMarkers}
                  center={
                    mapCenter ||
                    (activeMarkers.length > 0 ? activeMarkers[0].position : undefined)
                  }
                  zoom={mapCenter ? 17 : 11}
                  selectedMarkerId={selectedMarkerId}
                  InfoWindowModal={({ marker }) => (
                    <MarkerTooltip
                      address={marker.description}
                      duration={marker.duration}
                      timeWindowStart={marker.timeWindowStart}
                      timeWindowEnd={marker.timeWindowEnd}
                      jobType={marker.jobType}
                      jobData={marker.jobData}
                    />
                  )}
                />
                <Button
                  onClick={() => setIsMapOpen(false)}
                  className="absolute top-4 right-4 z-10 bg-white shadow-md font-medium text-xs rounded-none"
                >
                  Close Map
                </Button>
              </div>
            </Panel>
            <ResizeHandle />
            <Panel defaultSize={60} minSize={20} className="w-full">
              {tableContent}
            </Panel>
          </PanelGroup>
        ) : (
          tableContent
        )}
      </div>

      {/* Edit Job Drawer */}
      <Drawer
        title={<EditJobTitle job={editJobData} />}
        size={720}
        onClose={() => setEditJobData(null)}
        open={Boolean(editJobData)}
        destroyOnHidden
      >
        <JobForm
          initialData={editJobData}
          onSubmit={() => setEditJobData(null)}
        />
      </Drawer>

      {/* Add Single Job Modal */}
      <AddJobsModal
        open={showAddJobModal}
        onCancel={() => setShowAddJobModal(false)}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadModal
        open={showBulkUploadModal}
        onCancel={() => setShowBulkUploadModal(false)}
      />

      {/* Create Route Optimization Modal */}
      <CreateRouteModal
        open={showCreateRouteModal}
        setOpen={setShowCreateRouteModal}
        onCancel={() => setShowCreateRouteModal(false)}
        selectedJobIds={selectedJobIds}
      />
    </div>
  );
}
