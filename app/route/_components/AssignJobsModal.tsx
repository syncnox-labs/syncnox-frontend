"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Collapse, Modal, Radio, Select, Spin, Tag, message } from "antd";
import { ArrowLeft, ArrowRight, Check, MapPin } from "lucide-react";
import type { Route } from "@/types/routes.type";
import { useJobsStore } from "@/store/jobs.store";
import { useOptimizationStore } from "@/store/optimization.store";
import { useManualRoutingStore } from "@/store/manualRouting.store";
import { commitManualRouting, getAssignmentRoutingContext, previewManualRouting, type ManualJobSummary, type ManualRoutingContext, type ManualRoutingPreview, type ManualRoutingRequest } from "@/apis/manualRouting.api";
import { assignmentProposal, formatRouteClock, manualJobLabel, manualJobTrip, manualRouteLabel, manualRoutingErrorInfo, otherLongRides, rideDurationSeconds } from "./manualRouting.utils";
import { choicesCoverJobs, filterAssignmentChoices } from "./assignmentChoices.utils";
import TripPlaces from "./TripPlaces";

const cleanName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Minutes since midnight from "HH:MM" or an ISO time, read the same way the clock on screen is read (no time-zone shift). */
const clockMinutes = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const match = /(?:T|^)(\d{1,2}):(\d{2})/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : undefined;
};
/** Planned time minus asked time in minutes, treating times as the nearest day apart (so 00:10 is 20 minutes after 23:50). */
const minutesApart = (planned?: string | null, asked?: string | null): number | undefined => {
  const a = clockMinutes(planned), b = clockMinutes(asked);
  if (a === undefined || b === undefined) return undefined;
  return ((a - b + 720) % 1440 + 1440) % 1440 - 720;
};
const minuteWord = (count: number) => `${count} ${count === 1 ? "minute" : "minutes"}`;
/** A ride length for reading at a glance: whole minutes, hours when long. */
const rideWords = (pickup?: string | null, dropoff?: string | null): string | undefined => {
  const seconds = rideDurationSeconds(pickup, dropoff);
  if (seconds === undefined) return undefined;
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
};
/** The most people on board at once along a trip, from its pickups and drop-offs. */
const peakLoad = (stops: { stop_type: string; passenger_count?: number }[]): number => {
  let onBoard = 0, peak = 0;
  for (const stop of stops) {
    if (stop.stop_type === "pickup") onBoard += stop.passenger_count || 1;
    if (stop.stop_type === "dropoff") onBoard = Math.max(0, onBoard - (stop.passenger_count || 1));
    peak = Math.max(peak, onBoard);
  }
  return peak;
};

