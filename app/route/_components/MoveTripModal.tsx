"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Spin, message } from "antd";
import { Car, Check, Search } from "lucide-react";
import { isAxiosError } from "axios";
import dayjs from "dayjs";
import { getMoveTripVehicleOptions, moveRouteTrip, type VehicleReplacementOption } from "@/apis/routes.api";
import { useOptimizationStore } from "@/store/optimization.store";
import type { Routes, TripMoveSelection } from "@/types/routes.type";
import { tripMoveRequest } from "./tripMoveRequest.utils";

interface Props {
  optimizationId: number;
  routes: Routes[];
  selection: TripMoveSelection;
  targetIndex: number;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
  onSuccess: () => Promise<void>;
}

const errorText = (error: unknown) => {
  const detail = isAxiosError(error) ? error.response?.data?.detail
    : (error as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" ? detail : error instanceof Error ? error.message : "Could not move the trip. Please try again.";
};

export default function MoveTripModal({ optimizationId, routes, selection, targetIndex, onClose, onBusyChange, onSuccess }: Props) {
  const [request, setRequest] = useState<Awaited<ReturnType<typeof tripMoveRequest>> | null>(null);
  const [options, setOptions] = useState<VehicleReplacementOption[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = routes[selection.sourceRouteIndex];
  const target = routes[targetIndex];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setRequest(null);
    setOptions([]);
    setSelectedId(null);
    (async () => {
      try {
        const resolved = await tripMoveRequest(optimizationId, routes, selection, targetIndex);
        const result = await getMoveTripVehicleOptions(resolved.optimizationId, resolved.routeIndex, resolved.payload);
        if (!active) return;
        setRequest(resolved);
        setOptions(result.vehicles);
        const preferred = result.vehicles.find(vehicle => vehicle.available && vehicle.id === source?.vehicle_id)
          || result.vehicles.find(vehicle => vehicle.available);
        setSelectedId(preferred?.id ?? null);
      } catch (error) {
        if (active) setError(errorText(error));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [optimizationId, routes, selection, targetIndex, source?.vehicle_id]);

  const available = useMemo(() => options.filter(vehicle => vehicle.available), [options]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return available.filter(vehicle => `${vehicle.name} ${vehicle.license_plate || ""}`.toLowerCase().includes(query));
  }, [available, search]);

  const save = async () => {
    if (!request || saving || selectedId === null || !available.some(vehicle => vehicle.id === selectedId)) return;
    if (useOptimizationStore.getState().currentOptimization?.id !== optimizationId) {
      setError("The route plan changed. Open the plan again before moving this trip.");
      return;
    }
    setSaving(true);
    onBusyChange(true);
    setError(null);
    try {
      const result = await moveRouteTrip(request.optimizationId, request.routeIndex, { ...request.payload, vehicle_id: selectedId });
      if (!result.success) throw new Error(result.message);
      message.success(result.message);
      if (useOptimizationStore.getState().currentOptimization?.id === optimizationId) await onSuccess();
      onClose();
    } catch (error) {
      const detail = errorText(error);
      setError(detail);
      Modal.error({ title: "Trip could not be moved", width: 640,
        content: <div className="whitespace-pre-line break-words">{detail}</div>, okText: "Got it",
        okButtonProps: { style: { backgroundColor: "#003220", borderColor: "#003220" } },
      });
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  };

  return (
    <Modal open title="Move complete trip" width={540} centered onCancel={onClose}
      closable={!saving} maskClosable={!saving} keyboard={!saving}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>Cancel</Button>,
        <Button key="move" type="primary" onClick={save} loading={saving}
          disabled={loading || !request || !available.some(vehicle => vehicle.id === selectedId)}>Move trip</Button>,
      ]}>
      <div className="flex flex-col gap-4 pt-1">
        <div>
          <p className="m-0 font-semibold">{source?.team_member_name} → {target?.team_member_name}</p>
          <p className="mt-1 mb-0 text-sm text-gray-600">
            {dayjs(selection.stops[0]?.arrival_time).format("ddd, h:mm A")}–{dayjs(selection.stops.at(-1)?.arrival_time).format("ddd, h:mm A")}
          </p>
          <p className="mt-2 mb-0 text-xs text-gray-500">Passenger times and stop order stay unchanged. Home travel is recalculated for the destination driver.</p>
        </div>
        {error && <Alert type="error" showIcon title={<span className="whitespace-pre-line break-words">{error}</span>} />}
        {loading ? <div className="py-10 text-center"><Spin /><p className="mt-3 text-sm text-gray-500">Checking vehicles and driver availability…</p></div> : request && (
          <>
            <div>
              <label htmlFor="move-trip-vehicle-search" className="text-sm font-medium">Select vehicle</label>
              <p className="mt-1 mb-2 text-xs text-gray-500">Available for this trip, including connecting travel, and matching {target?.team_member_name}&apos;s skills and the required seat capacity.</p>
              <Input id="move-trip-vehicle-search" prefix={<Search size={14} />} placeholder="Search vehicles by name or plate"
                allowClear value={search} onChange={event => setSearch(event.target.value)} disabled={saving} />
            </div>
            <div role="radiogroup" aria-label="Vehicle for moved trip" className="max-h-[320px] overflow-y-auto flex flex-col gap-2">
              {filtered.map(vehicle => (
                <button key={vehicle.id} type="button" role="radio" aria-checked={selectedId === vehicle.id}
                  disabled={saving} onClick={() => setSelectedId(vehicle.id)}
                  className={`flex items-center gap-3 rounded border p-3 text-left ${selectedId === vehicle.id ? "border-[#003220] bg-emerald-50" : "border-gray-200 hover:border-emerald-700"}`}>
                  <Car size={20} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{vehicle.name}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{vehicle.capacity} seats{vehicle.license_plate ? ` · ${vehicle.license_plate}` : ""}</span>
                  </span>
                  {selectedId === vehicle.id && <Check size={18} className="text-[#003220] shrink-0" />}
                </button>
              ))}
              {!filtered.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={available.length ? "No matching vehicles" : "No compatible vehicle is available for these trip times"} />}
            </div>
            {!available.length && <Alert type="info" showIcon title="Choose another driver or adjust the trip schedule to make a compatible vehicle available." />}
          </>
        )}
      </div>
    </Modal>
  );
}
