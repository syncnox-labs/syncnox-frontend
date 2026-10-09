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
 * Creates a custom map marker icon as an SVG data URL
 * @param number - The number to display on the marker
 * @param status - The job status for color selection
 * @param isSelected - Whether the marker is selected (for size adjustment)
 * @returns Google Maps Icon configuration
 */
export const createCustomMarkerIcon = (
  number: string | number,
  status: JobStatus,
  isSelected: boolean = false,
  colorOverride?: string,
  isDepot: boolean = false,
  depotLabel: string = "Depot",
  depotKind?: string,
  stopType?: string,
  isNew: boolean = false,
  isTimeEdited: boolean = false,
  isAdditionalLocation: boolean = false,
  locationType?: string
): google.maps.Icon => {
  let fillColor = "";
  let strokeColor = "";
  let strokeWidth = 0;
  let textColor = "";
  let dotColor = "";

  const locTypeKey = (locationType || "metro_station").toLowerCase().replace(/\s+/g, "_");
  const locTypeColor = getLocationTypeColor(locationType);

  let baseColor =
    colorOverride ||
    (isAdditionalLocation ? locTypeColor : isDepot ? "#003220" : STATUS_COLORS[status] || STATUS_COLORS.draft);

  if (isDepot) {
    fillColor = baseColor;
    strokeColor = "none";
    textColor = "white";
    dotColor = baseColor;
  } else if (isAdditionalLocation) {
    fillColor = baseColor;
    strokeColor = "#ffffff";
    strokeWidth = 1.5;
    textColor = "white";
    dotColor = baseColor;
  } else {
    if (status === "failed" || status === "cancelled") {
      baseColor = "#ff4d4f"; // red
      fillColor = baseColor;
      strokeColor = baseColor;
      strokeWidth = 0;
      textColor = "white";
    } else if (status === "completed") {
      fillColor = baseColor;
      strokeColor = baseColor;
      strokeWidth = 0;
      textColor = "white";
    } else {
      // draft, assigned, in_progress, etc.
      fillColor = "white";
      strokeColor = baseColor;
      strokeWidth = 2;
      textColor = baseColor;
    }
    dotColor = baseColor;
  }

  const scale = isSelected ? 1.35 : 1;
  /* 
    Depot markers are square (36x36 base) and centred.
    Stop and location markers are pins (32x45 base) and bottom-anchored.
  */
  // Rendered dimensions
  const width = (isDepot ? 36 : 32) * scale;
  const height = (isDepot ? 36 : 45) * scale;

  let badgeSvg = "";
  if (!isDepot && !isAdditionalLocation && stopType) {
    if (stopType === "pickup") {
      badgeSvg = `
        <!-- Pickup Badge (Emerald) -->
        <circle cx="26" cy="4" r="7" fill="#ffffff" stroke="#10b981" stroke-width="1.5"/>
        <g transform="translate(19, -3) scale(0.6)" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>
        </g>
      `;
    } else if (stopType === "dropoff" || stopType === "drop_off") {
      badgeSvg = `
        <!-- Dropoff Badge (Blue) -->
        <circle cx="26" cy="4" r="7" fill="#ffffff" stroke="#3b82f6" stroke-width="1.5"/>
        <g transform="translate(19, -3) scale(0.6)" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none">
          <path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>
        </g>
      `;
    }
  }

  const homeSvg = `<g transform="translate(6, 6) scale(1)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></g>`;
  const flagSvg = `<g transform="translate(6, 6) scale(1)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></g>`;
  
  const depotIconSvg = depotKind === "end" ? flagSvg : homeSvg;

  // Custom icon for additional location types
  let locTypeSvg = "";
  if (isAdditionalLocation) {
    if (locTypeKey === "metro_station") {
      locTypeSvg = `<g transform="translate(8.2, 4.2) scale(0.65)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16M12 3v7M8 21l2-4m6 4l-2-4"/><circle cx="8" cy="14" r="1" fill="white"/><circle cx="16" cy="14" r="1" fill="white"/></g>`;
    } else if (locTypeKey === "warehouse") {
      locTypeSvg = `<g transform="translate(8.2, 4.2) scale(0.65)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M3 21h18M3 10l9-7 9 7v11H3zM9 21v-8h6v8"/></g>`;
    } else if (locTypeKey === "customer_site") {
      locTypeSvg = `<g transform="translate(8.2, 4.2) scale(0.65)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12h12M6 8h12M6 16h12"/></g>`;
    } else if (locTypeKey === "end_customer") {
      locTypeSvg = `<g transform="translate(8.2, 4.2) scale(0.65)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></g>`;
    } else if (locTypeKey === "pickup") {
      locTypeSvg = `<g transform="translate(8.2, 4.2) scale(0.65)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></g>`;
    } else {
      // other / custom pin
      locTypeSvg = `<g transform="translate(8.2, 4.2) scale(0.65)" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3" fill="white"/></g>`;
    }
  }

  // SVG marker icon
  const svg = `
    <svg width="${width}" height="${height}" viewBox="-2 -2 36 49" xmlns="http://www.w3.org/2000/svg">
      <!-- Drop shadow -->
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5"/>
          <feOffset dx="0" dy="1" result="offsetblur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.35"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        ${(isNew || isTimeEdited) ? `
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur"/>
          <feComponentTransfer in="blur" result="glow">
            <feFuncA type="linear" slope="1.5"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="glow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        ` : ""}
      </defs>

      <!-- Main pin body (teardrop for stops and additional locations, rounded square for depot) -->
      ${
        isDepot
          ? `<rect x="2" y="2" width="28" height="28" rx="6" fill="${fillColor}" filter="url(#${(isNew || isTimeEdited) ? 'glow' : 'shadow'})"/>
             ${depotIconSvg}
            `
          : `<path 
            d="M16 0C9.4 0 4 5.4 4 12c0 8 12 24 12 24s12-16 12-24c0-6.6-5.4-12-12-12z" 
            fill="${fillColor}"
            stroke="${isNew ? '#059669' : isTimeEdited ? '#9333ea' : strokeColor}"
            stroke-width="${(isNew || isTimeEdited) ? 4 : strokeWidth}"
            filter="url(#${(isNew || isTimeEdited) ? 'glow' : 'shadow'})"
          />
          
          ${
            isAdditionalLocation
              ? locTypeSvg
              : `<!-- Number text -->
                 <text 
                   x="16" 
                   y="12" 
                   font-family="Arial, sans-serif" 
                   font-size="11" 
                   font-weight="bold" 
                   fill="${textColor}" 
                   text-anchor="middle" 
                   dominant-baseline="central"
                 >${number}</text>
                 ${badgeSvg}
                `
          }
          `
      }
      
      <!-- Dot trail -->
      <circle cx="16" cy="38" r="1.5" fill="${dotColor}" opacity="0.6"/>
      <circle cx="16" cy="41" r="1.2" fill="${dotColor}" opacity="0.4"/>
      <circle cx="16" cy="43.5" r="0.8" fill="${dotColor}" opacity="0.2"/>
    </svg>
  `;

  // Convert SVG to data URL
  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;

  return {
    url: dataUrl,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(width / 2, isDepot ? height / 2 : height - 5), // Center for depot, bottom for pin
  };
};
