"use client";

import { useState } from "react";
import { Button, Popover } from "antd";
import { DownOutlined, ReloadOutlined } from "@ant-design/icons";
import type { PendingDriverRoute } from "./jobAddition.utils";

export default function PendingOptimizationIndicator({ drivers, disabled, onOptimize, onOptimizeAll }: {
  drivers: PendingDriverRoute[];
  disabled: boolean;
  onOptimize: (routeIndex: number) => void;
  onOptimizeAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!drivers.length) return null;

  return <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomLeft"
    title="Drivers pending optimization"
    content={<div className="w-80 max-w-[calc(100vw-48px)]">
      <div className="max-h-64 overflow-y-auto space-y-2">
        {drivers.map(driver => <div key={driver.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs font-medium text-slate-700" title={driver.driverName}>{driver.driverName}</span>
          <Button size="small" icon={<ReloadOutlined />} disabled={disabled}
            aria-label={`Optimize route for ${driver.driverName}`}
            onClick={() => { setOpen(false); onOptimize(driver.routeIndices[0]); }}>
            Optimize route
          </Button>
        </div>)}
      </div>
      <div className="mt-3 border-t border-slate-200 pt-2">
        <Button size="small" type="text" block disabled={disabled}
          onClick={() => { setOpen(false); onOptimizeAll(); }}>
          Reoptimize all routes
        </Button>
      </div>
    </div>}>
    <button type="button" disabled={disabled} aria-expanded={open}
      aria-label={`Optimization pending for ${drivers.length} ${drivers.length === 1 ? "driver" : "drivers"}`}
      className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 font-semibold cursor-pointer transition-colors disabled:cursor-wait">
      <span className="h-1.5 w-1.5 bg-amber-500 animate-pulse" aria-hidden="true" />
      Optimization Pending ({drivers.length} {drivers.length === 1 ? "driver" : "drivers"})
      <DownOutlined className="text-[9px]" />
    </button>
  </Popover>;
}
