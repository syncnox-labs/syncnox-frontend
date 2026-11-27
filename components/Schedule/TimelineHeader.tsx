"use client";

interface TimelineHeaderProps {
  dayStartHour?: number;
  dayEndHour?: number;
  intervalMinutes?: number;
}

export default function TimelineHeader({
  dayStartHour = 0,
  dayEndHour = 24,
  intervalMinutes = 30,
}: TimelineHeaderProps) {
  const intervals = [];
  const totalMinutes = (dayEndHour - dayStartHour) * 60;
  for (let m = 0; m < totalMinutes; m += intervalMinutes) {
    const totalMinsFromStart = dayStartHour * 60 + m;
    const hour = Math.floor(totalMinsFromStart / 60);
    const minute = totalMinsFromStart % 60;
    intervals.push({ hour, minute });
  }

  return (
    <div className="flex h-9 items-stretch bg-white shadow-[inset_0_-2px_0_#DCDFE4] sticky top-0 z-10">
      {/* Driver column - sticky */}
      <div data-resource-name className="w-[130px] min-w-[130px] sm:w-[180px] sm:min-w-[180px] flex items-center px-4 text-xs font-semibold text-[#626F86] border-r border-[#DCDFE4] bg-white shadow-[inset_0_-2px_0_#DCDFE4] sticky left-0 z-5">
        Driver
      </div>

      {/* Timeline hours */}
      <div className="flex-1 flex relative">
        {intervals.map((interval, i) => (
          <div
            key={i}
            className="flex flex-1 min-w-[60px] items-center px-1.5 text-left text-xs tabular-nums text-[#626F86]"
          >
            {interval.hour.toString().padStart(2, "0")}:{interval.minute.toString().padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
}
