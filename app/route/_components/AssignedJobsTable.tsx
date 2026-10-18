"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColDef } from "ag-grid-community";
import { Alert } from "antd";
import { X } from "lucide-react";
import BaseTable from "@/components/Table/BaseTable";
import { getCustomFields, type CustomFieldDefinition } from "@/apis/custom-fields.api";
import { createJobTableColumns, STANDARD_JOB_FIELD_KEYS } from "@/utils/jobs.utils";
import type { Job, JobTemplateType } from "@/types/job.type";

interface Props {
  jobs: Job[];
  loading: boolean;
  error: string | null;
  templateType: JobTemplateType;
  teamsMap: Record<number, string>;
  onOpenJob: (job: Job) => void;
  driverFilter: string;
  onClearDriverFilter: () => void;
}

export default function AssignedJobsTable({ jobs, loading, error, templateType, teamsMap, onOpenJob, driverFilter, onClearDriverFilter }: Props) {
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
    ...createJobTableColumns({ templateType, jobStatus: "assigned", teamsMap, onIdClick: onOpenJob }),
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
  ], [templateType, teamsMap, onOpenJob, customFields]);

  return (
    <section aria-label="Assigned route jobs" className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-gray-200 shrink-0">
        <span className="text-sm font-semibold text-gray-800">Assigned jobs{!loading && ` (${jobs.length})`}</span>
        {driverFilter && (
          <button type="button" onClick={onClearDriverFilter} aria-label="Clear driver search"
            className="flex items-center gap-2 border border-gray-200 px-2 py-1 text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
            Driver: {driverFilter}<X size={12} />
          </button>
        )}
      </div>
      {error && <Alert type="error" showIcon title="Unable to load route jobs" description={error} />}
      <BaseTable<Job>
        columnDefs={columns}
        rowData={jobs}
        loading={loading}
        pagination
        paginationPageSize={100}
        emptyMessage="No assigned jobs in this route"
        containerClassName="flex-1 min-h-0 w-full"
        containerStyle={{ height: "100%", width: "100%" }}
        minHeight={0}
      />
    </section>
  );
}
