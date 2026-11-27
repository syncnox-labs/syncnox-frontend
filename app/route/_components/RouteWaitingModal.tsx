"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, InputNumber, Modal, Select, Spin, message } from "antd";
import { ArrowRight, Car, Clock3, Timer } from "lucide-react";
import { StopArrowSvg } from "./TimelineStopArrow";
import type { Route } from "@/types/routes.type";
import { commitManualRouting, getManualRoutingContext, previewManualRouting, previewCrossPlanWaiting, commitCrossPlanWaiting, type ManualRoutingContext, type ManualRoutingPreview } from "@/apis/manualRouting.api";
import { useOptimizationStore } from "@/store/optimization.store";
import { useJobsStore } from "@/store/jobs.store";
import { formatRouteClock, manualRouteLabel, manualRoutingError } from "./manualRouting.utils";
import { getTimelineSegment } from "./timelineSegment.utils";
import { crossPlanWaitingReferences, sameWaitingRoute, waitingMergeCandidates, waitingPlanIssue, type WaitingSelection } from "./routeWaiting.utils";
import styles from "./RouteWaitingModal.module.css";

type AnyStop = { stop_type: string; arrival_time?: string | null; candidate_name?: string | null; address_formatted?: string | null; job_id?: number | null };
const stopKind = (type: string) => ({ pickup: "Pickup", pick_up: "Pickup", dropoff: "Drop-off", drop_off: "Drop-off",
  depot_start: "Trip start", depot_end: "Trip end", depot: "Depot" } as Record<string, string>)[type] ?? type.replaceAll("_", " ");
const stopName = (stop: AnyStop) => stopKind(stop.stop_type).toLowerCase() + (stop.arrival_time ? ` ${formatRouteClock(stop.arrival_time)}` : "");
const minutesWord = (secondsValue: number) => {
  const total = Math.round(secondsValue / 60), h = Math.floor(total / 60), m = total % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};
const deltaWord = (ms: number) => { const m = Math.round(ms / 60000); return m === 0 ? "" : `${m > 0 ? "+" : "−"}${Math.abs(m)} min`; };

/** Same fills as the timeline key: solid line = driving, grey hatch = waiting. */
const DRIVE_STYLE = { backgroundColor: "#0B5D3B", opacity: 0.6 } as const;
const WAIT_STYLE = { backgroundColor: "#cbd5e1", backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 6px)" } as const;
const isPickupType = (type: string) => type === "pickup" || type === "pick_up";

function Marker({ stop }: { stop: AnyStop }) {
  if (stop.stop_type.startsWith("depot")) return <span aria-hidden="true" className="h-5 w-5 shrink-0 bg-[#0B5D3B]" />;
  return <span aria-hidden="true" className="inline-flex h-[30px] w-6 shrink-0 items-center justify-center">
    <span className="inline-flex origin-center scale-[0.72]"><StopArrowSvg isPickup={isPickupType(stop.stop_type)} displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /></span>
  </span>;
}

