"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Modal, Button, Tooltip, Input, Popconfirm } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined, DeleteOutlined, SearchOutlined } from "@ant-design/icons";
import { GripVertical, House, Flag, Lock } from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import { formatTime12h } from "@/utils/app.utils";
import { getRouteColor } from "@/utils/timeline.utils";
import { StopArrowSvg, EditedMark } from "./TimelineStopArrow";

export interface ReorderStopItem {
  id: string | number;
  job_id: number;
  stop_type: string;
  address_formatted?: string;
  arrival_time?: string;
  candidate_name?: string;
  passenger_count?: number;
  is_new?: boolean;
  time_edited?: boolean;
  rawStop: any;
  originalIndex: number;
}

interface ReorderStopsModalProps {
  open: boolean;
  routeIndex: number | null;
  routeData: any | null;
  jobs?: Job[];
  onClose: () => void;
  onSave: (
    routeIndex: number,
    orderedJobIds: number[],
    orderedStopIndices?: number[],
    orderedStops?: any[]
  ) => Promise<void> | void;
  onSaveAndReOptimize?: (
    routeIndex: number,
    orderedJobIds: number[],
    orderedStopIndices?: number[],
    orderedStops?: any[]
  ) => Promise<void> | void;
  onRemoveStop?: (routeIndex: number, jobId: number) => Promise<void> | void;
}

