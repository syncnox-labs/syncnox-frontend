import type { Routes } from "@/types/routes.type";

type Trip = Pick<Routes, "team_member_name" | "vehicle_name" | "leg" | "stops" | "name">;

function clock(value: string): string | null {
  const match = /(?:T|^)(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

function dateLabel(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function tripLabel(route: Trip | undefined, options: { driver?: boolean; vehicle?: boolean; leg?: string | null } = {}): string {
  if (!route) return "Trip details unavailable";
  const leg = options.leg ?? route.leg;
  const direction = leg === "GO" ? "Outbound trip" : leg === "RETURN" ? "Return trip"
    : leg === "COMBINED" ? "Outbound and return trips" : "Trip";
  const scoped = options.leg && route.leg === "COMBINED" ? route.stops?.filter(stop => stop.leg === options.leg) : route.stops;
  const times = (scoped || []).map(stop => stop.arrival_time).filter((value): value is string => Boolean(value)).sort();
  const start = times[0], end = times[times.length - 1];
  const startTime = start && clock(start), endTime = end && clock(end);
  const startDate = start && dateLabel(start), endDate = end && dateLabel(end);
  const when = startTime ? `${startDate ? `${startDate}, ` : ""}${startTime}${endTime && end !== start ? `–${endDate && endDate !== startDate ? `${endDate}, ` : ""}${endTime}` : ""}` : "Time not set";
  return [options.driver !== false ? route.team_member_name || "Driver not assigned" : null,
    direction, when, options.vehicle ? route.vehicle_name || "Vehicle not assigned" : null,
    route.name || null].filter(Boolean).join(" · ");
}

export function vehicleAvailabilityMessage(reason?: string | null): string | null {
  if (!reason) return null;
  const match = /^(Assigned to another (?:trip|plan) at this time|Booked by another route at this time|Reserved at this time) · Driver: (.+)$/.exec(reason);
  if (match) return `${match[2]} is using this vehicle during the selected trip.`;
  return reason;
}
