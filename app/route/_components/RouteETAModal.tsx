"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, DatePicker, Modal, Spin, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { Route, Routes } from "@/types/routes.type";
import { getOptimizationRequest } from "@/apis/routes.api";
import { editRouteETA, previewRouteETA, type ETAConflict } from "@/apis/routeEta.api";
import { useOptimizationStore } from "@/store/optimization.store";
import { useJobsStore } from "@/store/jobs.store";
import { manualRoutingError } from "./manualRouting.utils";
import { routeNeedsOptimization } from "./jobAddition.utils";

export interface ETASelection { routeIndex: number; stopIndex: number }

export default function RouteETAModal({ plan, selection, onClose, onSaved }: {
  plan: Route; selection: ETASelection | null; onClose: () => void;
  onSaved: (route: Routes) => void;
}) {
  const [source, setSource] = useState<{ route: Routes; requestId: number; routeIndex: number; stopIndex: number } | null>(null);
  const [value, setValue] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | null>(null);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<{ arrival: string; stops: Routes["stops"]; conflicts: ETAConflict[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const session = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    if (!selection) return;
    const current = ++session.current;
    setSource(null); setValue(null); setPreview(null); setError(undefined); setBusy("load");
    const displayed = plan.result.routes[selection.routeIndex];
    const selected = displayed?.stops[selection.stopIndex];
    const requestId = displayed?.source_optimization_id ?? plan.id;
    const routeIndex = displayed?.source_route_index ?? selection.routeIndex;
    const stopIndex = selection.stopIndex + (displayed?.source_stop_range?.[0] ?? 0);
    getOptimizationRequest(requestId).then(fresh => {
      if (current !== session.current) return;
      const route = fresh.result?.routes[routeIndex];
      const stop = route?.stops[stopIndex];
      if (!selected || !stop || stop.job_id !== selected.job_id || stop.stop_type !== selected.stop_type
          || stop.arrival_time !== selected.arrival_time || route.team_member_id !== displayed.team_member_id
          || route.vehicle_id !== displayed.vehicle_id) {
        throw new Error("This stop changed. Refresh the plan and select it again.");
      }
      const arrival = dayjs(stop.arrival_time);
      if (!arrival.isValid()) throw new Error("This stop has no saved ETA to edit.");
      setSource({ route, requestId, routeIndex, stopIndex });
      // The picker displays minutes, but preserve the saved seconds until
      // the user actually chooses a different time.
      setValue(arrival);
    }).catch(reason => { if (current === session.current) setError(manualRoutingError(reason)); })
      .finally(() => { if (current === session.current) setBusy(null); });
    return () => { session.current = current + 1; };
    // Keep the opening selection while live updates arrive; saving verifies it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, plan.id]);

  const arrival = value?.isValid() ? value.format("YYYY-MM-DDTHH:mm:ss") : null;
  useEffect(() => {
    if (!source || !arrival) { setPreview(null); setPreviewing(false); return; }
    let active = true;
    setPreview(null); setPreviewing(true);
    const timer = setTimeout(() => {
      previewRouteETA(source.requestId, source.routeIndex, source.stopIndex, arrival, source.route)
        .then(result => { if (active) { setError(undefined); setPreview({ arrival, stops: result.stops, conflicts: result.conflicts ?? [] }); } })
        .catch(reason => { if (active) setError(manualRoutingError(reason)); })
        .finally(() => { if (active) setPreviewing(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [source, arrival, previewAttempt]);

  const save = async () => {
    if (!source || !arrival || preview?.arrival !== arrival || busy || saving.current) return;
    saving.current = true; setBusy("save"); setError(undefined);
    try {
      const saved = await editRouteETA(source.requestId, source.routeIndex, source.stopIndex,
        arrival, source.route, preview.stops.map(stop => stop.arrival_time));
      if (source.requestId === plan.id) {
        if (useOptimizationStore.getState().currentOptimization?.id === plan.id) {
          useOptimizationStore.getState().setOptimizationResult("completed", saved.result);
        }
        onSaved(saved.result.routes[source.routeIndex]);
      }
      message.success(saved.message);
      onClose();
      // Refresh neighboring-plan projections and job details after the immediate update.
      void useOptimizationStore.getState().fetchOptimization(plan.id).catch(() => message.warning("ETA saved. Refresh to reload the full plan."));
      void useJobsStore.getState().fetchJobsByIds(plan.job_ids || []).catch(() => message.warning("ETA saved. Refresh to reload job details."));
    } catch (reason) { setError(manualRoutingError(reason)); setPreview(null); setPreviewAttempt(attempt => attempt + 1); }
    finally { saving.current = false; setBusy(null); }
  };
  const stop = source?.route.stops[source.stopIndex];
  const label = stop?.stop_type === "pickup" || stop?.stop_type === "job" ? "pickup"
    : stop?.stop_type === "dropoff" ? "dropoff" : "arrival";
  const labelWord = label === "dropoff" ? "drop-off" : label;
  const stopName = (type: string) => ({ pickup: "Pickup", job: "Stop", dropoff: "Drop-off", drop_off: "Drop-off",
    depot_start: "Trip start", depot_end: "Trip end", depot: "Depot", break: "Break" } as Record<string, string>)[type]
    ?? type.replaceAll("_", " ");
  const savedTime = stop ? dayjs(stop.arrival_time) : null;
  // Minutes, as the picker shows them: saved times can carry seconds the user never sees.
  const shift = value && savedTime ? Math.round(value.startOf("minute").diff(savedTime.startOf("minute"), "minute")) : 0;
  const nudge = (minutes: number) => { if (value) { setValue(value.add(minutes, "minute")); setError(undefined); } };
  const signed = (minutes: number) => `${minutes > 0 ? "+" : "−"}${Math.abs(minutes)} min`;

  return <Modal open={selection !== null} centered width={600} rootClassName="lang"
    title={<div>
      <div className="text-[15px] font-medium text-[#12211A]">Change {labelWord} time</div>
      {stop && savedTime && <div className="mt-0.5 text-[12px] font-normal text-[#4A5750]">
        {stopName(stop.stop_type)}{stop.job_id ? ` · Job #${stop.job_id}` : ""} · now {savedTime.format("ddd, MMM D, h:mm A")}
      </div>}
    </div>}
    onCancel={busy === "save" ? undefined : onClose} closable={busy !== "save"} maskClosable={!busy}
    footer={<>
      <Button disabled={Boolean(busy)} onClick={onClose}>Cancel</Button>
      <Button type="primary" loading={busy === "save"} disabled={!source || !arrival || preview?.arrival !== arrival || Boolean(busy) || previewing || shift === 0} onClick={save}>Save new time</Button>
    </>}>
    {error && <Alert type="error" showIcon title="This change needs attention" description={error} className="mb-4" />}
    {busy === "load" && <div className="py-6 text-center"><Spin /></div>}
    {source && <div className="space-y-4">
      {routeNeedsOptimization(source.route) && <Alert type="warning" showIcon
        title="Route changes need review"
        description="You can edit these estimated times, but travel times and constraints have not been fully checked. The route will remain pending; optimizing it may change the stop order and times." />}
      <div>
        <label htmlFor="route-eta-arrival" className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[#626E67]">New time</label>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker id="route-eta-arrival" value={value} onChange={next => { setValue(next?.startOf("minute") ?? null); setError(undefined); }}
            showTime={{ format: "HH:mm", showSecond: false }} needConfirm={false} format="ddd, MMM D, h:mm A" allowClear={false}
            className="min-w-[220px] flex-1" disabled={Boolean(busy)} />
          <div role="group" aria-label="Move by minutes" className="flex">
            {[-15, -5, 5, 15].map(minutes => (
              <button key={minutes} type="button" disabled={Boolean(busy) || !value} onClick={() => nudge(minutes)}
                aria-label={`${minutes > 0 ? "Later" : "Earlier"} by ${Math.abs(minutes)} minutes`}
                className="-ml-px h-8 min-w-11 border border-[#D5DCD8] bg-white px-2 text-[12px] tabular-nums text-[#12211A] cursor-pointer hover:bg-[#F3F6F4] disabled:cursor-default disabled:opacity-40">
                {minutes > 0 ? `+${minutes}` : `−${Math.abs(minutes)}`}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[12px] text-[#626E67]">
          {shift === 0 ? "Same as now." : <span className={shift > 0 ? "text-[#12211A]" : "text-[#12211A]"}>{signed(shift)} from the current time.</span>}
          {" "}Times are in the route&apos;s local time. Stops after this one move with it when needed; the driver may wait if a return passenger&apos;s shift has not ended.
        </p>
      </div>
      {shift !== 0 && previewing && <div className="text-[12px] text-[#626E67]"><Spin size="small" /> Checking the stops after this one…</div>}
      {shift !== 0 && preview?.arrival === arrival && (preview.conflicts?.length ?? 0) > 0 && <Alert type="warning" showIcon
        title={preview.conflicts.some(conflict => conflict.out_of_order) ? "The new time is before the previous stop" : "The new time leaves less travel time than estimated"}
        description={<div>
          <p>You can still save it. The stop order stays the same, and the times after it adjust as shown below.</p>
          {preview.conflicts.map(conflict => {
            const previous = source.route.stops[conflict.previous_stop_index];
            return <p key={conflict.stop_index}>
              Previous stop ({stopName(previous.stop_type)}{previous.job_id ? ` · #${previous.job_id}` : ""}): {dayjs(preview.stops[conflict.previous_stop_index].arrival_time).format("MMM D, h:mm A")}.
              {conflict.out_of_order
                ? ` The next stop is ${Math.round(-conflict.available_seconds / 60 * 10) / 10} min earlier.`
                : ` Available: ${Math.round(conflict.available_seconds / 60 * 10) / 10} min.`}
              {conflict.minimum_seconds != null && ` Saved minimum: ${Math.round(conflict.minimum_seconds / 60 * 10) / 10} min`}
              {conflict.travel_seconds != null && ` (${Math.round(conflict.service_seconds / 60 * 10) / 10} min service + ${Math.round(conflict.travel_seconds / 60 * 10) / 10} min travel)`}{conflict.minimum_seconds != null && "."}
            </p>;
          })}
        </div>} />}
      {shift !== 0 && preview && preview.arrival === arrival && (() => {
        const rows = source.route.stops.slice(source.stopIndex).map((item, index) => {
          const before = dayjs(item.arrival_time), after = dayjs(preview.stops[source.stopIndex + index].arrival_time);
          return { item, before, after, delta: Math.round(after.startOf("minute").diff(before.startOf("minute"), "minute")), first: index === 0 };
        });
        const moved = rows.filter(row => row.delta !== 0).length;
        return <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[#626E67]">What changes</span>
            <span className="text-[12px] text-[#4A5750]">{moved === 0 ? "No stop moves" : `${moved} of ${rows.length} stops move`}</span>
          </div>
          <div className="max-h-56 overflow-auto custom-scrollbar border border-[#E3E8E5]">
            <table className="w-full text-left text-[12px]"><thead className="sticky top-0 bg-[#F3F6F4] text-[11px] text-[#626E67]"><tr>
              <th className="px-3 py-2 font-medium">Stop</th><th className="px-3 py-2 font-medium">Now</th><th className="px-3 py-2 font-medium">After saving</th>
            </tr></thead><tbody>{rows.map(({ item, before, after, delta, first }, index) => <tr key={index}
              className={`border-t border-[#E3E8E5] ${first ? "bg-[#F1F8F4]" : ""} ${delta === 0 && !first ? "text-[#626E67]" : "text-[#12211A]"}`}>
              <td className="px-3 py-2">{stopName(item.stop_type)}{item.job_id ? ` · #${item.job_id}` : ""}{first && <span className="ml-1.5 text-[11px] text-[#0B5D3B]">this stop</span>}</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">{before.format("MMM D, h:mm A")}</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                <span className={delta === 0 ? "" : "font-medium"}>{after.format("MMM D, h:mm A")}</span>
                {delta !== 0 && <span className={`ml-1.5 text-[11px] ${delta > 0 ? "text-[#4A5750]" : "text-[#4A5750]"}`}>{signed(delta)}</span>}
              </td>
            </tr>)}</tbody></table>
          </div>
        </div>;
      })()}
    </div>}
  </Modal>;
}
