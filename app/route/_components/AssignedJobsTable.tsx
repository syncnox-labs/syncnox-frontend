"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { Alert, Radio } from "antd";
import { X } from "lucide-react";
import BaseTable from "@/components/Table/BaseTable";
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
}

export default function AssignedJobsTable({ jobs, unassignedJobs, loading, error, templateType, teamsMap, onOpenJob, driverFilter, onClearDriverFilter }: Props) {
  const [assignmentFilter, setAssignmentFilter] = useState<"assigned" | "unassigned">("assigned");
  const unassignedIds = useMemo(() => new Set(unassignedJobs.map(job => job.id)), [unassignedJobs]);
  const rows = useMemo(() => assignmentFilter === "assigned" ? jobs
    : unassignedJobs,
  [jobs, unassignedJobs, assignmentFilter]);
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
      column.field === "status" ? { ...column, headerName: "Assignment",
        valueGetter: ({ data }: { data?: Job }) => data && unassignedIds.has(data.id) ? "Unassigned" : "Assigned",
        cellRenderer: ({ data }: { data?: Job }) => {
          const unassigned = Boolean(data && unassignedIds.has(data.id));
          return <span className={`inline-block px-2 text-xs font-semibold border ${unassigned
            ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"}`}>
            {unassigned ? "Unassigned" : "Assigned"}
          </span>;
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
    <section aria-label="Optimization jobs" className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-800">Jobs{!loading && ` (${rows.length})`}</span>
        <Radio.Group aria-label="Filter jobs by assignment" size="small" buttonStyle="solid"
          value={assignmentFilter} onChange={({ target: { value } }) => setAssignmentFilter(value)}>
          <Radio.Button value="assigned">Assigned ({jobs.length})</Radio.Button>
          <Radio.Button value="unassigned">Unassigned ({unassignedJobs.length})</Radio.Button>
        </Radio.Group>
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
        emptyMessage={`No ${assignmentFilter} jobs in this optimization`}
        containerClassName="flex-1 min-h-0 w-full"
        containerStyle={{ height: "100%", width: "100%" }}
        minHeight={0}
      />
    </section>
  );
}
