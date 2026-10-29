import { Team } from "@/types/team.type";
import { Vehicle } from "@/types/vehicle.type";

export function csvEscape(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateTeamMembersCsv(members: Team[]): string {
  const headers = [
    "NAME",
    "DRIVER LICENSE",
    "EMAIL",
    "PHONE NUMBER",
    "ROLE",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
    "SUNDAY",
  ];

  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  const rows = members.map((tm) => {
    const skillsStr = Array.isArray(tm.skills) ? tm.skills.join(" - ") : "";
    const schedules = tm.day_schedules || {};
    const dayStrs = days.map((day) => {
      const cfg = schedules[day];
      if (cfg && cfg.enabled && cfg.start_time && cfg.end_time) {
        return `${cfg.start_time} - ${cfg.end_time}`;
      }
      if (!tm.day_schedules && tm.work_start_time && tm.work_end_time && day !== "saturday" && day !== "sunday") {
        return `${tm.work_start_time} - ${tm.work_end_time}`;
      }
      return "NA";
    });

    return [
      csvEscape(tm.name || ""),
      csvEscape(skillsStr),
      csvEscape(tm.email || ""),
      csvEscape(tm.phone_number || ""),
      csvEscape(tm.role_type || "driver"),
      ...dayStrs.map(csvEscape),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function generateVehiclesCsv(vehicles: Vehicle[]): string {
  const headers = [
    "Vehicle Name",
    "Vehicle Type",
    "Passenger Capacity",
    "License Plate",
    "Make",
    "Model",
    "Required Skills",
    "Max Weight (kg)",
    "Max Volume (m3)",
    "Max Pallets",
  ];

  const rows = vehicles.map((v) => {
    let capVal = "";
    let weightVal = "";
    let volumeVal = "";
    let palletsVal = "";

    if (Array.isArray(v.load_constraints)) {
      for (const c of v.load_constraints) {
        if (c.constraint_type === "capacity") capVal = String(c.max_value ?? "");
        else if (c.constraint_type === "weight") weightVal = String(c.max_value ?? "");
        else if (c.constraint_type === "volume") volumeVal = String(c.max_value ?? "");
        else if (c.constraint_type === "pallets") palletsVal = String(c.max_value ?? "");
      }
    }

    const skillsStr = Array.isArray(v.required_skills) ? v.required_skills.join(" - ") : "";

    return [
      csvEscape(v.name || ""),
      csvEscape(v.type || ""),
      csvEscape(capVal),
      csvEscape(v.license_plate || ""),
      csvEscape(v.make || ""),
      csvEscape(v.model || ""),
      csvEscape(skillsStr),
      csvEscape(weightVal),
      csvEscape(volumeVal),
      csvEscape(palletsVal),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

export function triggerDownload(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

