import { JobStatus } from "@/types/job.type";
import { STATUS_COLORS } from "./jobs.utils";

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
): google.maps.Icon => {
  let fillColor = "";
  let strokeColor = "";
  let strokeWidth = 0;
  let textColor = "";
  let dotColor = "";

  let baseColor = colorOverride || STATUS_COLORS[status] || STATUS_COLORS.draft;

  if (isDepot) {
    fillColor = baseColor;
    strokeColor = "none";
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
    Stop markers are pins (32x45 base) and bottom-anchored.
  */
  // Rendered dimensions
  const width = (isDepot ? 36 : 32) * scale;
  const height = (isDepot ? 36 : 45) * scale;

  let badgeSvg = "";
  if (!isDepot && stopType) {
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
      </defs>

      <!-- Main pin body (teardrop for stops, rounded square for depot) -->
      ${
        isDepot
          ? `<rect x="2" y="2" width="28" height="28" rx="6" fill="${fillColor}" filter="url(#shadow)"/>
             ${depotIconSvg}
            `
          : `<path 
            d="M16 0C9.4 0 4 5.4 4 12c0 8 12 24 12 24s12-16 12-24c0-6.6-5.4-12-12-12z" 
            fill="${fillColor}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
            filter="url(#shadow)"
          />
          
          <!-- Number text -->
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