/** The gap drawn the way the timeline draws it, updated as the form changes. */
function GapDiagram({ from, to, driveSeconds, waitSeconds, side }: {
  from: AnyStop; to: AnyStop; driveSeconds: number | null; waitSeconds: number; side: "left" | "right";
}) {
  const drive = Math.max(0, driveSeconds ?? 0), wait = Math.max(0, waitSeconds);
  const total = drive + wait || 1;
  // Each part keeps a readable width even when it is short.
  const share = (value: number) => value <= 0 ? 0 : Math.max(22, Math.min(78, (value / total) * 100));
  const parts = [
    { key: "drive", seconds: drive, style: DRIVE_STYLE, icon: <Car size={14} aria-hidden="true" />, word: "Drive", unknown: driveSeconds == null },
    { key: "wait", seconds: wait, style: WAIT_STYLE, icon: <Timer size={14} aria-hidden="true" />, word: "Wait", unknown: false },
  ];
  const ordered = side === "left" ? [parts[1], parts[0]] : parts;
  const shown = ordered.filter(part => part.seconds > 0 || part.unknown);
  const spoken = shown.map(part => `${part.word.toLowerCase()} ${part.unknown ? "time unknown" : minutesWord(part.seconds)}`).join(", then ");
  return <figure className="m-0 border border-[#E3E8E5] px-3 pt-3 pb-2" aria-label={`From ${stopName(from)}: ${spoken || "no time between the stops"}, to ${stopName(to)}`}>
    <div className="flex items-center gap-1.5">
      <Marker stop={from} />
      <div className="flex h-[5px] min-w-0 flex-1 items-center gap-0.5">
        {shown.length ? shown.map(part => <span key={part.key} className="block h-full"
          style={{ ...part.style, flexBasis: `${share(part.seconds)}%`, flexGrow: share(part.seconds) }} />)
          : <span className="block h-px w-full bg-[#C4CCC7]" />}
      </div>
      <Marker stop={to} />
    </div>
    <div className="mt-1.5 flex gap-0.5 px-[30px]">
      {shown.map(part => <span key={part.key} className="inline-flex min-w-0 items-center justify-center gap-1 text-[12px] text-[#4A5750] tabular-nums"
        style={{ flexBasis: `${share(part.seconds)}%`, flexGrow: share(part.seconds) }}>
        {part.icon}<span className="truncate">{part.word} {part.unknown ? "?" : minutesWord(part.seconds)}</span>
      </span>)}
    </div>
  </figure>;
}

/** Small picture of the order, for the "where does the driver wait" cards. */
function OrderIcon({ side }: { side: "left" | "right" }) {
  const wait = <span className="block h-[5px] w-4" style={WAIT_STYLE} />;
  const drive = <span className="block h-[5px] w-6" style={DRIVE_STYLE} />;
  return <span aria-hidden="true" className="inline-flex items-center gap-0.5">
    <span className="h-2 w-2 rounded-full border border-[#4A5750] bg-white" />
    {side === "left" ? <>{wait}{drive}</> : <>{drive}{wait}</>}
    <span className="h-2 w-2 rounded-full border border-[#4A5750] bg-white" />
  </span>;
}

