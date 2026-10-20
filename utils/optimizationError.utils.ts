/** Compact older saved fit errors as well as errors from the current worker. */
export function formatOptimizationError(value: string): string {
  if (!value.includes("Unable to optimize the added booking without dropping assigned jobs")) return value;
  const ids = [...new Set([...value.matchAll(/Job #(\d+):/g)].map(match => match[1]))];
  if (!ids.length) return "Added booking cannot fit this driver's route. Assignments kept.";
  const visible = ids.slice(0, 3).map(id => `#${id}`).join(", ");
  const more = ids.length > 3 ? ` +${ids.length - 3} more` : "";
  return `Jobs ${visible}${more}: cannot fit this driver's hours or route constraints. Assignments kept.`;
}
