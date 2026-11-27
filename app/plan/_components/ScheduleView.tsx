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
import { useRouteStore } from "@/store/routes.store";
import { planActionsClassName, scheduleTitleClassName, scheduleToolbarClassName } from "./planStyles";

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

  // When the chosen day has no trips, point to the nearest day that has a plan.
  const { routes: plans, initializeRoutes } = useRouteStore();
  useEffect(() => { void initializeRoutes(); }, [initializeRoutes]);
  const dayKey = selectedDate.format("YYYY-MM-DD");
  const emptyDay = !loading && !resources.some((resource) => (resource.blocks ?? []).length > 0);
  const planDays = [...new Set(plans.map((plan) => String(plan.scheduled_date ?? "").slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d !== dayKey))].sort();
  const nearestPlanDay = planDays.find((d) => d > dayKey) ?? planDays.at(-1);

  const goToPreviousDay = () => {
    setSelectedDate((prev) => prev.subtract(1, "day"));
  };

  const goToNextDay = () => {
    setSelectedDate((prev) => prev.add(1, "day"));
  };

  return (
    <div className="flex flex-col h-full min-h-[360px] min-w-0">
      <Flex justify="space-between" align="center" wrap className={scheduleToolbarClassName}>
        <Flex wrap gap={12} align="center">
          <Title level={4} className={scheduleTitleClassName}>
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

        <Flex wrap gap={8} align="center" className={planActionsClassName}>
          <Select
            value={intervalMinutes}
            onChange={setIntervalMinutes}
            options={INTERVAL_OPTIONS}
            style={{ width: 100 }}
          />
          <Button icon={<LeftOutlined />} onClick={goToPreviousDay} aria-label="Previous day" title="Previous day" />
          <DatePicker
            value={selectedDate}
            onChange={(date) => date && setSelectedDate(date)}
            format="ddd, MMM D"
            allowClear={false}
            style={{ width: "150px" }}
          />
          <Button icon={<RightOutlined />} onClick={goToNextDay} aria-label="Next day" title="Next day" />
        </Flex>
      </Flex>

      {emptyDay && (
        <div role="status" className="lang mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2 text-[13px] text-[#4A5750]">
          <span>No trips on {selectedDate.format("ddd, MMM D")}.</span>
          {nearestPlanDay && <>
            <span>Next day with a plan:</span>
            <button type="button" onClick={() => setSelectedDate(dayjs(nearestPlanDay))}
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-[#0B5D3B] underline underline-offset-2 hover:text-[#003220]">
              {dayjs(nearestPlanDay).format("ddd, MMM D")}
            </button>
          </>}
        </div>
      )}
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
