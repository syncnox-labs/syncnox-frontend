import React from "react";
import { Timeline, Typography, Tag, Card } from "antd";
import {
  ClockCircleOutlined,
  EnvironmentOutlined,
  HomeOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

const { Text, Title } = Typography;

interface Stop {
  job_id: number;
  stop_type: string;
  arrival_time: string;
}

interface RouteTimelineProps {
  stops: Stop[];
}

const RouteTimeline: React.FC<RouteTimelineProps> = ({ stops }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case "depot":
        return <HomeOutlined style={{ fontSize: "16px", color: "#1890ff" }} />;
      case "job":
        return (
          <EnvironmentOutlined style={{ fontSize: "16px", color: "#52c41a" }} />
        );
      default:
        return (
          <ClockCircleOutlined style={{ fontSize: "16px", color: "gray" }} />
        );
    }
  };

  const getColor = (type: string) => {
    switch (type) {
      case "depot":
        return "blue";
      case "job":
        return "green";
      default:
        return "gray";
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg">
      <Timeline
        mode="left"
        items={stops.map((stop, index) => ({
          color: getColor(stop.stop_type),
          dot: getIcon(stop.stop_type),
          children: (
            <Card
              size="small"
              bordered={false}
              className="shadow-sm hover:shadow-md transition-shadow mb-2 border border-gray-100"
              bodyStyle={{ padding: "12px" }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Tag color={getColor(stop.stop_type)}>
                      {stop.stop_type.toUpperCase()}
                    </Tag>
                    <Text strong>
                      {stop.stop_type === "job"
                        ? `Job #${stop.job_id}`
                        : "Start / End"}
                    </Text>
                  </div>
                  <Text type="secondary" className="text-xs">
                    Sequence: {index + 1}
                  </Text>
                </div>
                <div className="flex flex-col items-end">
                  <Text strong className="text-lg text-blue-600">
                    {dayjs(stop.arrival_time).format("hh:mm A")}
                  </Text>
                  <Text type="secondary" className="text-xs">
                    {dayjs(stop.arrival_time).format("MMM D")}
                  </Text>
                </div>
              </div>
            </Card>
          ),
        }))}
      />
    </div>
  );
};

export default RouteTimeline;
