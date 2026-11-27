"use client";

import { ClipboardPenLine, Table2 } from "lucide-react";
import type { EntityView } from "@/store/settings-view.store";

export default function EntityViewToggle({ value, onChange, label }: {
  value: EntityView;
  onChange: (view: EntityView) => void;
  label: string;
}) {
  // Two views of the same records, as plain words on one thin line with a green line under the one in use
  const options: { value: EntityView; label: string; icon: typeof Table2 }[] = [
    { value: "form", label: "Form", icon: ClipboardPenLine },
    { value: "table", label: "Table", icon: Table2 },
  ];
  return (
    <div role="group" aria-label={`${label} view`} className="inline-flex shrink-0 gap-1 shadow-[inset_0_-1px_0_#D5DCD8]">
      {options.map((option) => {
        const on = option.value === value, Icon = option.icon;
        return (
          <button key={option.value} type="button" aria-pressed={on} aria-label={`${option.label} view`} data-tip={`${option.label} view`} onClick={() => onChange(option.value)}
            className={`tip inline-flex h-8 w-9 cursor-pointer items-center justify-center border-0 bg-transparent outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B] ${
              on ? "text-[#12211A] shadow-[inset_0_-2px_0_#0B5D3B]" : "text-[#626E67] hover:text-[#12211A]"
            }`}>
            <Icon size={17} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
