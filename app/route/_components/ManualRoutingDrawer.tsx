"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Collapse, Drawer, Input, InputNumber, Select, Spin, Tag, message } from "antd";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Eye, GitMerge, Pencil, Route as RouteIcon, Scissors, Trash2, X } from "lucide-react";
import dayjs from "dayjs";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import type { Job } from "@/types/job.type";
import type { Route, Routes } from "@/types/routes.type";
import { useJobsStore } from "@/store/jobs.store";
import { useTeamStore } from "@/store/team.store";
import { useVehicleStore } from "@/store/vehicle.store";
import { useOptimizationStore } from "@/store/optimization.store";
import { useManualRoutingStore } from "@/store/manualRouting.store";
import { commitManualRouting, getManualRoutingContext, previewManualRouting, type ManualJobUpdate, type ManualRoutingContext, type ManualRoutingPreview, type ManualRoutingRequest, type ManualStop } from "@/apis/manualRouting.api";
import { formatRouteClock, formatScheduledClock, hasJobProgress, localRouteTime, manualJobLabel, manualJobTrip, manualRouteLabel, manualRoutingError, routeJobIds, scheduledJobPickup } from "./manualRouting.utils";

const inputClass = "w-full border border-solid border-transparent bg-[#F3F6F4] px-3 py-2 lg:py-1.5 text-sm lg:text-[13px] text-[#12211A] min-h-11 lg:min-h-8 outline-none focus:border-[#0B5D3B] focus:bg-white";
const labelClass = "block text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67] mb-1.5";
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block min-w-0"><span className={labelClass}>{label}</span>{children}
    {hint && <span className="block text-xs leading-4 text-[#626E67] mt-1.5">{hint}</span>}
  </label>
);

function JobEditor({ job, update, onChange, onAddressValidity }: { job: Job; update?: ManualJobUpdate; onChange: (patch: Partial<ManualJobUpdate>) => void; onAddressValidity: (key: string, valid: boolean) => void }) {
  const detail = job.worker_shuttle_detail || job.pickup_delivery_detail;
  const shuttle = Boolean(job.worker_shuttle_detail || job.template_type === "worker_shuttle");
  const cf = job.custom_fields || {};
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const endpoint = (key: "pickup" | "dropoff") => {
    const address = update?.[key]?.address ?? (key === "pickup" ? job.pick_up_address || job.worker_shuttle_detail?.pick_up_address || job.address_formatted || job.pickup_delivery_detail?.address_formatted : job.drop_off_address || job.worker_shuttle_detail?.drop_off_address) ?? "";
    return <Field label={key === "pickup" ? "Pickup address" : "Drop-off address"} hint="Choose a suggestion to confirm the map location.">
      <AddressAutocomplete value={addresses[key] ?? address}
        onChange={value => { setAddresses(previous => ({ ...previous, [key]: value })); onAddressValidity(`${job.id}-${key}`, value === address); }}
        onSelect={value => { setAddresses(previous => ({ ...previous, [key]: value.address_formatted })); onAddressValidity(`${job.id}-${key}`, true); onChange({ [key]: { ...value.location, address: value.address_formatted } }); }} />
      {addresses[key] !== undefined && addresses[key] !== (update?.[key]?.address ?? address) && <span role="alert" className="text-xs text-amber-700">Choose a suggestion to apply this address.</span>}
    </Field>;
  };
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
    <Field label="Name"><Input value={update?.name ?? manualJobLabel(job)} onChange={event => onChange({ name: event.target.value })} /></Field>
    <Field label="Phone"><Input value={update?.phone ?? job.candidate_phone ?? job.worker_shuttle_detail?.candidate_phone ?? job.phone_number ?? ""} onChange={event => onChange({ phone: event.target.value })} /></Field>
    <Field label={shuttle ? "Worker shift starts" : "Job window starts"}><input aria-label={`Job ${job.id} start time`} className={inputClass} type="time" value={update?.start_hour ?? job.start_hour ?? cf.start_hour ?? detail?.start_hour ?? job.time_window_start ?? ""} onChange={event => onChange({ start_hour: event.target.value })} /></Field>
    <Field label={shuttle ? "Worker shift ends" : "Job window ends"}><input aria-label={`Job ${job.id} end time`} className={inputClass} type="time" value={update?.end_hour ?? job.end_hour ?? cf.end_hour ?? detail?.end_hour ?? job.time_window_end ?? ""} onChange={event => onChange({ end_hour: event.target.value })} /></Field>
    {shuttle && <Field label="Passengers"><InputNumber min={1} max={1000} className="!w-full" value={update?.passenger_count ?? Number(cf.passenger_count || 1)} onChange={value => onChange({ passenger_count: value || 1 })} /></Field>}
    {endpoint("pickup")}{shuttle && endpoint("dropoff")}
    <div className="sm:col-span-2"><Field label="Notes"><Input.TextArea rows={2} value={update?.notes ?? job.notes ?? job.worker_shuttle_detail?.notes ?? job.additional_notes ?? ""} onChange={event => onChange({ notes: event.target.value })} /></Field></div>
  </div>;
}