function StopBox({ stop, edge }: { stop: AnyStop; edge: "From" | "To" }) {
  const place = stop.address_formatted || (stop.job_id != null ? `Job #${stop.job_id}` : "");
  return <div className="min-w-0 border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2">
    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[#626E67]">
      {!stop.stop_type.startsWith("depot") && <span aria-hidden="true" className="inline-flex h-4 w-3 items-center justify-center"><span className="inline-flex scale-[0.42]"><StopArrowSvg isPickup={isPickupType(stop.stop_type)} displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /></span></span>}
      {edge} · {stopKind(stop.stop_type)}
    </div>
    <div className="mt-0.5 text-[14px] font-medium text-[#12211A] tabular-nums">{formatRouteClock(stop.arrival_time)}</div>
    {stop.candidate_name && <div className="truncate text-[12px] text-[#4A5750]" title={stop.candidate_name}>{stop.candidate_name}</div>}
    {place && <div className="truncate text-[12px] text-[#626E67]" title={place}>{place}</div>}
  </div>;
}

export default function RouteWaitingModal({ plan, selection, onClose }: {
  plan: Route; selection: WaitingSelection | null; onClose: () => void;
}) {
  const [context, setContext] = useState<ManualRoutingContext | null>(null);
  const [target, setTarget] = useState<number>();
  const [seconds, setSeconds] = useState<number | null>(null);
  const [durationEdited, setDurationEdited] = useState(false);
  const [side, setSide] = useState<"left" | "right">("right");
  const [preview, setPreview] = useState<ManualRoutingPreview | null>(null);
  const [busy, setBusy] = useState<"load" | "preview" | "save" | null>(null);
  const [error, setError] = useState<string>();
  const session = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const requestToken = useRef("");
  const saving = useRef(false);
  const crossPlan = useRef<ReturnType<typeof crossPlanWaitingReferences>>(null);
  const source = selection ? context?.result.routes[selection.routeIndex] : undefined;
  const stop = selection?.afterStopIndex === undefined ? undefined : source?.stops[selection.afterStopIndex];
  const merging = selection?.afterStopIndex === undefined || stop?.stop_type === "depot_end";
  const candidates = useMemo(() => selection && context ? waitingMergeCandidates(context.result.routes, selection.routeIndex) : [], [context, selection]);

  useEffect(() => {
    if (!selection) return;
    const current = ++session.current;
    setBusy("load"); setContext(null); setPreview(null); setError(undefined);
    setTarget(undefined); setSeconds(null); setDurationEdited(false); setSide("right");
    crossPlan.current = null;
    const snapshot = plan.result;
    const planIssue = waitingPlanIssue(snapshot.routes, plan.id, selection);
    if (planIssue) {
      setError(planIssue);
      setBusy(null);
      return () => { session.current = current + 1; abort.current?.abort(); };
    }
    try {
      crossPlan.current = crossPlanWaitingReferences(snapshot.routes, plan.id, selection);
    } catch (reason) {
      setError(manualRoutingError(reason)); setBusy(null);
      return () => { session.current = current + 1; abort.current?.abort(); };
    }
    if (crossPlan.current) {
      const references = crossPlan.current;
      Promise.all(references.map(ref => getManualRoutingContext(ref.plan_id))).then(results => {
        if (current !== session.current) return;
        const indices = [selection.routeIndex, selection.mergeRouteIndex!];
        const combined = [...snapshot.routes];
        references.forEach((ref, i) => {
          const fresh = results[i].result.routes[ref.route_index];
          if (!sameWaitingRoute(snapshot.routes[indices[i]], fresh)) throw new Error("The selected trips changed, or one is part of a combined route. Refresh and select complete trips again.");
          combined[indices[i]] = fresh;
        });
        const root = results[references.findIndex(ref => ref.plan_id === plan.id)];
        setContext({ ...root, result: { ...root.result, routes: combined } });
        setTarget(selection.mergeRouteIndex);
      }).catch(reason => { if (current === session.current) setError(manualRoutingError(reason)); })
        .finally(() => { if (current === session.current) setBusy(null); });
      return () => { session.current = current + 1; abort.current?.abort(); };
    }
    getManualRoutingContext(plan.id).then(data => {
      if (current !== session.current) return;
      const indices = [selection.routeIndex, ...(selection.mergeRouteIndex === undefined ? [] : [selection.mergeRouteIndex])];
      for (const index of indices) {
        const before = snapshot.routes[index], fresh = data.result.routes[index];
        if (!sameWaitingRoute(before, fresh)) {
          throw new Error("These trips changed. Close this editor and select the interval again.");
        }
      }
      setContext(data);
      const route = data.result.routes[selection.routeIndex];
      const index = selection.afterStopIndex;
      if (index !== undefined && route.stops[index]?.stop_type !== "depot_end") {
        if (!route.stops[index + 1]) throw new Error("This interval changed. Select it again.");
        const segment = getTimelineSegment(route.stops[index], route.stops[index + 1]);
        setSeconds(segment.waitingSeconds);
        setSide(route.stops[index].waiting_position || "right");
      } else if (index === undefined) {
        const options = waitingMergeCandidates(data.result.routes, selection.routeIndex);
        setTarget(selection.mergeRouteIndex ?? options[0]);
      }
    }).catch(reason => { if (current === session.current) setError(manualRoutingError(reason)); })
      .finally(() => { if (current === session.current) setBusy(null); });
    return () => { session.current = current + 1; abort.current?.abort(); };
  // Capture the opening snapshot; live events must not reset the user's edits.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, plan.id]);

  const review = async () => {
    if (!context || !selection || busy) return;
    setBusy("preview"); setError(undefined);
    const current = session.current;
    abort.current = new AbortController();
    try {
      let checked: ManualRoutingPreview;
      if (crossPlan.current) {
        const [first, second] = crossPlan.current;
        const result = await previewCrossPlanWaiting(plan.id, { first, second,
          waiting_seconds: durationEdited ? seconds ?? undefined : undefined, waiting_side: side }, abort.current.signal);
        const routes = [...context.result.routes];
        routes[selection.routeIndex] = result.candidate;
        checked = { ...result, success: true, revision: context.revision, message: "",
          result: { ...context.result, routes }, affected_route_indices: [selection.routeIndex], deleted_route_indices: [], updates_drivers: false };
      } else checked = await previewManualRouting(plan.id, {
        action: "waiting", route_index: selection.routeIndex, job_ids: [],
        merge_route_index: selection.afterStopIndex === undefined ? target : undefined,
        waiting_after_stop_index: selection.afterStopIndex,
        waiting_seconds: durationEdited ? seconds ?? undefined : undefined, waiting_side: side, expected_revision: context.revision,
      }, abort.current.signal);
      if (current !== session.current) return;
      requestToken.current = crypto.randomUUID();
      setPreview(checked);
    } catch (reason) { if (current === session.current) setError(manualRoutingError(reason)); }
    finally { if (current === session.current) setBusy(null); }
  };
  const save = async () => {
    if (!preview || busy || saving.current) return;
    saving.current = true; setBusy("save"); setError(undefined);
    try {
      if (crossPlan.current) {
        const saved = await commitCrossPlanWaiting(plan.id, preview.preview_token, requestToken.current);
        message.success(saved.message);
        onClose();
        const refs = crossPlan.current;
        const refreshed = await Promise.allSettled([
          useOptimizationStore.getState().fetchOptimization(plan.id),
          useJobsStore.getState().fetchJobsByIds([...new Set(refs.flatMap(ref => ref.job_ids))]),
        ]);
        if (refreshed.some(item => item.status === "rejected")) message.warning("Trips merged. Refresh the plan to see the latest details.");
        return;
      }
      const saved = await commitManualRouting(plan.id, preview.preview_token, requestToken.current);
      useOptimizationStore.setState(state => state.currentOptimization?.id === plan.id
        ? { currentOptimization: { ...state.currentOptimization, result: saved.result, status: "completed", error_message: null }, error: null } : {});
      message.success(saved.message);
      onClose();
      void useJobsStore.getState().fetchJobsByIds(plan.job_ids || []).catch(() => message.warning("Saved. Refresh job details to see the updated times."));
    } catch (reason) { setError(manualRoutingError(reason)); }
    finally { saving.current = false; setBusy(null); }
  };
  const resetPreview = () => { setPreview(null); setError(undefined); };
  const beforeTimes = new Map((context?.result.routes || []).flatMap(route => route.stops
    .filter(stop => stop.job_id != null).map(stop => [`${stop.job_id}-${stop.stop_type}`, stop.arrival_time] as const)));
  const updated = preview && selection ? preview.result.routes[selection.routeIndex] : undefined;
  const tripTimes = (route: Route["result"]["routes"][number]) => {
    const first = route.stops[0]?.arrival_time;
    const last = route.stops[route.stops.length - 1]?.arrival_time;
    return `${formatRouteClock(first)}–${formatRouteClock(last)}${first && last && first.slice(0, 10) !== last.slice(0, 10) ? " (+1 day)" : ""}`;
  };

  const nextStop = !merging && source && selection?.afterStopIndex !== undefined ? source.stops[selection.afterStopIndex + 1] : undefined;
  const segment = stop && nextStop ? getTimelineSegment(stop, nextStop) : null;
  const legWord = source?.leg === "GO" ? "Outbound" : source?.leg === "RETURN" ? "Return" : source?.leg === "COMBINED" ? "Outbound and return" : source?.leg;
  const setMinutes = (value: number | null) => { setSeconds(value === null ? null : Math.round(value * 60)); setDurationEdited(true); };
  const resetMinutes = () => { setSeconds(segment?.waitingSeconds ?? 0); setDurationEdited(false); };

  return <Modal open={selection !== null} onCancel={busy === "save" ? undefined : onClose}
    closable={busy !== "save"} maskClosable={!busy} width={640} centered className={styles.modal}
    title={<span className={styles.title}><Clock3 size={20} aria-hidden="true" />{merging ? "Merge routes with waiting" : "Change waiting time"}</span>}
    footer={<div className={styles.actions}>
      <Button disabled={Boolean(busy)} onClick={preview ? resetPreview : onClose}>{preview ? "Back to editing" : "Cancel"}</Button>
      <Button type="primary" loading={Boolean(busy)} disabled={!context || (selection?.afterStopIndex === undefined && target === undefined) || (!merging && seconds === null)} onClick={preview ? save : review}>
        {preview ? merging ? "Merge routes" : "Save waiting time" : "Preview changes"}
      </Button>
    </div>}>
    <div className={styles.content}>
      {error && <Alert type="error" showIcon title="This change needs attention" description={error} />}
      {busy === "load" && <div className="text-center py-6" role="status"><Spin /><p className="mt-3 text-slate-500">Loading current trips…</p></div>}
      {source && !preview && <>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-[#E3E8E5] pb-3 text-[13px] text-[#4A5750]"
          aria-label={manualRouteLabel(source, selection!.routeIndex)}>
          <strong className="font-medium text-[#12211A]">{source.team_member_name || source.name || "Selected trip"}</strong>
          {legWord && <span>· {legWord}</span>}
          <span className="tabular-nums">· {tripTimes(source)}</span>
        </div>
        {!merging && stop && nextStop && <section aria-label="This gap" className="flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <StopBox stop={stop} edge="From" />
            <ArrowRight size={16} className="self-center text-[#626E67]" aria-hidden="true" />
            <StopBox stop={nextStop} edge="To" />
          </div>
          {segment && <GapDiagram from={stop} to={nextStop} driveSeconds={segment.travelSeconds}
            waitSeconds={seconds ?? segment.waitingSeconds ?? 0} side={side} />}
          {segment && <p className="m-0 text-[12px] text-[#626E67] tabular-nums">
            Now: {minutesWord(segment.elapsedSeconds)} between the two stops
            {segment.travelSeconds != null && <> · {minutesWord(segment.travelSeconds)} driving</>}
            {segment.serviceSeconds ? <> · {minutesWord(segment.serviceSeconds)} at the stop</> : null}
            {segment.waitingSeconds != null && <> · <span className="text-[#12211A]">{minutesWord(segment.waitingSeconds)} waiting</span></>}
          </p>}
        </section>}
        {selection?.afterStopIndex === undefined && <div className={styles.field}>
          <label htmlFor="waiting-merge-route" className={styles.label}>Merge with</label>
          <Select id="waiting-merge-route" className={styles.select} value={target} disabled={Boolean(busy) || Boolean(crossPlan.current) || Boolean(selection?.lockMergeRoute)} placeholder="Choose a consecutive route" onChange={setTarget}
            options={candidates.map(index => {
              const route = context!.result.routes[index];
              return { value: index, label: manualRouteLabel(route, index) };
            })} />
          {!candidates.length && <span className={styles.emptyHint}>No consecutive route uses this driver and vehicle. Match their assignments before merging.</span>}
        </div>}
        {merging && <div className={styles.mergeNote} role="note"><Clock3 size={17} aria-hidden="true" /><p>Join the trips with direct travel and waiting, replacing the finish and home stops between them.</p></div>}
        {merging && <div className={styles.durationChoice}>
          <Checkbox disabled={Boolean(busy)} checked={seconds === null} onChange={event => { setSeconds(event.target.checked ? null : 0); setDurationEdited(!event.target.checked); }}>Use the current gap between trips</Checkbox>
          <p>Waiting is calculated to keep passenger times the same.</p>
        </div>}
        {(!merging || seconds !== null) && <div className="flex flex-col gap-2">
          <label htmlFor="route-waiting-minutes" className="text-[13px] font-medium text-[#12211A]">Waiting time</label>
          <div className="flex items-center gap-2">
            <InputNumber
              id="route-waiting-minutes"
              aria-label="Waiting time in minutes"
              style={{ width: 140 }}
              suffix="min"
              min={0}
              max={2880}
              step={1}
              precision={0}
              disabled={Boolean(busy)}
              value={seconds === null ? null : Math.round(seconds / 60)}
              onChange={value => { setMinutes(value); }}
            />
            {[-15, -5, 5, 15].map(delta => (
              <button key={delta} type="button" disabled={Boolean(busy) || seconds === null}
                onClick={() => setMinutes(Math.max(0, Math.round((seconds ?? 0) / 60) + delta))}
                className="h-8 min-w-[44px] border border-[#D5DCD8] bg-white px-2 text-[12px] text-[#12211A] tabular-nums cursor-pointer hover:bg-[#F3F6F4] disabled:cursor-not-allowed disabled:opacity-50">
                {delta > 0 ? `+${delta}` : `−${-delta}`}
              </button>
            ))}
            {durationEdited && seconds !== null && <button type="button" onClick={resetMinutes}
              className="ml-auto border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline">Reset</button>}
          </div>
          <span className="text-[12px] text-[#626E67]">{seconds === 0 ? "No waiting: the driver goes straight on." : "Enter 0 to remove the waiting."}</span>
        </div>}
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={Boolean(busy)}>
          <legend className="mb-2 p-0 text-[13px] font-medium text-[#12211A]">Where does the driver wait?</legend>
          <div role="radiogroup" aria-label="Waiting location" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {([
              ["left", stop && !merging ? `At ${stopName(stop)}` : "At the first stop", "Wait first, then drive", "Earlier stops move if the waiting changes."],
              ["right", nextStop && !merging ? `At ${stopName(nextStop)}` : "At the next stop", "Drive first, then wait", "Later stops move if the waiting changes."],
            ] as const).map(([value, title, order, effect]) => {
              const on = side === value;
              return <button key={value} type="button" role="radio" aria-checked={on} onClick={() => setSide(value)}
                className={`flex min-w-0 flex-col items-start gap-0.5 border px-3 py-2.5 text-left cursor-pointer ${on
                  ? "border-[#003220] bg-[#F1F8F4] shadow-[inset_3px_0_0_#003220]" : "border-[#D5DCD8] bg-white hover:border-[#9AA59F]"}`}>
                <span className="flex w-full items-center gap-2 text-[13px] font-medium text-[#12211A]">
                  <span aria-hidden="true" className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${on ? "border-[#003220]" : "border-[#9AA59F]"}`}>
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-[#003220]" />}
                  </span>
                  <span className="truncate">{title}</span>
                </span>
                <span className="flex items-center gap-2 pl-[22px] text-[12px] text-[#4A5750]"><OrderIcon side={value} />{order}</span>
                <span className="pl-[22px] text-[12px] text-[#626E67]">{effect}</span>
              </button>;
            })}
          </div>
          {!durationEdited && <p className="m-0 text-[12px] text-[#626E67]">Passenger times stay the same while the waiting time is unchanged.</p>}
        </fieldset>
      </>}
      {preview && updated && <>
        <Alert type="success" showIcon title={preview.explanation} description="Review the times below, then save. Share the plan when ready to update drivers." />
        <div className={styles.previewTable}>
          <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">Stop</th><th className="p-3">Current</th><th className="p-3">After saving</th></tr></thead>
            <tbody>{updated.stops.map((stop, index) => {
              const previous = beforeTimes.get(`${stop.job_id}-${stop.stop_type}`);
              const changed = previous && previous !== stop.arrival_time;
              return <tr key={`${index}-${stop.job_id}-${stop.stop_type}`} className={changed ? "bg-[#FFF8E6] border-t border-[#E3E8E5]" : "border-t border-[#E3E8E5]"}>
                <td className="p-3">{stopKind(stop.stop_type)}{stop.job_id != null && <span> · {stop.candidate_name || `#${stop.job_id}`}</span>}</td>
                <td className="p-3 whitespace-nowrap">{previous ? `${previous.slice(5, 10)} ${formatRouteClock(previous)}` : "—"}</td>
                <td className={`p-3 whitespace-nowrap ${changed ? "font-medium text-[#12211A]" : ""}`}>{stop.arrival_time.slice(5, 10)} {formatRouteClock(stop.arrival_time)}
                  {changed && previous && <span className="ml-1.5 text-[11px] text-[#8A6700]">{deltaWord(Date.parse(stop.arrival_time) - Date.parse(previous))}</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </>}
    </div>
  </Modal>;
}
