"use client";

import { ResourceSchedule } from "@/types/schedule.type";
import TimelineHeader from "./TimelineHeader";
import ResourceRow from "./ResourceRow";
import { Empty } from "antd";

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

  if (!loading && resources.length === 0) {
    return (
      <div className="flex justify-center items-center h-[300px] border border-gray-200 rounded-lg bg-gray-50">
        <Empty description="No drivers scheduled for this date" />
      </div>
    );
  }

  return (
    <div className="border border-gray-200 overflow-hidden bg-white h-full">
      {/* Scrollable container */}
      <div className="custom-scrollbar h-full overflow-auto">
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
