import { useState } from "react";
import { Typography, Tag, Button, message, App } from "antd";
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  CheckCircleOutlined,
  UserAddOutlined,
  UserDeleteOutlined,
  CopyOutlined,
} from "@ant-design/icons";
import { Job, JobStatus } from "@/types/job.type";
import { STATUS_COLORS } from "@/utils/jobs.utils";
import { formatTime12h } from "@/utils/app.utils";
import { updateJobStatus } from "@/apis/jobs.api";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";
import { MarkerJobData } from "./optimizationView.utils";

const { Text } = Typography;

interface MarkerData {
  id: string | number;
  position: google.maps.LatLngLiteral;
  title?: string;
  description?: string;
  jobData?: Job | MarkerJobData;
}

interface RouteInfoWindowProps {
  marker: MarkerData;
  onRemoveJob?: () => void;
  onViewDetails?: () => void;
}

const RouteInfoWindow: React.FC<RouteInfoWindowProps> = ({ marker, onRemoveJob, onViewDetails }) => {
  const { jobData, title, description } = marker;
  const { patchJobLocally } = useJobsStore();
  const { modal } = App.useApp();
  const { fetchRoutes, selectedStatus } = useRouteStore();
  const [isMarkingComplete, setIsMarkingComplete] = useState(false);
  const status = jobData?.status;
  const showButtons = status === "completed" || status === "failed";


  const stopType = String((jobData as any)?.stop_type || "").toLowerCase();
  const isPickupStop = stopType === "pickup";
  const isDropoffStop = stopType === "dropoff" || stopType === "drop_off";

  const handleUpdateJobStatus = async (status: string) => {
    if (!jobData?.id) return;

    let targetStatus = status;
    if (status === "completed" && isPickupStop) {
      targetStatus = "in_transit";
    }

    try {
      setIsMarkingComplete(true);
      const updatedJob = await updateJobStatus(jobData.id, targetStatus);
      patchJobLocally(updatedJob);
      await fetchRoutes(selectedStatus);
      message.success(
        isPickupStop
          ? "Pickup marked as done (In Transit)"
          : status === "completed"
            ? "Job marked as completed"
            : "Job marked as skipped",
      );
    } catch (error) {
      message.error(
        status === "completed"
          ? "Failed to mark job as completed"
          : "Failed to skip job",
      );
    } finally {
      setIsMarkingComplete(false);
    }
  };

  const confirmAction = (status: string) => {
    const isComplete = status === "completed";
    const title = isPickupStop
      ? "Mark Pickup as Done?"
      : isComplete
        ? "Mark as Completed?"
        : "Skip this job?";
    const content = isPickupStop
      ? "Are you sure you want to mark this pickup as done?"
      : isComplete
        ? "Are you sure you want to mark this job as completed?"
        : "Are you sure you want to skip this job?";
    const okText = isPickupStop
      ? "Mark Pickup Done"
      : isComplete
        ? "Mark as Completed"
        : "Skip";

    modal.confirm({
      title,
      content,
      okText,
      okType: isComplete ? "primary" : "danger",
      cancelText: "Cancel",
      onOk: () => handleUpdateJobStatus(status),
    });
  };

  return (
    <div className="min-w-[270px] max-w-[320px] bg-white text-slate-800 p-1">
      {/* Header: Pickup / Drop-off Badge & Status */}
      <div className="mb-2 pb-1.5 border-b border-slate-200 flex items-center justify-between">
        {isPickupStop ? (
          <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-400">
            <UserAddOutlined className="text-emerald-700 font-bold" />
            PICKUP
          </span>
        ) : isDropoffStop ? (
          <span className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-400">
            <UserDeleteOutlined className="text-blue-700 font-bold" />
            DROP-OFF
          </span>
        ) : null}

        {status && (
          <Tag
            color={STATUS_COLORS[status]}
            className="mr-0 ml-auto capitalize border-none px-2 py-0.5 text-xs font-semibold shrink-0"
            style={{ borderRadius: "0px" }}
          >
            {status.replace("_", " ")}
          </Tag>
        )}
      </div>

      {/* Address */}
      <div className="flex gap-2.5 mb-2.5 items-start select-text">
        {isPickupStop ? (
          <EnvironmentOutlined className="text-emerald-600 text-base shrink-0 mt-0.5" />
        ) : (
          <EnvironmentOutlined className="text-blue-600 text-base shrink-0 mt-0.5" />
        )}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 select-none">
              {isPickupStop ? "Pickup Address" : isDropoffStop ? "Drop-off Address" : "Address"}
            </span>
            {(title || jobData?.address_formatted) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const textToCopy = String(title || jobData?.address_formatted || "");
                  navigator.clipboard.writeText(textToCopy);
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
          <Text className="text-xs text-slate-900 leading-snug font-bold select-text cursor-text break-words">
            {title || jobData?.address_formatted || "Unknown Address"}
          </Text>
        </div>
      </div>

      {/* Time Info */}
      <div className="flex justify-center items-center bg-slate-50 border border-slate-200 p-2 text-center">
        <div className="flex gap-2 items-center justify-center">
          <ClockCircleOutlined className="text-slate-500 text-xs shrink-0" />
          <div className="flex flex-col items-center">
            {description && (
              <Text className="text-xs text-slate-900 font-bold leading-snug">
                {description}
              </Text>
            )}
            {jobData &&
              "time_window_start" in jobData &&
              jobData.time_window_start &&
              "time_window_end" in jobData &&
              jobData.time_window_end && (
                <Text className="text-[11px] text-slate-600 leading-tight">
                  Window: {formatTime12h(jobData.time_window_start)} - {formatTime12h(jobData.time_window_end)}
                </Text>
              )}
          </div>
        </div>
      </div>
      {jobData && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
          {/* {onViewDetails && (
            <Button
              type="primary"
              size="small"
              className="bg-[#003220] hover:bg-[#002417] text-xs font-semibold"
              style={{ width: "100%" }}
              onClick={onViewDetails}
            >
              View Full Job Details
            </Button>
          )} */}

          {!showButtons && (
            <div className="flex gap-2">
              <Button
                type="default"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={isMarkingComplete}
                onClick={() => confirmAction("completed")}
                style={{
                  width: "100%",
                }}
              >
                Mark Complete
              </Button>
              <Button
                onClick={() => confirmAction("failed")}
                type="default"
                size="small"
              >
                Skip
              </Button>
            </div>
          )}

          {onRemoveJob && !showButtons && (
            <Button
              danger
              type="text"
              size="small"
              style={{ width: "100%" }}
              onClick={onRemoveJob}
            >
              Remove from Route
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default RouteInfoWindow;
