"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Empty, Modal, Select, Spin, message } from "antd";
import { isAxiosError } from "axios";
import { getVehicleSwapOptions, swapRouteVehicles, type VehicleSwapPreview } from "@/apis/routes.api";
import type { Routes } from "@/types/routes.type";
import { tripLabel, vehicleAvailabilityMessage } from "./tripLabel.utils";

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

/** "Cannot give X this vehicle: <reason> · Driver: Y." → which vehicle, who is blocked and who holds it, in plain words. */
const friendlyError = (text: string, vehicleFor: (driver: string) => string | undefined) => {
  const match = /^Cannot give (.+?) this vehicle: (.+?)\.?$/.exec(text);
  if (!match) return text;
  const [, driver, cause] = match;
  const vehicle = vehicleFor(driver) || "this vehicle";
  const held = /^(Assigned to another (trip|plan)|Booked by another route|Reserved) at this time · Driver: (.+)$/.exec(cause);
  if (held) return `${driver} can't take ${vehicle}: ${held[3]} has it at that time${held[2] === "plan" ? " in another plan" : ""}.`;
  const plain = vehicleAvailabilityMessage(cause) ?? cause;
  return `${driver} can't take ${vehicle}. ${/[.!?]$/.test(plain) ? plain : `${plain}.`}`;
};

function TripCard({ kicker, driver, detail }: { kicker: string; driver: string; detail: string }) {
  return <div className="min-w-0 border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2.5">
    <div className="text-[11px] uppercase tracking-wide text-[#626E67]">{kicker}</div>
    <div className="mt-0.5 truncate text-[14px] font-medium text-[#12211A]">{driver}</div>
    <div className="mt-0.5 text-[12px] text-[#4A5750]">{detail}</div>
  </div>;
}

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

  const target = targetIndex === null ? undefined : routes[targetIndex];
  return <Modal open title="Swap vehicles" width={600} centered onCancel={onClose} rootClassName="lang"
    closable={!saving} maskClosable={!saving} keyboard={!saving}
    footer={[
      <Button key="cancel" disabled={saving} onClick={onClose}>Cancel</Button>,
      <Button key="swap" type="primary" loading={saving} onClick={save}
        disabled={loading || !preview || preview.target.route_index !== targetIndex}>Swap vehicles</Button>,
    ]}>
    <div className="flex flex-col gap-4 pt-1">
      <p className="m-0 text-[13px] text-[#4A5750]">Two trips exchange vehicles. Every stop and passenger time stays the same; both drivers and vehicles are checked first.</p>
      <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <TripCard kicker="This trip" driver={source?.team_member_name || "Selected driver"}
          detail={tripLabel(source, { driver: false, vehicle: true })} />
        <span aria-hidden="true" className="self-center justify-self-center text-[18px] leading-none text-[#626E67]">⇄</span>
        {target ? <TripCard kicker="Other trip" driver={target.team_member_name || "Driver not assigned"}
          detail={tripLabel(target, { driver: false, vehicle: true })} />
          : <div className="flex items-center border border-dashed border-[#C4CCC7] px-3 py-2.5 text-[12px] text-[#626E67]">Choose the other trip below</div>}
      </div>
      {candidates.length ? <div className="flex flex-col gap-1.5">
        <label htmlFor="vehicle-swap-target" className="text-[13px] font-medium text-[#12211A]">Swap with</label>
        <Select id="vehicle-swap-target" placeholder="Search a driver or vehicle" showSearch optionFilterProp="label"
          value={targetIndex ?? undefined} disabled={saving}
          onChange={value => { setPreview(null); setError(null); setTargetIndex(value); }}
          options={candidates.map(({ route, index }) => ({ value: index,
            label: tripLabel(route, { vehicle: true }) }))} />
      </div> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No other trip has a different vehicle to exchange." />}
      {loading && <div className="flex items-center gap-2 text-[12px] text-[#626E67]" role="status"><Spin size="small" />Checking both drivers and vehicles…</div>}
      {error && <Alert type="error" showIcon title={friendlyError(error, driver =>
        driver === target?.team_member_name ? source?.vehicle_name ?? undefined
          : driver === source?.team_member_name ? target?.vehicle_name ?? undefined : undefined)}
        action={<Button disabled={saving || loading} onClick={() => setAttempt(value => value + 1)}>Check again</Button>} />}
      {preview && <section aria-label="After the swap" className="border border-[#E3E8E5]">
        <h3 className="m-0 border-b border-[#E3E8E5] bg-[#F1F8F4] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[#0B5D3B]">Checked · after the swap</h3>
        {[preview.source, preview.target].map((side, i) => {
          const other = i === 0 ? preview.target : preview.source;
          return <p key={side.route_index} className="m-0 flex flex-wrap items-baseline gap-x-1.5 border-b border-[#E3E8E5] px-3 py-2.5 text-[13px] last:border-b-0">
            <strong className="font-medium text-[#12211A]">{side.driver_name}</strong>
            <span className="text-[#4A5750]">receives</span>
            <strong className="font-medium text-[#12211A]">{other.vehicle_name}</strong>
            <span className="text-[12px] text-[#626E67]">(gives up {side.vehicle_name})</span>
          </p>;
        })}
        {(preview.source.is_team_leader || preview.target.is_team_leader) &&
          <p className="m-0 border-t border-[#E3E8E5] px-3 py-2 text-[12px] text-[#4A5750]">A team leader keeps one vehicle for both directions, so the outbound and return trips and the vehicle booking between them are exchanged together.</p>}
      </section>}
    </div>
  </Modal>;
}
