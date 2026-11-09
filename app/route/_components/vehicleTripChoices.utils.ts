import type { Routes } from "@/types/routes.type";
import { tripLabel } from "./tripLabel.utils";

export function vehicleTripChoices(routes: Routes[], driverId: number | undefined) {
  const trips = routes.map((route, index) => ({ route, index })).filter(({ route }) =>
    route.team_member_id === driverId && route.stops?.length);
  const choices = trips.flatMap(({ route, index }) => {
    return route.leg === "COMBINED" ? [
      { value: `${index}:GO`, label: tripLabel(route, { driver: false, vehicle: true, leg: "GO" }) },
      { value: `${index}:RETURN`, label: tripLabel(route, { driver: false, vehicle: true, leg: "RETURN" }) },
      { value: String(index), label: tripLabel(route, { driver: false, vehicle: true }) },
    ] : [{ value: String(index), label: tripLabel(route, { driver: false, vehicle: true }) }];
  });
  if (trips.length > 1) choices.push({ value: "all", label: "All trips for this driver" });
  return choices;
}
