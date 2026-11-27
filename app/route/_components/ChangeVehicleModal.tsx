"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Select, Spin, message } from "antd";
import { Car, Check, Search } from "lucide-react";
import { isAxiosError } from "axios";
import { changeRouteVehicle, getRouteVehicleOptions, getVehicleSwapOptions, swapRouteVehicles, type VehicleReplacementOptions, type VehicleSwapPreview } from "@/apis/routes.api";
import type { Routes } from "@/types/routes.type";
import { vehicleTripChoices } from "./vehicleTripChoices.utils";
import { tripLabel, vehicleAvailabilityMessage } from "./tripLabel.utils";

interface Props {
  optimizationId: number;
  routeIndex: number;
  routes: Routes[];
  onClose: () => void;
  onSuccess: () => void;
}

const errorText = (error: unknown) => {
  const detail = isAxiosError(error) ? error.response?.data?.detail
    : (error as { detail?: unknown } | null)?.detail;
  return typeof detail === "string" ? detail : "Unable to change the vehicle. Please try again.";
};

export default function ChangeVehicleModal({ optimizationId, routeIndex, routes, onClose, onSuccess }: Props) {
  const [trip, setTrip] = useState(String(routeIndex));
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<VehicleReplacementOptions | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapPreviews, setSwapPreviews] = useState<VehicleSwapPreview[]>([]);
  const [swapFailures, setSwapFailures] = useState<{ index: number; reason: string }[]>([]);
  const [swapTarget, setSwapTarget] = useState<number | null>(null);
  const [checkingSwaps, setCheckingSwaps] = useState(false);
  const driverId = routes[routeIndex]?.team_member_id;
  const trips = routes.map((route, index) => ({ route, index })).filter(item =>
    item.route.team_member_id === driverId && item.route.stops?.length);
  const leader = trips.some(item => item.route.is_team_leader) || options?.is_team_leader;
  const selectedIndex = trip === "all" ? routeIndex : Number(trip.split(":")[0]);
  const scope = trip === "all" ? "driver" : "route";
  const current = routes[selectedIndex];
  const direction = trip.split(":")[1] || current?.leg;
  const leg = !leader && scope === "route" && (trip.includes(":") || current?.source_leg === "COMBINED")
    && (direction === "GO" || direction === "RETURN") ? direction : undefined;
  const tripChoices = vehicleTripChoices(routes, driverId);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setOptions(null);
    setSelectedId(null);
    setError(null);
    getRouteVehicleOptions(optimizationId, selectedIndex, scope, leg)
      .then(result => { if (active) setOptions(result); })
      .catch(error => { if (active) setError(errorText(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [optimizationId, selectedIndex, scope, leg, current?.team_member_id, current?.vehicle_id, current?.leg]);

  const selectedVehicle = options?.vehicles.find(vehicle => vehicle.id === selectedId);
  useEffect(() => {
    let active = true;
    setSwapPreviews([]);
    setSwapFailures([]);
    setSwapTarget(null);
    if (!selectedVehicle || selectedVehicle.available || scope !== "route" || leg) {
      setCheckingSwaps(false);
      return;
    }
    const targets = routes.map((route, index) => ({ route, index })).filter(({ route, index }) =>
      index !== selectedIndex && route.vehicle_id === selectedVehicle.id && route.stops?.some(stop => stop.job_id));
    setCheckingSwaps(true);
    Promise.allSettled(targets.map(({ index }) => getVehicleSwapOptions(optimizationId, selectedIndex, index)))
      .then(results => {
        if (active) {
          setSwapPreviews(results.flatMap(result => result.status === "fulfilled" ? [result.value] : []));
          setSwapFailures(results.flatMap((result, i) => {
            if (result.status !== "rejected") return [];
            const detail = isAxiosError(result.reason) ? result.reason.response?.data?.detail : result.reason?.detail;
            return typeof detail === "string" ? [{ index: targets[i].index, reason: detail }] : [];
          }));
          if (results.some(result => result.status === "rejected" && !(isAxiosError(result.reason)
            ? result.reason.response?.status === 409 : typeof result.reason?.detail === "string"))) {
            setError("Some swap options could not be checked. Please close and reopen this dialog to try again.");
          }
        }
      }).finally(() => { if (active) setCheckingSwaps(false); });
    return () => { active = false; };
  }, [optimizationId, selectedIndex, selectedId, selectedVehicle?.available, scope, leg, routes]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return options?.vehicles.filter(vehicle =>
      `${vehicle.name} ${vehicle.license_plate || ""}`.toLowerCase().includes(query)) || [];
  }, [options, search]);

  const save = async () => {
    if (!options || selectedId === null || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (!selectedVehicle?.available) {
        const preview = swapPreviews.find(item => item.target.route_index === swapTarget);
        if (!preview) return;
        const response = await swapRouteVehicles(optimizationId, selectedIndex, preview);
        if (!response.success) throw { detail: response.message };
        message.success(response.message);
      } else {
      const response = await changeRouteVehicle(optimizationId, selectedIndex, {
        vehicle_id: selectedId, expected_driver_id: options.driver_id,
        expected_vehicle_id: options.current_vehicle_id, expected_leg: options.leg, scope, ...(leg ? { leg } : {}),
      });
      if (!response.success) throw { detail: response.message };
      message.success("Vehicle changed. Stops and pickup times stay the same.");
      }
      onSuccess();
      onClose();
    } catch (error) {
      setError(errorText(error));
      setSwapPreviews([]);
      setSwapTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open title="Change vehicle" onCancel={onClose} width={560} centered rootClassName="lang"
      closable={!saving} maskClosable={!saving} keyboard={!saving}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>Cancel</Button>,
        <Button key="save" type="primary" onClick={save} loading={saving}
          disabled={loading || checkingSwaps || !selectedVehicle || (!selectedVehicle.available && !swapPreviews.some(item => item.target.route_index === swapTarget))}>
          {selectedVehicle && !selectedVehicle.available ? "Swap vehicles" : "Change vehicle"}
        </Button>,
      ]}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-[#E3E8E5] pb-3">
          <p className="m-0 text-[14px] font-medium text-[#12211A]">{routes[routeIndex]?.team_member_name || "Driver"}</p>
          <p className="m-0 text-[12px] text-[#4A5750]">Now driving <span className="text-[#12211A]">{options?.current_vehicle_name || current?.vehicle_name || "no vehicle"}</span></p>
          <p className="m-0 w-full text-[12px] text-[#626E67]">Stops and pickup times stay the same. The choice is kept when you re-optimize.</p>
        </div>
        {!leader && tripChoices.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vehicle-trip" className="text-[13px] font-medium text-[#12211A]">Which trip</label>
            <Select id="vehicle-trip" aria-label="Trips to change vehicle for" value={trip} onChange={setTrip} disabled={saving || loading}
              options={tripChoices}
            />
          </div>
        ) : (
          <div className="border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2 text-[13px]">
            <span className="text-gray-500">Current vehicle: </span>
            <span className="font-medium">{options?.current_vehicle_name || current?.vehicle_name || "Unassigned"}</span>
            <p className="mb-0 mt-1 text-xs text-gray-500">
              {current?.leg === "COMBINED" ? "GO + RETURN trips" : `${current?.leg || "Selected"} trip`}
            </p>
          </div>
        )}
        {leader && <p className="m-0 text-[12px] text-[#4A5750]">This team leader uses one vehicle for GO and RETURN. Both legs will be updated together.</p>}
        {error && <Alert type="error" showIcon title={error} />}
        {loading ? <div className="py-10 text-center"><Spin /></div> : options && (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-[#12211A]">New vehicle</span>
              <span className="text-[12px] text-[#626E67]">Needs at least {options.required_capacity} {options.required_capacity === 1 ? "seat" : "seats"}</span>
            </div>
            <Input prefix={<Search size={14} />} placeholder="Search by name or plate" aria-label="Search replacement vehicles"
              allowClear value={search} onChange={event => setSearch(event.target.value)} disabled={saving} />
            <div role="radiogroup" aria-label="Replacement vehicle" className="max-h-[340px] overflow-y-auto border border-[#E3E8E5]">
              {([
                ["free", "Free during this trip", filtered.filter(vehicle => vehicle.available && vehicle.id !== options.current_vehicle_id)],
                ["busy", "In use at this time · swap possible", filtered.filter(vehicle => !vehicle.available && vehicle.id !== options.current_vehicle_id && /at this time/i.test(vehicle.reason || ""))],
                ["blocked", "Not suitable", filtered.filter(vehicle => !vehicle.available && vehicle.id !== options.current_vehicle_id && !/at this time/i.test(vehicle.reason || ""))],
                ["current", "Current vehicle", filtered.filter(vehicle => vehicle.id === options.current_vehicle_id)],
              ] as const).map(([key, heading, list]) => list.length > 0 && <div key={key} role="group" aria-label={heading}>
                <div className="sticky top-0 z-10 border-b border-[#E3E8E5] bg-[#F3F6F4] px-3 py-1.5 text-[11px] uppercase tracking-wide text-[#626E67]">
                  {heading} <span className="tabular-nums">({list.length})</span>
                </div>
                {list.map(vehicle => {
                  const on = selectedId === vehicle.id;
                  const isCurrent = vehicle.id === options.current_vehicle_id;
                  const spare = vehicle.capacity - options.required_capacity;
                  return <button key={vehicle.id} type="button" role="radio" aria-checked={on}
                    disabled={saving || isCurrent} onClick={() => { setError(null); setSelectedId(vehicle.id); }}
                    className={`flex w-full items-center gap-3 border-0 border-b border-[#E3E8E5] px-3 py-2.5 text-left last:border-b-0 ${
                      on ? "bg-[#F1F8F4] shadow-[inset_3px_0_0_#003220] cursor-pointer" : isCurrent ? "bg-white cursor-default" : "bg-white hover:bg-[#F8FAF9] cursor-pointer"}`}>
                    <span aria-hidden="true" className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${on ? "border-[#003220]" : "border-[#9AA59F]"} ${isCurrent ? "opacity-0" : ""}`}>
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-[#003220]" />}
                    </span>
                    <Car size={18} className="shrink-0 text-[#4A5750]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-[#12211A]">{vehicle.name}</span>
                      {vehicle.license_plate && <span className="block text-[12px] text-[#626E67]">{vehicle.license_plate}</span>}
                      {vehicle.reason && !isCurrent && <span className={`mt-0.5 block text-[12px] ${key === "blocked" ? "text-[#C9372C]" : "text-[#8A6700]"}`}>{vehicleAvailabilityMessage(vehicle.reason)}</span>}
                    </span>
                    <span className="shrink-0 text-right text-[12px] tabular-nums">
                      <span className="block text-[#12211A]">{vehicle.capacity} {vehicle.capacity === 1 ? "seat" : "seats"}</span>
                      {spare >= 0 && <span className="block text-[#626E67]">{spare === 0 ? "exact fit" : `${spare} spare`}</span>}
                    </span>
                    {on && <Check size={16} className="shrink-0 text-[#003220]" />}
                  </button>;
                })}
              </div>)}
              {!filtered.length && <div className="py-6"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matching vehicles" /></div>}
            </div>
            {selectedVehicle && !selectedVehicle.available && <div className="border border-[#E3E8E5] bg-[#F8FAF9] p-3 text-[13px] text-[#12211A]">
              <p className="mt-0 text-[#4A5750]">{selectedVehicle.name} is busy during this trip, so the two trips swap vehicles instead. Both drivers keep their stops and times.</p>
              {checkingSwaps ? <p className="mb-0">Checking possible swaps…</p> : swapPreviews.length ? <>
                <label htmlFor="replacement-swap-target" className="block mb-2 font-medium">Swap with a trip</label>
                <Select id="replacement-swap-target" className="w-full" placeholder="Choose a compatible trip" value={swapTarget ?? undefined}
                  onChange={setSwapTarget} disabled={saving} options={swapPreviews.map(preview => {
                    const target = routes[preview.target.route_index];
                    return { value: preview.target.route_index, label: tripLabel(target ? { ...target, team_member_name: preview.target.driver_name } : undefined) };
                  })} />
                {swapTarget !== null && <p className="mb-0 mt-2">{options.driver_name} receives {selectedVehicle.name}; {swapPreviews.find(item => item.target.route_index === swapTarget)?.target.driver_name} receives {options.current_vehicle_name}. Stops and passenger times stay the same.</p>}
              </> : <p className="mb-0">{scope !== "route" || leg ? "Select a whole trip to check possible swaps." : "No compatible trip is available to swap with."}</p>}
              {!checkingSwaps && swapFailures.length > 0 && <details className="mt-2 text-xs text-gray-600">
                <summary className="cursor-pointer">Why were other trips unavailable?</summary>
                <ul className="mb-0 pl-4">{swapFailures.map(({ index, reason }) => <li key={index} className="mt-1">
                  {tripLabel(routes[index])}: {reason}
                </li>)}</ul>
              </details>}
            </div>}
            {!options.vehicles.some(vehicle => vehicle.available) && <p className="m-0 text-[12px] text-[#626E67]">No suitable replacement is available for these trip times.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
