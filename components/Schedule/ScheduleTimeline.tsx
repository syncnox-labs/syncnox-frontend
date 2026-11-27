"use client";

import { ResourceSchedule } from "@/types/schedule.type";
import TimelineHeader from "./TimelineHeader";
import ResourceRow from "./ResourceRow";
import { Empty } from "antd";
import { useEffect, useRef } from "react";

interface ScheduleTimelineProps {
  resources: ResourceSchedule[];
  dayStartHour?: number;
  dayEndHour?: number;
  timezone?: string;
  loading?: boolean;
  intervalMinutes?: number;
}

export default function ScheduleTimeline({
  resources,
  dayStartHour = 0,
  dayEndHour = 24,
  timezone,
  loading = false,
  intervalMinutes = 30,
}: ScheduleTimelineProps) {
  const effectiveTimezone =
    timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Open at the first booking of the day instead of at midnight
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || resources.length === 0) return;
    const starts = resources.flatMap((resource) => resource.blocks.map((block) => new Date(block.start_time)))
      .filter((date) => Number.isFinite(date.getTime()))
      .map((date) => date.getHours() + date.getMinutes() / 60);
    if (starts.length === 0) return;
    const nameColumn = container.querySelector<HTMLElement>("[data-resource-name]")?.offsetWidth ?? 180;
    const timelineWidth = container.scrollWidth - nameColumn;
    const hours = dayEndHour - dayStartHour;
    const first = Math.max(0, Math.min(...starts) - dayStartHour - 0.5);
    container.scrollLeft = Math.max(0, (first / hours) * timelineWidth);
  }, [resources, dayStartHour, dayEndHour, intervalMinutes]);

  if (!loading && resources.length === 0) {
    return (
      <div className="flex justify-center items-center h-[300px] rounded-none bg-[#F7F8F9]">
        <Empty description="No drivers scheduled for this date" />
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white h-full">
      {/* Scrollable container */}
      <div ref={scrollRef} className="custom-scrollbar h-full overflow-auto">
        {/* Fixed header + scrollable body */}
        <div className="min-w-max">
          <TimelineHeader 
            dayStartHour={dayStartHour} 
            dayEndHour={dayEndHour} 
            intervalMinutes={intervalMinutes}
          />

          {/* Resource rows */}
          <div>
            {resources.map((resource) => (
              <ResourceRow
                key={resource.resource_id}
                resource={resource}
                dayStartHour={dayStartHour}
                dayEndHour={dayEndHour}
                timezone={effectiveTimezone}
                intervalMinutes={intervalMinutes}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
