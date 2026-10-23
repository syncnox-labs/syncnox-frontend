"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Empty, Modal, Select, Spin, message } from "antd";
import { isAxiosError } from "axios";
import { getVehicleSwapOptions, swapRouteVehicles, type VehicleSwapPreview } from "@/apis/routes.api";
import type { Routes } from "@/types/routes.type";

interface Props {
  optimizationId: number;
  routeIndex: number;
  routes: Routes[];
  onClose: () => void;
  onSuccess: () => void;
}

const errorText = (error: unknown) => {
  const detail = isAxiosError(error) ? error.response?.data?.detail : (error as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" ? detail : "Unable to swap vehicles. Please try again.";
};

const legLabel = (leg?: string | null) => leg === "COMBINED" ? "GO + RETURN" : leg || "Trip";

export default function SwapVehicleModal({ optimizationId, routeIndex, routes, onClose, onSuccess }: Props) {
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<VehicleSwapPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const source = routes[routeIndex];
  const candidates = routes.map((route, index) => ({ route, index })).filter(({ route, index }) =>
    index !== routeIndex && route.vehicle_id && route.vehicle_id !== source?.vehicle_id && route.stops?.some(stop => stop.job_id));

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    if (targetIndex === null) { setLoading(false); return; }
    setLoading(true);
    getVehicleSwapOptions(optimizationId, routeIndex, targetIndex)
      .then(result => { if (active) setPreview(result); })
      .catch(failure => { if (active) setError(errorText(failure)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [optimizationId, routeIndex, targetIndex, routes, attempt]);

  const save = async () => {
    if (!preview || loading || saving || preview.target.route_index !== targetIndex) return;
    setSaving(true);
    setError(null);
    try {
      const response = await swapRouteVehicles(optimizationId, routeIndex, preview);
      if (!response.success) throw { detail: response.message };
      message.success(response.message);
      onSuccess();
      onClose();
    } catch (failure) {
      setError(errorText(failure));
      setPreview(null); // Reload eligibility before another attempt after a conflict.
    } finally { setSaving(false); }
  };

  return <Modal open title="Swap vehicles" width={560} centered onCancel={onClose}
    closable={!saving} maskClosable={!saving} keyboard={!saving}
    footer={[
      <Button key="cancel" disabled={saving} onClick={onClose}>Cancel</Button>,
      <Button key="swap" type="primary" loading={saving} onClick={save}
        disabled={loading || !preview || preview.target.route_index !== targetIndex}>Swap vehicles</Button>,
    ]}>
    <div className="flex flex-col gap-4 pt-1">
      <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        <p className="m-0 font-semibold">{source?.team_member_name || "Selected driver"}</p>
        <p className="mb-0 mt-1 text-gray-600">{legLabel(source?.leg)} · {source?.vehicle_name || `Vehicle #${source?.vehicle_id}`}</p>
      </div>
      <p className="m-0 text-sm text-gray-600">Exchange vehicles with another route. Stops and passenger times stay the same. Both drivers and vehicles are checked before the swap.</p>
      {candidates.length ? <div className="flex flex-col gap-1.5">
        <label htmlFor="vehicle-swap-target" className="text-sm font-medium">Swap with route</label>
        <Select id="vehicle-swap-target" placeholder="Choose another route" showSearch optionFilterProp="label"
          value={targetIndex ?? undefined} disabled={saving}
          onChange={value => { setPreview(null); setError(null); setTargetIndex(value); }}
          options={candidates.map(({ route, index }) => ({ value: index,
            label: `${route.team_member_name} · ${legLabel(route.leg)} · ${route.vehicle_name || `Vehicle #${route.vehicle_id}`} · Route ${index + 1}` }))} />
      </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No other route has a different vehicle to exchange." />}
      {loading && <div className="py-4 text-center"><Spin /></div>}
      {error && <Alert type="error" showIcon title={error}
        action={<Button disabled={saving || loading} onClick={() => setAttempt(value => value + 1)}>Check again</Button>} />}
      {preview && <div className="flex flex-col gap-2 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
        <p className="m-0"><strong>{preview.source.driver_name}</strong> receives <strong>{preview.target.vehicle_name}</strong>.</p>
        <p className="m-0"><strong>{preview.target.driver_name}</strong> receives <strong>{preview.source.vehicle_name}</strong>.</p>
        {(preview.source.is_team_leader || preview.target.is_team_leader) &&
          <p className="m-0 text-gray-600">For each team leader, both GO and RETURN legs and the continuous vehicle reservation will be exchanged together.</p>}
      </div>}
    </div>
  </Modal>;
}
