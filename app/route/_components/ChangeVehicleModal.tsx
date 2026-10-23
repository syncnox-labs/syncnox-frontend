"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Select, Spin, message } from "antd";
import { Car, Check, Search } from "lucide-react";
import { isAxiosError } from "axios";
import { changeRouteVehicle, getRouteVehicleOptions, type VehicleReplacementOptions } from "@/apis/routes.api";
import type { Routes } from "@/types/routes.type";

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
  const driverId = routes[routeIndex]?.team_member_id;
  const trips = routes.map((route, index) => ({ route, index })).filter(item =>
    item.route.team_member_id === driverId && item.route.stops?.length);
  const leader = trips.some(item => item.route.is_team_leader) || options?.is_team_leader;
  const selectedIndex = trip === "all" ? routeIndex : Number(trip);
  const scope = trip === "all" ? "driver" : "route";
  const current = routes[selectedIndex];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setOptions(null);
    setSelectedId(null);
    setError(null);
    getRouteVehicleOptions(optimizationId, selectedIndex, scope)
      .then(result => { if (active) setOptions(result); })
      .catch(error => { if (active) setError(errorText(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [optimizationId, selectedIndex, scope, current?.team_member_id, current?.vehicle_id, current?.leg]);

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
      await changeRouteVehicle(optimizationId, selectedIndex, {
        vehicle_id: selectedId, expected_driver_id: options.driver_id,
        expected_vehicle_id: options.current_vehicle_id, expected_leg: options.leg, scope,
      });
      message.success("Vehicle changed. Stops and pickup times stay the same.");
      onSuccess();
      onClose();
    } catch (error) {
      setError(errorText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open title="Change vehicle" onCancel={onClose} width={520} centered
      closable={!saving} maskClosable={!saving} keyboard={!saving}
      footer={[
        <Button key="cancel" onClick={onClose} disabled={saving}>Cancel</Button>,
        <Button key="save" type="primary" onClick={save} loading={saving}
          disabled={loading || !selectedId || !options?.vehicles.some(vehicle => vehicle.id === selectedId && vehicle.available)}>
          Change vehicle
        </Button>,
      ]}
    >
      <div className="flex flex-col gap-4 pt-1">
        <div>
          <p className="m-0 font-semibold text-gray-900">{routes[routeIndex]?.team_member_name || "Driver"}</p>
          <p className="mt-1 mb-0 text-xs text-gray-500">Choose a replacement for this plan. Your choice is kept when you reoptimize.</p>
        </div>
        {!leader && trips.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="vehicle-trip" className="text-xs font-medium text-gray-700">Change vehicle for</label>
            <Select id="vehicle-trip" value={trip} onChange={setTrip} disabled={saving}
              options={[
                ...trips.map(({ route, index }) => ({ value: String(index),
                  label: `${route.leg === "COMBINED" ? "GO + RETURN" : route.leg || "Trip"} · ${route.vehicle_name || `Vehicle #${route.vehicle_id}`}` })),
                { value: "all", label: "All trips for this driver" },
              ]}
            />
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">Current vehicle: </span>
            <span className="font-medium">{options?.current_vehicle_name || current?.vehicle_name || "Unassigned"}</span>
            <p className="mb-0 mt-1 text-xs text-gray-500">
              {current?.leg === "COMBINED" ? "GO + RETURN trips" : `${current?.leg || "Selected"} trip`}
            </p>
          </div>
        )}
        {leader && <p className="m-0 text-xs text-gray-600">This team leader uses one vehicle for GO and RETURN. Both legs will be updated together.</p>}
        {error && <Alert type="error" showIcon title={error} />}
        {loading ? <div className="py-10 text-center"><Spin /></div> : options && (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
              <span>Replacement vehicle</span>
              <span>At least {options.required_capacity} {options.required_capacity === 1 ? "seat" : "seats"} needed</span>
            </div>
            <Input prefix={<Search size={14} />} placeholder="Search vehicles by name or plate" aria-label="Search replacement vehicles"
              allowClear value={search} onChange={event => setSearch(event.target.value)} disabled={saving} />
            <div role="radiogroup" aria-label="Replacement vehicle" className="max-h-[320px] overflow-y-auto flex flex-col gap-2">
              {filtered.map(vehicle => (
                <button key={vehicle.id} type="button" role="radio" aria-checked={selectedId === vehicle.id}
                  disabled={!vehicle.available || saving} onClick={() => setSelectedId(vehicle.id)}
                  className={`flex items-center gap-3 rounded border p-3 text-left transition-colors ${
                    !vehicle.available ? "border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed"
                      : selectedId === vehicle.id ? "border-[#003220] bg-emerald-50 cursor-pointer" : "border-gray-200 hover:border-emerald-700 cursor-pointer"}`}>
                  <Car size={20} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{vehicle.name}</span>
                    <span className="block text-xs text-gray-500 mt-0.5">{vehicle.capacity} {vehicle.capacity === 1 ? "seat" : "seats"}{vehicle.license_plate ? ` · ${vehicle.license_plate}` : ""}</span>
                    {vehicle.reason && <span className="block text-xs mt-1">{vehicle.reason}</span>}
                  </span>
                  {selectedId === vehicle.id && <Check size={18} className="text-[#003220] shrink-0" />}
                </button>
              ))}
              {!filtered.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No matching vehicles" />}
            </div>
            {!options.vehicles.some(vehicle => vehicle.available) && <p className="m-0 text-xs text-gray-500">No suitable replacement is available for these trip times.</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
