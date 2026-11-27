"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Modal, Button, Input, Select, Checkbox, message, Switch } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { Car, Users } from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import { getRouteColor } from "@/utils/timeline.utils";
import { StopArrowSvg, EditedMark } from "./TimelineStopArrow";
import { legJobIds, type TransferSelection } from "./transferStops.utils";
import { tripLabel } from "./tripLabel.utils";

export interface TransferStopItem {
  key: string;
  job_id: number;
  stop_type: string;
  address_formatted?: string;
  arrival_time?: string;
  candidate_name?: string;
  candidate_phone?: string;
  is_new?: boolean;
  time_edited?: boolean;
  originalIndex: number;
  rawStop: any;
}

interface TransferStopsModalProps {
  open: boolean;
  sourceRouteIndex: number | null;
  routes: any[];
  jobs?: Job[];
  onClose: () => void;
  onTransfer: (
    sourceRouteIndex: number,
    targetRouteIndex: number,
    jobIds: number[],
    targetPosition?: number,
    reoptimize?: boolean,
    selection?: TransferSelection,
  ) => Promise<void> | void;
  initialSelectedJobIds?: number[];
}

const TransferStopsModal: React.FC<TransferStopsModalProps> = ({
  open,
  sourceRouteIndex,
  routes,
  jobs = [],
  onClose,
  onTransfer,
  initialSelectedJobIds = [],
}) => {
  const [targetRouteIndex, setTargetRouteIndex] = useState<number | null>(null);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number | null>(null);
  const activeSourceIndex = selectedSourceIndex ?? sourceRouteIndex;
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [autoSelectLinkedStops, setAutoSelectLinkedStops] = useState(true);
  const [reoptimize, setReoptimize] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const transferInFlight = useRef(false);
  const [scope, setScope] = useState<"jobs" | "leg">("jobs");
  const [transferLeg, setTransferLeg] = useState<"GO" | "RETURN">("GO");

  const jobsByIdMap = useMemo(() => {
    const map = new Map<number, Job>();
    jobs.forEach((j) => map.set(Number(j.id), j));
    return map;
  }, [jobs]);

  const sourceRoute = useMemo(() => {
    if (activeSourceIndex === null || !routes || !routes[activeSourceIndex]) return null;
    return routes[activeSourceIndex];
  }, [activeSourceIndex, routes]);
  useEffect(() => { setSelectedSourceIndex(sourceRouteIndex); }, [open, sourceRouteIndex]);

  // Extract non-depot stops from source route
  const stopsList = useMemo<TransferStopItem[]>(() => {
    if (!sourceRoute?.stops) return [];

    return sourceRoute.stops
      .map((s: any, idx: number) => {
        const isDepot =
          s.stop_type === "depot_start" ||
          s.stop_type === "depot_end" ||
          s.stop_type?.startsWith("depot");
        if (isDepot || !s.job_id) return null;

        const jobId = Number(s.job_id);
        const fullJob: any = jobsByIdMap.get(jobId);

        const candName =
          s.candidate_name ||
          fullJob?.worker_shuttle_detail?.candidate_name ||
          fullJob?.candidate_name ||
          fullJob?.custom_fields?.candidate_name ||
          (fullJob?.first_name || fullJob?.last_name
            ? `${fullJob.first_name || ""} ${fullJob.last_name || ""}`.trim()
            : null);

        const candPhone =
          s.candidate_phone ||
          fullJob?.worker_shuttle_detail?.candidate_phone ||
          fullJob?.worker_shuttle_detail?.client_phone ||
          fullJob?.phone_number;

        return {
          key: `stop-${idx}-${jobId}`,
          job_id: jobId,
          stop_type: s.stop_type || "job",
          address_formatted: s.address_formatted || fullJob?.address || `Stop #${idx + 1}`,
          arrival_time: s.arrival_time,
          candidate_name: candName || undefined,
          candidate_phone: candPhone || undefined,
          is_new: Boolean(s.is_new),
          time_edited: Boolean(s.time_edited),
          originalIndex: idx,
          rawStop: s,
        };
      })
      .filter(Boolean) as TransferStopItem[];
  }, [sourceRoute, jobsByIdMap]);

  // Initialize selected jobs & default target route
  const initialJobIdsKey = initialSelectedJobIds.join(",");
  useEffect(() => {
    if (open) {
      setSearchTerm("");
      setScope("jobs");
      setReoptimize(false);
      setTransferLeg(routes[activeSourceIndex ?? -1]?.leg === "RETURN" ? "RETURN" : "GO");

      if (initialSelectedJobIds && initialSelectedJobIds.length > 0) {
        const available = new Set((routes[activeSourceIndex ?? -1]?.stops || []).map((stop: any) => Number(stop.job_id)));
        setSelectedJobIds(new Set(initialSelectedJobIds.filter(id => available.has(id))));
      } else {
        setSelectedJobIds(new Set());
      }

      // Default target driver to the first available other driver
      if (routes && routes.length > 1 && activeSourceIndex !== null) {
        const firstOtherIdx = routes.findIndex((item, idx) => idx !== activeSourceIndex && item.team_member_id !== routes[activeSourceIndex]?.team_member_id);
        setTargetRouteIndex(firstOtherIdx >= 0 ? firstOtherIdx : null);
      } else {
        setTargetRouteIndex(null);
      }
    }
  }, [open, activeSourceIndex, routes, initialJobIdsKey]);

  const targetRoute = useMemo(() => {
    if (targetRouteIndex === null || !routes || !routes[targetRouteIndex]) return null;
    return routes[targetRouteIndex];
  }, [targetRouteIndex, routes]);
  const effectiveJobIds = useMemo(() => scope === "leg"
    ? new Set(legJobIds(sourceRoute, jobs, transferLeg)) : selectedJobIds,
  [scope, sourceRoute, jobs, transferLeg, selectedJobIds]);

  // One row per job: its pickup and drop-off always move together.
  const jobGroups = useMemo(() => {
    const byJob = new Map<number, { job_id: number; name?: string; stops: TransferStopItem[] }>();
    stopsList.forEach(item => {
      const group = byJob.get(item.job_id) ?? { job_id: item.job_id, name: item.candidate_name, stops: [] };
      group.stops.push(item);
      group.name = group.name || item.candidate_name;
      byJob.set(item.job_id, group);
    });
    return [...byJob.values()];
  }, [stopsList]);

  const filteredGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return jobGroups;
    return jobGroups.filter(group => String(group.job_id).includes(q)
      || group.name?.toLowerCase().includes(q)
      || group.stops.some(stop => stop.address_formatted?.toLowerCase().includes(q)));
  }, [jobGroups, searchTerm]);

  // Toggle selection for a stop
  const toggleJobSelection = (jobId: number) => {
    if (transferInFlight.current) return;
    setScope("jobs");
    setSelectedJobIds(() => {
      const next = new Set(effectiveJobIds);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setScope("jobs");
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      filteredGroups.forEach((group) => next.add(group.job_id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setScope("jobs");
    setSelectedJobIds(new Set());
  };

  const handleConfirmTransfer = async () => {
    if (transferInFlight.current) return;
    if (activeSourceIndex === null || targetRouteIndex === null) {
      message.error("Please choose a destination driver.");
      return;
    }
    if (activeSourceIndex === targetRouteIndex) {
      message.error("Destination driver must be different from source driver.");
      return;
    }
    if (effectiveJobIds.size === 0) {
      message.error("Please select at least one stop to transfer.");
      return;
    }

    try {
      transferInFlight.current = true;
      setIsSubmitting(true);
      await onTransfer(
        activeSourceIndex,
        targetRouteIndex,
        Array.from(effectiveJobIds),
        undefined,
        reoptimize,
        { scope, leg: scope === "leg" ? transferLeg : undefined },
      );
      onClose();
    } catch (err: any) {
      console.error("Transfer error:", err);
    } finally {
      transferInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const sourceColor = activeSourceIndex !== null ? getRouteColor(activeSourceIndex) : "#003220";
  const targetColor = targetRouteIndex !== null ? getRouteColor(targetRouteIndex) : "#3b82f6";

  const allFilteredSelected =
    filteredGroups.length > 0 && filteredGroups.every((group) => effectiveJobIds.has(group.job_id));

  // Count total selected stops (including linked pickups and dropoffs)
  const selectedStopsCount = stopsList.filter((s) => effectiveJobIds.has(s.job_id)).length;

  const targetName = targetRoute?.team_member_name || "the other driver";
  const canMove = effectiveJobIds.size > 0 && targetRouteIndex !== null && targetRouteIndex !== activeSourceIndex;
  const clock = (value?: string) => value && dayjs(value).isValid() ? dayjs(value).format("h:mm A") : "Time not set";

  return (
    <Modal
      open={open}
      onCancel={isSubmitting ? undefined : onClose}
      closable={!isSubmitting}
      maskClosable={!isSubmitting}
      width={760}
      centered
      destroyOnHidden
      rootClassName="lang"
      title={<div>
        <div className="text-[16px] font-medium text-[#12211A]">Move jobs to another driver</div>
        <div className="mt-0.5 text-[12px] font-normal text-[#4A5750]">Each job&apos;s pickup and drop-off move together. Planned times stay as they are until the route is re-optimized.</div>
      </div>}
      styles={{ body: { maxHeight: "calc(100dvh - 260px)", overflowY: "auto" } }}
      footer={<div className="flex flex-col gap-3 border-t border-[#E3E8E5] pt-3 text-left">
        <label htmlFor="reoptimize-switch" className="flex cursor-pointer items-start gap-2.5">
          <Switch size="small" checked={reoptimize} onChange={setReoptimize} id="reoptimize-switch" disabled={isSubmitting} className="mt-0.5" />
          <span>
            <span className="block text-[13px] text-[#12211A]">Re-optimize {targetRoute ? `${targetName}'s` : "the receiving"} route after the move</span>
            <span className="block text-[12px] text-[#626E67]">{reoptimize ? "The new stop order and times are worked out for that route." : "The jobs keep their planned times; re-optimize later to fit them in."}</span>
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-[12px] text-[#4A5750] tabular-nums" aria-live="polite">
            {effectiveJobIds.size > 0 ? `${effectiveJobIds.size} ${effectiveJobIds.size === 1 ? "job" : "jobs"} · ${selectedStopsCount} stops selected` : "No jobs selected"}
          </span>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="primary" onClick={handleConfirmTransfer} loading={isSubmitting} disabled={!canMove}>
            {`${effectiveJobIds.size > 0 ? `Move ${effectiveJobIds.size} ${effectiveJobIds.size === 1 ? "job" : "jobs"}` : "Move jobs"}${targetRoute ? ` to ${targetName}` : ""}`}
          </Button>
        </div>
      </div>}
    >
      <div className="flex flex-col gap-4">
        {/* From → To */}
        <div className="grid grid-cols-1 items-stretch gap-2 md:grid-cols-[1fr_auto_1fr]">
          <div className="min-w-0 border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2.5" style={{ boxShadow: `inset 3px 0 0 ${sourceColor}` }}>
            <div className="text-[11px] uppercase tracking-wide text-[#626E67]">From</div>
            <div className="mt-0.5 truncate text-[14px] font-medium text-[#12211A]">{sourceRoute?.team_member_name || "Driver name unavailable"}</div>
            <Select aria-label="Trip to move jobs from" size="small" className="mt-1.5 w-full" value={activeSourceIndex}
              disabled={isSubmitting} onChange={setSelectedSourceIndex} popupMatchSelectWidth={false}
              options={routes.map((trip, index) => ({ trip, index })).filter(({ trip }) => trip.team_member_id === sourceRoute?.team_member_id)
                .map(({ trip, index }) => ({ value: index, label: tripLabel(trip, { driver: false }) }))} />
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#626E67]">
              <span>{jobGroups.length} {jobGroups.length === 1 ? "job" : "jobs"}</span>
              {sourceRoute?.vehicle_name && <><span aria-hidden="true">·</span><Car size={13} aria-hidden="true" /><span className="truncate">{sourceRoute.vehicle_name}</span></>}
            </div>
          </div>
          <span aria-hidden="true" className="self-center justify-self-center text-[18px] leading-none text-[#626E67]">→</span>
          <div className="min-w-0 border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2.5" style={{ boxShadow: `inset 3px 0 0 ${targetRoute ? targetColor : "#C4CCC7"}` }}>
            <div className="text-[11px] uppercase tracking-wide text-[#626E67]">To</div>
            <div className={`mt-0.5 truncate text-[14px] font-medium ${targetRoute ? "text-[#12211A]" : "text-[#626E67]"}`}>{targetRoute ? targetName : "Choose a driver"}</div>
            <Select aria-label="Driver and trip to move jobs to" disabled={isSubmitting} value={targetRouteIndex}
              onChange={(val) => setTargetRouteIndex(val)} placeholder="Search a driver" className="mt-1.5 w-full" size="small"
              labelRender={({ value }) => tripLabel(routes[Number(value)], { driver: false })}
              showSearch optionFilterProp="search" popupMatchSelectWidth={false}
              options={routes.map((r, idx) => ({
                value: idx,
                search: tripLabel(r, { vehicle: true }),
                disabled: idx === sourceRouteIndex || r.team_member_id === sourceRoute?.team_member_id,
                label: <span className="flex items-center justify-between gap-3">
                  <span className="truncate">{tripLabel(r, { vehicle: true })}</span>
                  <span className="shrink-0 text-[11px] text-[#626E67]">{new Set((r.stops || []).filter((stop: any) => stop.job_id).map((stop: any) => stop.job_id)).size} jobs</span>
                </span>,
              }))} />
            {targetRoute && <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#626E67]">
              <span>{new Set((targetRoute.stops || []).filter((stop: any) => stop.job_id).map((stop: any) => stop.job_id)).size} jobs now</span>
              {targetRoute.vehicle_name && <><span aria-hidden="true">·</span><Car size={13} aria-hidden="true" /><span className="truncate">{targetRoute.vehicle_name}</span></>}
            </div>}
          </div>
        </div>

        {/* What to move */}
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="What to move" className="inline-flex border border-[#D5DCD8]">
            {(["jobs", "leg"] as const).map(value => (
              <button key={value} type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)} disabled={isSubmitting}
                className={`h-8 border-0 px-3 text-[12px] cursor-pointer ${scope === value ? "bg-[#003220] text-white" : "bg-white text-[#4A5750] hover:text-[#12211A]"}`}>
                {value === "jobs" ? "Choose jobs" : "A whole direction"}
              </button>
            ))}
          </div>
          {scope === "leg" && <Select value={transferLeg} onChange={setTransferLeg} size="small" disabled={isSubmitting} aria-label="Direction to move"
            options={(["GO", "RETURN"] as const).map(leg => ({ value: leg, label: `${leg === "GO" ? "Outbound trip" : "Return trip"} (${legJobIds(sourceRoute, jobs, leg).length} jobs)`,
              disabled: legJobIds(sourceRoute, jobs, leg).length === 0 }))} />}
          <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 sm:flex-none">
            <Input size="small" placeholder="Search name, address or job #" aria-label="Search jobs"
              prefix={<SearchOutlined className="text-[#626E67]" />} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} allowClear />
            <button type="button" onClick={allFilteredSelected ? handleDeselectAll : handleSelectAllFiltered} disabled={isSubmitting || !filteredGroups.length}
              className="shrink-0 border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline disabled:cursor-not-allowed disabled:opacity-50">
              {allFilteredSelected ? "Clear" : searchTerm ? "Select shown" : "Select all"}
            </button>
          </div>
        </div>

        {/* Jobs */}
        <ul className="m-0 list-none border border-[#E3E8E5] p-0" aria-label="Jobs on this trip">
          {filteredGroups.length === 0 ? (
            <li className="py-10 text-center text-[#626E67]">
              <Users className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
              <div className="text-[13px]">{searchTerm ? "No job matches this search." : "This trip has no jobs."}</div>
            </li>
          ) : filteredGroups.map(group => {
            const isSelected = effectiveJobIds.has(group.job_id);
            const ordered = [...group.stops].sort((a, b) => a.originalIndex - b.originalIndex);
            return <li key={group.job_id} className="border-b border-[#E3E8E5] last:border-b-0">
              <label className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${isSelected ? "bg-[#F1F8F4] shadow-[inset_3px_0_0_#003220]" : "bg-white hover:bg-[#F8FAF9]"}`}>
                <Checkbox checked={isSelected} onChange={() => toggleJobSelection(group.job_id)} className="mt-0.5" disabled={isSubmitting} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-[13px] font-medium text-[#12211A]">{group.name || `Job #${group.job_id}`}</span>
                    <span className="text-[12px] text-[#626E67] tabular-nums">Job #{group.job_id}</span>
                    {group.stops.some(stop => stop.is_new) && <span className="text-[11px] text-[#0B5D3B]">New</span>}
                    {group.stops.some(stop => stop.time_edited) && <span className="inline-flex items-center gap-1 text-[11px] text-[#4A5750]"><EditedMark size={11} />Edited</span>}
                  </span>
                  <span className="mt-1 grid gap-1">
                    {ordered.map(stop => {
                      const pickup = stop.stop_type === "pickup" || stop.stop_type === "pick_up";
                      return <span key={stop.key} className="grid grid-cols-[16px_128px_1fr] items-center gap-2 text-[12px]">
                        <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center"><span className="inline-flex scale-[0.45]">
                          <StopArrowSvg isPickup={pickup} displayIndex="" fill="#fff" stroke="#0B5D3B" textColor="#0B5D3B" /></span></span>
                        <span className="tabular-nums"><span className="text-[#626E67]">{pickup ? "Pickup" : "Drop-off"}</span> <span className="text-[#12211A]">{clock(stop.arrival_time)}</span></span>
                        <span className="truncate text-[#4A5750]" title={stop.address_formatted}>{stop.address_formatted}</span>
                      </span>;
                    })}
                  </span>
                </span>
              </label>
            </li>;
          })}
        </ul>
      </div>
    </Modal>
  );
};

export default TransferStopsModal;
