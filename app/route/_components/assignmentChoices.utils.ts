import type { AssignmentChoice } from "@/apis/manualRouting.api";

export function choicesCoverJobs(choices: AssignmentChoice[], jobIds: number[]) {
  const covered = new Set(choices.flatMap(choice => choice.job_ids));
  return jobIds.every(id => covered.has(id));
}

export function filterAssignmentChoices(choices: AssignmentChoice[], options: {
  placement: "auto" | "existing" | "new"; routeIndex?: number;
  includeExtraHours: boolean; changeFixedDriver: boolean;
}) {
  return choices.filter(choice =>
    (options.includeExtraHours || !choice.requires_working_time_extension) &&
    (options.changeFixedDriver || !choice.changes_required_driver) &&
    (options.placement !== "new" || choice.route_index === null) &&
    (options.placement !== "existing" || (choice.route_index !== null &&
      (options.routeIndex === undefined || choice.route_index === options.routeIndex))));
}