export default function ManualRoutingDrawer({ plan }: { plan: Route }) {
  const { intent, close } = useManualRoutingStore();
  const { jobs, fetchJobsByIds } = useJobsStore();
  const { teams } = useTeamStore();
  const { vehicles } = useVehicleStore();
  const opened = intent?.planId === plan.id && intent.action !== "assign" && intent.action !== "waiting";
  const [proposal, setProposal] = useState<ManualRoutingRequest>({ action: "assign", job_ids: [] });
  const [baseResult, setBaseResult] = useState(plan.result);
  const [routingContext, setRoutingContext] = useState<ManualRoutingContext | null>(null);
  const [revision, setRevision] = useState<string>();
  const [preview, setPreview] = useState<ManualRoutingPreview | null>(null);
  const [busy, setBusy] = useState<"load" | "preview" | "save" | null>(null);
  const [error, setError] = useState<string>();
  const [advanced, setAdvanced] = useState<string[]>([]);
  const [changedAddresses, setChangedAddresses] = useState<Record<string, string>>({});
  const [invalidAddresses, setInvalidAddresses] = useState<string[]>([]);
  const retryToken = useRef("");
  const activeSession = useRef(0);
  const previewAbort = useRef<AbortController | null>(null);
  const routes = useMemo(() => baseResult?.routes || [], [baseResult]);
  const selectedRoute = proposal.route_index === undefined ? undefined : routes[proposal.route_index];
  const activeDrivers = routingContext?.drivers || teams.filter(team => team.status === "active");
  const saveInProgress = useRef(false);
  const update = (patch: Partial<ManualRoutingRequest>) => {
    if (busy) return;
    setProposal(previous => ({ ...previous, ...patch }));
    setPreview(null); setError(undefined);
  };

  useEffect(() => {
    if (!opened || !intent) return;
    const session = ++activeSession.current;
    setBusy("load"); setError(undefined); setPreview(null); setRevision(undefined); setRoutingContext(null);
    setChangedAddresses({}); setInvalidAddresses([]); setAdvanced([]);
    const initialize = (result: Route["result"]) => {
      const source = intent.routeIndex === undefined ? undefined : result?.routes?.[intent.routeIndex];
      setProposal({ action: intent.action, placement: intent.placement || (intent.action === "create" ? "new" : "auto"),
        route_index: intent.routeIndex, job_ids: intent.jobIds || (intent.action === "edit" ? routeJobIds(source) : []),
        driver_id: intent.driverId ?? (intent.action === "edit" || intent.action === "split" || intent.action === "merge" ? source?.team_member_id : undefined),
        vehicle_id: intent.action === "edit" || intent.action === "split" || intent.action === "merge" ? source?.vehicle_id : undefined,
        name: intent.action === "assign" ? undefined : intent.action === "edit" ? source?.name || "" : "",
        ...(source ? { start_at: source.planning_settings?.start_at || null, end_at: source.planning_settings?.end_at || null } : {}),
      });
    };
    initialize(plan.result);
    getManualRoutingContext(plan.id).then(data => {
      if (session !== activeSession.current) return;
      setBaseResult(data.result); setRevision(data.revision); setRoutingContext(data); initialize(data.result);
    }).catch(reason => { if (session === activeSession.current) setError(manualRoutingError(reason)); })
      .finally(() => { if (session === activeSession.current) setBusy(null); });
    return () => { activeSession.current = session + 1; previewAbort.current?.abort(); };
  // Intent opens a new editing session; live plan events must not erase a form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, intent, plan.id]);

  const refresh = async () => {
    setBusy("load"); setError(undefined); setPreview(null);
    try {
      const data = await getManualRoutingContext(plan.id);
      const sourceId = selectedRoute?.route_id;
      if (sourceId) {
        const nextIndex = data.result.routes.findIndex(route => route.route_id === sourceId);
        if (nextIndex < 0) throw new Error("The selected route was deleted. Close the editor and choose another route.");
        setProposal(previous => ({ ...previous, route_index: nextIndex }));
      }
      setBaseResult(data.result); setRevision(data.revision); setRoutingContext(data);
    } catch (reason) { setError(manualRoutingError(reason)); }
    finally { setBusy(null); }
  };
  const selectRoute = (index: number) => {
    const route = routes[index];
    update({ route_index: index, job_ids: proposal.action === "edit" ? routeJobIds(route) : proposal.job_ids,
      merge_route_index: undefined,
      driver_id: proposal.action === "assign" ? undefined : route.team_member_id,
      vehicle_id: proposal.action === "assign" ? undefined : route.vehicle_id,
      name: proposal.action === "edit" ? route.name || "" : "", ordered_stops: undefined, job_updates: [],
      start_at: route.planning_settings?.start_at || null, end_at: route.planning_settings?.end_at || null,
      start_point: undefined, end_point: undefined });
  };
  const switchAction = (action: ManualRoutingRequest["action"]) => {
    update({ action, job_ids: action === "edit" ? routeJobIds(selectedRoute) : [], ordered_stops: undefined, job_updates: [],
      placement: action === "split" ? "new" : "auto", merge_route_index: undefined,
      name: action === "edit" ? selectedRoute?.name || "" : "" });
  };
  const updateJob = (jobId: number, patch: Partial<ManualJobUpdate>) => {
    const previous = proposal.job_updates || [];
    update({ job_updates: [...previous.filter(item => item.job_id !== jobId), { ...previous.find(item => item.job_id === jobId), job_id: jobId, ...patch }] });
  };
  const addressValidity = (key: string, valid: boolean) => setInvalidAddresses(previous => valid ? previous.filter(item => item !== key) : [...new Set([...previous, key])]);
  const poolIds = useMemo(() => new Set((baseResult?.unassigned_jobs || []).map(job => job.job_id)), [baseResult]);
  const sourceIds = useMemo(() => new Set(routeJobIds(selectedRoute)), [selectedRoute]);
  const planIds = useMemo(() => new Set([...(plan.job_ids || []), ...routes.flatMap(routeJobIds), ...poolIds]), [plan.job_ids, routes, poolIds]);
  const availableJobs = jobs.filter(job => planIds.has(job.id) && (
    proposal.action === "split" ? sourceIds.has(job.id) : proposal.action === "assign" || proposal.action === "create" ? poolIds.has(job.id) : true));
  const selectedJobs = availableJobs.filter(job => proposal.job_ids.includes(job.id));
  const canReview = Boolean(revision && !busy && proposal.job_ids.length <= 500 &&
    (proposal.action !== "create" || proposal.driver_id !== undefined) &&
    !invalidAddresses.some(key => key.endsWith("_point") || proposal.job_ids.some(id => key.startsWith(`${id}-`))) &&
    (!["edit", "split", "merge", "delete"].includes(proposal.action) || selectedRoute) &&
    (proposal.action !== "merge" || proposal.merge_route_index !== undefined) &&
    (proposal.action === "delete" || proposal.action === "merge" || proposal.action === "create" || proposal.action === "edit" || proposal.job_ids.length));
  const titles: Record<ManualRoutingRequest["action"], string> = { assign: "Assign jobs", create: "Create a route", edit: "Edit route", split: "Split into a new route", merge: "Merge routes", delete: "Delete route", waiting: "Edit waiting time" };

  const persist = async (checked: ManualRoutingPreview, token: string) => {
    if (saveInProgress.current) return false;
    saveInProgress.current = true;
    setBusy("save"); setError(undefined);
    try {
      const result = await commitManualRouting(plan.id, checked.preview_token, token);
      useOptimizationStore.setState(state => state.currentOptimization?.id === plan.id
        ? { currentOptimization: { ...state.currentOptimization, result: result.result, status: "completed", error_message: null }, error: null }
        : {});
      message.success(result.message); close();
      void fetchJobsByIds(plan.job_ids || []).catch(() => message.warning("Routes saved. Reload job details to see the latest changes."));
      return true;
    } catch (reason) { setError(manualRoutingError(reason)); return false; }
    finally { saveInProgress.current = false; setBusy(null); }
  };
  const review = async () => {
    if (!canReview) return;
    setBusy("preview"); setError(undefined);
    const session = activeSession.current;
    try {
      previewAbort.current = new AbortController();
      const result = await previewManualRouting(plan.id, { ...proposal, expected_revision: revision }, previewAbort.current.signal);
      if (session !== activeSession.current) return;
      retryToken.current = crypto.randomUUID();
      setPreview(result);
    } catch (reason) { if (session === activeSession.current) setError(manualRoutingError(reason)); }
    finally { if (session === activeSession.current) setBusy(null); }
  };
  const save = async () => {
    if (!preview || busy) return;
    await persist(preview, retryToken.current);
  };
  const changeOrder = (route: Routes, from: number, to: number) => {
    const stops = route.stops.filter(stop => stop.job_id != null).map(stop => ({ job_id: stop.job_id!, stop_type: stop.stop_type as ManualStop["stop_type"] }));
    [stops[from], stops[to]] = [stops[to], stops[from]];
    update({ ordered_stops: stops, driver_id: route.team_member_id, vehicle_id: route.vehicle_id,
      ...(proposal.action === "assign" ? { placement: route.route_id ? "existing" as const : "new" as const,
        route_index: route.route_id ? routes.findIndex(item => item.route_id === route.route_id) : undefined } : {}) });
  };
  const endpointField = (endpoint: "start" | "end") => {
    const key = `${endpoint}_point` as const;
    const value = proposal[key] || (selectedRoute?.team_member_id === proposal.driver_id ? selectedRoute?.planning_settings?.[key] : undefined);
    const driver = teams.find(team => team.id === proposal.driver_id);
    const address = value?.address || driver?.[`${endpoint}_address`] || "";
    return <Field label={endpoint === "start" ? "Start location" : "Finish location"} hint="Defaults to the selected driver's location.">
      <AddressAutocomplete value={changedAddresses[key] ?? address} placeholder="Use driver location or choose an address"
        onChange={text => { setChangedAddresses(previous => ({ ...previous, [key]: text })); addressValidity(key, text === address); }}
        onSelect={data => { setChangedAddresses(previous => ({ ...previous, [key]: data.address_formatted })); addressValidity(key, true); update({ [key]: { ...data.location, address: data.address_formatted } }); }} />
      {invalidAddresses.includes(key) && <span role="alert" className="text-xs text-amber-700">Choose a suggestion to confirm this location.</span>}
    </Field>;
  };

  const actionLabels: Record<ManualRoutingRequest["action"], string> = { assign: "Assign jobs", create: "Create route", edit: "Save changes", split: "Split route", merge: "Merge routes", delete: "Delete route", waiting: "Save waiting time" };
  const actionHelp: Record<"edit" | "split" | "merge" | "delete", string> = {
    edit: "Change the driver, vehicle or jobs on this trip.",
    split: "Move selected jobs to a separate trip.",
    merge: "Combine the jobs from two trips into one. Stop times will be recalculated.",
    delete: "Remove the trip and return its unfinished jobs to Unassigned.",
  };
  const routeActions = [
    { key: "edit" as const, title: "Edit trip", icon: Pencil },
    { key: "merge" as const, title: "Merge trips", icon: GitMerge },
    { key: "split" as const, title: "Split trip", icon: Scissors },
    { key: "delete" as const, title: "Delete trip", icon: Trash2 },
  ];
  const mergeTarget = proposal.merge_route_index === undefined ? undefined : routes[proposal.merge_route_index];
  const previousStopTimes = new Map<string, string>(routes.flatMap(route => route.stops.flatMap(stop =>
    stop.job_id == null ? [] : [[`${stop.job_id}-${stop.stop_type}`, stop.arrival_time] as const])));
  const defaultVehicleId = proposal.vehicle_id ?? selectedRoute?.vehicle_id ?? activeDrivers.find(driver => driver.id === proposal.driver_id)?.vehicle_id;
  const defaultVehicle = vehicles.find(vehicle => vehicle.id === defaultVehicleId);
  const jobOptionLabel = (job: Job) => {
    const summary = routingContext?.job_summaries?.[String(job.id)] || job;
    const trip = manualJobTrip(summary);
    return `${manualJobLabel(summary)} · #${job.id} · ${trip.direction} · ${trip.timeLabel}`;
  };

  /** The one way the job list changes, whether from the search box or a row's remove button. Jobs already started stay. */
  const setJobIds = (ids: number[]) => {
    const locked = availableJobs.filter(job => sourceIds.has(job.id) && hasJobProgress(job)).map(job => job.id);
    update({ job_ids: [...new Set([...ids, ...locked])], ordered_stops: undefined, job_updates: (proposal.job_updates || []).filter(item => ids.includes(item.job_id)) });
  };
  // A trip is read in the order it is driven: earliest scheduled pickup first, jobs not yet on the trip last.
  const pickupAt = (id: number) => selectedRoute?.stops.find(stop => stop.job_id === id && ["pickup", "job"].includes(stop.stop_type))?.arrival_time || "9999";
  const orderedSelectedJobs = [...selectedJobs].sort((a, b) => pickupAt(a.id).localeCompare(pickupAt(b.id)) || a.id - b.id);

  return <Drawer rootClassName="lang" open={opened} onClose={busy === "save" ? undefined : close} width="min(640px, 100vw)"
    title={<div className="flex items-center gap-2.5"><RouteIcon size={20} className="text-[#4A5750]" /><div><div className="text-lg font-medium leading-6 text-[#12211A]">{titles[proposal.action]}</div><p className="m-0 text-xs font-normal text-[#626E67] mt-0.5">{dayjs(plan.scheduled_date).format("ddd, D MMM YYYY")} · {plan.route_name}</p></div></div>}
    styles={{ body: { padding: 24 }, footer: { padding: "16px 24px" } }}
    footer={<div className="flex flex-wrap justify-between items-center gap-3">
      <span className="text-xs text-[#626E67]">{busy === "preview" ? "Checking the route…" : busy === "save" ? "Saving…" : preview ? proposal.action === "delete" ? "Review the jobs before deleting the trip." : "Review the proposed times before saving." : "Preview the changes before saving."}</span>
      <div className="flex items-center gap-2"><Button onClick={preview ? () => setPreview(null) : close} disabled={Boolean(busy)}>{preview ? "Back to editing" : "Cancel"}</Button>
        <Button type="primary" danger={Boolean(preview) && proposal.action === "delete"} onClick={preview ? save : review} loading={Boolean(busy)} disabled={preview ? Boolean(busy) : !canReview} icon={preview ? <Check size={15} /> : <Eye size={15} />}>
          {preview ? actionLabels[proposal.action] : "Preview changes"}
        </Button>
      </div>
    </div>}>
    <div className="space-y-5">
      {error && <Alert type="error" showIcon title="This change needs attention" description={<div><p className="whitespace-pre-line mb-2">{error}</p><div className="flex flex-wrap gap-2"><Button size="small" onClick={refresh} disabled={Boolean(busy)}>Refresh and keep my changes</Button><Button size="small" onClick={() => setAdvanced(["options"])} disabled={Boolean(busy)}>More options</Button></div></div>} />}
      {busy === "load" && <div role="status" className="py-5 text-center"><Spin /><p className="text-sm text-slate-500 mt-3">Loading route details…</p></div>}
      {preview ? <div className="space-y-4">
        <Alert type="success" showIcon title="Review your changes" description={<span>{preview.explanation} {proposal.action === "delete" ? "Check which jobs will return to Unassigned before deleting." : "Check the proposed pickup and drop-off times before saving."}</span>} />
        {preview.deleted_route_indices.map(index => <div key={`deleted-${index}`} className="bg-[#FDF3F2] p-3 shadow-[inset_3px_0_0_#C9372C]"><strong className="text-[13px] font-medium text-[#12211A]">{manualRouteLabel(routes[index], index)}</strong><p className="text-xs text-[#C9372C] mt-1 mb-0">{proposal.action === "merge" ? "Jobs move to the merged route." : "Unfinished jobs return to Unassigned."}</p></div>)}
        {preview.affected_route_indices.filter(index => !preview.deleted_route_indices.includes(index)).map(index => {
          const route = preview.result.routes[index];
          const stops = route.stops.filter(stop => stop.job_id != null);
          return <section key={index} className="border border-solid border-[#D5DCD8]">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-[#F3F6F4] px-3 py-2.5"><div className="min-w-0"><strong className="text-[13px] font-medium text-[#12211A]">{route.name || "Trip"}</strong><p className="text-xs text-[#4A5750] mt-0.5 mb-0">{route.team_member_name} · {route.vehicle_name} · {routeJobIds(route).length} jobs</p></div>
              {route.stops.length > 0 && <p className="m-0 text-xs tabular-nums text-[#12211A]">Trip: {formatRouteClock(route.stops[0].arrival_time)}–{formatRouteClock(route.stops[route.stops.length - 1].arrival_time)}</p>}
            </div>
            {stops.length ? <ol className="m-0 p-0 list-none [&>li+li]:border-0 [&>li+li]:border-t [&>li+li]:border-solid [&>li+li]:border-[#E3E8E5]">
              {stops.map((stop, position) => <li key={`${stop.job_id}-${stop.stop_type}`} className="px-3 py-2.5 flex items-start gap-2.5">
                <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-[#626E67]">{position + 1}.</span>
                <div className="min-w-0 flex-1"><div className="text-[13px] text-[#12211A]"><strong className="font-medium tabular-nums">{formatScheduledClock(stop.arrival_time, plan.scheduled_date)}</strong> <span className="capitalize text-[#626E67]">{stop.stop_type}</span> {stop.candidate_name || `Job #${stop.job_id}`}</div>
                  {previousStopTimes.get(`${stop.job_id}-${stop.stop_type}`) && previousStopTimes.get(`${stop.job_id}-${stop.stop_type}`) !== stop.arrival_time && <p className="text-xs font-medium text-[#9A6700] mb-0 mt-0.5">Previously {formatScheduledClock(previousStopTimes.get(`${stop.job_id}-${stop.stop_type}`), plan.scheduled_date)}</p>}
                  <p className="text-xs text-[#626E67] mb-0 mt-0.5 truncate">{stop.address_formatted}</p></div>
                {preview.affected_route_indices.filter(item => !preview.deleted_route_indices.includes(item)).length === 1 && <div className="flex"><Button size="small" type="text" aria-label={`Move stop ${position + 1} earlier`} disabled={position === 0} icon={<ArrowUp size={14} />} onClick={() => changeOrder(route, position, position - 1)} /><Button size="small" type="text" aria-label={`Move stop ${position + 1} later`} disabled={position === stops.length - 1} icon={<ArrowDown size={14} />} onClick={() => changeOrder(route, position, position + 1)} /></div>}
              </li>)}
            </ol> : <p className="p-3 text-sm text-slate-500 m-0">An empty route. Add jobs whenever you’re ready.</p>}
          </section>;
        })}
      </div> : <fieldset disabled={Boolean(busy)} className="border-0 p-0 m-0 space-y-5 min-w-0">
        {["edit", "delete", "split", "merge"].includes(proposal.action) && <>
          <Field label="Trip"><Select className="w-full" showSearch optionFilterProp="label" value={proposal.route_index} disabled={Boolean(busy)} onChange={selectRoute} options={routes.map((route, index) => ({ value: index, label: manualRouteLabel({ ...route, team_member_name: routingContext?.driver_names?.[String(route.team_member_id)] || route.team_member_name }, index) }))} /></Field>
          <section aria-label="Trip action" className="space-y-2">
            <p className={`m-0 ${labelClass}`}>What would you like to do?</p>
            {/* Four choices on one filled strip. The chosen one is white with the green line under it; delete turns red when chosen. */}
            <div className="grid grid-cols-2 gap-px bg-[#D5DCD8] p-px sm:grid-cols-4">{routeActions.map(({ key, title, icon: Icon }) => <button key={key} type="button" aria-pressed={proposal.action === key} disabled={Boolean(busy) || !selectedRoute}
              onClick={() => { if (proposal.action !== key) switchAction(key); }} className={`min-h-11 lg:min-h-10 flex items-center justify-center gap-1.5 border-0 px-2 py-2 text-[13px] transition-colors cursor-pointer outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B5D3B] disabled:cursor-not-allowed disabled:opacity-50 ${proposal.action === key ? `bg-white font-medium ${key === "delete" ? "text-[#C9372C] shadow-[inset_0_-2px_0_#C9372C]" : "text-[#12211A] shadow-[inset_0_-2px_0_#0B5D3B]"}` : "bg-[#F3F6F4] text-[#4A5750] hover:bg-white hover:text-[#12211A]"}`}>
              <Icon size={15} aria-hidden="true" />{title}</button>)}</div>
            <p className="m-0 text-xs leading-4 text-[#626E67]">{actionHelp[proposal.action as keyof typeof actionHelp]}</p>
          </section>
        </>}
        {proposal.action === "delete" ? <Alert type="warning" showIcon title="Delete this route?" description="Unfinished jobs return to Unassigned. Active trips and completed work are kept safe." /> : <>
          {proposal.action === "merge" && <>
            <Field label="Choose the other trip" hint="Select the trip whose jobs should join the trip above."><Select className="w-full" showSearch optionFilterProp="label" disabled={Boolean(busy)} value={proposal.merge_route_index} onChange={value => update({ merge_route_index: value })} options={routes.flatMap((route, index) => index === proposal.route_index ? [] : [{ value: index, label: manualRouteLabel(route, index), sameDriver: route.team_member_id === selectedRoute?.team_member_id }]).sort((a, b) => Number(b.sameDriver) - Number(a.sameDriver))} placeholder="Search by driver, time or vehicle" /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-label="Trips to merge">{[{ label: "Selected trip", route: selectedRoute, index: proposal.route_index }, { label: "Trip to merge", route: mergeTarget, index: proposal.merge_route_index }].map(({ label, route, index }) => <section key={label} className="bg-[#F3F6F4] p-3">
              <p className={`m-0 ${labelClass} !mb-0`}>{label}</p>
              {route && index !== undefined ? <><p className="mt-1 mb-1 text-sm font-medium text-slate-800">{manualRouteLabel(route, index)}</p>
                <p className="m-0 text-xs text-slate-500">{routeJobIds(route).length} {routeJobIds(route).length === 1 ? "job" : "jobs"}</p>
                <ul className="mt-2 mb-0 pl-4 space-y-1 text-xs text-slate-600">{routeJobIds(route).map(id => {
                  const summary = routingContext?.job_summaries?.[String(id)] || jobs.find(job => job.id === id);
                  const pickup = scheduledJobPickup(route, id, plan.scheduled_date);
                  return <li key={id}>{summary ? `${manualJobLabel(summary)} · #${id}` : `Job #${id}`}{pickup ? ` · Pickup ${pickup}` : ""}</li>;
                })}</ul></> : <p className="mt-2 mb-0 text-xs text-slate-500">Choose a trip above.</p>}
            </section>)}</div>
          </>}
          {proposal.action === "split" && <Alert type="info" showIcon title="Which jobs should move to a new route?" description="Choose those jobs below. The others stay on the current route." />}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Driver"><Select className="w-full" showSearch optionFilterProp="label" disabled={Boolean(busy)} placeholder="Choose a driver" value={proposal.driver_id} onChange={value => { update({ driver_id: value, vehicle_id: undefined, start_point: undefined, end_point: undefined }); setChangedAddresses({}); setInvalidAddresses(previous => previous.filter(key => !key.endsWith("_point"))); }} options={activeDrivers.map(driver => ({ value: driver.id, label: driver.name }))} /></Field>
            <Field label="Vehicle"><Select className="w-full" disabled={Boolean(busy)} allowClear showSearch optionFilterProp="label" placeholder={defaultVehicle ? `${defaultVehicle.name} (the driver’s vehicle)` : "Use the driver’s vehicle"} value={proposal.vehicle_id} onChange={value => update({ vehicle_id: value })} options={vehicles.map(vehicle => ({ value: vehicle.id, label: vehicle.name }))} /></Field>
          </div>
          {proposal.action !== "merge" && <Field label={proposal.action === "create" ? "Jobs (optional)" : "Jobs"} hint={proposal.action === "create" ? "You can leave this empty and add jobs later." : "Search to add a job. Remove one from the list below. Pickup and drop-off stay together."}>
            <Select className="w-full" mode="multiple" maxTagCount={0} maxTagPlaceholder={omitted => `${omitted.length} ${omitted.length === 1 ? "job" : "jobs"} chosen`} showSearch optionFilterProp="label" disabled={Boolean(busy)}
              placeholder="Search and choose jobs" value={proposal.job_ids} onChange={ids => setJobIds(ids)} options={availableJobs.map(job => ({ value: job.id, label: jobOptionLabel(job), disabled: hasJobProgress(job) }))} />
          </Field>}
          {selectedJobs.length > 0 && <div><div className="mb-1.5 flex items-baseline justify-between gap-2"><p className={`m-0 ${labelClass} !mb-0`}>Selected jobs</p><span className="text-xs tabular-nums text-[#626E67]">{selectedJobs.length} {selectedJobs.length === 1 ? "job" : "jobs"}</span></div>
            <p className="mt-0 mb-2 text-xs leading-4 text-[#626E67]">Requested times come from the job; scheduled times show the current trip. To change requested times, edit job details in More options.</p>
            <div className="max-h-80 overflow-y-auto border-0 border-t border-solid border-[#D5DCD8]">
            {orderedSelectedJobs.map(job => {
              const summary = routingContext?.job_summaries?.[String(job.id)] || job;
              const staged = proposal.job_updates?.find(item => item.job_id === job.id);
              const trip = manualJobTrip(staged ? { ...summary, ...staged } : summary);
              const pickup = scheduledJobPickup(selectedRoute, job.id, plan.scheduled_date);
              const started = hasJobProgress(job);
              const name = staged?.name || manualJobLabel(summary);
              return <div key={job.id} className="flex items-start gap-3 border-0 border-b border-solid border-[#E3E8E5] px-1 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><span className="truncate text-[13px] font-medium text-[#12211A]">{name}</span><span className="shrink-0 text-xs tabular-nums text-[#626E67]">#{job.id}</span>
                    {(trip.direction === "GO" || trip.direction === "RETURN") && <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">{trip.direction === "RETURN" ? <ArrowLeft size={12} aria-hidden="true" /> : <ArrowRight size={12} aria-hidden="true" />}{trip.direction}</span>}
                  </div>
                  {/* What was asked for, then what the trip currently gives. */}
                  <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
                    <p className="m-0 text-xs leading-4 text-[#4A5750]">{trip.timeLabel}{started ? " · Started — kept on this route" : ""}</p>
                    {pickup ? <p className="m-0 text-xs leading-4 text-[#12211A]">Scheduled pickup: <strong className="font-medium tabular-nums">{pickup}</strong></p>
                      : <p className="m-0 text-xs leading-4 text-[#626E67]">Not on this trip yet</p>}
                  </div>
                </div>
                {started ? <span className="h-8 w-8 shrink-0" aria-hidden="true" />
                  : <button type="button" aria-label={`Remove ${name}, job #${job.id}, from this trip`} disabled={Boolean(busy)} onClick={() => setJobIds(proposal.job_ids.filter(id => id !== job.id))}
                    className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] outline-none hover:bg-[#EAEFEC] hover:text-[#C9372C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B] disabled:cursor-not-allowed disabled:opacity-50"><X size={15} aria-hidden="true" /></button>}
              </div>;
            })}
          </div></div>}
          {proposal.job_ids.length > 500 && <Alert type="warning" title="Choose up to 500 jobs at a time." />}
          <Collapse ghost activeKey={advanced} onChange={keys => setAdvanced(Array.isArray(keys) ? keys : [keys])} className="!bg-[#F3F6F4]" items={[{ key: "options", label: <span className="text-sm text-[#4A5750]">More options</span>, children: <div className="space-y-4 pb-2">
            <Field label="Route name (optional)"><Input placeholder="For example, Late return pickups" disabled={Boolean(busy)} maxLength={255} value={proposal.name} onChange={event => update({ name: event.target.value })} /></Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{endpointField("start")}{endpointField("end")}
              <Field label="Route starts at" hint="Leave empty to calculate from the jobs."><input aria-label="Route start time" type="datetime-local" className={inputClass} value={localRouteTime(proposal.start_at)} onChange={event => update({ start_at: event.target.value || null })} /></Field>
              <Field label="Route finishes by" hint="Includes travel to the finish location."><input aria-label="Route finish deadline" type="datetime-local" className={inputClass} value={localRouteTime(proposal.end_at)} onChange={event => update({ end_at: event.target.value || null })} /></Field>
            </div>
            <Checkbox checked={proposal.change_fixed_driver} onChange={event => update({ change_fixed_driver: event.target.checked })}>Also change the jobs’ required driver</Checkbox>
            {selectedJobs.filter(job => !hasJobProgress(job)).length > 0 && <Collapse ghost items={[{ key: "jobs", label: "Edit selected job details", children: selectedJobs.filter(job => !hasJobProgress(job)).map(job => <Collapse key={job.id} ghost size="small" items={[{ key: String(job.id), label: `${manualJobLabel(job)} · #${job.id}`, children: <JobEditor job={job} update={proposal.job_updates?.find(item => item.job_id === job.id)} onAddressValidity={addressValidity} onChange={patch => updateJob(job.id, patch)} /> }]} />) }]} />}
            {(proposal.ordered_stops || selectedRoute?.stops.length) && <Collapse ghost items={[{ key: "order", label: "Change stop order or arrival times", children: <div className="space-y-3">
              <p className="text-xs text-slate-500">Use arrows to arrange stops. Set an arrival time only to keep that exact time.</p>
              {(proposal.ordered_stops || (selectedRoute?.stops || []).filter(stop => stop.job_id != null).map(stop => ({ job_id: stop.job_id!, stop_type: stop.stop_type as ManualStop["stop_type"], arrival_time: undefined as string | null | undefined }))).map((stop, index, order) => <div key={`${stop.job_id}-${stop.stop_type}`} className="flex flex-wrap items-center gap-1 border-b border-slate-100 pb-2">
                <span className="flex-1 text-xs capitalize">{index + 1}. {stop.stop_type} · #{stop.job_id}</span>
                <input aria-label={`Arrival time for job ${stop.job_id} ${stop.stop_type}`} type="datetime-local" className="border border-slate-300 rounded px-2 py-1 text-xs max-w-44" value={localRouteTime(stop.arrival_time)} onChange={event => update({ ordered_stops: order.map((item, position) => position === index ? { ...item, arrival_time: event.target.value || null } : item) })} />
                <Button size="small" type="text" aria-label={`Move stop ${index + 1} earlier`} disabled={index === 0} icon={<ArrowUp size={14} />} onClick={() => { const next = [...order]; [next[index], next[index - 1]] = [next[index - 1], next[index]]; update({ ordered_stops: next }); }} />
                <Button size="small" type="text" aria-label={`Move stop ${index + 1} later`} disabled={index === order.length - 1} icon={<ArrowDown size={14} />} onClick={() => { const next = [...order]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; update({ ordered_stops: next }); }} />
              </div>)}
            </div> }]} />}
          </div> }]} />
        </>}
      </fieldset>}
    </div>
  </Drawer>;
}
