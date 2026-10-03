"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Button,
  Tag,
  Tooltip,
  Input,
  message,
  Popconfirm,
  Badge,
} from "antd";
import {
  MenuOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SaveOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  UserOutlined,
  FlagOutlined,
  HomeOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { GripVertical, House, Flag, Sparkles as SparklesIcon } from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import { formatTime12h } from "@/utils/app.utils";
import { getRouteColor } from "@/utils/timeline.utils";

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
  onSave: (routeIndex: number, orderedJobIds: number[]) => Promise<void> | void;
  onSaveAndReOptimize?: (routeIndex: number, orderedJobIds: number[]) => Promise<void> | void;
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
          time_edited: Boolean(s.time_edited),
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
    (routeIndex !== null ? `Driver ${routeIndex + 1}` : "Driver");
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
  };

  const moveDown = (index: number) => {
    if (index >= stopsList.length - 1) return;
    const updated = [...stopsList];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    setStopsList(updated);
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
          time_edited: Boolean(s.time_edited),
          rawStop: s,
          originalIndex: idx,
        });
      }
    });
    setStopsList(initial);
    message.info("Stop order reset to original");
  };

  const handleSaveOrder = async () => {
    if (routeIndex === null) return;
    const orderedJobIds = stopsList.map((s) => s.job_id);
    try {
      setIsSaving(true);
      await onSave(routeIndex, orderedJobIds);
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
    try {
      setIsReoptimizing(true);
      await onSaveAndReOptimize(routeIndex, orderedJobIds);
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

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={780}
      centered
      title={
        <div className="flex items-center justify-between pr-6 py-1 select-none border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
              style={{ backgroundColor: routeColor }}
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 text-base">
                  Reorder Stops — {driverName}
                </span>
                {isOrderChanged && (
                  <Tag color="orange" className="font-semibold text-xs border-orange-300">
                    Unsaved Changes
                  </Tag>
                )}
              </div>
              <p className="text-xs text-gray-500 font-normal m-0 mt-0.5">
                Drag and drop stops or use the arrow buttons to customize the stop order. ETAs will update accordingly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tag color="blue" className="text-xs font-bold px-2 py-0.5">
              {stopsList.length} Job Stops
            </Tag>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleReset}
              disabled={!isOrderChanged || isSaving || isReoptimizing}
              className="text-xs text-gray-600"
            >
              Reset Order
            </Button>
          </div>

          <div className="flex items-center gap-2.5">
            <Button size="middle" onClick={onClose} disabled={isSaving || isReoptimizing}>
              Cancel
            </Button>

            {onSaveAndReOptimize && (
              <Button
                size="middle"
                icon={<ThunderboltOutlined />}
                loading={isReoptimizing}
                disabled={isSaving}
                onClick={handleSaveAndReoptimize}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs border-none"
              >
                Save & Reoptimize
              </Button>
            )}

            <Button
              type="primary"
              size="middle"
              icon={<SaveOutlined />}
              loading={isSaving}
              disabled={isReoptimizing || (!isOrderChanged && stopsList.length > 0)}
              onClick={handleSaveOrder}
              style={{ backgroundColor: "#003220", borderColor: "#003220" }}
              className="font-semibold text-xs shadow-sm"
            >
              Save New Order
            </Button>
          </div>
        </div>
      }
      styles={{ body: { padding: "16px 20px", maxHeight: "72vh", overflowY: "auto" } }}
    >
      <div className="space-y-3">
        {/* Search Bar */}
        {stopsList.length > 5 && (
          <Input
            size="small"
            placeholder="Search stops by job #, name, or address..."
            prefix={<SearchOutlined className="text-gray-400 text-xs" />}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            allowClear
            className="text-xs rounded-md"
          />
        )}

        {/* Start Depot (Locked) */}
        {depotStart && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50/70 select-none">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold shadow-xs">
              <House size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900">
                  DEPOT (START)
                </span>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-200/60 px-1.5 py-0.2 rounded">
                  Locked
                </span>
              </div>
              <p className="text-xs text-amber-800/80 truncate m-0 font-medium">
                {depotStart.address_formatted || "Departure Depot"}
              </p>
            </div>
            {depotStart.arrival_time && (
              <div className="text-right text-xs font-bold text-amber-900 shrink-0">
                <ClockCircleOutlined className="mr-1 text-amber-600" />
                {formatTime12h(depotStart.arrival_time)}
              </div>
            )}
          </div>
        )}

        {/* Draggable Stop List */}
        <div className="space-y-1.5">
          {filteredStops.map((stopItem, index) => {
            const actualIndex = stopsList.findIndex((s) => s.id === stopItem.id);
            const isDragging = draggedItemIndex === actualIndex;
            const isDragOver = dragOverIndex === actualIndex;
            const isPickup = stopItem.stop_type === "pickup";
            const isDropoff =
              stopItem.stop_type === "dropoff" ||
              stopItem.stop_type === "drop_off";

            return (
              <div
                key={stopItem.id}
                draggable
                onDragStart={(e) => handleDragStart(e, actualIndex)}
                onDragOver={(e) => handleDragOver(e, actualIndex)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, actualIndex)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2.5 p-2 rounded-lg border transition-all select-none cursor-grab active:cursor-grabbing ${
                  isDragging
                    ? "opacity-40 border-dashed border-emerald-500 bg-emerald-50/50 scale-[0.99]"
                    : isDragOver
                    ? "border-2 border-emerald-600 bg-emerald-50 shadow-md translate-y-0.5"
                    : stopItem.is_new
                    ? "border-emerald-400 bg-emerald-50/40 hover:bg-emerald-50/70 shadow-xs"
                    : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/70 shadow-xs"
                }`}
              >
                {/* Drag Handle */}
                <div
                  className="text-gray-400 hover:text-gray-700 cursor-grab p-1 shrink-0 flex items-center justify-center"
                  title="Drag to reorder"
                >
                  <GripVertical size={16} />
                </div>

                {/* Display Sequence Number Badge */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-xs text-white ${
                    stopItem.is_new
                      ? "bg-emerald-600 ring-2 ring-emerald-300"
                      : "bg-slate-700"
                  }`}
                >
                  {actualIndex + 1}
                </div>

                {/* Stop Type & Highlights */}
                <div className="shrink-0 flex items-center gap-1">
                  {isPickup ? (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                      PICKUP
                    </span>
                  ) : isDropoff ? (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                      DROP-OFF
                    </span>
                  ) : (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-300">
                      JOB
                    </span>
                  )}

                  {/* Newly Added Job Highlight */}
                  {stopItem.is_new && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-400 flex items-center gap-1 animate-pulse">
                      <SparklesIcon size={10} className="text-amber-600" />
                      NEW
                    </span>
                  )}

                  {/* Time Edited Flag */}
                  {stopItem.time_edited && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-purple-100 text-purple-900 border border-purple-300 flex items-center gap-0.5">
                      <ClockCircleOutlined className="text-[10px]" /> EDITED
                    </span>
                  )}
                </div>

                {/* Stop Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-900 truncate">
                    <span>Job #{stopItem.job_id}</span>
                    {stopItem.candidate_name && (
                      <span className="text-gray-600 font-semibold truncate">
                        • {stopItem.candidate_name}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                    <EnvironmentOutlined className="text-gray-400 text-[10px] shrink-0" />
                    <span className="truncate">{stopItem.address_formatted || "No address provided"}</span>
                  </div>
                </div>

                {/* ETA */}
                {stopItem.arrival_time && (
                  <div className="text-right text-xs font-semibold text-gray-700 shrink-0 px-1">
                    <div className="text-[10px] text-gray-400 font-medium uppercase">ETA</div>
                    <div className="font-bold text-slate-800">
                      {formatTime12h(stopItem.arrival_time)}
                    </div>
                  </div>
                )}

                {/* Move Up / Down Buttons */}
                <div className="flex items-center gap-0.5 shrink-0 pl-1 border-l border-gray-100">
                  <Tooltip title="Move Stop Up">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowUpOutlined className="text-xs" />}
                      disabled={actualIndex === 0}
                      onClick={() => moveUp(actualIndex)}
                      className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                    />
                  </Tooltip>
                  <Tooltip title="Move Stop Down">
                    <Button
                      type="text"
                      size="small"
                      icon={<ArrowDownOutlined className="text-xs" />}
                      disabled={actualIndex === stopsList.length - 1}
                      onClick={() => moveDown(actualIndex)}
                      className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                    />
                  </Tooltip>
                  {onRemoveStop && (
                    <Popconfirm
                      title="Remove this stop from route?"
                      description="The job will be moved back to Unassigned."
                      okText="Remove"
                      okButtonProps={{ danger: true, size: "small" }}
                      cancelButtonProps={{ size: "small" }}
                      onConfirm={() => handleRemove(stopItem.job_id)}
                    >
                      <Tooltip title="Remove Stop from Route">
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined className="text-xs" />}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                        />
                      </Tooltip>
                    </Popconfirm>
                  )}
                </div>
              </div>
            );
          })}

          {filteredStops.length === 0 && (
            <div className="p-8 text-center text-gray-400 text-sm font-medium border border-dashed rounded-lg bg-gray-50">
              No matching stops found.
            </div>
          )}
        </div>

        {/* End Depot (Locked) */}
        {depotEnd && (
          <div className="flex items-center gap-3 p-2.5 rounded-lg border border-amber-200 bg-amber-50/70 select-none">
            <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 font-bold shadow-xs">
              <Flag size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900">
                  DEPOT (END)
                </span>
                <span className="text-[10px] font-semibold text-amber-700 bg-amber-200/60 px-1.5 py-0.2 rounded">
                  Locked
                </span>
              </div>
              <p className="text-xs text-amber-800/80 truncate m-0 font-medium">
                {depotEnd.address_formatted || "Return Depot"}
              </p>
            </div>
            {depotEnd.arrival_time && (
              <div className="text-right text-xs font-bold text-amber-900 shrink-0">
                <ClockCircleOutlined className="mr-1 text-amber-600" />
                {formatTime12h(depotEnd.arrival_time)}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ReorderStopsModal;
