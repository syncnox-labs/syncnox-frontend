"use client";

import { useState, useEffect, useCallback } from "react";
import { Typography, Button, Spin, message, Flex, DatePicker, Select } from "antd";
import { LeftOutlined, RightOutlined } from "@ant-design/icons";
import { ScheduleTimeline } from "@/components/Schedule";
import { fetchDriverSchedule } from "@/apis/schedule.api";
import {
  ResourceSchedule,
  SCHEDULE_STATUS_COLORS,
} from "@/types/schedule.type";
import dayjs, { Dayjs } from "dayjs";

const { Title } = Typography;

const INTERVAL_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 25, label: "25 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "60 min" },
];

export default function ScheduleView() {
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [resources, setResources] = useState<ResourceSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(30);

  const loadSchedule = useCallback(async (date: Dayjs) => {
    setLoading(true);
    try {
      const dateStr = date.format("YYYY-MM-DD");
      const response = await fetchDriverSchedule(dateStr);
      setResources(response.resources);
    } catch (error) {
      console.error("Failed to fetch schedule:", error);
      message.error("Failed to load schedule data");
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedule(selectedDate);
  }, [selectedDate, loadSchedule]);

  const goToPreviousDay = () => {
    setSelectedDate((prev) => prev.subtract(1, "day"));
  };

  const goToNextDay = () => {
    setSelectedDate((prev) => prev.add(1, "day"));
  };

  const goToToday = () => {
    setSelectedDate(dayjs());
  };

  return (
    <div className="flex flex-col h-full min-h-[360px] min-w-0">
      <Flex justify="space-between" align="center" className="plan-toolbar responsive-toolbar !mb-0 shrink-0">
        <Flex wrap gap={12} align="center">
          <Title level={4} className="m-0 pt-2">
            Driver Schedule
          </Title>
          <Flex wrap gap={8} align="center">
            {Object.entries(SCHEDULE_STATUS_COLORS).map(([status, color]) => (
              <Flex key={status} align="center" gap={4}>
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    backgroundColor: color,
                    borderRadius: "2px",
                  }}
                />
                <span
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    textTransform: "capitalize",
                  }}
                >
                  {status.replace("_", " ")}
                </span>
              </Flex>
            ))}
          </Flex>
        </Flex>

        <Flex wrap gap={8} align="center">
          <Select
            value={intervalMinutes}
            onChange={setIntervalMinutes}
            options={INTERVAL_OPTIONS}
            style={{ width: 100 }}
          />
          <Button onClick={goToToday}>Today</Button>
          <Button icon={<LeftOutlined />} onClick={goToPreviousDay} />
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            format="MMM D, YYYY"
            allowClear={false}
            style={{ width: "150px" }}
          />
          <Button icon={<RightOutlined />} onClick={goToNextDay} />
        </Flex>
      </Flex>

      <div className="flex-1 min-h-0 mt-2 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
            <Spin />
          </div>
        )}
        <ScheduleTimeline
          resources={resources}
          dayStartHour={0}
          dayEndHour={24}
          loading={loading}
          intervalMinutes={intervalMinutes}
        />
      </div>
    </div>
  );
}
