"use client";
import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  Button,
  Tag,
  Tooltip,
  Input,
  Select,
  Checkbox,
  message,
  Switch,
  Badge,
} from "antd";
import {
  SearchOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  UserOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CarOutlined,
} from "@ant-design/icons";
import { ArrowDown, ArrowUp, Sparkles as SparklesIcon, Users } from "lucide-react";
import dayjs from "dayjs";
import type { Job } from "@/types/job.type";
import { formatTime12h } from "@/utils/app.utils";
import { getRouteColor } from "@/utils/timeline.utils";

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
  const [selectedJobIds, setSelectedJobIds] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "pickup" | "dropoff">("all");
  const [autoSelectLinkedStops, setAutoSelectLinkedStops] = useState(true);
  const [reoptimize, setReoptimize] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const jobsByIdMap = useMemo(() => {
    const map = new Map<number, Job>();
    jobs.forEach((j) => map.set(Number(j.id), j));
    return map;
  }, [jobs]);

  const sourceRoute = useMemo(() => {
    if (sourceRouteIndex === null || !routes || !routes[sourceRouteIndex]) return null;
    return routes[sourceRouteIndex];
  }, [sourceRouteIndex, routes]);

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
  useEffect(() => {
    if (open) {
      setSearchTerm("");
      setFilterType("all");

      if (initialSelectedJobIds && initialSelectedJobIds.length > 0) {
        setSelectedJobIds(new Set(initialSelectedJobIds));
      } else {
        setSelectedJobIds(new Set());
      }

      // Default target driver to the first available other driver
      if (routes && routes.length > 1 && sourceRouteIndex !== null) {
        const firstOtherIdx = routes.findIndex((_, idx) => idx !== sourceRouteIndex);
        setTargetRouteIndex(firstOtherIdx >= 0 ? firstOtherIdx : null);
      } else {
        setTargetRouteIndex(null);
      }
    }
  }, [open, sourceRouteIndex, routes, initialSelectedJobIds]);

  const targetRoute = useMemo(() => {
    if (targetRouteIndex === null || !routes || !routes[targetRouteIndex]) return null;
    return routes[targetRouteIndex];
  }, [targetRouteIndex, routes]);

  // Filtered stops
  const filteredStops = useMemo(() => {
    return stopsList.filter((item) => {
      if (filterType !== "all" && item.stop_type !== filterType) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      const matchName = item.candidate_name?.toLowerCase().includes(q);
      const matchAddr = item.address_formatted?.toLowerCase().includes(q);
      const matchJob = String(item.job_id).includes(q);
      return Boolean(matchName || matchAddr || matchJob);
    });
  }, [stopsList, filterType, searchTerm]);

  // Toggle selection for a stop
  const toggleJobSelection = (jobId: number) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      filteredStops.forEach((s) => next.add(s.job_id));
      return next;
    });
  };

  const handleDeselectAll = () => {
    setSelectedJobIds(new Set());
  };

  const handleConfirmTransfer = async () => {
    if (sourceRouteIndex === null || targetRouteIndex === null) {
      message.error("Please choose a destination driver.");
      return;
    }
    if (sourceRouteIndex === targetRouteIndex) {
      message.error("Destination driver must be different from source driver.");
      return;
    }
    if (selectedJobIds.size === 0) {
      message.error("Please select at least one stop to transfer.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onTransfer(
        sourceRouteIndex,
        targetRouteIndex,
        Array.from(selectedJobIds),
        undefined,
        reoptimize,
      );
      onClose();
    } catch (err: any) {
      console.error("Transfer error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceColor = sourceRouteIndex !== null ? getRouteColor(sourceRouteIndex) : "#003220";
  const targetColor = targetRouteIndex !== null ? getRouteColor(targetRouteIndex) : "#3b82f6";

  const allFilteredSelected =
    filteredStops.length > 0 && filteredStops.every((s) => selectedJobIds.has(s.job_id));

  // Count total selected stops (including linked pickups and dropoffs)
  const selectedStopsCount = stopsList.filter((s) => selectedJobIds.has(s.job_id)).length;

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      closable={false}
      width={780}
      centered
      destroyOnClose
      rootClassName="transfer-stops-modal"
      className="transfer-stops-modal rounded-none"
      styles={{
        body: {
          padding: 0,
          borderRadius: 0,
          overflow: "hidden",
        },
      }}
    >
      <style>{`
        .transfer-stops-modal,
        .transfer-stops-modal * {
          border-radius: 0 !important;
        }
        .transfer-stops-modal .ant-modal-content,
        .transfer-stops-modal .ant-modal-body,
        .transfer-stops-modal .ant-select-selector,
        .transfer-stops-modal .ant-select-dropdown,
        .transfer-stops-modal .ant-input,
        .transfer-stops-modal .ant-btn,
        .transfer-stops-modal .ant-checkbox-inner,
        .transfer-stops-modal .ant-switch,
        .transfer-stops-modal .ant-switch-handle,
        .transfer-stops-modal .ant-tag {
          border-radius: 0 !important;
        }
        .transfer-stops-modal .ant-select-focused .ant-select-selector,
        .transfer-stops-modal .ant-select:hover .ant-select-selector,
        .transfer-stops-modal .ant-input:focus,
        .transfer-stops-modal .ant-input:hover {
          border-color: #003220 !important;
        }
        .transfer-stops-modal .ant-checkbox-checked .ant-checkbox-inner {
          background-color: #003220 !important;
          border-color: #003220 !important;
        }
        .transfer-stops-modal .ant-switch.ant-switch-checked {
          background-color: #003220 !important;
        }
      `}</style>
      <div className="flex flex-col max-h-[88vh] bg-white rounded-none">
        {/* Header - Syncnox Forest Green Branding */}
        <div className="px-6 py-4 bg-[#003220] text-white flex items-center justify-between border-b border-emerald-950 rounded-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-none bg-emerald-900/60 border border-emerald-700/60 flex items-center justify-center text-emerald-300 shrink-0">
              <SwapOutlined className="text-lg" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2 m-0">
                Transfer Stops to Another Driver
              </h2>
              <p className="text-xs text-emerald-100/75 m-0 mt-0.5">
                Move candidates/stops from one driver&apos;s route to another driver with instant ETA recalculation.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-none bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors border-none cursor-pointer outline-none"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Driver Route Selector Panel */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 rounded-none">
          <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
            {/* Source Driver Card */}
            <div className="md:col-span-5 bg-white p-3 rounded-none border border-slate-200 flex items-center gap-3">
              <div
                className="w-2 h-10 rounded-none shrink-0"
                style={{ backgroundColor: sourceColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Source Driver
                </div>
                <div className="text-sm font-bold text-slate-900 truncate">
                  {sourceRoute?.team_member_name || `Driver #${(sourceRouteIndex ?? 0) + 1}`}
                </div>
                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                  <span>{stopsList.length} stops</span>
                  {sourceRoute?.vehicle_name && (
                    <>
                      <span>•</span>
                      <span className="truncate flex items-center gap-1">
                        <CarOutlined className="text-[10px]" /> {sourceRoute.vehicle_name}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Transfer Direction Arrow */}
            <div className="md:col-span-1 flex justify-center text-slate-400">
              <div className="w-8 h-8 rounded-none bg-white border border-slate-200 flex items-center justify-center shadow-xs">
                <ArrowRightOutlined className="text-sm text-[#003220] font-bold" />
              </div>
            </div>

            {/* Target Driver Card / Select */}
            <div className="md:col-span-5 bg-white p-3 rounded-none border border-slate-200 flex items-center gap-3">
              <div
                className="w-2 h-10 rounded-none shrink-0"
                style={{ backgroundColor: targetColor }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  Destination Driver
                </div>
                <Select
                  value={targetRouteIndex}
                  onChange={(val) => setTargetRouteIndex(val)}
                  placeholder="Select destination driver..."
                  className="w-full mt-0.5 rounded-none"
                  size="small"
                  style={{ borderRadius: 0 }}
                  options={routes
                    .map((r, idx) => ({
                      value: idx,
                      disabled: idx === sourceRouteIndex,
                      label: (
                        <div className="flex items-center justify-between text-xs py-0.5">
                          <span className={`font-semibold ${idx === sourceRouteIndex ? "text-slate-400" : "text-slate-800"}`}>
                            {r.team_member_name || `Driver #${idx + 1}`}
                            {idx === sourceRouteIndex && " (Source)"}
                          </span>
                          <span className="text-[10px] text-slate-400 ml-2">
                            {r.stops?.filter((s: any) => s.job_id)?.length || 0} stops
                          </span>
                        </div>
                      ),
                    }))}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Search, Filter & Quick-action Toolbar */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 rounded-none">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Input
              size="small"
              placeholder="Search candidate, address, or Job ID..."
              prefix={<SearchOutlined className="text-slate-400 text-xs" />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
              className="rounded-none text-xs"
              style={{ borderRadius: 0 }}
            />
            <div className="flex items-center rounded-none bg-slate-100 p-0.5 text-xs shrink-0 border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`px-2.5 py-1 rounded-none text-[11px] font-medium border-none cursor-pointer transition-all ${
                  filterType === "all"
                    ? "bg-[#003220] text-white shadow-xs font-bold"
                    : "bg-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                All ({stopsList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("pickup")}
                className={`px-2.5 py-1 rounded-none text-[11px] font-medium border-none cursor-pointer transition-all ${
                  filterType === "pickup"
                    ? "bg-[#003220] text-white shadow-xs font-bold"
                    : "bg-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                Pickups
              </button>
              <button
                type="button"
                onClick={() => setFilterType("dropoff")}
                className={`px-2.5 py-1 rounded-none text-[11px] font-medium border-none cursor-pointer transition-all ${
                  filterType === "dropoff"
                    ? "bg-[#003220] text-white shadow-xs font-bold"
                    : "bg-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                Drop-offs
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="small"
              onClick={allFilteredSelected ? handleDeselectAll : handleSelectAllFiltered}
              className="text-xs rounded-none border border-slate-300 hover:border-[#003220] hover:text-[#003220]"
              style={{ borderRadius: 0 }}
            >
              {allFilteredSelected ? "Clear Selection" : "Select All Filtered"}
            </Button>
            {selectedJobIds.size > 0 && (
              <span className="m-0 text-xs font-semibold px-2 py-0.5 rounded-none bg-emerald-50 text-[#003220] border border-emerald-300">
                {selectedJobIds.size} jobs ({selectedStopsCount} stops) selected
              </span>
            )}
          </div>
        </div>

        {/* Stops List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 min-h-[260px] max-h-[420px] custom-scrollbar bg-slate-50/50 rounded-none">
          {filteredStops.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5] mb-2" />
              <div className="text-sm font-medium">No stops found</div>
              <div className="text-xs text-slate-400 mt-1">
                {searchTerm ? "Try adjusting your search query or filter" : "This route has no job stops"}
              </div>
            </div>
          ) : (
            filteredStops.map((item) => {
              const isSelected = selectedJobIds.has(item.job_id);
              const isPickup = item.stop_type === "pickup";
              const isDropoff = item.stop_type === "dropoff";

              const arrTime = item.arrival_time ? dayjs(item.arrival_time) : null;
              const formattedTime = arrTime && arrTime.isValid() ? arrTime.format("hh:mm A") : null;

              return (
                <div
                  key={item.key}
                  onClick={() => toggleJobSelection(item.job_id)}
                  className={`group relative flex items-center gap-3 p-3 rounded-none border transition-all cursor-pointer select-none ${
                    isSelected
                      ? "bg-emerald-50/60 border-l-4 border-l-[#003220] border-t-emerald-300 border-r-emerald-300 border-b-emerald-300 shadow-xs"
                      : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs"
                  }`}
                >
                  {/* Checkbox */}
                  <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onChange={() => toggleJobSelection(item.job_id)}
                      style={{ borderRadius: 0 }}
                    />
                  </div>

                  {/* Stop Index Badge */}
                  <div
                    className={`w-7 h-7 rounded-none flex items-center justify-center font-bold text-xs shrink-0 ${
                      isSelected
                        ? "bg-[#003220] text-white"
                        : "bg-slate-100 text-slate-700 border border-slate-200 group-hover:bg-slate-200"
                    }`}
                  >
                    {item.originalIndex + 1}
                  </div>

                  {/* Stop Type Pin (Square, zero border radius) */}
                  <div className="shrink-0">
                    {isPickup ? (
                      <div
                        className="w-6 h-6 rounded-none bg-emerald-50 border border-emerald-300 flex items-center justify-center text-emerald-700"
                        title="Pickup"
                      >
                        <ArrowDown size={13} strokeWidth={2.5} />
                      </div>
                    ) : isDropoff ? (
                      <div
                        className="w-6 h-6 rounded-none bg-blue-50 border border-blue-300 flex items-center justify-center text-blue-700"
                        title="Drop-off"
                      >
                        <ArrowUp size={13} strokeWidth={2.5} />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-none bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 text-[10px] font-bold">
                        J
                      </div>
                    )}
                  </div>

                  {/* Stop Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 truncate flex items-center gap-1">
                        <UserOutlined className="text-slate-400 text-[11px]" />
                        {item.candidate_name || `Job #${item.job_id}`}
                      </span>

                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-none m-0 border uppercase font-semibold ${
                          isPickup
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : isDropoff
                            ? "bg-blue-50 text-blue-800 border-blue-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {item.stop_type}
                      </span>

                      {item.is_new && (
                        <span className="px-1.5 py-0.5 bg-[#003220] text-white text-[8px] font-black uppercase rounded-none flex items-center gap-0.5">
                          <SparklesIcon size={7} /> NEW
                        </span>
                      )}

                      <span className="text-[10px] text-slate-400 font-mono">
                        Job #{item.job_id}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                      <EnvironmentOutlined className="text-slate-400 shrink-0 text-[10px]" />
                      <span className="truncate">{item.address_formatted}</span>
                    </div>
                  </div>

                  {/* Arrival ETA */}
                  {formattedTime && (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] text-slate-400 font-medium">ETA</div>
                      <div className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                        <ClockCircleOutlined className="text-[10px] text-slate-400" />
                        {formattedTime}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 rounded-none">
          <div className="flex items-center gap-2">
            <Switch
              size="small"
              checked={reoptimize}
              onChange={setReoptimize}
              id="reoptimize-switch"
              style={{ borderRadius: 0 }}
              className="rounded-none"
            />
            <label
              htmlFor="reoptimize-switch"
              className="text-xs text-slate-700 cursor-pointer select-none font-medium"
            >
              Re-optimize target route after transfer
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-none border-slate-300 text-slate-700 hover:border-[#003220] hover:text-[#003220]"
              style={{ borderRadius: 0 }}
            >
              Cancel
            </Button>
            <Button
              type="primary"
              onClick={handleConfirmTransfer}
              loading={isSubmitting}
              disabled={
                selectedJobIds.size === 0 ||
                targetRouteIndex === null ||
                targetRouteIndex === sourceRouteIndex
              }
              style={{
                backgroundColor:
                  selectedJobIds.size > 0 && targetRouteIndex !== null && targetRouteIndex !== sourceRouteIndex
                    ? "#003220"
                    : undefined,
                borderColor:
                  selectedJobIds.size > 0 && targetRouteIndex !== null && targetRouteIndex !== sourceRouteIndex
                    ? "#003220"
                    : undefined,
                borderRadius: 0,
              }}
              className="rounded-none font-semibold text-xs shadow-none"
              icon={<SwapOutlined />}
            >
              Transfer {selectedJobIds.size > 0 ? `${selectedJobIds.size} Job(s)` : "Stops"}
              {targetRoute ? ` to ${targetRoute.team_member_name || `Driver #${targetRouteIndex! + 1}`}` : ""}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TransferStopsModal;
