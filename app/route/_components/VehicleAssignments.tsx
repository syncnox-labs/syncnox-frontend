"use client";

import { useMemo, useState } from "react";
import { Alert, Input, Select, Spin } from "antd";
import { ArrowRight, Search, Truck, User } from "lucide-react";
import dayjs from "dayjs";
import type { Routes } from "@/types/routes.type";
import type { Vehicle } from "@/types/vehicle.type";
import { buildVehicleSchedule, filterVehicleSchedule, type VehicleAssignment, type VehicleSchedule } from "./vehicleSchedule.utils";

type View = "vehicle" | "driver";

/** One row: a trip, with the vehicle it used, so the same rows can be grouped by vehicle or by driver. */
interface TripRow extends VehicleAssignment {
  vehicleName: string;
  plate: string | null;
  capacity: number | null;
}
interface Group {
  key: string;
  name: string;
  plate: string | null;
  capacity: number | null;
  missingVehicle: boolean;
  rows: TripRow[];
}

const ms = (value: string | null) => (value ? Date.parse(value) : NaN);
const minutesWord = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};
const journeyWord = (leg: string) => leg.split(" + ").map(part => {
  const word = part.toLowerCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}).join(" + ").replace(/ \+ (\w)/g, (_, c) => ` + ${c.toLowerCase()}`);

/** Turnarounds shorter than this are flagged, so the dispatcher can check the driver has time to get back. */
const TIGHT_TURNAROUND_MIN = 60;

function When({ start, end }: { start: string | null; end: string | null }) {
  if (!start) return <span className="text-[#8A6700]">Time unavailable</span>;
  const s = dayjs(start), e = end ? dayjs(end) : null;
  const days = e ? e.startOf("day").diff(s.startOf("day"), "day") : 0;
  const length = e ? Math.max(0, e.diff(s, "minute")) : null;
  return <span className="whitespace-nowrap tabular-nums">
    <time dateTime={start} className="text-[#12211A]">{s.format("h:mm A")}</time>
    {e && <>
      <span className="text-[#626E67]"> – </span>
      <time dateTime={end!} className="text-[#12211A]">{e.format("h:mm A")}</time>
      {days > 0 && <span className="ml-1 text-[12px] text-[#626E67]">{days === 1 ? "next day" : `+${days} days`}</span>}
    </>}
    {length !== null && <span className="block text-[12px] text-[#626E67]">{minutesWord(length)}</span>}
  </span>;
}

/** Calendar days a trip touches. An overnight trip belongs to both days, so a vehicle never looks free at midnight. */
const daysTouched = (row: { start: string | null; end: string | null }): string[] => {
  if (!row.start) return [];
  const first = dayjs(row.start).startOf("day");
  const last = row.end ? dayjs(row.end).startOf("day") : first;
  const keys: string[] = [];
  for (let d = first; !d.isAfter(last) && keys.length < 14; d = d.add(1, "day")) keys.push(d.format("YYYY-MM-DD"));
  return keys;
};

