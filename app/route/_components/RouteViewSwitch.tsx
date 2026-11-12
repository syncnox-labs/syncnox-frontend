"use client";

import { Radio, Tooltip } from "antd";
import { Route, FileText, Truck } from "lucide-react";

export type RouteDetailView = "timeline" | "table" | "vehicles";

const VIEWS = [
  { value: "timeline", label: "Timeline", icon: Route },
  { value: "table", label: "Jobs", icon: FileText },
  { value: "vehicles", label: "Vehicles", icon: Truck },
] as const;

export default function RouteViewSwitch({ value, onChange }: {
  value: RouteDetailView;
  onChange: (view: RouteDetailView) => void;
}) {
  return (
    <Radio.Group
      size="small"
      aria-label="Route view"
      buttonStyle="solid"
      className="pointer-events-auto inline-flex! h-6! items-center! whitespace-nowrap @max-[640px]:h-7! @max-[640px]:w-full!"
      value={value}
      onChange={event => onChange(event.target.value as RouteDetailView)}
    >
      {VIEWS.map(({ value: option, label, icon: Icon }) => (
        <Radio.Button
          key={option}
          value={option}
          aria-label={label}
          className="inline-flex! h-6! w-8! min-w-8! items-center! justify-center! p-0! leading-none! @max-[640px]:h-7! @max-[640px]:w-auto! @max-[640px]:min-w-0! @max-[640px]:flex-1! @max-[640px]:px-1.5!"
        >
          <Tooltip title={label} placement="bottom" mouseEnterDelay={0.15}>
            <span className="inline-flex h-full w-full items-center justify-center gap-1.5 @max-[640px]:gap-1">
              <Icon size={16} strokeWidth={2} className="block shrink-0 @max-[640px]:size-3.5" aria-hidden="true" />
              <span className="hidden text-[11px] font-medium @max-[640px]:inline">{label}</span>
            </span>
          </Tooltip>
        </Radio.Button>
      ))}
    </Radio.Group>
  );
}
