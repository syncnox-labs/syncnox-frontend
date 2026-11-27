import { JobStatus } from "@/types/job.type";
import { STATUS_COLORS } from "./jobs.utils";

/**
 * Creates a custom map marker icon as an SVG data URL
 * @param number - The number to display on the marker
 * @param status - The job status for color selection
 * @param isSelected - Whether the marker is selected (for size adjustment)
 * @returns Google Maps Icon configuration
 */
export const LOCATION_TYPE_COLORS: Record<string, string> = {
  metro_station: "#7c3aed",
  customer_site: "#2563eb",
  end_customer: "#0891b2",
  pickup: "#059669",
  warehouse: "#d97706",
  other: "#64748b",
};

const CUSTOM_TYPE_PALETTE = [
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#f97316", // orange
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#e11d48", // rose
  "#84cc16", // lime
];

export const getLocationTypeColor = (type?: string): string => {
  if (!type || !type.trim()) return LOCATION_TYPE_COLORS.metro_station;
  const key = type.toLowerCase().replace(/\s+/g, "_");
  if (LOCATION_TYPE_COLORS[key]) {
    return LOCATION_TYPE_COLORS[key];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CUSTOM_TYPE_PALETTE.length;
  return CUSTOM_TYPE_PALETTE[index];
};

/**
 * Map marker icons as SVG data URLs. Three kinds, three shapes, so a glance tells them apart:
 * - Stop: a pin in the trip's colour with the stop number. A small arrow in the same colour says
 *   pickup (up) or drop-off (down), matching the timeline. No extra colours.
 * - Depot: a dark square with a house (start) or flag (end), centred on the place.
 * - Additional location: a small square tile in the type's colour, centred and drawn under stops.
 *   It is reference, not work, so it is smaller and quieter than a stop.
 * Status: assigned stops are outlined, completed are filled, failed are filled red.
 * An edited stop carries the same dark pencil disc the timeline uses.
 */
const ICON_PATHS: Record<string, string> = {
  metro_station: `<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16M12 3v7M8 21l2-4m6 4l-2-4"/>`,
  warehouse: `<path d="M3 21h18M3 10l9-7 9 7v11H3zM9 21v-8h6v8"/>`,
  customer_site: `<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12h12M6 8h12M6 16h12"/>`,
  end_customer: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  pickup: `<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>`,
  other: `<circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>`,
};

const toIcon = (svg: string, width: number, height: number, anchorX: number, anchorY: number): google.maps.Icon => ({
  url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
  scaledSize: new google.maps.Size(width, height),
  anchor: new google.maps.Point(anchorX, anchorY),
});

const SHADOW = `<filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-color="#000" flood-opacity="0.28"/></filter>`;

export const createCustomMarkerIcon = (
  number: string | number,
  status: JobStatus,
  isSelected: boolean = false,
  colorOverride?: string,
  isDepot: boolean = false,
  _depotLabel: string = "Depot",
  depotKind?: string,
  stopType?: string,
  isNew: boolean = false,
  isTimeEdited: boolean = false,
  isAdditionalLocation: boolean = false,
  locationType?: string,
  jobCount: number = 1
): google.maps.Icon => {
  const scale = isSelected ? 1.3 : 1;

  if (isDepot) {
    const size = 30 * scale;
    const glyph = depotKind === "end"
      ? `<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>`
      : `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`;
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg"><defs>${SHADOW}</defs>
      <rect x="2" y="2" width="26" height="26" rx="2" fill="${colorOverride || "#003220"}" stroke="#ffffff" stroke-width="1.5" filter="url(#s)"/>
      <g transform="translate(7.5,7.5) scale(0.625)" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none">${glyph}</g></svg>`;
    return toIcon(svg, size, size, size / 2, size / 2);
  }

  if (isAdditionalLocation) {
    const key = (locationType || "metro_station").toLowerCase().replace(/\s+/g, "_");
    const color = colorOverride || getLocationTypeColor(locationType);
    const size = 22 * scale;
    const svg = `<svg width="${size}" height="${size}" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><defs>${SHADOW}</defs>
      <rect x="1.5" y="1.5" width="19" height="19" rx="2" fill="${color}" stroke="#ffffff" stroke-width="1.5" filter="url(#s)"/>
      <g transform="translate(5,5) scale(0.5)" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none">${ICON_PATHS[key] || ICON_PATHS.other}</g></svg>`;
    return toIcon(svg, size, size, size / 2, size / 2);
  }

  const routeColor = colorOverride || STATUS_COLORS[status] || STATUS_COLORS.draft;
  const failed = status === "failed" || status === "cancelled";
  const skipped = (status as string) === "skipped";
  const partly = (status as string) === "partly_done";
  const filled = failed || skipped || status === "completed";
  const color = failed ? "#C9372C" : skipped ? "#9AA59F" : routeColor;
  // Some passengers done, some still to do: a light fill in the trip colour, the same as the timeline.
  const fill = filled ? color : partly ? `${color}40` : "#ffffff";
  const ink = filled ? "#ffffff" : color;
  const ring = isNew ? "#1F845A" : color;

  // Several jobs at one stop: a second pin outline behind (lower right) and a dark count tag in the top-right
  // corner, placed exactly as on the timeline arrow. The direction badge then moves to the top-left corner.
  const many = jobCount > 1;
  const pinPath = "M16 1C9.9 1 5 5.9 5 12c0 7.4 11 23 11 23s11-15.6 11-23C27 5.9 22.1 1 16 1z";
  const stack = many ? `<path d="${pinPath}" transform="translate(3,3)" fill="#ffffff" stroke="${color}" stroke-opacity="0.6" stroke-width="1.5"/>` : "";
  const countLabel = jobCount > 99 ? "99+" : String(jobCount);
  const countWidth = 8 + countLabel.length * 5.5;
  const count = many ? `<rect x="${27.5 - countWidth / 2}" y="-1" width="${countWidth}" height="12" fill="#12211A" stroke="#ffffff" stroke-width="1.5"/>
      <text x="27.5" y="5.3" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${countLabel}</text>` : "";

  // Pickup arrow points up, drop-off down, both in the pin's own colour (as on the timeline).
  const type = String(stopType || "").toLowerCase();
  const arrow = type === "pickup" || type === "pick_up" ? "up" : type === "dropoff" || type === "drop_off" ? "down" : type === "pickup_dropoff" ? "both" : null;
  const arrowPath = arrow === "up" ? "M12 19V5m-6 6 6-6 6 6" : arrow === "down" ? "M12 5v14m6-6-6 6-6-6" : "m7 7 5-5 5 5M12 2v20m-5-5 5 5 5-5";
  const bx = many ? 5 : 27; // top-right normally, top-left when the count tag takes the top-right corner
  const badge = arrow ? `<circle cx="${bx}" cy="5" r="6.5" fill="#ffffff" stroke="${color}" stroke-width="1.5"/>
      <g transform="translate(${bx - 5.4},-0.4) scale(0.45)" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="${arrowPath}"/></g>` : "";
  // The same dark pencil disc the timeline shows on edited stops; it drops to the lower left when the top-left is taken.
  const ey = many && arrow ? 22 : 5;
  const edited = isTimeEdited ? `<circle cx="5" cy="${ey}" r="6" fill="#12211A" stroke="#ffffff" stroke-width="1.5"/>
      <g transform="translate(1.4,${ey - 3.6}) scale(0.3)" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></g>` : "";

  const width = 36 * scale;
  const height = 44 * scale;
  const svg = `<svg width="${width}" height="${height}" viewBox="-2 -2 36 44" xmlns="http://www.w3.org/2000/svg"><defs>${SHADOW}</defs>
    ${stack}<path d="${pinPath}" fill="${fill}" stroke="${ring}" stroke-width="${isNew ? 3 : 2}" filter="url(#s)"/>
    <text x="16" y="12.5" font-family="Inter, Arial, sans-serif" font-size="11" font-weight="600" fill="${ink}" text-anchor="middle" dominant-baseline="central">${number}</text>
    ${badge}${edited}${count}</svg>`;
  // Anchor at the pin's tip.
  return toIcon(svg, width, height, width * (18 / 36), height * (37 / 44));
};
