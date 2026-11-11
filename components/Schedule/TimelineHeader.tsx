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
    <div className="flex border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
      {/* Driver column - sticky */}
      <div className="w-[130px] min-w-[130px] sm:w-[180px] sm:min-w-[180px] py-2 px-3 font-semibold border-r border-gray-200 bg-gray-50 sticky left-0 z-5">
        Driver
      </div>

      {/* Timeline hours */}
      <div className="flex-1 flex relative">
        {intervals.map((interval, i) => (
          <div
            key={i}
            className="flex-1 min-w-[60px] py-2 px-1 text-left text-xs font-medium text-gray-500 border-r border-gray-100"
          >
            {interval.hour.toString().padStart(2, "0")}:{interval.minute.toString().padStart(2, "0")}
          </div>
        ))}
      </div>
    </div>
  );
}
