"use client";

import type { ReactNode } from "react";

/**
 * One header for every dialog: a bare icon that says what kind of action this is, a plain title,
 * and one line of context. No box behind the icon (owner rule). Tones follow the status colours.
 */
export type DialogTone = "neutral" | "brand" | "warning" | "danger";
const TONE: Record<DialogTone, string> = { neutral: "#4A5750", brand: "#0B5D3B", warning: "#B38600", danger: "#C9372C" };

export default function DialogTitle({ icon, title, subtitle, tone = "brand" }: {
  icon: ReactNode; title: ReactNode; subtitle?: ReactNode; tone?: DialogTone;
}) {
  return (
    <div className="flex items-start gap-3 pr-6">
      <span aria-hidden="true" className="mt-0.5 flex shrink-0 [&_svg]:h-[22px] [&_svg]:w-[22px]" style={{ color: TONE[tone] }}>{icon}</span>
      <div className="min-w-0">
        <div className="text-[16px] font-medium leading-snug text-[#12211A]">{title}</div>
        {subtitle && <div className="mt-0.5 text-[13px] font-normal leading-snug text-[#4A5750]">{subtitle}</div>}
      </div>
    </div>
  );
}
