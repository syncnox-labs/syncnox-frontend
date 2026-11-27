"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { Alert, Select } from "antd";
import { X } from "lucide-react";
import dayjs from "dayjs";
import BaseTable from "@/components/Table/BaseTable";
import { StatusLozenge } from "@/components/Jobs/StatusBanner";
import { getCustomFields, type CustomFieldDefinition } from "@/apis/custom-fields.api";
import { createJobTableColumns, STANDARD_JOB_FIELD_KEYS } from "@/utils/jobs.utils";
import type { Job, JobTemplateType } from "@/types/job.type";

interface Props {
  jobs: Job[];
  unassignedJobs: Job[];
  loading: boolean;
  error: string | null;
  templateType: JobTemplateType;
  teamsMap: Record<number, string>;
  onOpenJob: (job: Job) => void;
  driverFilter: string;
  onClearDriverFilter: () => void;
  /** The plan's own day, marked "plan" in the day tabs. */
  planDate?: string | null;
  /** When one trip is in focus, Assigned lists only that trip's jobs; say so and offer the way back. */
  focusName?: string | null;
  onClearFocus?: () => void;
}

export default function AssignedJobsTable({ jobs, unassignedJobs, loading, error, templateType, teamsMap, onOpenJob, driverFilter, onClearDriverFilter, planDate, focusName, onClearFocus }: Props) {
  const [assignmentFilter, setAssignmentFilter] = useState<"assigned" | "unassigned">("assigned");
  const [day, setDay] = useState<string>("all");
  const unassignedIds = useMemo(() => new Set(unassignedJobs.map(job => job.id)), [unassignedJobs]);
  // A job's day is its scheduled date: the date the job is booked for, shown in the Scheduled Date column.
  const dayOf = (job: Job) => job.scheduled_date && dayjs(job.scheduled_date).isValid() ? dayjs(job.scheduled_date).format("YYYY-MM-DD") : null;
  const days = useMemo(() => {
    const keys = new Set<string>();
    [...jobs, ...unassignedJobs].forEach(job => { const key = dayOf(job); if (key) keys.add(key); });
    return [...keys].sort();
  }, [jobs, unassignedJobs]);
  const activeDay = day !== "all" && days.includes(day) ? day : "all";
  const onDay = (job: Job) => activeDay === "all" || dayOf(job) === activeDay;
  // Plain filters: cheap, and always in step with the chosen day.
  const assignedShown = jobs.filter(onDay);
  const unassignedShown = unassignedJobs.filter(onDay);
  const planDayKey = planDate && dayjs(planDate).isValid() ? dayjs(planDate).format("YYYY-MM-DD") : null;
  const rows = assignmentFilter === "assigned" ? assignedShown : unassignedShown;
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);

  useEffect(() => {
    let active = true;
    getCustomFields("job")
      .then(fields => {
        if (active) setCustomFields(fields.filter(field =>
          field.is_visible_in_list && field.surfaces?.disp !== false && !STANDARD_JOB_FIELD_KEYS.has(field.field_key)));
      })
      .catch(error => console.error("Failed to fetch job custom fields", error));
    return () => { active = false; };
  }, []);

  const columns = useMemo<ColDef<Job>[]>(() => [
    ...createJobTableColumns({ templateType, jobStatus: "assigned", teamsMap, onIdClick: onOpenJob }).map(column =>
      // Same status cell as the Plan jobs table (icon + word, no box). A job left out of this plan
      // reads "Unassigned"; otherwise the job's own status shows, so run-day progress stays visible.
      column.field === "status" ? { ...column, headerName: "Status", width: 200, minWidth: 180,
        valueGetter: ({ data }: { data?: Job }) => data && unassignedIds.has(data.id) ? "unassigned" : (data?.status || "assigned"),
        cellRenderer: ({ value, data }: { value?: string; data?: Job }) => {
          const shown = value ?? (data && unassignedIds.has(data.id) ? "unassigned" : (data?.status || "assigned"));
          return (
          <span className="flex h-full items-center gap-2">
            <StatusLozenge value={String(shown)} />
            {data?.is_new && <span className="text-[11px] text-[#0B5D3B]">Newly added</span>}
          </span>
          );
        },
      } : column),
    ...customFields.map(field => ({
      colId: `custom_fields.${field.field_key}`,
      headerName: field.label,
      width: 150,
      valueGetter: ({ data }: { data?: Job }) => {
        const value = data?.[field.field_key as keyof Job]
          ?? data?.worker_shuttle_detail?.[field.field_key]
          ?? data?.pickup_delivery_detail?.[field.field_key]
          ?? data?.custom_fields?.[field.field_key];
        return value === undefined || value === null || value === "" ? "-" : String(value);
      },
    })),
  ], [templateType, teamsMap, onOpenJob, customFields, unassignedIds]);

  return (
    <section aria-label="Optimization jobs" className="lang flex h-full min-h-0 flex-col bg-white">
      <div className="flex items-stretch gap-1 px-4 border-b border-[#E3E8E5] shrink-0" style={{ height: 41 }}>
        <div role="tablist" aria-label="Filter jobs by assignment" className="flex items-stretch gap-1">
        {/* Each tab wears its status: same icon and colour as the Status column below. */}
        {([["assigned", "Assigned", assignedShown.length, "#1F845A"], ["unassigned", "Unassigned", unassignedShown.length, "#C9372C"]] as const).map(([value, label, count, ink]) => {
          const active = assignmentFilter === value;
          return (
            <button key={value} type="button" role="tab" aria-selected={active} onClick={() => setAssignmentFilter(value)}
              className={`inline-flex items-center gap-1.5 px-2 text-[12px] bg-transparent cursor-pointer border-0 border-b-2 ${active ? "font-medium" : "opacity-70 hover:opacity-100"}`}
              style={{ borderBottomColor: active ? ink : "transparent", color: ink }}>
              <StatusLozenge value={value} label={label} />
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
        </div>
        {focusName && assignmentFilter === "assigned" && <span className="ml-3 inline-flex items-center gap-2 self-center text-[12px] text-[#4A5750]">
          Only {focusName}&apos;s trip
          {onClearFocus && <button type="button" onClick={onClearFocus}
            className="border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline">Show all trips</button>}
        </span>}
        {days.length > 1 && <label className="ml-auto inline-flex items-center gap-1.5 self-center text-[12px] text-[#626E67]">
          Scheduled for
          <Select size="small" aria-label="Show jobs scheduled for one day" value={activeDay} onChange={setDay} style={{ width: 168 }}
            popupMatchSelectWidth={false}
            options={[{ value: "all", label: "All days" }, ...days.map(key => ({
              value: key, label: `${dayjs(key).format("ddd, MMM D")}${key === planDayKey ? " · plan day" : ""}`,
            }))]} />
        </label>}
        {/* <span className="text-xs text-gray-500">Unassigned jobs are shown for the entire plan.</span>
        {driverFilter && (
          <button type="button" onClick={onClearDriverFilter} aria-label="Clear driver search"
            className="flex items-center gap-2 border border-gray-200 px-2 py-1 text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
            Driver: {driverFilter}<X size={12} />
          </button>
        )} */}
      </div>
      {error && <Alert type="error" showIcon title="Unable to load route jobs" description={error} />}
      <BaseTable<Job>
        columnDefs={columns}
        rowData={rows}
        loading={loading}
        pagination
        paginationPageSize={100}
        emptyMessage={activeDay === "all" ? `No ${assignmentFilter} jobs in this optimization`
          : `No ${assignmentFilter} jobs scheduled for ${dayjs(activeDay).format("ddd, MMM D")}`}
        containerClassName="flex-1 min-h-0 w-full"
        containerStyle={{ height: "100%", width: "100%" }}
        minHeight={0}
      />
    </section>
  );
}
