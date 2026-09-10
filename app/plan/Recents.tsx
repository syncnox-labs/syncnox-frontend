import { useState } from "react";
import Link from "next/link";
import { Panel, PanelGroup } from "react-resizable-panels";
import BaseTable from "@/components/Table/BaseTable";
import GoogleMaps from "@/components/GoogleMaps";
import MarkerTooltip from "@/components/MarkerTooltip";
import { Job } from "@/types/job.type";
import { createJobTableColumns } from "@/utils/jobs.utils";
import { createActionsColumn } from "@/components/Table/ActionsColumn";
import { useJobsStore } from "@/store/jobs.store";
import { useTeamStore } from "@/store/team.store";
import { useIndexStore } from "@/store/index.store";
import { Button, Typography, Drawer, Flex } from "antd";
import JobForm from "@/components/Jobs/JobForm";
import CreateRouteModal from "./_components/CreateRouteModal";
import ResizeHandle from "@/components/ResizeHandle";
import DraftJobsDatePicker from "@/components/Jobs/DraftJobsDatePicker";

const { Title } = Typography;

const Recents = () => {
  const {
    draftJobs,
    deleteJobAction,
    isLoading,
    error,
    selectedDate,
    setSelectedDate,
    draftJobDates,
  } = useJobsStore();
  const { getTeamsMap } = useTeamStore();
  const { setCurrentTab } = useIndexStore();
  const [editJobData, setEditJobData] = useState<Job | null>(null);
  const [mapCenter, setMapCenter] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<
    number | string | null
  >(null);
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [showCreateRouteModal, setShowCreateRouteModal] = useState(false);

  // Transform draftJobs into markers for GoogleMaps
  const markers = draftJobs
    .filter((job) => job.location?.lat && job.location?.lng)
    .map((job, index) => ({
      id: job.id,
      position: {
        lat: job.location!.lat,
        lng: job.location!.lng,
      },
      description: job.address_formatted || "No address",
      duration: job.service_duration,
      timeWindowStart: job.time_window_start,
      timeWindowEnd: job.time_window_end,
      jobType: job.job_type,
      jobData: job, // Store full job data for edit functionality
      sequenceNumber: index + 1, // Sequence number for marker label (1, 2, 3...)
    }));

  const columns = [
    ...createJobTableColumns({
      viewColumnRenderer: (params: any) => (
        <button
          type="button"
          onClick={() => {
            if (params.data.location?.lat && params.data.location?.lng) {
              setMapCenter({
                lat: params.data.location.lat,
                lng: params.data.location.lng,
              });
              // Auto-open tooltip when ID is clicked
              setSelectedMarkerId(params.data.id);
            }
          }}
          className="text-blue-600 hover:underline font-semibold cursor-pointer border-none bg-transparent p-0"
        >
          {params.value}
        </button>
      ),
      teamsMap: getTeamsMap(),
    }),
    createActionsColumn<Job>({
      actions: [
        {
          key: "edit",
          label: "Edit",
          onClick: (job: Job) => setEditJobData(job),
        },
        {
          key: "delete",
          label: "Delete",
          type: "delete",
          onClick: async (job: Job) => {
            await deleteJobAction(job.id);
          },
        },
      ],
      entityName: "Job",
    }),
  ];

  const recentsJobDates = Array.from(
    new Set(
      draftJobs
        .map((j) => j.scheduled_date)
        .filter((d): d is string => Boolean(d))
    )
  );

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="absolute inset-0">
      <PanelGroup direction="vertical">
        {/* Map Panel - Resizable */}
        <Panel defaultSize={40} minSize={10}>
          <div className="h-full">
            <GoogleMaps
              markers={markers}
              center={mapCenter || undefined}
              zoom={mapCenter ? 17 : undefined}
              selectedMarkerId={selectedMarkerId}
              onMarkerSelect={setSelectedMarkerId}
              InfoWindowModal={({ marker }) => (
                <MarkerTooltip
                  jobType={marker.jobType}
                  address={marker.description}
                  duration={marker.duration}
                  timeWindowStart={marker.timeWindowStart}
                  timeWindowEnd={marker.timeWindowEnd}
                  onEdit={() => setEditJobData((marker.jobData as Job) ?? null)}
                />
              )}
            />
          </div>
        </Panel>

        <ResizeHandle />

        {/* Jobs Section Panel */}
        <Panel defaultSize={60} minSize={5}>
          <div className="flex flex-col h-full p-4 bg-gray-50">
            {/* Top Bar */}
            <Flex justify="space-between" align="center" className="mb-4">
              <Flex gap={24} align="center">
                <Title level={4} className="m-0 pt-2">
                  Jobs
                </Title>
                <DraftJobsDatePicker
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  draftJobDates={recentsJobDates}
                />
              </Flex>
              <Flex gap={8}>
                <Link href="/plan" onClick={() => setCurrentTab("add-jobs")}>
                  <Button>Add Jobs</Button>
                </Link>
                <Button
                  disabled={selectedJobIds.length === 0}
                  type="primary"
                  onClick={() => setShowCreateRouteModal(true)}
                >
                  Create New Route
                </Button>
              </Flex>
            </Flex>

            {/* Table with explicit height */}
            <div className="flex-1 mb-2 mt-2">
              <BaseTable<Job>
                columnDefs={columns}
                rowData={draftJobs}
                rowSelection="multiple"
                loading={isLoading}
                emptyMessage="No jobs on the selected date"
                pagination={true}
                containerStyle={{ height: "100%" }}
                onSelectionChanged={(event) => {
                  const selectedRows = event.api
                    .getSelectedRows()
                    .map((row: Job) => row.id);
                  setSelectedJobIds(selectedRows);
                }}
              />
            </div>
            <Drawer
              onClose={() => setEditJobData(null)}
              title={`Edit Job #${editJobData?.id || ""}`}
              open={editJobData?.id !== undefined}
              width={720}
              placement="right"
              destroyOnClose
            >
              <JobForm
                onSubmit={() => setEditJobData(null)}
                initialData={editJobData}
              />
            </Drawer>
            {showCreateRouteModal && (
              <CreateRouteModal
                open={showCreateRouteModal}
                setOpen={setShowCreateRouteModal}
                selectedJobIds={selectedJobIds}
              />
            )}
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
};

export default Recents;