const ReorderStopsModal: React.FC<ReorderStopsModalProps> = ({
  open,
  routeIndex,
  routeData,
  jobs = [],
  onClose,
  onSave,
  onSaveAndReOptimize,
  onRemoveStop,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [stopsList, setStopsList] = useState<ReorderStopItem[]>([]);
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReoptimizing, setIsReoptimizing] = useState(false);

  const jobsByIdMap = useMemo(() => {
    const map = new Map<number, Job>();
    jobs.forEach((j) => map.set(Number(j.id), j));
    return map;
  }, [jobs]);

  const resolveCandidateName = (stop: any): string | null => {
    const jobId = stop?.job_id;
    const fullJob: any = jobId ? jobsByIdMap.get(Number(jobId)) : null;
    return (
      fullJob?.worker_shuttle_detail?.candidate_name ||
      fullJob?.candidate_name ||
      fullJob?.custom_fields?.candidate_name ||
      (fullJob?.first_name || fullJob?.last_name
        ? `${fullJob.first_name || ""} ${fullJob.last_name || ""}`.trim()
        : null) ||
      stop?.candidate_name ||
      null
    );
  };

  // Extract non-depot stops when routeData changes
  useEffect(() => {
    if (!routeData || !routeData.stops) {
      setStopsList([]);
      return;
    }

    const nonDepotStops: ReorderStopItem[] = [];
    routeData.stops.forEach((s: any, idx: number) => {
      const isDepot =
        s.stop_type === "depot" ||
        s.stop_type === "depot_start" ||
        s.stop_type === "depot_end";

      if (!isDepot && s.job_id) {
        nonDepotStops.push({
          id: `${s.job_id}-${s.stop_type}-${idx}`,
          job_id: Number(s.job_id),
          stop_type: s.stop_type || "job",
          address_formatted: s.address_formatted || "",
          arrival_time: s.arrival_time,
          candidate_name: resolveCandidateName(s) || undefined,
          passenger_count: s.passenger_count || 1,
          is_new: Boolean(s.is_new),
          time_edited: Boolean(s.time_edited || s.is_edited),
          rawStop: s,
          originalIndex: idx,
        });
      }
    });

    setStopsList(nonDepotStops);
    setSearchTerm("");
  }, [routeData, open]);

  const depotStart = useMemo(() => {
    return routeData?.stops?.find((s: any) => s.stop_type === "depot_start" || (s.stop_type === "depot" && s === routeData.stops[0]));
  }, [routeData]);

  const depotEnd = useMemo(() => {
    if (!routeData?.stops || routeData.stops.length <= 1) return null;
    const last = routeData.stops[routeData.stops.length - 1];
    return last?.stop_type === "depot_end" || last?.stop_type === "depot" ? last : null;
  }, [routeData]);

  const driverName =
    routeData?.team_member_name ||
    "Driver name unavailable";
  const routeColor = routeIndex !== null ? getRouteColor(routeIndex) : "#003220";

  // Check if order has changed from initial
  const isOrderChanged = useMemo(() => {
    if (!routeData?.stops) return false;
    const initialJobIds: number[] = [];
    routeData.stops.forEach((s: any) => {
      const isDepot =
        s.stop_type === "depot" ||
        s.stop_type === "depot_start" ||
        s.stop_type === "depot_end";
      if (!isDepot && s.job_id) initialJobIds.push(Number(s.job_id));
    });

    if (initialJobIds.length !== stopsList.length) return true;
    return stopsList.some((s, i) => s.job_id !== initialJobIds[i]);
  }, [routeData, stopsList]);

  // Where each stop sat when the dialog opened, to mark what moved.
  const startPosition = useMemo(() => {
    const map = new Map<number, number>();
    (routeData?.stops || []).filter((s: any) => s.job_id && !String(s.stop_type || "").startsWith("depot"))
      .forEach((s: any, i: number) => { const idx = routeData.stops.indexOf(s); map.set(idx, i); });
    return map;
  }, [routeData]);

  // A drop-off can never come before its own pickup.
  const outOfOrder = useMemo(() => {
    const bad = new Set<number>();
    const pickupAt = new Map<number, number>();
    stopsList.forEach((s, i) => { if (s.stop_type === "pickup" || s.stop_type === "pick_up") pickupAt.set(s.job_id, i); });
    stopsList.forEach((s, i) => {
      if ((s.stop_type === "dropoff" || s.stop_type === "drop_off") && pickupAt.has(s.job_id) && pickupAt.get(s.job_id)! > i) bad.add(s.job_id);
    });
    return bad;
  }, [stopsList]);

  const [announcement, setAnnouncement] = useState("");
  const announceMove = (item: ReorderStopItem | undefined, to: number) => {
    if (item) setAnnouncement(`Job #${item.job_id} ${item.stop_type === "pickup" ? "pickup" : "drop-off"} moved to position ${to + 1} of ${stopsList.length}.`);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${index}`);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === targetIndex) {
      setDraggedItemIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...stopsList];
    const [movedItem] = updated.splice(draggedItemIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setStopsList(updated);
    announceMove(movedItem, targetIndex);
    setDraggedItemIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedItemIndex(null);
    setDragOverIndex(null);
  };

  // Move up / down buttons
  const moveUp = (index: number) => {
    if (index <= 0) return;
    const updated = [...stopsList];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    setStopsList(updated);
    announceMove(temp, index - 1);
  };

  const moveDown = (index: number) => {
    if (index >= stopsList.length - 1) return;
    const updated = [...stopsList];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setStopsList(updated);
    announceMove(temp, index + 1);
  };

  // Reset order to original
  const handleReset = () => {
    if (!routeData?.stops) return;
    const initial: ReorderStopItem[] = [];
    routeData.stops.forEach((s: any, idx: number) => {
      const isDepot =
        s.stop_type === "depot" ||
        s.stop_type === "depot_start" ||
        s.stop_type === "depot_end";
      if (!isDepot && s.job_id) {
        initial.push({
          id: `${s.job_id}-${s.stop_type}-${idx}`,
          job_id: Number(s.job_id),
          stop_type: s.stop_type || "job",
          address_formatted: s.address_formatted || "",
          arrival_time: s.arrival_time,
          candidate_name: resolveCandidateName(s) || undefined,
          passenger_count: s.passenger_count || 1,
          is_new: Boolean(s.is_new),
          time_edited: Boolean(s.time_edited || s.is_edited),
          rawStop: s,
          originalIndex: idx,
        });
      }
    });
    setStopsList(initial);
    setAnnouncement("Stop order reset.");
  };

  const handleSaveOrder = async () => {
    if (routeIndex === null) return;
    const orderedJobIds = stopsList.map((s) => s.job_id);
    const orderedStopIndices = stopsList.map((s) => s.originalIndex);
    const orderedStops = stopsList.map((s) => ({ job_id: s.job_id, stop_type: s.stop_type }));
    try {
      setIsSaving(true);
      await onSave(routeIndex, orderedJobIds, orderedStopIndices, orderedStops);
      onClose();
    } catch (err: any) {
      // Error handled by parent
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndReoptimize = async () => {
    if (routeIndex === null || !onSaveAndReOptimize) return;
    const orderedJobIds = stopsList.map((s) => s.job_id);
    const orderedStopIndices = stopsList.map((s) => s.originalIndex);
    const orderedStops = stopsList.map((s) => ({ job_id: s.job_id, stop_type: s.stop_type }));
    try {
      setIsReoptimizing(true);
      await onSaveAndReOptimize(routeIndex, orderedJobIds, orderedStopIndices, orderedStops);
      onClose();
    } catch (err: any) {
      // Error handled by parent
    } finally {
      setIsReoptimizing(false);
    }
  };

  const handleRemove = async (jobId: number) => {
    if (routeIndex === null || !onRemoveStop) return;
    try {
      await onRemoveStop(routeIndex, jobId);
      setStopsList((prev) => prev.filter((s) => s.job_id !== jobId));
    } catch (err) {
      // Handled in parent
    }
  };

  const filteredStops = useMemo(() => {
    if (!searchTerm.trim()) return stopsList;
    const term = searchTerm.toLowerCase();
    return stopsList.filter(
      (s) =>
        s.job_id.toString().includes(term) ||
        (s.candidate_name && s.candidate_name.toLowerCase().includes(term)) ||
        (s.address_formatted && s.address_formatted.toLowerCase().includes(term)) ||
        s.stop_type.toLowerCase().includes(term)
    );
  }, [stopsList, searchTerm]);

  const busy = isSaving || isReoptimizing;
  const invalid = outOfOrder.size > 0;
  const depotRow = (stop: any, kind: "start" | "end") => (
    <div className="flex items-center gap-3 bg-[#F3F6F4] px-3 py-2 text-[12px]">
      <span aria-hidden="true" className="inline-flex h-6 w-6 shrink-0 items-center justify-center text-white" style={{ backgroundColor: routeColor }}>
        {kind === "start" ? <House size={13} /> : <Flag size={13} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[#12211A]">{kind === "start" ? "Trip starts" : "Trip ends"}
          <span className="inline-flex items-center gap-1 text-[11px] text-[#626E67]"><Lock size={11} aria-hidden="true" />fixed</span></span>
        <span className="block truncate text-[#626E67]">{stop.address_formatted || (kind === "start" ? "Departure depot" : "Return depot")}</span>
      </span>
      {stop.arrival_time && <span className="shrink-0 tabular-nums text-[#12211A]">{formatTime12h(stop.arrival_time)}</span>}
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={busy ? undefined : onClose}
      maskClosable={!busy}
      width={760}
      centered
      rootClassName="lang"
      className="responsive-reorder-modal"
      title={<div className="pr-6">
        <div className="flex flex-wrap items-center gap-2 text-[16px] font-medium text-[#12211A]">
          <span aria-hidden="true" className="h-3 w-3 shrink-0" style={{ backgroundColor: routeColor }} />
          Change stop order
          {isOrderChanged && <span className="text-[12px] font-normal text-[#8A6700]">· not saved</span>}
        </div>
        <div className="mt-0.5 text-[12px] font-normal text-[#4A5750]">
          {driverName} · {stopsList.length} stops. Drag a stop, or use the arrows. New times are worked out when you save.
        </div>
      </div>}
      footer={<div className="flex flex-col gap-2 border-t border-[#E3E8E5] pt-3">
        {invalid && <p role="alert" className="m-0 text-left text-[12px] text-[#C9372C]">
          A drop-off is before its own pickup ({[...outOfOrder].map(id => `Job #${id}`).join(", ")}). Move it below the pickup to save.
        </p>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={handleReset} disabled={!isOrderChanged || busy}
            className="mr-auto border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline disabled:cursor-not-allowed disabled:text-[#9AA59F] disabled:no-underline">
            Reset order
          </button>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          {onSaveAndReOptimize && (
            <Tooltip title="Saves this order, then re-optimizes the route. The optimizer may change the order again.">
              <Button loading={isReoptimizing} disabled={isSaving || invalid} onClick={handleSaveAndReoptimize}>
                Save and re-optimize
              </Button>
            </Tooltip>
          )}
          <Button type="primary" loading={isSaving}
            disabled={isReoptimizing || invalid || (!isOrderChanged && stopsList.length > 0)} onClick={handleSaveOrder}>
            Save order
          </Button>
        </div>
      </div>}
      styles={{ body: { maxHeight: "calc(100dvh - 280px)", overflowY: "auto" } }}
    >
      <div className="flex flex-col gap-3">
        <p className="sr-only" aria-live="polite">{announcement}</p>
        {stopsList.length > 5 && (
          <Input size="small" placeholder="Search by name, address or job #" aria-label="Search stops"
            prefix={<SearchOutlined className="text-[#626E67]" />} value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)} allowClear />
        )}
        {searchTerm && <p className="m-0 text-[12px] text-[#626E67]">Showing matches only. Clear the search to drag stops across the whole list.</p>}

        <div className="border border-[#E3E8E5]">
          {depotStart && depotRow(depotStart, "start")}
          <ol className="m-0 list-none p-0" aria-label="Stops in order">
            {filteredStops.map((stopItem) => {
              const actualIndex = stopsList.findIndex((s) => s.id === stopItem.id);
              const isDragging = draggedItemIndex === actualIndex;
              const isDragOver = dragOverIndex === actualIndex;
              const isPickup = stopItem.stop_type === "pickup" || stopItem.stop_type === "pick_up";
              const from = startPosition.get(stopItem.originalIndex);
              const moved = from !== undefined && from !== actualIndex;
              const bad = outOfOrder.has(stopItem.job_id) && !isPickup;
              return (
                <li
                  key={stopItem.id}
                  draggable={!busy && !searchTerm}
                  onDragStart={(e) => handleDragStart(e, actualIndex)}
                  onDragOver={(e) => handleDragOver(e, actualIndex)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, actualIndex)}
                  onDragEnd={handleDragEnd}
                  className={`reorder-stop-row relative flex items-center gap-2.5 border-t border-[#E3E8E5] px-2 py-2 select-none ${
                    isDragging ? "opacity-40" : ""} ${
                    bad ? "bg-[#FDECEA]" : moved ? "bg-[#FFF8E6]" : "bg-white hover:bg-[#F8FAF9]"} ${
                    !busy && !searchTerm ? "cursor-grab active:cursor-grabbing" : ""}`}
                >
                  {isDragOver && !isDragging && <span aria-hidden="true" className="absolute inset-x-0 -top-px h-0.5 bg-[#003220]" />}
                  <span className="shrink-0 p-1 text-[#9AA59F]" title="Drag to reorder" aria-hidden="true"><GripVertical size={16} /></span>
                  <span className="w-6 shrink-0 text-center text-[13px] font-medium text-[#12211A] tabular-nums">{actualIndex + 1}</span>
                  <span aria-hidden="true" className="inline-flex h-[30px] w-6 shrink-0 items-center justify-center">
                    <span className="inline-flex scale-[0.62]"><StopArrowSvg isPickup={isPickup} displayIndex="" fill="#fff" stroke={routeColor} textColor={routeColor} /></span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                      <span className="text-[#626E67]">{isPickup ? "Pickup" : "Drop-off"}</span>
                      <span className="truncate font-medium text-[#12211A]">{stopItem.candidate_name || `Job #${stopItem.job_id}`}</span>
                      {stopItem.candidate_name && <span className="text-[12px] text-[#626E67] tabular-nums">Job #{stopItem.job_id}</span>}
                      {stopItem.is_new && <span className="text-[11px] text-[#0B5D3B]">New</span>}
                      {stopItem.time_edited && <span className="inline-flex items-center gap-1 text-[11px] text-[#4A5750]"><EditedMark size={11} />Edited</span>}
                      {moved && !bad && <span className="text-[11px] text-[#8A6700]">Moved from {from! + 1}</span>}
                      {bad && <span className="text-[11px] text-[#C9372C]">Before its pickup</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#626E67]">{stopItem.address_formatted || "No address"}</span>
                  </span>
                  {stopItem.arrival_time && <span className={`shrink-0 text-right text-[12px] tabular-nums ${moved ? "text-[#626E67]" : "text-[#12211A]"}`}
                    title={moved ? "Planned time before this change" : "Planned time"}>
                    {formatTime12h(stopItem.arrival_time)}{moved && <span className="block text-[11px]">was</span>}
                  </span>}
                  <span className="flex shrink-0 items-center border-l border-[#E3E8E5] pl-1">
                    <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={busy || actualIndex === 0}
                      aria-label={`Move stop ${actualIndex + 1} up`} title="Move up" onClick={() => moveUp(actualIndex)} />
                    <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={busy || actualIndex === stopsList.length - 1}
                      aria-label={`Move stop ${actualIndex + 1} down`} title="Move down" onClick={() => moveDown(actualIndex)} />
                    {onRemoveStop && (
                      <Popconfirm title="Remove this job from the route?" description="Its pickup and drop-off go back to Unassigned."
                        okText="Remove" okButtonProps={{ danger: true, size: "small" }} cancelButtonProps={{ size: "small" }}
                        onConfirm={() => handleRemove(stopItem.job_id)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={busy}
                          aria-label={`Remove job ${stopItem.job_id} from this route`} title="Remove from route" />
                      </Popconfirm>
                    )}
                  </span>
                </li>
              );
            })}
            {filteredStops.length === 0 && (
              <li className="border-t border-[#E3E8E5] py-8 text-center text-[13px] text-[#626E67]">No stop matches this search.</li>
            )}
          </ol>
          {depotEnd && <div className="border-t border-[#E3E8E5]">{depotRow(depotEnd, "end")}</div>}
        </div>
      </div>
    </Modal>
  );
};

export default ReorderStopsModal;
