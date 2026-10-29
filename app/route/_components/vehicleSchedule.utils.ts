import type { Routes, Stop } from "@/types/routes.type";
import type { Vehicle } from "@/types/vehicle.type";

export interface VehicleAssignment {
  key: string;
  routeIndex: number;
  startStopIndex: number;
  driverName: string;
  leg: string;
  start: string | null;
  end: string | null;
  jobCount: number;
  pending: boolean;
  planName: string | null;
}

export interface VehicleSchedule {
  key: string;
  vehicleId: number | null;
  name: string;
  plate: string | null;
  capacity: number | null;
  assignments: VehicleAssignment[];
}

function validTime(value?: string): value is string {
  return Boolean(value && Number.isFinite(Date.parse(value)));
}

/** Preserve separate depot-bounded trips so the gap between them is not a booking. */
function tripStops(stops: Stop[]): { stop: Stop; index: number }[][] {
  const trips: { stop: Stop; index: number }[][] = [];
  let current: { stop: Stop; index: number }[] = [];
  const flush = () => {
    if (current.some(({ stop }) => stop.job_id != null)) trips.push(current);
    current = [];
  };
  stops.forEach((stop, index) => {
    const previous = current[current.length - 1]?.stop;
    const unboundedLegChange = current[0]?.stop.stop_type !== "depot_start"
      && previous?.leg && stop.leg && previous.leg !== stop.leg;
    if (stop.stop_type === "depot_start" || unboundedLegChange) flush();
    current.push({ stop, index });
    if (stop.stop_type === "depot_end") flush();
  });
  flush();
  return trips;
}

/** Uses the plan's trip assignments, never a vehicle's default team member. */
export function buildVehicleSchedule(routes: Routes[], vehicles: Vehicle[]): VehicleSchedule[] {
  const fleet = new Map(vehicles.map(vehicle => [vehicle.id, vehicle]));
  const groups = new Map<string, VehicleSchedule>();
  const ensure = (id: number | null, route?: Routes) => {
    const key = id === null ? "missing" : String(id);
    let group = groups.get(key);
    if (!group) {
      const vehicle = id === null ? undefined : fleet.get(id);
      const seats = vehicle?.load_constraints.find(constraint => constraint.constraint_type === "capacity"
        && ["seat", "seats", "passenger", "passengers"].includes(constraint.unit?.toLowerCase()))?.max_value;
      group = {
        key, vehicleId: id,
        name: route?.vehicle_name || vehicle?.name || (id === null ? "Vehicle not assigned" : `Vehicle #${id}`),
        plate: vehicle?.license_plate || null,
        capacity: route?.vehicle_capacity ?? seats ?? null,
        assignments: [],
      };
      groups.set(key, group);
    }
    return group;
  };
  routes.forEach((route, routeIndex) => {
    const trips = tripStops(route.stops || []);
    if (!trips.length) return;
    const group = ensure(route.vehicle_id || null, route);
    trips.forEach(trip => {
      const first = trip[0], last = trip[trip.length - 1];
      const legs = [...new Set(trip.map(({ stop }) => stop.leg).filter(Boolean))];
      const start = validTime(first.stop.arrival_time) ? first.stop.arrival_time : null;
      // An open route still occupies the vehicle while its last passenger alights.
      const service = last.stop.stop_type === "depot_end" ? 0
        : last.stop.service_duration_seconds ?? (last.stop.service_duration_minutes || 0) * 60;
      const end = validTime(last.stop.arrival_time) && Number.isFinite(service) && service >= 0
        ? new Date(Date.parse(last.stop.arrival_time) + service * 1000).toISOString() : null;
      const chronological = start && end && Date.parse(end) >= Date.parse(start);
      group.assignments.push({
        key: `${routeIndex}-${first.index}`, routeIndex,
        startStopIndex: trip.find(({ stop }) => validTime(stop.arrival_time))?.index ?? first.index,
        driverName: route.team_member_name || `Driver #${route.team_member_id}`,
        leg: legs.length ? legs.join(" + ") : route.leg === "COMBINED" ? "GO + RETURN" : route.leg || "Trip",
        start, end: chronological ? end : null,
        jobCount: new Set(trip.map(({ stop }) => stop.job_id).filter(id => id != null)).size,
        pending: Boolean(route.needs_optimization || trip.some(({ stop }) => stop.needs_optimization
          || (stop.needs_optimization === undefined && (stop.is_new || stop.time_edited)))),
        planName: route.source_route_name || (route.source_optimization_id ? `Plan #${route.source_optimization_id}` : null),
      });
    });
  });
  vehicles.forEach(vehicle => ensure(vehicle.id));
  for (const group of groups.values()) {
    group.assignments.sort((a, b) => (a.start ? Date.parse(a.start) : Infinity) - (b.start ? Date.parse(b.start) : Infinity)
      || a.routeIndex - b.routeIndex || a.startStopIndex - b.startStopIndex);
  }
  return [...groups.values()].sort((a, b) => Number(b.assignments.length > 0) - Number(a.assignments.length > 0)
    || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function filterVehicleSchedule(groups: VehicleSchedule[], search: string, scope: "scheduled" | "all"): VehicleSchedule[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  const query = normalize(search);
  const matches = (value: string | null) => value !== null && normalize(value).includes(query);
  return groups.filter(group => {
    if (scope === "scheduled" && !group.assignments.length) return false;
    // Match the whole phrase within one visible field, preserving the vehicle's full schedule.
    return !query || matches(group.name) || matches(group.plate)
      || group.assignments.some(assignment => matches(assignment.driverName));
  });
}