export default function VehicleAssignments({ routes, vehicles, loading, error, onViewTrip, planDate }: {
  routes: Routes[];
  vehicles: Vehicle[];
  loading: boolean;
  error: string | null;
  onViewTrip: (assignment: VehicleAssignment) => void;
  /** The plan's own day, marked "plan" in the day tabs. */
  planDate?: string | null;
}) {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"scheduled" | "all">("scheduled");
  const [view, setView] = useState<View>("vehicle");
  const [day, setDay] = useState<string>("all");
  const schedule = useMemo(() => buildVehicleSchedule(routes, vehicles), [routes, vehicles]);
  const vehicleGroups = useMemo(() => filterVehicleSchedule(schedule, search, scope), [schedule, search, scope]);

  // Every trip once, carrying its vehicle, so the driver view is the same data regrouped.
  const allRows = useMemo<TripRow[]>(() => schedule.flatMap((group: VehicleSchedule) => group.assignments.map(a => ({
    ...a, vehicleName: group.name, plate: group.plate, capacity: group.capacity,
  }))), [schedule]);

  const groups = useMemo<Group[]>(() => {
    if (view === "vehicle") {
      return vehicleGroups.map(group => ({
        key: group.key, name: group.name, plate: group.plate, capacity: group.capacity,
        missingVehicle: group.vehicleId === null,
        rows: group.assignments.map(a => ({ ...a, vehicleName: group.name, plate: group.plate, capacity: group.capacity })),
      }));
    }
    const query = search.trim().toLocaleLowerCase();
    const byDriver = new Map<string, Group>();
    allRows.forEach(row => {
      if (query && !`${row.driverName} ${row.vehicleName} ${row.plate ?? ""}`.toLocaleLowerCase().includes(query)) return;
      const group = byDriver.get(row.driverName) ?? { key: row.driverName, name: row.driverName, plate: null, capacity: null, missingVehicle: false, rows: [] };
      group.rows.push(row);
      byDriver.set(row.driverName, group);
    });
    return [...byDriver.values()]
      .map(group => ({ ...group, rows: [...group.rows].sort((a, b) => (ms(a.start) || Infinity) - (ms(b.start) || Infinity)) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [view, vehicleGroups, allRows, search]);


  // Days the plan's trips touch, with how many trips touch each.
  const days = useMemo(() => {
    const counts = new Map<string, number>();
    allRows.forEach(row => daysTouched(row).forEach(key => counts.set(key, (counts.get(key) ?? 0) + 1)));
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({ key, count }));
  }, [allRows]);
  const activeDay = day !== "all" && days.some(d => d.key === day) ? day : "all";
  const onDay = (row: TripRow) => activeDay === "all" || daysTouched(row).includes(activeDay);
  const planDayKey = planDate && dayjs(planDate).isValid() ? dayjs(planDate).format("YYYY-MM-DD") : null;

  const shownRows = allRows.filter(onDay);
  const scheduledVehicles = new Set(shownRows.map(row => row.vehicleName)).size;
  const driverCount = new Set(shownRows.map(row => row.driverName)).size;

  return <section aria-label="Vehicle assignments" className="lang absolute inset-0 flex min-h-0 min-w-0 flex-col overflow-hidden bg-white">
    <div className="shrink-0 flex flex-wrap items-center gap-3 border-b border-[#E3E8E5] px-4" style={{ minHeight: 41 }}>
      <div role="tablist" aria-label="Group trips" className="flex items-stretch self-stretch">
        {([["vehicle", "By vehicle", Truck], ["driver", "By driver", User]] as const).map(([value, label, Icon]) => (
          <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)}
            className={`inline-flex items-center gap-1.5 px-2 text-[12px] bg-transparent cursor-pointer border-0 border-b-2 ${view === value
              ? "border-[#003220] text-[#12211A] font-medium" : "border-transparent text-[#4A5750] hover:text-[#12211A]"}`}>
            <Icon size={14} aria-hidden="true" />{label}
          </button>
        ))}
      </div>
      <Input size="small" aria-label="Search vehicles or drivers" placeholder="Search vehicle, plate or driver" allowClear
        prefix={<Search size={14} className="text-[#626E67]" />} value={search}
        onChange={event => setSearch(event.target.value)} style={{ width: 240, maxWidth: "100%" }} />
      {view === "vehicle" && <div role="group" aria-label="Filter vehicles" className="flex">
        {([["scheduled", "With trips"], ["all", "All vehicles"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={scope === value} onClick={() => setScope(value)}
            className={`h-7 px-2 text-[12px] border-0 cursor-pointer ${scope === value ? "bg-[#E7F3ED] text-[#003220] font-medium" : "bg-transparent text-[#4A5750] hover:text-[#12211A]"}`}>
            {label}
          </button>
        ))}
      </div>}
      {days.length > 1 && <label className="inline-flex items-center gap-1.5 text-[12px] text-[#626E67]"
        title="A trip that runs past midnight is listed on both days">
        Driving on
        <Select size="small" aria-label="Show trips driving on one day" value={activeDay} onChange={setDay} style={{ width: 168 }}
          popupMatchSelectWidth={false}
          options={[{ value: "all", label: "All days" }, ...days.map(({ key }) => ({
            value: key, label: `${dayjs(key).format("ddd, MMM D")}${key === planDayKey ? " · plan day" : ""}`,
          }))]} />
      </label>}
      {loading && <Spin size="small" />}
      <span className="ml-auto text-[12px] text-[#626E67] tabular-nums">
        {shownRows.length} trips · {scheduledVehicles} vehicles · {driverCount} drivers
      </span>
    </div>
    {error && <Alert className="shrink-0" type="warning" showIcon title="Vehicle details could not be loaded" description={error} />}

    <div role="region" aria-label="Vehicle assignment list" tabIndex={0} className="custom-scrollbar min-h-0 flex-1 overflow-auto overscroll-contain">
      {groups.length === 0 || (activeDay !== "all" && shownRows.length === 0 && !(view === "vehicle" && scope === "all"))
        ? <div className="py-10 text-center text-[13px] text-[#626E67]" role="status">
        {search ? "No vehicles or drivers match your search." : loading ? "Loading vehicles…"
          : activeDay !== "all" ? `No trips on ${dayjs(activeDay).format("ddd, MMM D")}.` : "No vehicle assignments to show."}
      </div> : <table className="w-full min-w-[760px] border-collapse text-left text-[13px]">
        <caption className="sr-only">Trips grouped {view === "vehicle" ? "by vehicle" : "by driver"}</caption>
        <colgroup>
          <col style={{ width: "13%" }} /><col style={{ width: "20%" }} /><col style={{ width: "22%" }} />
          <col style={{ width: "18%" }} /><col style={{ width: "18%" }} /><col style={{ width: "9%" }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-white text-[11px] font-medium uppercase tracking-wide text-[#626E67]">
          <tr className="border-b border-[#E3E8E5]">
            <th scope="col" className="px-4 py-2 font-medium">Day</th>
            <th scope="col" className="px-3 py-2 font-medium">Time</th>
            <th scope="col" className="px-3 py-2 font-medium">{view === "vehicle" ? "Driver" : "Vehicle"}</th>
            <th scope="col" className="px-3 py-2 font-medium">Trip</th>
            <th scope="col" className="px-3 py-2 font-medium" title={`Shown only when the trip overlaps the one before it, or starts less than ${TIGHT_TURNAROUND_MIN} min after it`}>Check</th>
            <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        {groups.map(group => {
          const dayRows = group.rows.filter(onDay);
          const vehiclesUsed = new Set(dayRows.map(row => row.vehicleName)).size;
          const driversUsed = new Set(dayRows.map(row => row.driverName)).size;
          let overlapCount = 0, tightCount = 0;
          const rows = group.rows.map((row, index) => {
            const previous = group.rows[index - 1];
            const gap = previous && Number.isFinite(ms(previous.end)) && Number.isFinite(ms(row.start))
              ? Math.round((ms(row.start) - ms(previous.end)) / 60000) : null;
            return { row, previous, gap };
          }).filter(({ row }) => onDay(row));
          rows.forEach(({ gap }) => {
            if (gap !== null && gap < 0) overlapCount += 1;
            else if (gap !== null && gap < TIGHT_TURNAROUND_MIN) tightCount += 1;
          });
          // On a single day, a group with nothing that day is hidden, unless the user asked for every vehicle.
          if (activeDay !== "all" && rows.length === 0 && !(view === "vehicle" && scope === "all")) return null;
          return <tbody key={group.key} aria-label={group.name}>
            <tr className="border-t-8 border-white">
              <th scope="rowgroup" colSpan={7} className="bg-[#F3F6F4] px-4 pt-2.5 pb-2 text-left font-normal">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  {view === "vehicle"
                    ? <Truck size={15} className={`self-center ${group.missingVehicle ? "text-[#8A6700]" : "text-[#4A5750]"}`} aria-hidden="true" />
                    : <User size={15} className="self-center text-[#4A5750]" aria-hidden="true" />}
                  <h3 className={`m-0 text-[14px] font-medium ${group.missingVehicle ? "text-[#8A6700]" : "text-[#12211A]"}`}>{group.name}</h3>
                  {group.plate && <span className="text-[12px] text-[#4A5750]">{group.plate}</span>}
                  {group.capacity != null && <span className="text-[12px] text-[#626E67]">{group.capacity} seats</span>}
                  <span className="ml-auto text-[12px] text-[#4A5750] tabular-nums">
                    {rows.length} trip{rows.length === 1 ? "" : "s"}
                    {view === "vehicle" ? ` · ${driversUsed} driver${driversUsed === 1 ? "" : "s"}` : ` · ${vehiclesUsed} vehicle${vehiclesUsed === 1 ? "" : "s"}`}
                    {overlapCount > 0 && <span className="text-[#C9372C]"> · {overlapCount} overlap{overlapCount === 1 ? "" : "s"}</span>}
                    {tightCount > 0 && <span className="text-[#8A6700]"> · {tightCount} tight turnaround{tightCount === 1 ? "" : "s"}</span>}
                  </span>
                </div>
              </th>
            </tr>
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-3 text-[12px] text-[#626E67]">
              {activeDay === "all" ? "No trips shown for this vehicle in this plan." : `No trips on ${dayjs(activeDay).format("ddd, MMM D")}.`}
            </td></tr>}
            {rows.map(({ row, previous, gap }, index) => {
              const other = view === "vehicle" ? row.driverName : row.vehicleName;
              const changed = previous && (view === "vehicle" ? previous.driverName !== row.driverName : previous.vehicleName !== row.vehicleName);
              const dayKey = row.start ? dayjs(row.start).format("YYYY-MM-DD") : null;
              const sameDayAsAbove = index > 0 && rows[index - 1].row.start && dayKey === dayjs(rows[index - 1].row.start).format("YYYY-MM-DD");
              return <tr key={row.key} className="border-b border-[#E3E8E5] align-top hover:bg-[#F8FAF9]">
                <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                  {row.start && <time dateTime={row.start} className={sameDayAsAbove ? "text-[#626E67]" : "text-[#12211A]"}>
                    {dayjs(row.start).format("ddd, MMM D")}</time>}
                  {row.start && dayKey === planDayKey && <span className="block text-[11px] uppercase tracking-wide text-[#626E67]">Plan day</span>}
                </td>
                <td className="px-3 py-2.5"><When start={row.start} end={row.end} /></td>
                <td className="px-3 py-2.5">
                  <span className="text-[#12211A]" title={changed ? (view === "vehicle" ? `Takes over from ${previous!.driverName}` : `Was in ${previous!.vehicleName} before`) : undefined}>{other}</span>
                  {view === "driver" && row.capacity != null && <span className="ml-1.5 text-[12px] text-[#626E67]">{row.capacity} seats</span>}
                </td>
                <td className="px-3 py-2.5 text-[#4A5750]">
                  <span className="whitespace-nowrap">{journeyWord(row.leg)} · <span className="tabular-nums">{row.jobCount} {row.jobCount === 1 ? "job" : "jobs"}</span></span>
                  {row.planName && <span className="block text-[12px] text-[#626E67]">From {row.planName}</span>}
                  {row.pending && <span className="block text-[12px] text-[#8A6700]">Pending optimization</span>}
                </td>
                <td className="px-3 py-2.5 text-[12px]">
                  {gap !== null && gap < 0 && <span className="text-[#C9372C]">Overlaps the trip before by {minutesWord(-gap)}</span>}
                  {gap !== null && gap >= 0 && gap < TIGHT_TURNAROUND_MIN && <span className="text-[#8A6700]">Only {minutesWord(gap)} after the trip before</span>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button type="button" onClick={() => onViewTrip(row)}
                    aria-label={`View ${row.vehicleName} trip with ${row.driverName} in timeline`}
                    className="inline-flex items-center gap-1 whitespace-nowrap border-0 bg-transparent p-0 text-[12px] text-[#0B5D3B] cursor-pointer hover:underline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]">
                    Timeline <ArrowRight size={12} />
                  </button>
                </td>
              </tr>;
            })}
          </tbody>;
        })}
      </table>}
    </div>
  </section>;
}

