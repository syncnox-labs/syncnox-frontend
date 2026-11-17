/** Keep saved drivers in order and append any new drivers in their original order. */
export function orderDrivers<T extends { driverKey: string }>(groups: T[], savedKeys: string[]): T[] {
  const byKey = new Map(groups.map(group => [group.driverKey, group]));
  const ordered: T[] = [];
  for (const key of savedKeys) {
    const group = byKey.get(key);
    if (group) { ordered.push(group); byKey.delete(key); }
  }
  for (const group of groups) {
    if (byKey.has(group.driverKey)) { ordered.push(group); byKey.delete(group.driverKey); }
  }
  return ordered;
}

/** Move among visible drivers while keeping filtered-out drivers in their slots. */
export function moveVisibleDriver(allKeys: string[], visibleKeys: string[], source: string, target: string, side: "before" | "after"): string[] {
  if (source === target || !visibleKeys.includes(source) || !visibleKeys.includes(target)) return allKeys;
  const visible = visibleKeys.filter(key => key !== source);
  const targetIndex = visible.indexOf(target);
  visible.splice(targetIndex + (side === "after" ? 1 : 0), 0, source);
  const visibleSet = new Set(visibleKeys);
  let index = 0;
  return allKeys.map(key => visibleSet.has(key) ? visible[index++] : key);
}
