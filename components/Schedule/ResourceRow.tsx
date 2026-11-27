"use client";

import { ResourceSchedule } from "@/types/schedule.type";
import ScheduleBlock from "./ScheduleBlock";

interface ResourceRowProps {
  resource: ResourceSchedule;
  dayStartHour?: number;
  dayEndHour?: number;
  timezone?: string;
  intervalMinutes?: number;
}

export default function ResourceRow({
  resource,
  dayStartHour = 0,
  dayEndHour = 24,
  timezone,
  intervalMinutes = 30,
}: ResourceRowProps) {
  const intervals = [];
  const totalMinutes = (dayEndHour - dayStartHour) * 60;
  for (let m = 0; m < totalMinutes; m += intervalMinutes) {
    intervals.push(m);
  }

  return (
    <div className="flex border-b border-[#EBECF0] min-h-[48px] transition-colors hover:bg-[#F7F8F9]">
      {/* Driver name column - sticky */}
      <div className="w-[130px] min-w-[130px] sm:w-[180px] sm:min-w-[180px] py-2 px-4 border-r border-[#DCDFE4] flex items-center gap-2.5 bg-white sticky left-0 z-2">
        <span aria-hidden="true" className="hidden h-6 w-6 shrink-0 items-center justify-center bg-[#DCDFE4] text-[10px] font-semibold text-[#172B4D] sm:flex">
          {resource.resource_name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase()}
        </span>
        <span title={resource.resource_name} className="min-w-0 font-medium text-[#172B4D] break-words whitespace-normal text-[13px] sm:truncate">
          {resource.resource_name}
        </span>
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative flex">
        {/* Background hour grid */}
        {intervals.map((val, i) => (
          <div
            key={i}
            className="flex-1 min-w-[60px] border-r border-[#f4f4f4]"
          />
        ))}

        {/* Schedule blocks */}
        {resource.blocks.map((block) => (
          <ScheduleBlock
            key={block.id}
            block={block}
            dayStartHour={dayStartHour}
            dayEndHour={dayEndHour}
            timezone={timezone}
          />
        ))}
      </div>
    </div>
  );
}
