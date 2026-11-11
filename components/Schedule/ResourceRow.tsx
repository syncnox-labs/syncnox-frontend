"use client";

import { ResourceSchedule } from "@/types/schedule.type";
import ScheduleBlock from "./ScheduleBlock";
import { Avatar } from "antd";
import { UserOutlined } from "@ant-design/icons";

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
    <div className="flex border-b border-gray-100 min-h-[48px]">
      {/* Driver name column - sticky */}
      <div className="w-[130px] min-w-[130px] sm:w-[180px] sm:min-w-[180px] py-2 px-3 border-r border-gray-200 flex items-center gap-2 bg-white sticky left-0 z-2">
        <Avatar className="!hidden sm:!inline-flex" size="small" icon={<UserOutlined />} />
        <span title={resource.resource_name} className="min-w-0 font-medium break-words whitespace-normal text-xs sm:truncate">
          {resource.resource_name}
        </span>
      </div>

      {/* Timeline area */}
      <div className="flex-1 relative flex">
        {/* Background hour grid */}
        {intervals.map((val, i) => (
          <div
            key={i}
            className="flex-1 min-w-[60px] border-r border-gray-50"
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
