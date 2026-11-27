import React, { useState } from "react";
import {
  Drawer,
  Tag,
  Typography,
  Button,
  Avatar,
  App,
  message,
} from "antd";
import {
  EnvironmentOutlined,
  ClockCircleOutlined,
  UserOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PhoneOutlined,
  MailOutlined,
  FieldTimeOutlined,
  ScheduleOutlined,
  ContainerOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  TagOutlined,
  ShopOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import type { Job, JobStatus } from "@/types/job.type";
import { STATUS_COLORS } from "@/utils/jobs.utils";
import { updateJobStatus } from "@/apis/jobs.api";
import { useJobsStore } from "@/store/jobs.store";
import { useRouteStore } from "@/store/routes.store";
import { stopKindOf, stopStatusConfirm } from "./stopStatusConfirm";

const { Text } = Typography;

interface JobDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  stopData: any | null;
  job: Job | null;
  driverName?: string;
  onRemoveJob?: () => void;
}

const JobDetailsDrawer: React.FC<JobDetailsDrawerProps> = ({
  open,
  onClose,
  stopData,
  job,
  driverName,
  onRemoveJob,
}) => {
  const { patchJobLocally } = useJobsStore();
  const { modal } = App.useApp();
  const { fetchRoutes, selectedStatus } = useRouteStore();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!stopData && !job) return null;

  const jobId = job?.id || stopData?.job_id;
  const address = job?.address_formatted || stopData?.address_formatted || "Location Address Not Specified";
  const status = job?.status || stopData?.status || "assigned";
  const priority = job?.priority_level || (job as any)?.priority || "medium";

  const arrivalTime = stopData?.arrival_time ? dayjs(stopData.arrival_time) : null;
  const serviceDuration = stopData?.service_duration_minutes || job?.service_duration || 0;
  const departureTime = arrivalTime ? arrivalTime.add(serviceDuration, "minute") : null;

  const customerName = job?.first_name || job?.last_name
    ? `${job.first_name || ""} ${job.last_name || ""}`.trim()
    : (job as any)?.customer_name || "";
  const phone = job?.phone_number || (job as any)?.customer_phone || "";
  const email = job?.email || (job as any)?.customer_email || "";
  const businessName = job?.business_name || "";
  const notes = job?.additional_notes || (job as any)?.notes || "";
  const preferences = job?.customer_preferences || "";
  const podNotes = job?.pod_notes || "";

  const stopType = String(stopData?.stop_type || "").toLowerCase();
  const stopKind = stopKindOf(stopType);

  const handleUpdateStatus = async (newStatus: "completed" | "failed") => {
    if (!jobId) return;
    const confirm = stopStatusConfirm({
      action: newStatus, kind: stopKind, jobId, who: customerName || null,
      whenText: arrivalTime ? `${arrivalTime.format("h:mm A")} · ${arrivalTime.format("ddd, MMM D")}` : null,
      address: address !== "Location Address Not Specified" ? address : null,
    });
    modal.confirm({
      ...confirm.modal,
      onOk: async () => {
        try {
          setIsUpdating(true);
          const updated = await updateJobStatus(jobId, confirm.targetStatus);
          patchJobLocally(updated);
          await fetchRoutes(selectedStatus);
          message.success(confirm.successText);
          onClose();
        } catch {
          message.error(confirm.errorText);
        } finally {
          setIsUpdating(false);
        }
      },
    });
  };

  const getPriorityColor = (p?: string) => {
    if (!p) return "default";
    switch (p.toLowerCase()) {
      case "high":
        return "red";
      case "medium":
        return "orange";
      case "low":
        return "blue";
      default:
        return "default";
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center justify-between gap-2 pr-4">
          <div className="flex items-center gap-2">
            <Text className="text-sm font-bold text-gray-900">
              {stopData?.stop_type === "depot" ? "Depot Station" : `Job #${jobId || "--"}`}
            </Text>
            {stopData?.stop_type !== "depot" && (
              <Tag color={STATUS_COLORS[status as JobStatus] || "blue"} className="capitalize font-semibold border-none text-[11px] px-2 py-0">
                {(status || "assigned").replace("_", " ")}
              </Tag>
            )}
          </div>
          {priority && stopData?.stop_type !== "depot" && (
            <Tag color={getPriorityColor(priority)} className="uppercase text-[10px] font-bold px-1.5 py-0">
              {priority}
            </Tag>
          )}
        </div>
      }
      size={420}
      placement="right"
      destroyOnHidden
      styles={{
        body: { padding: "12px 16px" },
      }}
    >
      <div className="space-y-3 text-xs">
        {/* Destination & Location */}
        <div className="bg-gray-50 border border-gray-200/80 p-2.5 space-y-1">
          <div className="flex items-start gap-2">
            <EnvironmentOutlined className="text-[#003220] text-sm mt-0.5 shrink-0" />
            <div>
              <Text className="text-[10px] font-bold text-gray-500 block uppercase tracking-wider">
                Destination Address
              </Text>
              <Text className="text-xs font-semibold text-gray-800 leading-snug">
                {address}
              </Text>
            </div>
          </div>

          {(job?.location?.lat || stopData?.latitude) && (
            <div className="pl-5 text-[10px] font-mono text-gray-400">
              Lat: {job?.location?.lat || stopData?.latitude}, Lng: {job?.location?.lng || stopData?.longitude}
            </div>
          )}
        </div>

        {/* Schedule & Timing Overview */}
        <div>
          <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
            Schedule & Time Window
          </Text>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white border border-gray-200 p-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
                <ClockCircleOutlined className="text-[#003220]" />
                <span>ETA</span>
              </div>
              <div className="text-sm font-bold text-gray-900">
                {arrivalTime && arrivalTime.isValid() ? arrivalTime.format("h:mm A") : "--:--"}
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
                <FieldTimeOutlined className="text-[#003220]" />
                <span>Service Duration</span>
              </div>
              <div className="text-sm font-bold text-gray-900">
                {serviceDuration} min
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
                <ScheduleOutlined className="text-[#003220]" />
                <span>Departure</span>
              </div>
              <div className="text-xs font-semibold text-gray-800">
                {departureTime && departureTime.isValid() ? departureTime.format("h:mm A") : "--:--"}
              </div>
            </div>

            <div className="bg-white border border-gray-200 p-2">
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
                <ContainerOutlined className="text-[#003220]" />
                <span>Time Window</span>
              </div>
              <div className="text-xs font-semibold text-gray-800 truncate">
                {job?.time_window_start && job?.time_window_end
                  ? `${job.time_window_start} - ${job.time_window_end}`
                  : "Anytime"}
              </div>
            </div>
          </div>
        </div>

        {/* Driver & Job Metadata Bar */}
        <div className="grid grid-cols-2 gap-2">
          {driverName && (
            <div className="bg-white border border-gray-200 p-2 flex items-center gap-2">
              <Avatar size="small" icon={<UserOutlined />} className="bg-[#003220] shrink-0" />
              <div className="min-w-0">
                <Text className="text-[10px] text-gray-400 uppercase font-semibold block leading-none">Driver</Text>
                <Text className="text-xs font-bold text-gray-800 truncate block">{driverName}</Text>
              </div>
            </div>
          )}

          {job?.job_type && (
            <div className="bg-white border border-gray-200 p-2 flex items-center gap-2">
              <TagOutlined className="text-[#003220] text-sm shrink-0" />
              <div className="min-w-0">
                <Text className="text-[10px] text-gray-400 uppercase font-semibold block leading-none">Job Type</Text>
                <Text className="text-xs font-bold text-gray-800 capitalize truncate block">{job.job_type}</Text>
              </div>
            </div>
          )}
        </div>

        {/* Customer & Contact Details */}
        {(customerName || phone || email || businessName) && (
          <div>
            <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">
              Contact Information
            </Text>
            <div className="bg-white border border-gray-200 p-2.5 space-y-1.5">
              {businessName && (
                <div className="flex items-center gap-2 text-xs">
                  <ShopOutlined className="text-gray-400 shrink-0" />
                  <Text className="font-semibold text-gray-800">{businessName}</Text>
                </div>
              )}
              {customerName && (
                <div className="flex items-center gap-2 text-xs">
                  <UserOutlined className="text-gray-400 shrink-0" />
                  <Text className="font-semibold text-gray-800">{customerName}</Text>
                </div>
              )}
              {phone && (
                <div className="flex items-center gap-2 text-xs">
                  <PhoneOutlined className="text-gray-400 shrink-0" />
                  <Text className="text-gray-700">{phone}</Text>
                </div>
              )}
              {email && (
                <div className="flex items-center gap-2 text-xs">
                  <MailOutlined className="text-gray-400 shrink-0" />
                  <Text className="text-gray-700 truncate">{email}</Text>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Notes & Preferences */}
        {(notes || preferences || podNotes) && (
          <div className="space-y-2">
            {notes && (
              <div>
                <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Additional Notes
                </Text>
                <div className="bg-amber-50/80 border border-amber-200/80 p-2 text-xs text-amber-950 leading-relaxed">
                  {notes}
                </div>
              </div>
            )}

            {preferences && (
              <div>
                <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Customer Preferences
                </Text>
                <div className="bg-blue-50/80 border border-blue-200/80 p-2 text-xs text-blue-950 leading-relaxed">
                  {preferences}
                </div>
              </div>
            )}

            {podNotes && (
              <div>
                <Text className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                  Proof of Delivery Notes
                </Text>
                <div className="bg-emerald-50/80 border border-emerald-200/80 p-2 text-xs text-emerald-950 leading-relaxed">
                  {podNotes}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions Footer */}
        {stopData?.stop_type !== "depot" && (
          <div className="pt-3 border-t border-gray-200 space-y-1.5">
            <div className="flex gap-2">
              <Button
                type="primary"
                size="small"
                icon={<CheckCircleOutlined />}
                loading={isUpdating}
                disabled={status === "completed"}
                onClick={() => handleUpdateStatus("completed")}
                className="w-1/2 bg-[#003220] hover:bg-[#002417] text-xs"
              >
                Mark Completed
              </Button>
              <Button
                type="default"
                size="small"
                disabled={status === "skipped" || status === "failed"}
                onClick={() => handleUpdateStatus("failed")}
                className="w-1/2 text-xs"
              >
                Skip Stop
              </Button>
            </div>

            {onRemoveJob && (
              <Button
                danger
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                onClick={() => {
                  onClose();
                  onRemoveJob();
                }}
                className="w-full text-xs"
              >
                Remove Stop from Route
              </Button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
};

export default JobDetailsDrawer;

