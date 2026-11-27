import type { ComponentType, ReactNode } from "react";

/**
 * One named part of a record's form. The name and a line saying what the part is for sit on the left;
 * its fields sit in a single column on the right; a thin rule separates it from the next part.
 * On narrow screens the name moves above the fields.
 */
/** A section's icon: a bare thin-line symbol beside the title, with no box behind it. */
export function IconTile({ icon: Icon }: { icon: ComponentType<{ size?: number; strokeWidth?: number }> }) {
  return (
    <span aria-hidden="true" className="mt-[5px] flex shrink-0 text-[#4A5750]">
      <Icon size={18} strokeWidth={1.5} />
    </span>
  );
}

export default function FormSection({ title, description, icon, children }: {
  title: string;
  /** One icon for the whole part. Fields get their own icon only where the symbol is universal. */
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="form-section grid gap-x-10 gap-y-3 border-t border-[#D5DCD8] py-6 xl:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex items-start gap-2.5">
        {icon && <IconTile icon={icon} />}
        <div className="min-w-0 pt-1">
          <h3 className="m-0 text-sm font-medium leading-5 text-[#12211A]">{title}</h3>
          {description && <p className="m-0 mt-1 text-xs leading-5 text-[#626E67]">{description}</p>}
        </div>
      </div>
      <div className="min-w-0 max-w-[560px] [&>.ant-form-item:last-child]:mb-0">{children}</div>
    </section>
  );
}
