"use client";

import { Tooltip } from "antd";
import { Info } from "lucide-react";

export default function SettingsPageTitle({ title, description, className = "text-lg" }: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 !flex-nowrap items-center gap-1.5">
      <h1 className={`${className} min-w-0 font-bold text-gray-900 m-0`}>{title}</h1>
      <Tooltip title={description} trigger={["hover", "focus", "click"]}>
        <button
          type="button"
          aria-label={`About ${title}`}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center border-none bg-transparent p-0 text-gray-500 hover:text-gray-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#003220]"
        >
          <Info size={15} aria-hidden="true" />
        </button>
      </Tooltip>
    </div>
  );
}