/** Dropping onto a driver already answers "who?". Only confirmation remains. */
export default function AssignJobsModal({ plan }: { plan: Route }) {
  const { intent, close } = useManualRoutingStore();
  const { jobs, fetchJobsByIds } = useJobsStore();
  const opened = intent?.planId === plan.id && intent.action === "assign";
  const [context, setContext] = useState<ManualRoutingContext | null>(null);
  const [driverId, setDriverId] = useState<number>();
  const [expectedName, setExpectedName] = useState<string>();
  const [vehicleId, setVehicleId] = useState<number>();
  const [placement, setPlacement] = useState<"auto" | "existing" | "new">("auto");
  const [routeIndex, setRouteIndex] = useState<number>();
  const [changeFixedDriver, setChangeFixedDriver] = useState(false);
  const [includeExtraHours, setIncludeExtraHours] = useState(false);
  const [checkSelectedDriver, setCheckSelectedDriver] = useState(false);
  const [advanced, setAdvanced] = useState<string[]>([]);
  const [preview, setPreview] = useState<ManualRoutingPreview | null>(null);
  const [busy, setBusy] = useState<"load" | "preview" | "save" | null>(null);
  const [error, setError] = useState<ReturnType<typeof manualRoutingErrorInfo>>();
  /** Seconds spent in the current check, so a long wait can say that it is long and that nothing is saved yet. */
  const [waited, setWaited] = useState(0);
  const checking = busy === "load" || busy === "preview";
  useEffect(() => {
    if (!checking) { setWaited(0); return; }
    const timer = setInterval(() => setWaited(seconds => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [checking]);
  const workingTimeExtensions = preview?.working_time_extensions || [];
  const extraWorkingMinutes = workingTimeExtensions.reduce((total, extension) => total + extension.extra_minutes, 0);
  const session = useRef(0);
  const requestNumber = useRef(0);
  const saving = useRef(false);
  const retryToken = useRef("");
  const jobIds = useMemo(() => intent?.jobIds || [], [intent]);
  const routes = context?.result.routes || plan.result?.routes || [];
  const choices = useMemo(() => filterAssignmentChoices(context?.assignment_choices || [], {
    placement, routeIndex, includeExtraHours, changeFixedDriver,
  }), [context, placement, routeIndex, includeExtraHours, changeFixedDriver]);
  const driverChoices = choices.filter(choice => driverId !== undefined || vehicleId === undefined || choice.vehicle_id === vehicleId);
  const drivers = (context?.drivers || []).filter(driver => choicesCoverJobs(driverChoices.filter(choice => choice.driver_id === driver.id), jobIds));
  const vehicleChoices = choices.filter(choice => driverId === undefined || choice.driver_id === driverId);
  const vehicles = (context?.vehicles || []).filter(vehicle => choicesCoverJobs(vehicleChoices.filter(choice => choice.vehicle_id === vehicle.id), jobIds));
  const selectedChoices = choices.filter(choice => (driverId === undefined ? !choice.requires_working_time_extension : choice.driver_id === driverId)
    && (vehicleId === undefined || choice.vehicle_id === vehicleId));
  const availabilityReady = Array.isArray(context?.assignment_choices);
  const selectedDriverIsActive = driverId !== undefined && Boolean(context?.drivers?.some(driver => driver.id === driverId));
  const canCheck = availabilityReady && (choicesCoverJobs(selectedChoices, jobIds) || (checkSelectedDriver && selectedDriverIsActive));
  const requiredJobs = jobIds.map(id => context?.job_summaries?.[String(id)])
    .filter((job): job is ManualJobSummary => Boolean(job?.required_driver_name));
  const withRequiredDriverChange = filterAssignmentChoices(context?.assignment_choices || [], {
    placement, routeIndex, includeExtraHours, changeFixedDriver: true,
  });
  const requiredDriverBlocked = availabilityReady && !changeFixedDriver && requiredJobs.length > 0
    && !choicesCoverJobs(choices, jobIds) && choicesCoverJobs(withRequiredDriverChange, jobIds)
    && withRequiredDriverChange.some(choice => choice.changes_required_driver);
  const chooseExtraHoursDriver = availabilityReady && !canCheck && driverId === undefined && includeExtraHours
    && choicesCoverJobs(choices, jobIds);
  const currentName = driverId === undefined ? undefined : context?.driver_names?.[String(driverId)] || drivers.find(driver => driver.id === driverId)?.name;
  const driverChanged = Boolean(context && driverId !== undefined && expectedName && currentName && cleanName(expectedName) !== cleanName(currentName));
  const driverUnavailable = Boolean(availabilityReady && driverId !== undefined && !drivers.some(driver => driver.id === driverId));
  const needsDriverChoice = driverChanged || (driverUnavailable && !(checkSelectedDriver && selectedDriverIsActive));
  const selected = jobIds.map(id => context?.job_summaries?.[String(id)] || jobs.find(job => job.id === id) || {
    id, name: plan.result?.unassigned_jobs?.find(job => job.job_id === id)?.worker_name || `Job #${id}`, job_type: "",
  } as ManualJobSummary);
  const onlyReturns = selected.length > 0 && selected.every(job => job.job_type === "return_only");
  const title = jobIds.length === 1 ? onlyReturns ? "Assign return job" : "Assign job" : `Assign ${jobIds.length} jobs`;
  const proposal = useMemo<ManualRoutingRequest>(() => ({
    ...assignmentProposal(jobIds, driverId, expectedName), placement,
    ...(placement === "existing" ? { route_index: routeIndex } : {}),
    ...(vehicleId === undefined ? {} : { vehicle_id: vehicleId }),
    change_fixed_driver: changeFixedDriver, expected_revision: context?.revision,
  }), [jobIds, driverId, expectedName, placement, routeIndex, vehicleId, changeFixedDriver, context]);

  useEffect(() => {
    if (!opened || !intent) return;
    const current = ++session.current;
    const source = intent.routeIndex === undefined ? undefined : plan.result?.routes?.[intent.routeIndex];
    setDriverId(intent.driverId ?? source?.team_member_id);
    setExpectedName(intent.driverName ?? source?.team_member_name);
    setVehicleId(undefined);
    setPlacement(intent.placement || "auto"); setRouteIndex(intent.routeIndex);
    setChangeFixedDriver(false); setIncludeExtraHours(false); setCheckSelectedDriver(false); setAdvanced([]); setContext(null); setPreview(null); setError(undefined); setBusy("load");
    saving.current = false;
    const controller = new AbortController();
    getAssignmentRoutingContext(plan.id, jobIds, controller.signal).then(data => {
      if (session.current === current) { setContext(data); setBusy(null); }
    }).catch(reason => { if (session.current === current) { setError(manualRoutingErrorInfo(reason)); setBusy(null); } });
    return () => { session.current = current + 1; controller.abort(); };
  // The intent starts a session. Live plan events must not reset a selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, intent, plan.id]);

  useEffect(() => {
    if (!opened || !context || !jobIds.length || needsDriverChoice || !canCheck || saving.current) return;
    if (placement === "existing" && routeIndex === undefined) return;
    const current = ++requestNumber.current;
    const active = session.current;
    const controller = new AbortController();
    setPreview(null); setError(undefined); setBusy("preview");
    const timer = setTimeout(() => {
      previewManualRouting(plan.id, proposal, controller.signal).then(result => {
        if (controller.signal.aborted || current !== requestNumber.current || active !== session.current) return;
        setPreview(result); retryToken.current = crypto.randomUUID();
      }).catch(reason => {
        if (!controller.signal.aborted && current === requestNumber.current && active === session.current) setError(manualRoutingErrorInfo(reason));
      }).finally(() => {
        if (!controller.signal.aborted && current === requestNumber.current && active === session.current) setBusy(null);
      });
    }, 150);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [opened, context, jobIds.length, needsDriverChoice, canCheck, includeExtraHours, proposal, placement, routeIndex, plan.id]);

  const invalidate = () => { requestNumber.current++; setPreview(null); setError(undefined); setBusy(null); };
  const chooseDriver = (id: number | "recommend") => {
    invalidate(); setCheckSelectedDriver(false); setDriverId(id === "recommend" ? undefined : id);
    if (id === "recommend") setIncludeExtraHours(false);
    setExpectedName(id === "recommend" ? undefined : context?.driver_names?.[String(id)] || drivers.find(driver => driver.id === id)?.name);
    setPlacement("auto"); setRouteIndex(undefined); setVehicleId(undefined);
  };
  const retry = async () => {
    invalidate(); setBusy("load");
    const active = session.current;
    try { const data = await getAssignmentRoutingContext(plan.id, jobIds); if (session.current === active) setContext(data); }
    catch (reason) { if (session.current === active) setError(manualRoutingErrorInfo(reason)); }
    finally { if (session.current === active) setBusy(null); }
  };
  const assign = async () => {
    if (!preview || busy || saving.current || needsDriverChoice || !canCheck) return;
    saving.current = true; setBusy("save"); setError(undefined);
    const active = session.current;
    try {
      const saved = await commitManualRouting(plan.id, preview.preview_token, retryToken.current, workingTimeExtensions.length > 0);
      useOptimizationStore.setState(state => state.currentOptimization?.id === plan.id ? {
        currentOptimization: { ...state.currentOptimization, result: saved.result, status: "completed", error_message: null }, error: null,
      } : {});
      message.success(jobIds.length === 1 ? "Job assigned" : `${jobIds.length} jobs assigned`);
      if (active === session.current) close();
      void fetchJobsByIds(plan.job_ids || jobIds).catch(() => message.warning("Assignment saved. Refresh to load updated job details."));
    } catch (reason) { if (active === session.current) setError(manualRoutingErrorInfo(reason)); }
    finally { saving.current = false; if (active === session.current) setBusy(null); }
  };
  const changedRoutes = preview?.affected_route_indices.filter(index => !preview.deleted_route_indices.includes(index)) || [];
  const existingOptions = routes.flatMap((route, index) => {
    if (driverId !== undefined && route.team_member_id !== driverId) return [];
    if (onlyReturns && route.leg === "GO") return [];
    if (!choicesCoverJobs(choices.filter(choice => choice.route_index === index && (vehicleId === undefined || choice.vehicle_id === vehicleId)), jobIds)) return [];
    return [{ value: index, label: manualRouteLabel({ ...route, team_member_name: context?.driver_names?.[String(route.team_member_id)] || route.team_member_name }, index) }];
  });

  // What each driver in the list would mean for this assignment, from the choices the back end already checked.
  const driverHint = (id: number) => {
    const own = driverChoices.filter(choice => choice.driver_id === id);
    const onTime = own.filter(choice => !choice.requires_working_time_extension);
    const usable = choicesCoverJobs(onTime, jobIds) ? onTime : own;
    const joins = usable.some(choice => choice.route_index !== null), fresh = usable.some(choice => choice.route_index === null);
    return [
      joins && fresh ? "Can join an existing trip or start a new one" : joins ? "Joins an existing trip" : fresh ? "Starts a new trip" : "",
      choicesCoverJobs(onTime, jobIds) ? "" : "Extra working time needed",
    ].filter(Boolean).join(" · ");
  };
  const fieldLabel = "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67]";

  return <Modal rootClassName="lang" open={opened} onCancel={busy === "save" ? undefined : close} closable={busy !== "save"} maskClosable={busy !== "save"}
    title={<span className="text-lg font-medium leading-6 text-[#12211A]">{title}</span>} width={560} centered
    footer={<div className="flex items-center justify-between gap-3">
      <p className="m-0 text-left text-xs leading-4 text-[#626E67]">{busy === "save" ? "" : preview ? "Nothing changes until you confirm." : ""}</p>
      <div className="flex shrink-0 justify-end gap-2">
        <Button onClick={close} disabled={busy === "save"}>Cancel</Button>
        <Button type="primary" icon={<Check size={15} />} onClick={assign} disabled={!preview || needsDriverChoice || !canCheck || Boolean(busy)} loading={Boolean(busy)}>
          {busy === "save" ? "Assigning…" : busy ? "Checking availability…" : workingTimeExtensions.length ? "Extend time & assign" : jobIds.length === 1 ? "Assign job" : `Assign ${jobIds.length} jobs`}
        </Button>
      </div>
    </div>}>
    <div className="space-y-5 pt-2">
      {/* 1. What is being assigned: the time first, then who and where, the same way the unassigned cards read. */}
      <div className="max-h-60 space-y-2 overflow-y-auto">
        {selected.map(job => {
          const trip = manualJobTrip(job);
          const summary = context?.job_summaries?.[String(job.id)];
          const loadingJob = !context && !job.job_type;
          const clock = /(\d{1,2}:\d{2} [AP]M)(.*)$/.exec(trip.timeLabel);
          const meaning = clock ? trip.timeLabel.slice(0, clock.index).replace(/\s*(at|from|:)\s*$/i, "").trim() : "";
          const DirectionIcon = trip.direction === "RETURN" ? ArrowLeft : trip.direction === "GO" ? ArrowRight : null;
          return <div key={job.id} className="flex items-start gap-3 bg-[#F3F6F4] p-3">
            <div className="w-[128px] shrink-0 whitespace-nowrap border-0 border-r border-solid border-[#D5DCD8] pr-3">
              {loadingJob ? <p className="m-0 text-xs text-[#626E67]">Loading job details…</p> : clock ? <>
                <div className="text-[17px] font-medium leading-6 tabular-nums text-[#12211A]">{clock[1]}</div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] font-medium leading-4 text-[#4A5750]">
                  {DirectionIcon && <DirectionIcon size={12} aria-hidden="true" className="shrink-0" />}<span>{meaning}</span>
                </div>
                {clock[2].trim() && <div className="text-[11px] leading-4 text-[#626E67]">{clock[2].trim()}</div>}
              </> : <p className="m-0 text-xs font-medium text-[#12211A]">{trip.timeLabel}</p>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <strong className="truncate text-sm font-medium text-[#12211A]">{manualJobLabel(job)} <span className="font-normal tabular-nums text-[#626E67]">#{job.id}</span></strong>
                {(trip.direction === "RETURN" || trip.direction === "GO") && <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">{trip.direction === "RETURN" ? "Return" : "Outbound"}</span>}
              </div>
              {summary?.pickup?.address && <TripPlaces from={summary.pickup.address} to={summary.dropoff?.address} labels wrap={selected.length === 1} className="mt-2" />}
              {summary?.required_driver_name && <p className="m-0 mt-1 text-xs leading-4 text-[#4A5750]">Required driver: <span className="font-medium text-[#12211A]">{summary.required_driver_name}</span></p>}
            </div>
          </div>;
        })}
      </div>

      {/* 2. Who takes it. Driver and vehicle side by side; the list says what each driver would mean. */}
      <div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block min-w-0"><span className={fieldLabel}>Driver</span>
            <Select className="w-full" showSearch optionFilterProp="label" aria-label="Driver for selected jobs"
              disabled={busy === "save" || busy === "load" || !availabilityReady} value={needsDriverChoice ? undefined : driverId ?? "recommend"}
              placeholder="Choose the intended driver" onChange={chooseDriver}
              notFoundContent="No drivers available for these job times"
              popupMatchSelectWidth={320}
              optionRender={option => <div className="py-0.5">
                <div className="text-[13px] leading-5 text-[#12211A]">{option.data.name ?? option.label}</div>
                {option.data.hint && <div className="text-xs leading-4 text-[#626E67]">{option.data.hint}</div>}
              </div>}
              options={[{ value: "recommend", label: "Recommend an available driver", name: "Recommend an available driver", hint: "Picks the driver and trip that fit the time", disabled: !choicesCoverJobs(driverChoices.filter(choice => !choice.requires_working_time_extension), jobIds) },
                ...(checkSelectedDriver && selectedDriverIsActive && driverUnavailable && driverId !== undefined ? [{ value: driverId, label: currentName || expectedName || `Driver #${driverId}`, name: currentName || expectedName || `Driver #${driverId}`, hint: "Full check requested" }] : []),
                ...drivers.map(driver => ({ value: driver.id, name: driver.name, hint: driverHint(driver.id), label: `${driver.name}${choicesCoverJobs(driverChoices.filter(choice => choice.driver_id === driver.id && !choice.requires_working_time_extension), jobIds) ? "" : " · Extra working time needed"}` }))]} />
          </label>
          <label className="block min-w-0"><span className={fieldLabel}>Vehicle</span>
            <Select className="w-full" aria-label="Available vehicle for selected jobs" allowClear showSearch optionFilterProp="label"
              value={vehicleId} disabled={busy === "save" || busy === "load" || !availabilityReady}
              placeholder={driverId === undefined ? "Chosen with the driver" : "Choose a compatible vehicle"}
              notFoundContent="No compatible vehicles available for these job times"
              onChange={value => { invalidate(); setVehicleId(value); }}
              options={vehicles.map(vehicle => ({ value: vehicle.id, label: `${vehicle.name} · ${vehicle.capacity} seats` }))} />
          </label>
        </div>
        <p className="m-0 mt-1.5 text-xs leading-4 text-[#626E67]">
          {availabilityReady ? `${drivers.length} ${drivers.length === 1 ? "driver" : "drivers"} and ${vehicles.length} ${vehicles.length === 1 ? "vehicle" : "vehicles"} passed the first availability check. ` : ""}Travel time and the full trip are checked next, before anything is assigned.
        </p>
      </div>

      {/* 3. What will happen, or what stands in the way. Always in this one place. */}
      <div className="space-y-3">
      {requiredDriverBlocked && <Alert type="warning" showIcon title="Required driver has no available match" description={<div>
        {requiredJobs.slice(0, 3).map(job => <p key={job.id} className="mb-1">Job #{job.id} requires <strong>{job.required_driver_name}</strong>.
          {job.required_driver_issue === "no_matching_qualifications" && <> No vehicle matches this driver’s saved driving qualifications. Check their qualifications in Settings.</>}
          {job.required_driver_issue === "not_active" && <> This driver is not active.</>}
          {job.required_driver_issue === "no_vehicles" && <> No vehicles are listed in the fleet.</>}
        </p>)}
        {requiredJobs.length > 3 && <p className="mb-1">{requiredJobs.length - 3} more selected jobs have a required driver.</p>}
        <p className="mb-2">Other drivers can take {jobIds.length === 1 ? "this job" : "these jobs"} if you also change {jobIds.length === 1 ? "its required driver" : "their required drivers"}.</p>
        <Button size="small" onClick={() => { invalidate(); setChangeFixedDriver(true); setAdvanced(["options"]); }} disabled={busy === "save"}>Allow another driver</Button>
      </div>} />}
      {driverUnavailable && !checkSelectedDriver && !requiredDriverBlocked ? <Alert type="warning" showIcon title="No quick match for this driver" description={<div>
        <p className="mb-2">The initial availability check could not find a trip for {expectedName || "this driver"}. A full check can explain any conflict and may find a placement or extra working time.</p>
        <div className="flex flex-wrap gap-2">{selectedDriverIsActive && !driverChanged && <Button size="small" disabled={Boolean(busy)} onClick={() => { invalidate(); setCheckSelectedDriver(true); }}>Check {expectedName || "this driver"}</Button>}
          {choicesCoverJobs(driverChoices.filter(choice => !choice.requires_working_time_extension), jobIds) && <Button size="small" disabled={Boolean(busy)} onClick={() => chooseDriver("recommend")}>Find another driver</Button>}</div>
      </div>} />
        : driverChanged && <Alert type="warning" showIcon title="This driver's name has changed" description={`The saved plan shows ${expectedName}, but the current roster shows ${currentName}. Choose the intended driver above before assigning this job.`} />}
      {context && !availabilityReady && <Alert type="warning" showIcon title="Availability could not be loaded" description="Refresh the plan to load available drivers and vehicles." />}
      {chooseExtraHoursDriver && !requiredDriverBlocked && <Alert type="info" showIcon title="Choose a driver"
        description="Select a driver to review the extra working time needed." />}
      {availabilityReady && !canCheck && !needsDriverChoice && !requiredDriverBlocked && !chooseExtraHoursDriver && <Alert type="info" showIcon title="No available match"
        description={<div>
          <p className="mb-1">No driver and vehicle match these job times.</p>
          {/* Say which driver the job is tied to, when it is: that is usually the reason nobody matches. */}
          {requiredJobs.slice(0, 3).map(job => <p key={job.id} className="mb-1">Job #{job.id} requires <strong>{job.required_driver_name}</strong>.
            {job.required_driver_issue === "no_matching_qualifications" && <> No vehicle matches this driver’s saved driving qualifications.</>}
            {job.required_driver_issue === "not_active" && <> This driver is not active.</>}
            {job.required_driver_issue === "no_vehicles" && <> No vehicles are listed in the fleet.</>}
          </p>)}
          {requiredJobs.length > 3 && <p className="mb-1">{requiredJobs.length - 3} more selected jobs have a required driver.</p>}
          {/* The ways around a block all live in More options. Say which are already on, and offer the rest in one click. */}
          {(() => {
            const canAllowDriver = requiredJobs.length > 0 && !changeFixedDriver;
            const canAddTime = !includeExtraHours;
            const canAnyTrip = placement !== "auto";
            const tried = [
              requiredJobs.length > 0 && changeFixedDriver ? "another driver allowed" : "",
              includeExtraHours ? "drivers with extra working time included" : "",
              placement === "new" ? "a separate trip" : placement === "existing" ? "a specific existing trip" : "",
            ].filter(Boolean);
            return <>
              {tried.length > 0 && <p className="mb-1">Already tried: {tried.join(", ")}.</p>}
              {canAllowDriver || canAddTime || canAnyTrip ? <div className="mt-2 flex flex-wrap gap-2">
                {canAllowDriver && <Button size="small" disabled={busy === "save"} onClick={() => { invalidate(); setChangeFixedDriver(true); setAdvanced(["options"]); }}>Allow another driver</Button>}
                {canAddTime && <Button size="small" disabled={busy === "save"} onClick={() => { invalidate(); setIncludeExtraHours(true); setAdvanced(["options"]); }}>Include drivers who need extra time</Button>}
                {canAnyTrip && <Button size="small" disabled={busy === "save"} onClick={() => { invalidate(); setPlacement("auto"); setRouteIndex(undefined); setVehicleId(undefined); }}>Let Syncnox choose the trip</Button>}
              </div> : <p className="mb-0 mt-1">
                These did not find a driver and vehicle either, so {jobIds.length === 1 ? "this job" : "these jobs"} cannot be assigned from this window as the plan stands.
                You can close it and add a driver or vehicle to the plan, change the job’s time, or use Create route.
              </p>}
            </>;
          })()}
        </div>} />}
      {busy && busy !== "save" && !needsDriverChoice && <div role="status" className="flex min-h-[72px] items-start gap-2.5 bg-[#F3F6F4] p-3 text-sm text-[#4A5750]">
        <Spin size="small" className="mt-0.5" />
        <div>
          <p className="m-0">Finding a trip for {currentName || expectedName || "an available driver"} at the job’s requested time…</p>
          {waited >= 10 && <p className="m-0 mt-1 text-xs text-[#626E67]">Still checking ({waited} seconds). This can take up to a minute. Nothing is assigned until you confirm, and you can cancel at any time.</p>}
        </div>
      </div>}
      {error && <Alert type="error" showIcon title={error.title} description={<div>
        <p className="mb-1">{error.message}</p><p className="mb-2">{error.action}</p>
        {error.attempts && <ul className="mb-3 space-y-2 pl-0 list-none">{error.attempts.map((attempt, index) => <li key={`${attempt.label}-${index}`} className="border border-solid border-red-200 bg-white/60 p-2">
          <strong>{attempt.label}</strong><div>{attempt.title}: {attempt.message}</div><div className="mt-1">{attempt.action}</div>
        </li>)}</ul>}
        <div className="flex flex-wrap gap-2"><Button size="small" disabled={Boolean(busy)} onClick={retry}>Check again</Button>{error.showChangeOptions && <Button size="small" disabled={Boolean(busy)} onClick={() => setAdvanced(["options"])}>More options</Button>}</div>
      </div>} />}

      {workingTimeExtensions.length > 0 && <Alert type="warning" showIcon title={`${extraWorkingMinutes} extra working ${extraWorkingMinutes === 1 ? "minute" : "minutes"} needed`}
        description={<div><p className="mb-2">You can extend working time for this trip and assign the job. The weekly roster stays the same.</p>
          <div className="max-h-40 overflow-y-auto space-y-2">{workingTimeExtensions.map((extension, index) => <div key={`${extension.driver_id}-${index}`}>
            <strong>{extension.driver_name}: +{extension.extra_minutes} {extension.extra_minutes === 1 ? "minute" : "minutes"}</strong>
            {extension.added_windows.map((window, slot) => <div key={slot} className="text-xs mt-1">Extra time: {window.start_at.slice(0, 10)} {formatRouteClock(window.start_at)} → {window.end_at.slice(0, 10)} {formatRouteClock(window.end_at)}</div>)}
          </div>)}</div>
          <p className="mt-2 mb-0">Choose “Extend time & assign” to approve these times and save the assignment.</p></div>} />}

      {preview && <div aria-live="polite" className="space-y-3">
        {changedRoutes.map(index => {
          const route = preview.result.routes[index];
          const selectedStops = route.stops.filter(stop => stop.job_id != null && jobIds.includes(stop.job_id));
          const longRides = otherLongRides(route.stops, jobIds);
          const others = new Set(route.stops.map(stop => stop.job_id).filter((id): id is number => id != null && !jobIds.includes(id))).size;
          const peak = peakLoad(route.stops);
          const seats = typeof route.vehicle_capacity === "number" ? route.vehicle_capacity : undefined;
          const tripKind = `${route.route_id ? "Joins an existing" : "New"} ${route.leg === "RETURN" ? "return trip" : route.leg === "GO" ? "outbound trip" : "trip"}`;
          return <div key={index} className="border border-solid border-[#B7D7C6] bg-[#F1F8F4] shadow-[inset_3px_0_0_#0B5D3B]">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
              <p className="m-0 text-[11px] font-medium uppercase tracking-[0.09em] text-[#0B5D3B]">What will happen</p>
              <p className="m-0 text-xs font-medium text-[#12211A]">{tripKind}</p>
            </div>
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-0 px-4 pt-2">
              <div className="min-w-0"><dt className="text-[11px] leading-4 text-[#626E67]">{driverId === undefined ? "Recommended driver" : "Driver"}</dt><dd className="m-0 truncate text-sm font-medium text-[#12211A]" title={route.team_member_name}>{route.team_member_name}</dd></div>
              <div className="min-w-0"><dt className="text-[11px] leading-4 text-[#626E67]">Vehicle</dt><dd className="m-0 truncate text-sm font-medium text-[#12211A]" title={route.vehicle_name || undefined}>{route.vehicle_name || "Not named"}{seats !== undefined && <span className="font-normal text-[#626E67]"> · {seats} seats</span>}</dd></div>
            </dl>
            <div className="mt-3 border-0 border-t border-solid border-[#D3E6DB] px-4 py-3">
              {jobIds.filter(id => selectedStops.some(stop => stop.job_id === id)).map(id => {
                const pickup = selectedStops.find(stop => stop.job_id === id && ["pickup", "job"].includes(stop.stop_type));
                const dropoff = selectedStops.find(stop => stop.job_id === id && stop.stop_type === "dropoff");
                const ride = rideWords(pickup?.arrival_time, dropoff?.arrival_time);
                const job = selected.find(item => item.id === id);
                // Compare the plan with what was asked: a return is asked for by its pickup, an outbound trip by when work starts.
                const late = job?.job_type === "return_only" ? minutesApart(pickup?.arrival_time, job.end_hour)
                  : job?.job_type === "one_way" ? minutesApart(dropoff?.arrival_time, job.start_hour) : undefined;
                const verdict = late === undefined ? null
                  : job?.job_type === "return_only"
                    ? late === 0 ? { text: "Picked up at the requested time", bad: false }
                      : late > 0 ? { text: `Picked up ${minuteWord(late)} after the requested time`, bad: false }
                        : { text: `Picked up ${minuteWord(-late)} before the requested time`, bad: true }
                    : late > 0 ? { text: `Arrives ${minuteWord(late)} after work starts`, bad: true }
                      : late === 0 ? { text: "Arrives as work starts", bad: false }
                        : { text: `Arrives ${minuteWord(-late)} before work starts`, bad: false };
                return <div key={id} className="mb-2 last:mb-0">
                  {jobIds.length > 1 && <p className="m-0 text-xs text-[#626E67]">{job ? manualJobLabel(job) : "Job"} <span className="tabular-nums">#{id}</span></p>}
                  <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[#12211A]">
                    {pickup && <span><span className="text-xs text-[#626E67]">Pickup </span><span className="text-[15px] font-medium tabular-nums">{formatRouteClock(pickup.arrival_time)}</span></span>}
                    {pickup && dropoff && <ArrowRight size={13} aria-hidden="true" className="self-center text-[#626E67]" />}
                    {dropoff && <span><span className="text-xs text-[#626E67]">Drop-off </span><span className="text-[15px] font-medium tabular-nums">{formatRouteClock(dropoff.arrival_time)}</span></span>}
                    {ride && <span className="text-xs text-[#626E67]">· {ride} ride</span>}
                  </p>
                  {verdict && <p className={`m-0 mt-0.5 text-xs leading-4 ${verdict.bad ? "font-medium text-[#C9372C]" : "text-[#4A5750]"}`}>{verdict.text}</p>}
                </div>;
              })}
            </div>
            <ul className="m-0 list-none space-y-1 border-0 border-t border-solid border-[#D3E6DB] px-4 py-3 text-xs leading-4 text-[#4A5750]">
              {peak > 0 && seats !== undefined && <li className={peak > seats ? "font-medium text-[#C9372C]" : ""}>Busiest point on this trip: {peak} of {seats} seats taken.</li>}
              {others > 0 && <li>Shares the trip with {others} other {others === 1 ? "passenger" : "passengers"}.</li>}
              {longRides.length > 0 && <li>Other rides over 2h: {longRides.slice(0, 3).map(ride => `#${ride.jobId} · ${ride.duration}`).join(", ")}{longRides.length > 3 ? ` and ${longRides.length - 3} more` : ""}</li>}
              {!route.route_id && <li>Assigning the job creates this trip automatically.</li>}
              {route.route_id && others === 0 && peak === 0 && <li>The job is added to this trip.</li>}
            </ul>
          </div>;
        })}
      </div>}
      </div>

      <Collapse ghost activeKey={advanced} onChange={keys => setAdvanced(Array.isArray(keys) ? keys : [keys])} items={[{
        key: "options", label: <span className="text-sm text-[#4A5750]">More options</span>, children: <div className="space-y-4 pb-1">
          <div><span className={fieldLabel}>Trip</span><Radio.Group value={placement} disabled={busy === "save"} onChange={event => { invalidate(); setPlacement(event.target.value); setRouteIndex(undefined); setVehicleId(undefined); }} className="!flex !flex-col gap-2"><Radio value="auto">Choose the right trip automatically</Radio><Radio value="existing">Choose a specific existing trip</Radio><Radio value="new">Create a separate trip</Radio></Radio.Group></div>
          {placement === "existing" && <label className="block"><span className={fieldLabel}>Existing trip times</span><Select className="w-full" value={routeIndex} disabled={busy === "save"} placeholder="Choose an existing trip" notFoundContent="No existing trip can take this job" options={existingOptions} onChange={index => { invalidate(); setCheckSelectedDriver(false); setRouteIndex(index); setVehicleId(undefined); setDriverId(routes[index].team_member_id); setExpectedName(context?.driver_names?.[String(routes[index].team_member_id)] || routes[index].team_member_name); }} /><p className="text-xs text-[#626E67] mt-1">These times describe the existing trip. The job’s pickup time is shown above.</p></label>}
          <div className="flex flex-col gap-2">
            <Checkbox checked={changeFixedDriver} disabled={busy === "save"} onChange={event => { invalidate(); setChangeFixedDriver(event.target.checked); }}>Also change {jobIds.length === 1 ? "this job’s required driver" : "the selected jobs’ required drivers"}</Checkbox>
            <Checkbox checked={includeExtraHours} disabled={busy === "save"} onChange={event => { invalidate(); setIncludeExtraHours(event.target.checked); }}>Show drivers who need extra working time</Checkbox>
          </div>
        </div>,
      }]} />
    </div>
  </Modal>;
}
