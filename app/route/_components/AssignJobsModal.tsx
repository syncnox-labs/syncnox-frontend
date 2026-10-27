"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Checkbox, Collapse, Modal, Radio, Select, Spin, Tag, message } from "antd";
import { ArrowRight, Check, MapPin } from "lucide-react";
import type { Route } from "@/types/routes.type";
import { useJobsStore } from "@/store/jobs.store";
import { useOptimizationStore } from "@/store/optimization.store";
import { useManualRoutingStore } from "@/store/manualRouting.store";
import { commitManualRouting, getManualRoutingContext, previewManualRouting, type ManualJobSummary, type ManualRoutingContext, type ManualRoutingPreview, type ManualRoutingRequest } from "@/apis/manualRouting.api";
import { assignmentProposal, formatRideDuration, formatRouteClock, manualJobLabel, manualJobTrip, manualRouteLabel, manualRoutingErrorInfo, otherLongRides } from "./manualRouting.utils";
import { choicesCoverJobs, filterAssignmentChoices } from "./assignmentChoices.utils";

const cleanName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

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
  const [advanced, setAdvanced] = useState<string[]>([]);
  const [preview, setPreview] = useState<ManualRoutingPreview | null>(null);
  const [busy, setBusy] = useState<"load" | "preview" | "save" | null>(null);
  const [error, setError] = useState<ReturnType<typeof manualRoutingErrorInfo>>();
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
  const canCheck = availabilityReady && choicesCoverJobs(selectedChoices, jobIds);
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
  const needsDriverChoice = driverChanged || driverUnavailable;
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
    setChangeFixedDriver(false); setIncludeExtraHours(false); setAdvanced([]); setContext(null); setPreview(null); setError(undefined); setBusy("load");
    saving.current = false;
    getManualRoutingContext(plan.id, jobIds).then(data => {
      if (session.current === current) { setContext(data); setBusy(null); }
    }).catch(reason => { if (session.current === current) { setError(manualRoutingErrorInfo(reason)); setBusy(null); } });
    return () => { session.current = current + 1; };
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
    invalidate(); setDriverId(id === "recommend" ? undefined : id);
    if (id === "recommend") setIncludeExtraHours(false);
    setExpectedName(id === "recommend" ? undefined : context?.driver_names?.[String(id)] || drivers.find(driver => driver.id === id)?.name);
    setPlacement("auto"); setRouteIndex(undefined); setVehicleId(undefined);
  };
  const retry = async () => {
    invalidate(); setBusy("load");
    const active = session.current;
    try { const data = await getManualRoutingContext(plan.id, jobIds); if (session.current === active) setContext(data); }
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

  return <Modal open={opened} onCancel={busy === "save" ? undefined : close} closable={busy !== "save"} maskClosable={busy !== "save"}
    title={title} width={560} centered
    footer={<div className="flex justify-end gap-2">
      <Button onClick={close} disabled={busy === "save"}>Cancel</Button>
      <Button type="primary" icon={<Check size={15} />} onClick={assign} disabled={!preview || needsDriverChoice || !canCheck || Boolean(busy)} loading={Boolean(busy)}>
        {busy === "save" ? "Assigning…" : busy ? "Checking availability…" : workingTimeExtensions.length ? "Extend time & assign" : preview?.updates_drivers ? "Assign & update driver" : jobIds.length === 1 ? "Assign job" : `Assign ${jobIds.length} jobs`}
      </Button>
    </div>}>
    <div className="space-y-4 pt-3">
      <div className="max-h-60 overflow-y-auto space-y-2">
        {selected.map(job => {
          const trip = manualJobTrip(job);
          const summary = context?.job_summaries?.[String(job.id)];
          return <div key={job.id} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-2"><strong className="text-sm text-slate-900">{manualJobLabel(job)} <span className="font-normal text-slate-500">#{job.id}</span></strong><Tag className="!mr-0" color={trip.direction === "RETURN" ? "purple" : "blue"}>{trip.direction}</Tag></div>
            <p className="font-semibold text-slate-800 mt-2 mb-0">{!context && !job.job_type ? "Loading job details…" : trip.timeLabel}</p>
            {summary?.pickup?.address && <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-500"><MapPin size={13} className="shrink-0" /><span>{summary.pickup.address}{summary.dropoff?.address && <><ArrowRight size={12} className="inline mx-1" />{summary.dropoff.address}</>}</span></div>}
          </div>;
        })}
      </div>

      <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1.5">Assign to</span>
        <Select className="w-full" showSearch optionFilterProp="label" aria-label="Driver for selected jobs"
          disabled={busy === "save" || busy === "load" || !availabilityReady} value={needsDriverChoice ? undefined : driverId ?? "recommend"}
          placeholder="Choose the intended driver" onChange={chooseDriver}
          notFoundContent="No drivers available for these job times"
          options={[{ value: "recommend", label: "Recommend an available driver", disabled: !choicesCoverJobs(driverChoices.filter(choice => !choice.requires_working_time_extension), jobIds) },
            ...drivers.map(driver => ({ value: driver.id, label: `${driver.name}${choicesCoverJobs(driverChoices.filter(choice => choice.driver_id === driver.id && !choice.requires_working_time_extension), jobIds) ? "" : " · Extra working time needed"}` }))]} />
      </label>
      <label className="block"><span className="block text-sm font-medium mb-1.5">Available vehicle</span>
        <Select className="w-full" aria-label="Available vehicle for selected jobs" allowClear showSearch optionFilterProp="label"
          value={vehicleId} disabled={busy === "save" || busy === "load" || !availabilityReady}
          placeholder={driverId === undefined ? "Choose automatically with the driver" : "Choose an available compatible vehicle"}
          notFoundContent="No compatible vehicles available for these job times"
          onChange={value => { invalidate(); setVehicleId(value); }}
          options={vehicles.map(vehicle => ({ value: vehicle.id, label: `${vehicle.name} · ${vehicle.capacity} seats` }))} />
        <p className="text-xs text-slate-500 mt-1 mb-0">Travel time and the full trip are checked before assignment.</p>
      </label>
      {requiredDriverBlocked && <Alert type="warning" showIcon title="Required driver has no available match" description={<div>
        {requiredJobs.slice(0, 3).map(job => <p key={job.id} className="mb-1">Job #{job.id} requires <strong>{job.required_driver_name}</strong>.
          {job.required_driver_issue === "no_matching_qualifications" && <> No vehicle matches this driver’s saved driving qualifications. Check their qualifications in Settings.</>}
          {job.required_driver_issue === "not_active" && <> This driver is not active.</>}
          {job.required_driver_issue === "no_vehicles" && <> No vehicles are listed in the fleet.</>}
        </p>)}
        {requiredJobs.length > 3 && <p className="mb-1">{requiredJobs.length - 3} more selected jobs have a required driver.</p>}
        <p className="mb-2">To choose another driver, open More options and select “Also change {jobIds.length === 1 ? "this job’s required driver" : "the selected jobs’ required drivers"}”.</p>
        <Button size="small" onClick={() => setAdvanced(["options"])} disabled={busy === "save"}>Open More options</Button>
      </div>} />}
      {driverUnavailable && !requiredDriverBlocked ? <Alert type="warning" showIcon title="No available trip for this driver" description={`No trip matches ${expectedName || "this driver"} and these job times. Choose another driver or review working time in More options.`} />
        : driverChanged && <Alert type="warning" showIcon title="This driver's name has changed" description={`The saved plan shows ${expectedName}, but the current roster shows ${currentName}. Choose the intended driver above before assigning this job.`} />}
      {context && !availabilityReady && <Alert type="warning" showIcon title="Availability could not be loaded" description="Refresh the plan to load available drivers and vehicles." />}
      {chooseExtraHoursDriver && !requiredDriverBlocked && <Alert type="info" showIcon title="Choose a driver"
        description="Select a driver to review the extra working time needed." />}
      {availabilityReady && !canCheck && !needsDriverChoice && !requiredDriverBlocked && !chooseExtraHoursDriver && <Alert type="info" showIcon title="No available match"
        description="No driver and vehicle match these job times. Review the required driver and working time in More options." />}
      {busy && busy !== "save" && !needsDriverChoice && <div role="status" className="flex gap-2 items-center rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><Spin size="small" />Finding a trip for {currentName || expectedName || "an available driver"} at the job’s requested time…</div>}
      {error && <Alert type="error" showIcon title={error.title} description={<div><p className="mb-1">{error.message}</p><p className="mb-2">{error.action}</p><div className="flex flex-wrap gap-2"><Button size="small" disabled={Boolean(busy)} onClick={retry}>Check again</Button>{error.showChangeOptions && <Button size="small" disabled={Boolean(busy)} onClick={() => setAdvanced(["options"])}>More options</Button>}</div></div>} />}

      {workingTimeExtensions.length > 0 && <Alert type="warning" showIcon title={`${extraWorkingMinutes} extra working ${extraWorkingMinutes === 1 ? "minute" : "minutes"} needed`}
        description={<div><p className="mb-2">You can extend working time for this trip and assign the job. The weekly roster stays the same.</p>
          <div className="max-h-40 overflow-y-auto space-y-2">{workingTimeExtensions.map((extension, index) => <div key={`${extension.driver_id}-${index}`}>
            <strong>{extension.driver_name}: +{extension.extra_minutes} {extension.extra_minutes === 1 ? "minute" : "minutes"}</strong>
            {extension.added_windows.map((window, slot) => <div key={slot} className="text-xs mt-1">Extra time: {window.start_at.slice(0, 10)} {formatRouteClock(window.start_at)} → {window.end_at.slice(0, 10)} {formatRouteClock(window.end_at)}</div>)}
          </div>)}</div>
          <p className="mt-2 mb-0">Choose “Extend time & assign” to approve these times and save the assignment.</p></div>} />}

      {preview && <div aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
        {changedRoutes.map(index => {
          const route = preview.result.routes[index];
          const selectedStops = route.stops.filter(stop => stop.job_id != null && jobIds.includes(stop.job_id));
          const longRides = otherLongRides(route.stops, jobIds);
          return <div key={index}><div className="font-semibold text-sm text-emerald-950">{route.route_id ? "Existing" : "New"} {route.leg === "RETURN" ? "return trip" : route.leg === "GO" ? "outbound trip" : "trip"}</div>
            <p className="mt-1 mb-0 text-sm text-slate-700">{route.team_member_name}{route.vehicle_name ? ` · ${route.vehicle_name}` : ""}</p>
            {jobIds.filter(id => selectedStops.some(stop => stop.job_id === id)).map(id => {
              const pickup = selectedStops.find(stop => stop.job_id === id && ["pickup", "job"].includes(stop.stop_type));
              const dropoff = selectedStops.find(stop => stop.job_id === id && stop.stop_type === "dropoff");
              const ride = formatRideDuration(pickup?.arrival_time, dropoff?.arrival_time);
              return <p key={id} className="text-xs text-slate-600 mt-1 mb-0">{jobIds.length > 1 ? `#${id} · ` : ""}{pickup ? `Pickup ${formatRouteClock(pickup.arrival_time)}` : ""}{dropoff ? ` → Drop-off ${formatRouteClock(dropoff.arrival_time)}` : ""}{ride ? ` · Ride ${ride}` : ""}</p>;
            })}
            {longRides.length > 0 && <p className="text-xs text-slate-600 mt-1 mb-0">Other rides over 2h: {longRides.slice(0, 3).map(ride => `#${ride.jobId} · ${ride.duration}`).join(", ")}{longRides.length > 3 ? ` and ${longRides.length - 3} more` : ""}</p>}
            {!route.route_id && <p className="mt-2 mb-0 text-xs text-emerald-800">Assigning the job creates this trip automatically.</p>}
          </div>;
        })}
      </div>}

      <Collapse ghost activeKey={advanced} onChange={keys => setAdvanced(Array.isArray(keys) ? keys : [keys])} items={[{
        key: "options", label: <span className="text-sm text-slate-600">More options</span>, children: <div className="space-y-4 pb-1">
          <div><span className="block text-sm font-medium mb-2">Trip</span><Radio.Group value={placement} disabled={busy === "save"} onChange={event => { invalidate(); setPlacement(event.target.value); setRouteIndex(undefined); setVehicleId(undefined); }} className="!flex !flex-col gap-2"><Radio value="auto">Choose the right trip automatically</Radio><Radio value="existing">Choose a specific existing trip</Radio><Radio value="new">Create a separate trip</Radio></Radio.Group></div>
          {placement === "existing" && <label className="block"><span className="block text-sm font-medium mb-1.5">Existing trip times</span><Select className="w-full" value={routeIndex} disabled={busy === "save"} placeholder="Choose an existing trip" options={existingOptions} onChange={index => { invalidate(); setRouteIndex(index); setVehicleId(undefined); setDriverId(routes[index].team_member_id); setExpectedName(context?.driver_names?.[String(routes[index].team_member_id)] || routes[index].team_member_name); }} /><p className="text-xs text-slate-500 mt-1">These times describe the existing trip. The job’s pickup time is shown above.</p></label>}
          <Checkbox checked={changeFixedDriver} disabled={busy === "save"} onChange={event => { invalidate(); setChangeFixedDriver(event.target.checked); }}>Also change {jobIds.length === 1 ? "this job’s required driver" : "the selected jobs’ required drivers"}</Checkbox>
          <Checkbox checked={includeExtraHours} disabled={busy === "save"} onChange={event => { invalidate(); setIncludeExtraHours(event.target.checked); }}>Show drivers who need extra working time</Checkbox>
        </div>,
      }]} />
    </div>
  </Modal>;
}
