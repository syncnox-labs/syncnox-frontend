"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, DatePicker, Modal, Spin, message } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import type { Route, Routes } from "@/types/routes.type";
import { getOptimizationRequest } from "@/apis/routes.api";
import { editRouteETA } from "@/apis/routeEta.api";
import { useOptimizationStore } from "@/store/optimization.store";
import { useJobsStore } from "@/store/jobs.store";
import { manualRoutingError } from "./manualRouting.utils";

export interface ETASelection { routeIndex: number; stopIndex: number }

export default function RouteETAModal({ plan, selection, onClose, onSaved }: {
  plan: Route; selection: ETASelection | null; onClose: () => void;
  onSaved: (route: Routes) => void;
}) {
  const [source, setSource] = useState<{ route: Routes; requestId: number; routeIndex: number; stopIndex: number } | null>(null);
  const [value, setValue] = useState<Dayjs | null>(null);
  const [busy, setBusy] = useState<"load" | "save" | null>(null);
  const [error, setError] = useState<string>();
  const session = useRef(0);
  const saving = useRef(false);

  useEffect(() => {
    if (!selection) return;
    const current = ++session.current;
    setSource(null); setValue(null); setError(undefined); setBusy("load");
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
      setValue(arrival);
    }).catch(reason => { if (current === session.current) setError(manualRoutingError(reason)); })
      .finally(() => { if (current === session.current) setBusy(null); });
    return () => { session.current = current + 1; };
    // Keep the opening selection while live updates arrive; saving verifies it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, plan.id]);

  const save = async () => {
    if (!source || !value?.isValid() || busy || saving.current) return;
    saving.current = true; setBusy("save"); setError(undefined);
    try {
      const saved = await editRouteETA(source.requestId, source.routeIndex, source.stopIndex,
        value.format("YYYY-MM-DDTHH:mm:ss"), source.route);
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
    } catch (reason) { setError(manualRoutingError(reason)); }
    finally { saving.current = false; setBusy(null); }
  };
  const stop = source?.route.stops[source.stopIndex];
  const label = stop?.stop_type === "pickup" || stop?.stop_type === "job" ? "pickup"
    : stop?.stop_type === "dropoff" ? "dropoff" : "arrival";
  const delta = source && value?.isValid() ? value.diff(dayjs(stop!.arrival_time), "second") : 0;

  return <Modal open={selection !== null} title={`Edit estimated ${label} time`} centered width={640}
    onCancel={busy === "save" ? undefined : onClose} closable={busy !== "save"} maskClosable={!busy}
    footer={<>
      <Button disabled={Boolean(busy)} onClick={onClose}>Cancel</Button>
      <Button type="primary" loading={busy === "save"} disabled={!source || !value?.isValid() || Boolean(busy)} onClick={save}>Save ETA</Button>
    </>}>
    {error && <Alert type="error" showIcon title="This change needs attention" description={error} className="mb-4" />}
    {busy === "load" && <div className="py-6 text-center"><Spin /></div>}
    {source && <div className="space-y-4">
      <div>
        <label htmlFor="route-eta-arrival" className="block mb-2 font-semibold">New arrival date and time</label>
        <DatePicker id="route-eta-arrival" value={value} onChange={next => { setValue(next); setError(undefined); }}
          showTime needConfirm={false} format="YYYY-MM-DD HH:mm:ss" className="w-full" disabled={Boolean(busy)} />
        <p className="mt-2 text-slate-500 text-sm">Use the route&apos;s local time. This stop and all following stops move by the same amount. Earlier stops keep their times.</p>
      </div>
      {value?.isValid() && <div className="max-h-56 overflow-auto custom-scrollbar border border-slate-200">
        <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr>
          <th className="p-2">Stop</th><th className="p-2">Current</th><th className="p-2">After saving</th>
        </tr></thead><tbody>{source.route.stops.slice(source.stopIndex).map((item, index) => <tr key={index} className="border-t border-slate-100">
          <td className="p-2 capitalize">{item.stop_type.replaceAll("_", " ")}{item.job_id ? ` · #${item.job_id}` : ""}</td>
          <td className="p-2 whitespace-nowrap">{dayjs(item.arrival_time).format("MMM D, HH:mm:ss")}</td>
          <td className="p-2 whitespace-nowrap font-semibold">{dayjs(item.arrival_time).add(delta, "second").format("MMM D, HH:mm:ss")}</td>
        </tr>)}</tbody></table>
      </div>}
    </div>}
  </Modal>;
}
