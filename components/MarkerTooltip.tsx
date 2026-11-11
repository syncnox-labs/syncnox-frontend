import React from "react";
import { Flex, Typography, Button } from "antd";
import { Edit } from "lucide-react";
import { Job, JobType } from "@/types/job.type";

const { Text } = Typography;

interface MarkerTooltipProps {
  jobData?: Job;
  jobType?: JobType | string;
  address?: string;
  duration?: number;
  timeWindowStart?: string;
  timeWindowEnd?: string;
  onEdit?: () => void;
}

const JOB_TYPE_CONFIG: Partial<
  Record<
    JobType | string,
    { color: string; label: string; bg: string; icon: string }
  >
> = {
  delivery: { color: "#1677ff", label: "Delivery", bg: "#e6f4ff", icon: "📦" },
  pickup: { color: "#52c41a", label: "Pickup", bg: "#ecfdf5", icon: "📍" },
  service: { color: "#fa8c16", label: "Service", bg: "#fff7e6", icon: "🔧" },
  transport: { color: "#059669", label: "Transport", bg: "#ecfdf5", icon: "🚌" },
  one_way: { color: "#13c2c2", label: "One Way", bg: "#e6fffb", icon: "➡️" },
  return_only: { color: "#722ed1", label: "Return Only", bg: "#f9f0ff", icon: "↩️" },
  round_trip: { color: "#eb2f96", label: "Round Trip", bg: "#fff0f6", icon: "🔄" },
};

const MarkerTooltip: React.FC<MarkerTooltipProps> = ({
  jobType,
  address,
  duration,
  timeWindowStart,
  timeWindowEnd,
  onEdit,
}) => {
  const formatTimeWindow = () => {
    if (!timeWindowStart && !timeWindowEnd) return null;
    return `${timeWindowStart || ""} - ${timeWindowEnd || ""}`;
  };

  const timeWindow = formatTimeWindow();
  const config =
    jobType && jobType in JOB_TYPE_CONFIG
      ? JOB_TYPE_CONFIG[jobType as JobType]
      : null;

  return (
    <div
      className="bg-white shadow-xl"
      style={{
        width: "min(260px, calc(100vw - 64px))",
        // maxWidth: 280,
        borderRadius: 0,
        overflow: "hidden",
        border: "1px solid #e0e0e0",
      }}
    >
      {/* Compact Header with Job Type and Edit */}
      {(jobType || onEdit) && (
        <Flex
          justify="space-between"
          align="center"
          style={{
            backgroundColor: config?.bg || "#fafafa",
            padding: "8px 10px",
            borderLeft: `3px solid ${config?.color || "#d9d9d9"}`,
          }}
        >
          {jobType && config && (
            <Flex align="center" gap={6}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{config.icon}</span>
              <span
                style={{
                  color: config.color,
                  fontWeight: 600,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                }}
              >
                {config.label}
              </span>
            </Flex>
          )}
          {/* {onEdit && (
            <Button
              type="text"
              size="small"
              icon={<Edit size={13} />}
              onClick={onEdit}
              className="hover:bg-black/10"
              style={{
                padding: "3px 5px",
                height: "auto",
                borderRadius: 0,
                color: "#8c8c8c",
                marginLeft: "auto",
              }}
            />
          )} */}
          {onEdit && <Edit className="cursor-pointer" onClick={onEdit} size={20} />}
        </Flex>
      )}

      {/* Content Area */}
      <div style={{ padding: "10px" }}>
        {/* Address */}
        {address && (
          <Text
            strong
            style={{
              fontSize: 13,
              lineHeight: "18px",
              color: "#262626",
              display: "block",
              marginBottom: duration || timeWindow ? "8px" : 0,
            }}
          >
            {address}
          </Text>
        )}

        {/* Duration and Time Window */}
        {(duration || timeWindow) && (
          <Flex gap={10} align="center" wrap="wrap">
            {duration && (
              <Flex
                align="center"
                gap={4}
                style={{
                  backgroundColor: "#f5f5f5",
                  padding: "3px 7px",
                  borderRadius: 0,
                }}
              >
                <span style={{ fontSize: 11 }}>⏱</span>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#595959",
                  }}
                >
                  {duration}m
                </Text>
              </Flex>
            )}
            {timeWindow && (
              <Flex
                align="center"
                gap={4}
                style={{
                  backgroundColor: "#f5f5f5",
                  padding: "3px 7px",
                  borderRadius: 0,
                }}
              >
                <span style={{ fontSize: 11 }}>🕒</span>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#595959",
                  }}
                >
                  {timeWindow}
                </Text>
              </Flex>
            )}
          </Flex>
        )}
      </div>
    </div>
  );
};

export default MarkerTooltip;
