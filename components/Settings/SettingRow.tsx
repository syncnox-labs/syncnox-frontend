import type { ComponentType, ReactNode } from "react";
import { IconTile } from "./FormSection";
import { Checkbox } from "antd";

/**
 * Building blocks for settings pages, following the Atlassian Design System's form guidance:
 * one column; a section has a short title and an optional description; labels sit above their field;
 * helper text sits under it; options saved with a button are checkboxes (toggles are only for
 * changes that apply instantly); the buttons sit at the bottom left.
 */

export function SettingSection({ title, description, icon, action, children }: {
  title: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  description?: string;
  /** Optional control that belongs to the whole section, shown beside the heading */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-[#D5DCD8] py-6 first:border-t-0 first:pt-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 items-start gap-2.5 [&>span]:mt-px">
          {icon && <IconTile icon={icon} />}
          <div className="min-w-0">
            <h2 className="m-0 text-[15px] font-medium leading-5 text-[#12211A]">{title}</h2>
            {description && <p className="m-0 mt-0.5 text-xs leading-5 text-[#626E67]">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** A yes/no option that takes effect when the page is saved. */
export function SettingCheck({ id, label, description, checked, onChange }: {
  id: string;
  label: string;
  /** Say what happens when this is ticked */
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} className="mt-px" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-[13px] font-medium leading-5 text-[#12211A]">{label}</label>
        {description && <p className="m-0 text-xs leading-5 text-[#626E67]">{description}</p>}
      </div>
    </div>
  );
}

/** A labelled field: label above, control, helper text below. */
export function SettingField({ label, htmlFor, helper, children }: {
  label: string;
  htmlFor?: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium leading-4 text-[#4A5750]">{label}</label>
      {children}
      {helper && <p className="m-0 mt-1 text-xs leading-5 text-[#626E67]">{helper}</p>}
    </div>
  );
}

/** Buttons at the bottom left of a single-page form, primary first. */
export function SettingFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-t border-[#D5DCD8] pt-5">{children}</div>;
}
