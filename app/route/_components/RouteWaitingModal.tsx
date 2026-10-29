"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, InputNumber, Modal, Radio, Select, Spin, message } from "antd";
import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import type { Route } from "@/types/routes.type";
import { commitManualRouting, getManualRoutingContext, previewManualRouting, type ManualRoutingContext, type ManualRoutingPreview } from "@/apis/manualRouting.api";
import { useOptimizationStore } from "@/store/optimization.store";
import { useJobsStore } from "@/store/jobs.store";
import { formatRouteClock, manualRouteLabel, manualRoutingError } from "./manualRouting.utils";
import { getTimelineSegment } from "./timelineSegment.utils";
import { waitingMergeCandidates, type WaitingSelection } from "./routeWaiting.utils";
import styles from "./RouteWaitingModal.module.css";

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
  const source = selection ? context?.result.routes[selection.routeIndex] : undefined;
  const stop = selection?.afterStopIndex === undefined ? undefined : source?.stops[selection.afterStopIndex];
  const merging = selection?.afterStopIndex === undefined || stop?.stop_type === "depot_end";
  const candidates = useMemo(() => selection && context ? waitingMergeCandidates(context.result.routes, selection.routeIndex) : [], [context, selection]);

  useEffect(() => {
    if (!selection) return;
    const current = ++session.current;
    setBusy("load"); setContext(null); setPreview(null); setError(undefined);
    setTarget(undefined); setSeconds(null); setDurationEdited(false); setSide("right");
    const snapshot = plan.result;
    getManualRoutingContext(plan.id).then(data => {
      if (current !== session.current) return;
      const indices = [selection.routeIndex, ...(selection.mergeRouteIndex === undefined ? [] : [selection.mergeRouteIndex])];
      for (const index of indices) {
        const before = snapshot.routes[index], fresh = data.result.routes[index];
        if (!before || !fresh || before.route_id !== fresh.route_id || JSON.stringify(before.stops) !== JSON.stringify(fresh.stops)) {
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
      const checked = await previewManualRouting(plan.id, {
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

  return <Modal open={selection !== null} onCancel={busy === "save" ? undefined : onClose}
    closable={busy !== "save"} maskClosable={!busy} width={640} centered className={styles.modal}
    title={<span className={styles.title}><Clock3 size={20} aria-hidden="true" />{merging ? "Merge routes with waiting" : "Edit waiting time"}</span>}
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
        <div className={styles.routeSummary} aria-label={manualRouteLabel(source, selection!.routeIndex)}>
          <span className={styles.eyebrow}>Selected route</span>
          <div className={styles.routeHeading}><strong>{source.name || `Route ${selection!.routeIndex + 1}`}</strong>{source.leg && <span className={styles.leg}>{source.leg}</span>}</div>
          <div className={styles.routeDetails}><span>{source.team_member_name}</span><span className={styles.tripTime}><Clock3 size={14} aria-hidden="true" />{tripTimes(source)}</span></div>
        </div>
        {selection?.afterStopIndex === undefined && <div className={styles.field}>
          <label htmlFor="waiting-merge-route" className={styles.label}>Merge with</label>
          <Select id="waiting-merge-route" className={styles.select} value={target} disabled={Boolean(busy)} placeholder="Choose a consecutive route" onChange={setTarget}
            options={candidates.map(index => {
              const route = context!.result.routes[index];
              return { value: index, label: `${route.name || `Route ${index + 1}`}${route.leg ? ` · ${route.leg}` : ""} · ${tripTimes(route)}` };
            })} />
          {!candidates.length && <span className={styles.emptyHint}>No consecutive route uses this driver and vehicle. Match their assignments before merging.</span>}
        </div>}
        {merging && <div className={styles.mergeNote} role="note"><Clock3 size={17} aria-hidden="true" /><p>Join the trips with direct travel and waiting, replacing the finish and home stops between them.</p></div>}
        {merging && <div className={styles.durationChoice}>
          <Checkbox disabled={Boolean(busy)} checked={seconds === null} onChange={event => { setSeconds(event.target.checked ? null : 0); setDurationEdited(!event.target.checked); }}>Use the current gap between trips</Checkbox>
          <p>Waiting is calculated to keep passenger times the same.</p>
        </div>}
        {(!merging || seconds !== null) && <div className={styles.field}>
          <label htmlFor="route-waiting-minutes" className={styles.label}>Waiting time</label>
          <InputNumber
            id="route-waiting-minutes"
            aria-label="Waiting time in minutes"
            className={`${styles.durationInput} !w-full`}
            style={{ width: "100%" }}
            suffix="min"
            min={0}
            max={2880}
            step={1}
            precision={2}
            disabled={Boolean(busy)}
            value={seconds === null ? null : seconds / 60}
            onChange={value => { setSeconds(value === null ? null : Math.round(value * 60)); setDurationEdited(true); }}
          />
          <span className={styles.hint}>Set to 0 to remove waiting and keep the travel time.</span>
        </div>}
        <fieldset className={styles.placement} disabled={Boolean(busy)}>
          <legend className={styles.label}>Where should the driver wait?</legend>
          <Radio.Group aria-label="Waiting location" buttonStyle="solid" value={side} disabled={Boolean(busy)} onChange={event => setSide(event.target.value)} className={styles.sideOptions}>
            <Radio.Button value="left" className={styles.sideOption}><span className={styles.optionTitle}><ArrowLeft size={14} aria-hidden="true" />Left stop</span></Radio.Button>
            <Radio.Button value="right" className={styles.sideOption}><span className={styles.optionTitle}>Right stop<ArrowRight size={14} aria-hidden="true" /></span></Radio.Button>
          </Radio.Group>
          <p className={styles.placementHint}>{side === "left" ? "Wait at the left stop, then drive." : "Drive, then wait at the right stop."}{" "}{durationEdited && seconds !== null
            ? side === "left" ? "Earlier stops adjust to the new waiting time. Later stops keep their times." : "Later stops adjust to the new waiting time. Earlier stops keep their times."
            : "Passenger times stay the same unless you change the waiting duration."}</p>
        </fieldset>
      </>}
      {preview && updated && <>
        <Alert type="success" showIcon title={preview.explanation} description={preview.updates_drivers ? "Saving also updates the driver's app." : "Review the times below, then save."} />
        <div className={styles.previewTable}>
          <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="p-3">Stop</th><th className="p-3">Current</th><th className="p-3">After saving</th></tr></thead>
            <tbody>{updated.stops.map((stop, index) => {
              const previous = beforeTimes.get(`${stop.job_id}-${stop.stop_type}`);
              const changed = previous && previous !== stop.arrival_time;
              return <tr key={`${index}-${stop.job_id}-${stop.stop_type}`} className={changed ? "bg-amber-50 border-t border-slate-100" : "border-t border-slate-100"}>
                <td className="p-3"><span className="capitalize">{stop.stop_type.replaceAll("_", " ")}</span>{stop.job_id != null && <span> · {stop.candidate_name || `#${stop.job_id}`}</span>}</td>
                <td className="p-3 whitespace-nowrap">{previous ? `${previous.slice(5, 10)} ${formatRouteClock(previous)}` : "—"}</td>
                <td className={`p-3 whitespace-nowrap ${changed ? "font-semibold text-amber-800" : ""}`}>{stop.arrival_time.slice(5, 10)} {formatRouteClock(stop.arrival_time)}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </>}
    </div>
  </Modal>;
}
