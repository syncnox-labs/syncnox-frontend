"use client";

import { Button, Dropdown, Input, Select, Tooltip } from "antd";
import { Check, ChevronDown, ChevronRight, MapPin, Plus, Search, Trash2, Upload } from "lucide-react";
import { StatusLozenge } from "@/components/Jobs/StatusBanner";
import DraftJobsDatePicker from "@/components/Jobs/DraftJobsDatePicker";
import { ActionButton } from "@/components/ui/kit";

// A menu entry as two lines: what it does, then how
const menuLabel = (title: string, hint: string) => (
  <span className="block py-0.5">
    <span className="block text-[13px] font-medium leading-5 text-[#12211A]">{title}</span>
    <span className="block text-xs leading-4 text-[#626E67]">{hint}</span>
  </span>
);

const JOB_STATUSES = [
  { value: "draft", label: "Draft", hint: "Not on a route yet" },
  { value: "assigned", label: "Assigned", hint: "Placed on a route" },
  { value: "completed", label: "Completed", hint: "Finished" },
  { value: "all", label: "All statuses", hint: "Every job on this date" },
];

/**
 * Jobs filter bar. Left: what the list shows (search, date, status). Right: what can be done.
 * The blue button is always the next step: Add jobs, then Create route once jobs are selected.
 */
export default function JobsToolbar(props: {
  count?: number;
  search: string;
  onSearch: (text: string) => void;
  date: string | null;
  onDateChange: (date: string) => void;
  datesWithJobs: string[];
  status: string;
  onStatusChange: (status: string) => void;
  unscheduledCount: number;
  unscheduledActive: boolean;
  showUnscheduled: boolean;
  onShowUnscheduled: () => void;
  selectedCount: number;
  onCreateRoute: () => void;
  onDelete: () => void;
  mapOpen: boolean;
  onToggleMap: () => void;
  onAddSingle: () => void;
  onBulkImport: () => void;
}) {
  const hasSelection = props.selectedCount > 0;
  return (
    <div className="plan-toolbar flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-3">
      <div className="plan-toolbar-filters flex min-w-0 flex-wrap items-center gap-2">
        <Input
          allowClear
          aria-label="Search jobs"
          placeholder="Search jobs"
          prefix={<Search size={14} className="text-[#626E67]" />}
          value={props.search}
          onChange={(event) => props.onSearch(event.target.value)}
          style={{ width: 200 }}
        />
        <DraftJobsDatePicker selectedDate={props.date} setSelectedDate={props.onDateChange} draftJobDates={props.datesWithJobs} />
        <Select
          aria-label="Filter by status"
          value={props.status}
          onChange={props.onStatusChange}
          options={JOB_STATUSES}
          popupMatchSelectWidth={300}
          popupClassName="status-filter-menu"
          style={{ minWidth: 168 }}
          labelRender={(item) => (
            <span className="flex items-center gap-2">
              <span className="text-[#626E67]">Status</span>
              {item.value === "all" ? <span className="font-medium text-[#12211A]">All</span> : <StatusLozenge value={String(item.value)} />}
            </span>
          )}
          optionRender={(option) => (
            <span className="flex items-center gap-3 py-0.5">
              <span className="flex w-[100px] shrink-0">
                {option.value === "all" ? <span className="text-[13px] font-medium text-[#12211A]">All statuses</span> : <StatusLozenge value={String(option.value)} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-normal text-[#626E67]">{option.data.hint}</span>
              <Check size={14} className={`shrink-0 text-[#0B5D3B] ${option.value === props.status ? "" : "invisible"}`} aria-hidden="true" />
            </span>
          )}
        />
        {props.showUnscheduled && (
          <Button aria-pressed={props.unscheduledActive} type={props.unscheduledActive ? "primary" : "default"} onClick={props.onShowUnscheduled}>
            Unscheduled ({props.unscheduledCount})
          </Button>
        )}
        {props.count !== undefined && (
          <span className="ml-1 text-xs text-[#626E67]" role="status">
            {hasSelection ? `${props.selectedCount} of ${props.count} selected` : `${props.count} ${props.count === 1 ? "job" : "jobs"}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Tooltip title={props.mapOpen ? "Hide map" : "Show jobs on a map"}>
          <Button type={props.mapOpen ? "default" : "text"} aria-pressed={props.mapOpen}
            aria-label={props.mapOpen ? "Hide map" : "Show jobs on a map"} icon={<MapPin size={16} />} onClick={props.onToggleMap} />
        </Tooltip>
        <Tooltip title="Delete selected jobs">
          <Button type="text" danger={hasSelection} aria-label="Delete selected jobs" icon={<Trash2 size={16} />}
            disabled={!hasSelection} onClick={props.onDelete} />
        </Tooltip>
        {/* One filled button at a time: Add jobs first, then Create route once jobs are selected */}
        <ActionButton aria-label="Create new route" variant={hasSelection ? "primary" : "secondary"} disabled={!hasSelection} onClick={props.onCreateRoute}
          trailing={<ChevronRight size={14} />}>
          Create route{hasSelection ? ` (${props.selectedCount})` : ""}
        </ActionButton>
        <Dropdown trigger={["click"]} menu={{ items: [
          { key: "single", label: menuLabel("Add single job", "Enter one job by hand"), icon: <Plus size={18} />, onClick: props.onAddSingle },
          { key: "bulk", label: menuLabel("Bulk import jobs", "Upload a CSV or Excel file"), icon: <Upload size={18} />, onClick: props.onBulkImport },
        ] }} placement="bottomRight" overlayClassName="action-menu">
          <ActionButton aria-label="Add jobs" variant={hasSelection ? "secondary" : "primary"} trailing={<ChevronDown size={14} />}>Add jobs</ActionButton>
        </Dropdown>
      </div>
    </div>
  );
}
