import { ColDef } from "ag-grid-community";
import Link from "next/link";
import { Job, JobStatus } from "@/types/job.type";
import StatusBadge from "@/components/Jobs/StatusBanner";
import { formatTime12h, formatTimeWindow } from "./app.utils";
import { COUNTRY_CODES } from "@/constants/country";
import { Popover, Checkbox } from "antd";
import { useState } from "react";

export const filterCountryOptions = (input: string, option: any): boolean => {
  const searchText = input.toLowerCase();
  const country = COUNTRY_CODES.find(
    (c) => `${c.flag} ${c.code}` === option?.value
  );
  if (!country) return false;

  // Search in country name, code, and country abbreviation
  return (
    country.name.toLowerCase().includes(searchText) ||
    country.code.toLowerCase().includes(searchText) ||
    country.country.toLowerCase().includes(searchText)
  );
};

// Status color mapping
export const STATUS_COLORS: Record<JobStatus, string> = {
  draft: "#808080", // gray
  assigned: "#1677ff",
  in_progress: "#fa8c16",
  in_transit: "#13c2c2",
  completed: "#52c41a",
  cancelled: "#ff4d4f",
  failed: "#ff4d4f",
};

export const priorityStyleMap: Record<string, string> = {
  low: "bg-green-100 text-green-700 border border-green-200",
  medium: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  high: "bg-red-100 text-red-800 border border-red-200",
  default: "bg-gray-100 text-gray-700 border border-gray-200",
};

export const formatJobTypeLabel = (rawType?: string): string => {
  if (!rawType) return "-";
  const val = String(rawType).toLowerCase().trim().replace(/-/g, "_");
  if (val === "one_way" || val === "one way") return "One Way";
  if (val === "return_only" || val === "return only" || val === "return") return "Return Only";
  if (val === "round_trip" || val === "round trip") return "Round Trip";
  return val.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
};

export const jobTypeStyleMap: Record<string, string> = {
  one_way: "bg-sky-50 text-sky-700 border border-sky-200",
  return_only: "bg-amber-50 text-amber-800 border border-amber-200",
  round_trip: "bg-teal-50 text-teal-700 border border-teal-200",
  delivery: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  pickup: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  service: "bg-purple-50 text-purple-700 border border-purple-200",
  default: "bg-gray-50 text-gray-700 border border-gray-200",
};

export const JobTypeBadge = ({ value }: { value?: string }) => {
  if (!value) return <span className="text-gray-400">-</span>;

  const rawKey = String(value).toLowerCase().trim().replace(/-/g, "_");
  const label = formatJobTypeLabel(value);
  const style = jobTypeStyleMap[rawKey] || jobTypeStyleMap.default;

  return (
    <div className="flex text-center items-center justify-start h-full w-full">
      <span className={`${style} px-2.5 py-0.5 text-xs font-semibold min-w-[85px] inline-block text-center`}>
        {label}
      </span>
    </div>
  );
};

export const STANDARD_JOB_FIELD_KEYS = new Set([
  "id",
  "scheduled_date",
  "date",
  "job_type",
  "type",
  "status",
  "priority_level",
  "priority",
  "assigned_to",
  "assigned_driver",
  "driver_id",
  "team",
  "team_id",
  "address_formatted",
  "address",
  "delivery_address",
  "location",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "phone_number",
  "phone",
  "customer_phone",
  "first_name",
  "last_name",
  "email",
  "customer_email",
  "business_name",
  "time_window",
  "time_window_start",
  "time_window_end",
  "from",
  "to",
  "service_duration",
  "job_duration",
  "duration",
  "customer_preferences",
  "additional_notes",
  "notes",
  "special_notes",
  "recurrence_type",
  "single_or_recurring",
  "payment_status",
  "client_id",
  "candidate_id",
  "candidate_name",
  "quant_id",
  "quart_id",
  "client_name",
  "client_phone",
  "candidate_phone",
  "client_pick_up_time",
  "start_hour",
  "end_hour",
  "pickup_type",
  "dress_code",
  "go_pickup_point",
  "return_dropoff_point",
  "candidate_address",
  "client_address",
  "reach_before_minutes",
  "pick_up_address",
  "drop_off_address",
]);

export const paymentStyleMap: Record<string, string> = {
  paid: "bg-green-100 text-green-700 border border-green-200",
  unpaid: "bg-red-100 text-red-800 border border-red-200",
  default: "bg-gray-100 text-gray-700 border border-gray-200",
};

