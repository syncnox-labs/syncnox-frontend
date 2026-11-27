"use client";

import { Button, Modal } from "antd";
import type { Dayjs } from "dayjs";
import { Shuffle, ListOrdered, Sparkles, Info, Clock, Package, Truck as TruckIcon } from "lucide-react";
import DialogTitle from "@/components/ui/DialogTitle";

/** Re-optimize one trip: find the best order, or keep the dispatcher's order and only update times. */
export default function ReoptimizeTripModal({ open, who, jobCount, first, last, vehicleName, startedStops, removals, keep, running, onKeepChange, onCancel, onConfirm }: {
  open: boolean;
  who: string | null;
  jobCount: number;
  first: Dayjs | null;
  last: Dayjs | null;
  vehicleName?: string | null;
  startedStops: number;
  removals: number;
  keep: boolean;
  running: boolean;
  onKeepChange: (keep: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const empty = jobCount === 0;
  return <Modal open={open} width={540} centered rootClassName="lang" destroyOnHidden
          onCancel={() => { if (!running) onCancel(); }}
          title={<DialogTitle icon={<Sparkles />} title={who ? `Re-optimize ${who}'s trip` : "Re-optimize this trip"}
            subtitle={empty ? "This trip has no jobs yet." : "Syncnox plans this one trip again. Every other trip stays as it is."} />}
          footer={<div className="flex items-center justify-end gap-2">
            <Button onClick={onCancel} disabled={running}>Cancel</Button>
            <Button type="primary" loading={running} disabled={empty} onClick={onConfirm}>{keep ? "Update times" : "Re-optimize"}</Button>
          </div>}>
          <div className="flex flex-col gap-3 pt-2">
            {/* The trip in one line of icon facts, so the dispatcher knows exactly what is about to change */}
            {!empty && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[#12211A] tabular-nums">
              <span className="inline-flex items-center gap-1.5"><Package size={15} className="text-[#626E67]" aria-hidden="true" />{jobCount} {jobCount === 1 ? "job" : "jobs"}</span>
              {first && last && <span className="inline-flex items-center gap-1.5"><Clock size={15} className="text-[#626E67]" aria-hidden="true" />
                {first.format("ddd, MMM D")} · {first.format("h:mm A")} to {last.format("h:mm A")}{last.isAfter(first, "day") ? " next day" : ""}</span>}
              {vehicleName && <span className="inline-flex items-center gap-1.5"><TruckIcon size={15} className="text-[#626E67]" aria-hidden="true" />{vehicleName}</span>}
            </div>}
            {empty ? <p className="m-0 border-l-2 border-[#9AA8A0] bg-[#F3F6F4] px-3 py-2.5 text-[13px] text-[#12211A]">
              There is nothing to re-optimize. Add a job to this trip or move stops to it first.
            </p> : <>
              <div role="radiogroup" aria-label="How to re-optimize" className="flex flex-col gap-2">
                {([
                  [false, Shuffle, "Find the best order", "Stops can change order to save time and distance. Times update to match."],
                  [true, ListOrdered, "Keep my order, update times", "Stops stay in the order you set. Only the times are recalculated."],
                ] as const).map(([option, Icon, title, hint]) => {
                  const on = keep === option;
                  return <button key={String(option)} type="button" role="radio" aria-checked={on}
                    onClick={() => onKeepChange(option)}
                    className={`flex items-start gap-3 border px-3.5 py-3 text-left cursor-pointer transition-colors ${on ? "border-[#003220] bg-[#F1F8F4] shadow-[inset_3px_0_0_#003220]" : "border-[#D5DCD8] bg-white hover:border-[#9AA59F]"}`}>
                    <Icon size={20} aria-hidden="true" className={`mt-px shrink-0 ${on ? "text-[#0B5D3B]" : "text-[#626E67]"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-medium text-[#12211A]">{title}</span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-[#4A5750]">{hint}</span>
                    </span>
                    <span aria-hidden="true" className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? "border-[#003220]" : "border-[#9AA59F]"}`}>
                      {on && <span className="h-2 w-2 rounded-full bg-[#003220]" />}
                    </span>
                  </button>;
                })}
              </div>
              {keep && <p className="m-0 text-[12px] text-[#626E67]">If your order breaks a rule (working hours, seats or shift times), nothing is changed and you are told why.</p>}
              {startedStops > 0 && <p className="m-0 border-l-2 border-[#0B5D3B] bg-[#F1F8F4] px-3 py-2 text-[12.5px] text-[#12211A]">
                {/* Server behaviour (route_operations re_optimize): jobs in transit, completed or failed are kept as a fixed
                    start of the trip, in their current order; only the open jobs are planned again after them. */}
                {startedStops} {startedStops === 1 ? "stop is" : "stops are"} already done or under way. {startedStops === 1 ? "It stays" : "They stay"} first, in the same order; only the open stops are planned again.
              </p>}
              {removals > 0 && <p className="m-0 border-l-2 border-[#B38600] bg-[#FFF8E6] px-3 py-2 text-[12.5px] text-[#4A5750]">
                {removals} {removals === 1 ? "job you removed is" : "jobs you removed are"} taken off the plan first.
              </p>}
            </>}
            {!empty && <p className="m-0 flex items-center gap-1.5 text-[12px] text-[#626E67]"><Info size={14} aria-hidden="true" className="shrink-0" />Drivers see the new times after you share the plan again.</p>}
          </div>
        </Modal>;
}
