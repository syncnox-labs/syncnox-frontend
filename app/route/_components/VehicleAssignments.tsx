"use client";

import { useMemo, useState } from "react";
import { Alert, Input, Radio, Spin } from "antd";
import { ArrowRight, Search, Truck } from "lucide-react";
import dayjs from "dayjs";
import type { Routes } from "@/types/routes.type";
import type { Vehicle } from "@/types/vehicle.type";
import { buildVehicleSchedule, filterVehicleSchedule, type VehicleAssignment } from "./vehicleSchedule.utils";

function AssignmentTime({ value }: { value: string | null }) {
  return value ? <time dateTime={value} className="whitespace-nowrap">
    <span className="font-semibold text-slate-800">{dayjs(value).format("h:mm A")}</span>
    <span className="ml-1.5 text-[11px] text-slate-500">{dayjs(value).format("ddd, MMM D")}</span>
  </time> : <span className="text-amber-700">Time unavailable</span>;
}

export default function VehicleAssignments({ routes, vehicles, loading, error, onViewTrip }: {
  routes: Routes[];
  vehicles: Vehicle[];
  loading: boolean;
  error: string | null;
  onViewTrip: (assignment: VehicleAssignment) => void;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"scheduled" | "all">("scheduled");
  const schedule = useMemo(() => buildVehicleSchedule(routes, vehicles), [routes, vehicles]);
  const visible = useMemo(() => filterVehicleSchedule(schedule, search, scope), [schedule, search, scope]);
  const scheduledCount = schedule.filter(group => group.assignments.length).length;

  return <section aria-label="Vehicle assignments" className="absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
    <div className="shrink-0 border-b border-slate-200 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-800">Vehicles ({scheduledCount})</span>
        <Input aria-label="Search vehicles or drivers" placeholder="Search vehicle, plate or driver…" allowClear
          prefix={<Search size={14} className="text-slate-400" />} value={search}
          onChange={event => setSearch(event.target.value)} style={{ width: 280, maxWidth: "100%" }} />
        <Radio.Group size="small" buttonStyle="solid" aria-label="Filter vehicles" value={scope}
          onChange={({ target: { value } }) => setScope(value)}>
          <Radio.Button value="scheduled">With trips</Radio.Button>
          <Radio.Button value="all">All vehicles</Radio.Button>
        </Radio.Group>
        {loading && <Spin size="small" />}
      </div>
      {/* <p className="mt-1.5 text-[11px] text-slate-500">Assignments in this plan and its displayed linked routes. Trip times include home travel when planned.</p> */}
    </div>
    {error && <Alert className="shrink-0" type="warning" showIcon title="Vehicle details could not be loaded" description={error} />}
    <div role="region" aria-label="Vehicle assignment list" tabIndex={0}
      className="custom-scrollbar min-h-0 flex-1 overflow-auto overscroll-contain p-3 space-y-3">
      {visible.length === 0 && <div className="py-10 text-center text-sm text-slate-500" role="status">
        {search ? "No vehicles or drivers match your search." : loading ? "Loading vehicles…" : "No vehicle assignments to show."}
      </div>}
      {visible.map(group => <article key={group.key} aria-label={group.name} className="border border-slate-200 rounded-md overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200">
          <Truck size={16} className={group.vehicleId === null ? "text-amber-600" : "text-emerald-800"} />
          <h3 className={`text-sm font-bold ${group.vehicleId === null ? "text-amber-800" : "text-slate-900"}`}>{group.name}</h3>
          {group.plate && <span className="text-xs text-slate-600 border border-slate-300 bg-white px-1.5 rounded">{group.plate}</span>}
          {group.capacity != null && <span className="text-[11px] text-slate-500">{group.capacity} seats</span>}
          <span className="ml-auto text-[11px] text-slate-500">{group.assignments.length} trip{group.assignments.length === 1 ? "" : "s"}</span>
        </div>
        {group.assignments.length ? <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Driver assignments for {group.name}</caption>
            <thead className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <tr>{["Driver", "Journey", "Start", "Finish", "Jobs", ""].map((label, index) =>
                <th key={index} scope="col" className="px-3 py-2 font-semibold">{label || <span className="sr-only">Actions</span>}</th>)}</tr>
            </thead>
            <tbody>{group.assignments.map(assignment => <tr key={assignment.key} className="border-b border-slate-100 last:border-0 hover:bg-emerald-50/30">
              <td className="px-3 py-2.5 min-w-40">
                <span className="font-semibold text-slate-800">{assignment.driverName}</span>
                {assignment.planName && <div className="mt-0.5 text-[10px] text-slate-500">{assignment.planName}</div>}
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <span className="border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{assignment.leg}</span>
                {assignment.pending && <span className="ml-1 text-[10px] text-amber-700">Pending optimization</span>}
              </td>
              <td className="px-3 py-2.5"><AssignmentTime value={assignment.start} /></td>
              <td className="px-3 py-2.5"><AssignmentTime value={assignment.end} /></td>
              <td className="px-3 py-2.5 text-slate-600">{assignment.jobCount}</td>
              <td className="px-3 py-2.5 text-right">
                <button type="button" onClick={() => onViewTrip(assignment)}
                  aria-label={`View ${group.name} trip with ${assignment.driverName} in timeline`}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-800 font-semibold cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-emerald-700 focus-visible:outline-offset-2">
                  View timeline <ArrowRight size={12} />
                </button>
              </td>
            </tr>)}</tbody>
          </table>
        </div> : <p className="px-3 py-3 text-xs text-slate-500">No trips shown for this vehicle in this plan.</p>}
      </article>)}
    </div>
  </section>;
}