export const statusStyleMap: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 border border-gray-200",
  assigned: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  in_transit: "bg-blue-100 text-blue-800 border border-blue-200",
  completed: "bg-green-100 text-green-700 border border-green-200",
  default: "bg-gray-100 text-gray-700 border border-gray-200",
};

const JOB_STATUS_FILTER_OPTIONS = [
  { value: "draft", label: "Draft", dot: "bg-gray-400" },
  { value: "assigned", label: "Assigned", dot: "bg-blue-500" },
  { value: "completed", label: "Completed", dot: "bg-emerald-500" },
  { value: "all", label: "All", dot: "" },
] as const;

const JobStatusHeader = (props: any) => {
  const { selectedJobTab, handleJobStatusChange } = props;
  const [open, setOpen] = useState(false);

  const activeOption =
    JOB_STATUS_FILTER_OPTIONS.find((opt) => opt.value === selectedJobTab) ||
    JOB_STATUS_FILTER_OPTIONS[0];

  const filterContent = (
    <div className="p-1 min-w-[150px] space-y-1 font-sans">
      <div className="px-2 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
        Filter by Status
      </div>
      {JOB_STATUS_FILTER_OPTIONS.map(({ value, label, dot }) => {
        const isChecked = selectedJobTab === value;
        return (
          <div
            key={value}
            onClick={() => {
              handleJobStatusChange({ target: { value } });
              setOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors text-xs ${
              isChecked
                ? "bg-emerald-50 text-emerald-900 font-semibold"
                : "hover:bg-gray-50 text-gray-700 font-medium"
            }`}
          >
            <Checkbox checked={isChecked} />
            {dot && <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Popover
      content={filterContent}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      arrow={false}
      styles={{ container: { padding: 4, borderRadius: 8 } }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between w-full cursor-pointer group py-1 pr-1"
      >
        <span className="font-bold text-sm text-[#003220]">Status</span>
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all text-xs ${
            selectedJobTab !== "all"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
              : "bg-gray-50 border-gray-200 text-gray-600 group-hover:border-gray-300"
          }`}
        >
          {activeOption.dot && (
            <span className={`w-1.5 h-1.5 rounded-full ${activeOption.dot} shrink-0`} />
          )}
          <span className="text-[11px] truncate max-w-[65px]">
            {activeOption.label}
          </span>
          <span className="text-[9px] text-gray-400 group-hover:text-gray-600 transition-transform">
            {open ? "▲" : "▼"}
          </span>
        </div>
      </div>
    </Popover>
  );
};

/**
 * Factory function to create common job table columns.
 * @param options Configuration options for customizing specific columns
 * @returns Array of column definitions for AG Grid
 */
export const createJobTableColumns = (options?: {
  viewColumnRenderer?: (params: any) => any;
  onIdClick?: (job: Job) => void;
  teamsMap?: Record<number, string>;
  jobStatus?: JobStatus;
  templateType?: string;
  statusHeaderProps?: {
    selectedJobTab: string;
    handleJobStatusChange: (e: any) => void;
  };
}): ColDef<Job>[] => {
  const isWorkerShuttle = options?.templateType === "worker_shuttle";
  const getTeamName = (teamId?: number) =>
    teamId ? options?.teamsMap?.[teamId] || "Unknown" : "";
  const teamColumn: ColDef<Job> = {
    headerName: "Team",
    field: "assigned_to",
    filter: "agTextColumnFilter",
    filterValueGetter: (params) => getTeamName(params.data?.assigned_to),
    valueFormatter: (params) => getTeamName(params.value),
  };

  if (isWorkerShuttle) {
    const shuttleColumns: ColDef<Job>[] = [
      {
        field: "id",
        headerName: "ID",
        width: 100,
        minWidth: 80,
        cellRenderer: (params: any) => {
          const idVal = params.value;
          if (!idVal) return "-";
          if (options?.viewColumnRenderer) {
            return options.viewColumnRenderer(params);
          }
          if (options?.onIdClick) {
            return (
              <button
                type="button"
                className="text-blue-600 hover:underline font-medium cursor-pointer"
                onClick={() => options.onIdClick!(params.data)}
              >
                {idVal}
              </button>
            );
          }
          return <span className="font-medium text-gray-700">{idVal}</span>;
        },
      },
      {
        field: "scheduled_date",
        headerName: "Scheduled Date",
        width: 140,
      },
      {
        field: "status",
        headerName: "Status",
        ...(options?.statusHeaderProps && {
          headerComponent: JobStatusHeader,
          headerComponentParams: options.statusHeaderProps,
        }),
        cellRenderer: (params: any) => (
          <StatusBadge value={params.value} styleMap={statusStyleMap} />
        ),
        width: 160,
      },
      {
        field: "quant_id",
        headerName: "Quart / Shift Ref",
        width: 140,
        valueGetter: (params: any) =>
          params.data?.quant_id ||
          params.data?.quart_id ||
          params.data?.worker_shuttle_detail?.quant_id ||
          params.data?.worker_shuttle_detail?.quart_id ||
          params.data?.custom_fields?.quant_id ||
          params.data?.custom_fields?.quart_id ||
          "-",
      },
      {
        field: "start_hour",
        headerName: "Shift Start Time",
        width: 140,
        valueFormatter: (params) => formatTime12h(params.value),
        valueGetter: (params: any) =>
          params.data?.start_hour ||
          params.data?.worker_shuttle_detail?.start_hour ||
          params.data?.custom_fields?.start_hour ||
          "-",
      },
      {
        field: "end_hour",
        headerName: "Shift End Time",
        width: 140,
        valueFormatter: (params) => formatTime12h(params.value),
        valueGetter: (params: any) =>
          params.data?.end_hour ||
          params.data?.worker_shuttle_detail?.end_hour ||
          params.data?.custom_fields?.end_hour ||
          "-",
      },
      {
        field: "pickup_type",
        headerName: "Pickup Type",
        width: 140,
        valueGetter: (params: any) => {
          const raw =
            params.data?.pickup_type ||
            params.data?.worker_shuttle_detail?.pickup_type ||
            params.data?.custom_fields?.pickup_type;
          if (!raw) return "-";
          return String(raw)
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(" ");
        },
      },
      {
        field: "job_type",
        headerName: "Job Type",
        width: 140,
        cellRenderer: (params: any) => <JobTypeBadge value={params.value} />,
      },
      {
        field: "pick_up_address",
        headerName: "Pick Up Address",
        width: 250,
      },
      {
        field: "drop_off_address",
        headerName: "Drop Off Address",
        width: 250,
      },
      {
        field: "reach_before_minutes",
        headerName: "Reach Window",
        width: 150,
        valueGetter: (params: any) => {
          const mins = params.data?.reach_before_minutes;
          if (mins === undefined || mins === null) return "-";
          return `${mins > 0 ? "+" : ""}${mins}m`;
        },
      },
      {
        field: "candidate_id",
        headerName: "Candidate ID",
        width: 130,
        valueGetter: (params: any) =>
          params.data?.candidate_id ||
          params.data?.worker_shuttle_detail?.candidate_id ||
          params.data?.custom_fields?.candidate_id ||
          params.data?.client_id ||
          "-",
      },
      {
        field: "candidate_name",
        headerName: "Candidate Name",
        width: 160,
        valueGetter: (params: any) =>
          params.data?.candidate_name ||
          params.data?.worker_shuttle_detail?.candidate_name ||
          params.data?.custom_fields?.candidate_name ||
          "-",
      },
      {
        field: "candidate_phone",
        headerName: "Candidate Phone",
        width: 150,
        valueGetter: (params: any) =>
          params.data?.candidate_phone ||
          params.data?.worker_shuttle_detail?.candidate_phone ||
          params.data?.custom_fields?.candidate_phone ||
          "-",
      },
      {
        field: "client_pick_up_time",
        headerName: "Client Pickup Time",
        width: 160,
        valueGetter: (params: any) => {
          const isReturn = params.data?.job_type === "return_only";
          if (isReturn) {
            return (
              params.data?.end_hour ||
              params.data?.worker_shuttle_detail?.end_hour ||
              params.data?.custom_fields?.end_hour ||
              params.data?.client_pick_up_time ||
              params.data?.worker_shuttle_detail?.client_pick_up_time ||
              params.data?.start_hour ||
              params.data?.worker_shuttle_detail?.start_hour ||
              params.data?.custom_fields?.start_hour ||
              "-"
            );
          }
          return (
            params.data?.client_pick_up_time ||
            params.data?.worker_shuttle_detail?.client_pick_up_time ||
            params.data?.start_hour ||
            params.data?.worker_shuttle_detail?.start_hour ||
            params.data?.custom_fields?.start_hour ||
            params.data?.end_hour ||
            params.data?.worker_shuttle_detail?.end_hour ||
            params.data?.custom_fields?.end_hour ||
            "-"
          );
        },
      },
      {
        field: "client_name",
        headerName: "Client Name",
        width: 160,
        valueGetter: (params: any) =>
          params.data?.client_name ||
          params.data?.worker_shuttle_detail?.client_name ||
          params.data?.custom_fields?.client_name ||
          params.data?.first_name ||
          "-",
      },
      teamColumn,
      ...(options?.jobStatus === "assigned"
        ? [
            {
              field: "pickup_eta",
              headerName: "Pickup ETA",
              width: 160,
              valueFormatter: (params) => formatTime12h(params.value),
              tooltipField: "pickup_eta",
            },
            {
              field: "dropoff_eta",
              headerName: "Drop-off ETA",
              width: 160,
              valueFormatter: (params) => formatTime12h(params.value),
              tooltipField: "dropoff_eta",
            },
            {
              field: "vehicle_name",
              headerName: "Assigned Vehicle",
              width: 180,
              valueFormatter: (params) => params.value || "-",
            },
          ] satisfies ColDef<Job>[]
        : []),
      {
        field: "route_name",
        headerName: "Route Name",
        width: 150,
        cellRenderer: (params: any) => {
          if (!params.data.optimization_id || !params.value) {
            return params.value || "-";
          }
          return (
            <Link
              href={`/route/${params.data.optimization_id}`}
              className="text-blue-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {params.value}
            </Link>
          );
        },
      },
      {
        field: "notes",
        headerName: "Notes",
        width: 160,
        valueGetter: (params: any) =>
          params.data?.notes ||
          params.data?.additional_notes ||
          params.data?.worker_shuttle_detail?.notes ||
          params.data?.custom_fields?.notes ||
          params.data?.custom_fields?.additional_notes ||
          params.data?.custom_fields?.dress_code ||
          "-",
      },
    ];

    if (options?.jobStatus === "draft") {
      return shuttleColumns.filter((col) => col.field !== "route_name");
    }

    return shuttleColumns;
  }

  const allColumns: ColDef<Job>[] = [
    {
      field: "id",
      headerName: "ID",
      width: 100,
      minWidth: 80,
      cellRenderer: (params: any) => {
        const idVal = params.value;
        if (!idVal) return "-";
        if (options?.viewColumnRenderer) {
          return options.viewColumnRenderer(params);
        }
        if (options?.onIdClick) {
          return (
            <button
              type="button"
              className="text-blue-600 hover:underline font-medium cursor-pointer"
              onClick={() => options.onIdClick!(params.data)}
            >
              {idVal}
            </button>
          );
        }
        return <span className="font-medium text-gray-700">{idVal}</span>;
      },
    },
    {
      field: "priority_level",
      headerName: "Priority",
      cellRenderer: (params: any) => (
        <StatusBadge value={params.value} styleMap={priorityStyleMap} />
      ),
      width: 130,
      minWidth: 130,
    },
    {
      field: "address_formatted",
      headerName: "Address",
      width: 280,
    },
    {
      field: "status",
      headerName: "Status",
      ...(options?.statusHeaderProps && {
        headerComponent: JobStatusHeader,
        headerComponentParams: options.statusHeaderProps,
      }),
      cellRenderer: (params: any) => (
        <StatusBadge value={params.value} styleMap={statusStyleMap} />
      ),
      width: 180,
      minWidth: 160,
    },
    {
      field: "scheduled_date",
      headerName: "Scheduled Date",
      width: 150,
    },
    {
      field: "route_name",
      headerName: "Route Name",
      width: 150,
      cellRenderer: (params: any) => {
        if (!params.data.optimization_id || !params.value) {
          return params.value || "-";
        }
        return (
          <Link
            href={`/route/${params.data.optimization_id}`}
            className="text-blue-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {params.value}
          </Link>
        );
      },
    },
    teamColumn,
    {
      field: "phone_number",
      headerName: "Phone",
      width: 150,
    },
    {
      field: "service_duration",
      headerName: "Duration (mins)",
      width: 150,
    },
    {
      headerName: "Time Window",
      valueGetter: (params: any) =>
        formatTimeWindow(
          params.data.time_window_start,
          params.data.time_window_end
        ),
      width: 200,
    },
    {
      field: "first_name",
      headerName: "First Name",
      width: 150,
    },
    {
      field: "last_name",
      headerName: "Last Name",
      width: 150,
    },
    {
      field: "business_name",
      headerName: "Business Name",
    },
    {
      field: "customer_preferences",
      headerName: "Customer Preferences",
    },
    {
      field: "additional_notes",
      headerName: "Notes",
      width: 150,
    },
    {
      field: "payment_status",
      headerName: "Payment Status",
      width: 150,
      minWidth: 150,
      cellRenderer: (params: any) => (
        <StatusBadge value={params.value} styleMap={paymentStyleMap} />
      ),
    },
  ];

  if (options?.jobStatus === "draft") {
    return allColumns.filter((col) => col.field !== "route_name");
  }

  return allColumns;
};
