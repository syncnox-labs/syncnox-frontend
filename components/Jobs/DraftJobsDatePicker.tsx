import { DatePicker } from "antd";
import dayjs from "dayjs";
import { CSSProperties } from "react";

interface DraftJobsDatePickerProps {
  selectedDate: string | null;
  setSelectedDate: (date: string) => void;
  draftJobDates: string[];
  style?: CSSProperties;
}

export default function DraftJobsDatePicker({
  selectedDate,
  setSelectedDate,
  draftJobDates,
  style,
}: DraftJobsDatePickerProps) {
  return (
    <DatePicker
      allowClear={false}
      format="ddd, MMM D"
      aria-label="Jobs date"
      value={selectedDate ? dayjs(selectedDate) : null}
      onChange={(date) => {
        if (date) {
          setSelectedDate(date.format("YYYY-MM-DD"));
        }
      }}
      cellRender={(current, info) => {
        if (info.type !== "date") return info.originNode;
        const dateStr = dayjs(current).format("YYYY-MM-DD");
        const hasDraftJobs = draftJobDates.includes(dateStr);

        if (hasDraftJobs) {
          return (
            <div className="ant-picker-cell-inner relative!">
              {dayjs(current).date()}
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 bg-[#0B5D3B] rounded-full"></div>
            </div>
          );
        }
        return info.originNode;
      }}
      style={style}
    />
  );
}
