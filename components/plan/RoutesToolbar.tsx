"use client";

import { Button, Input, Select, Tooltip } from "antd";
import { Check, ChevronRight, Search, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/ui/kit";
import { StatusLozenge } from "@/components/Jobs/StatusBanner";

const ROUTE_STATUSES = [
  { value: "scheduled", label: "Scheduled", hint: "Planned, not started" },
  { value: "in_transit", label: "In transit", hint: "Drivers are on the road" },
  { value: "completed", label: "Completed", hint: "Finished" },
  { value: "all", label: "All statuses", hint: "Every route" },
];

export default function RoutesToolbar({ count, search, onSearch, status, onStatusChange, selectedCount, onDelete, onCreateRoute }: {
  count?: number;
  search: string;
  onSearch: (text: string) => void;
  status: string;
  onStatusChange: (status: string) => void;
  selectedCount: number;
  onDelete: () => void;
  onCreateRoute: () => void;
}) {
  return (
    <div className="plan-toolbar flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-3">
      <div className="plan-toolbar-filters flex min-w-0 flex-wrap items-center gap-2">
        <Input allowClear aria-label="Search routes" placeholder="Search routes" prefix={<Search size={14} className="text-[#626E67]" />}
          value={search} onChange={(event) => onSearch(event.target.value)} style={{ width: 200 }} />
        <Select aria-label="Filter by status" value={status} onChange={onStatusChange} options={ROUTE_STATUSES}
          popupMatchSelectWidth={300} classNames={{ popup: { root: "status-filter-menu" } }} style={{ minWidth: 168 }}
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
              <Check size={14} className={`shrink-0 text-[#0B5D3B] ${option.value === status ? "" : "invisible"}`} aria-hidden="true" />
            </span>
          )} />
        {count !== undefined && (
          <span className="ml-1 text-xs text-[#626E67]" role="status">
            {selectedCount > 0 ? `${selectedCount} of ${count} selected` : `${count} ${count === 1 ? "route" : "routes"}`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Tooltip title="Delete selected routes">
          <Button type="text" danger={selectedCount > 0} aria-label="Delete selected routes" icon={<Trash2 size={16} />}
            disabled={selectedCount === 0} onClick={onDelete} />
        </Tooltip>
        <ActionButton variant="primary" aria-label="Create new route" onClick={onCreateRoute} trailing={<ChevronRight size={14} />}>Create route</ActionButton>
      </div>
    </div>
  );
}
