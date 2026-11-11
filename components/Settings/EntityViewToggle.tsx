"use client";

import { Radio } from "antd";
import { PanelsTopLeft, Table2 } from "lucide-react";

export type EntityView = "form" | "table";

export default function EntityViewToggle({ value, onChange, label }: {
  value: EntityView;
  onChange: (view: EntityView) => void;
  label: string;
}) {
  return (
    <Radio.Group
      aria-label={`${label} view`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      buttonStyle="solid"
      className="shrink-0"
    >
      <Radio.Button value="form" className="!inline-flex items-center !h-11 lg:!h-8"><span className="inline-flex items-center gap-1.5"><PanelsTopLeft size={14} />Form</span></Radio.Button>
      <Radio.Button value="table" className="!inline-flex items-center !h-11 lg:!h-8"><span className="inline-flex items-center gap-1.5"><Table2 size={14} />Table</span></Radio.Button>
    </Radio.Group>
  );
}
