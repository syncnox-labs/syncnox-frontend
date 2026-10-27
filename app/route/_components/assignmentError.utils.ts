/** Turn known assignment diagnostics into one reason and one useful next step. */
export interface AssignmentErrorInfo {
  title: string;
  message: string;
  action: string;
  showChangeOptions: boolean;
}

const info = (title: string, message: string, action: string, showChangeOptions = true): AssignmentErrorInfo =>
  ({ title, message, action, showChangeOptions });

const clock = (value: string) => value.replace(/(?:(next day|day \+\d+)\s+)?(\d{1,2}):(\d{2})(?::\d{2})?/g,
  (_match, day: string | undefined, rawHour: string, minutes: string) => {
    const hour = Number(rawHour);
    return `${day ? `${day} ` : ""}${hour % 12 || 12}:${minutes} ${hour < 12 ? "AM" : "PM"}`;
  });

export function assignmentErrorInfo(detail: unknown, fallback: string, status?: number): AssignmentErrorInfo {
  const record = detail && !Array.isArray(detail) && typeof detail === "object"
    ? detail as Record<string, unknown> : undefined;
  if (record?.category === "routing_provider_unavailable") {
    if (record.code === "insufficient_credits") return info("Routing service unavailable",
      "The routing service has run out of credits.", "Ask your administrator to restore routing credits, then try again.", false);
    if (record.code === "access_denied") return info("Routing service unavailable",
      "The routing service couldn't check this trip.", "Ask your administrator to check the routing account, then try again.", false);
    return info("Routing service unavailable", "Road travel couldn't be checked.", "Try again in a moment.", false);
  }
  // Prefer a structured human-readable reason when the server supplies one.
  if (typeof record?.message === "string" && typeof record.action === "string") return info(
    typeof record.title === "string" ? record.title : "Can't assign job", record.message, record.action);
  if (status === 401) return info("Sign in again", "Your session has expired.", "Sign in, then reopen the assignment.", false);
  if (status === 403) return info("Permission needed", "You don't have permission to assign this job.",
    "Ask your administrator for assignment access.", false);

  const text = fallback.replace(/^(?:Existing|Separate) trip for [^\n:]+:\s*/gm, "")
    .replace(/^Extending working time cannot resolve this assignment:\s*/gm, "")
    .replace(/^Value error,?\s*/i, "").trim();
  let match: RegExpMatchArray | null;

  if (/preview.*(?:expired|invalid)|preview expired/i.test(text)) return info("Preview expired",
    "This assignment check has expired.", "Click Check again before assigning.", false);
  if (/changed.*(?:refresh|review)|refresh.*(?:changed|again)|since this preview/i.test(text)) return info("Availability changed",
    "The plan or availability changed since the last check.", "Click Check again to refresh and retry.", false);
  if (/took too long|taking too long|search time.*exceeded/i.test(text)) return info("Check took too long",
    "We couldn't finish checking this assignment.", "Choose a driver or select fewer jobs, then try again.");
  if ((status !== undefined && status >= 500) || /could not be queued|preview (?:failed|stopped)|temporarily unavailable|could not be completed|route directions (?:could not be loaded|are unavailable)|road travel could not be checked|route could not be checked/i.test(text)) {
    return info("Assignment check unavailable", "We couldn't check this assignment right now.", "Try again in a moment.", false);
  }
  if (/^Network Error$|^Failed to fetch$|network request failed/i.test(text)) return info("Connection problem",
    "We couldn't reach the server.", "Check your connection, then try again.", false);
  if (/no pickup or drop-off coordinates/i.test(text)) return info("Map location missing",
    "A pickup or drop-off location is missing.", "Edit the job and select the missing address on the map.");
  if (/needs valid pickup\/drop-off times|invalid time window/i.test(text)) return info("Check the job times",
    "A job time is missing or invalid.", "Edit the job's start and end times, then try again.");
  if ((match = text.match(/Choose a route (start|end) location/))) return info("Driver location missing",
    `This driver has no saved ${match[1] === "end" ? "finish" : "start"} address.`, "Set the driver's address, then try again.");
  if (/Review and approve the extra working time/i.test(text)) return info("Approve extra working time",
    "This trip needs approval for extra working time.", "Review the added time, then choose Extend time & assign.");

  if ((match = text.match(/Job #(\d+) requires (\d+) seats, but (.+?) has (\d+)\./))) return info("Not enough seats",
    `Job #${match[1]} needs ${match[2]} seats. ${match[3]} has ${match[4]}.`, `Choose a vehicle with at least ${match[2]} seats.`);
  if ((match = text.match(/Job #(\d+) requires driver (.+?)\. Choose/))) return info("Required driver",
    `Job #${match[1]} requires ${match[2]}.`, `Choose ${match[2]}, or change the required driver in More options.`);
  if ((match = text.match(/(.+?) lacks the qualifications required for (.+?)\./))) return info("Driver can't use this vehicle",
    `${match[1]} isn't qualified to drive ${match[2]}.`, "Choose another vehicle or a qualified driver.");

  if (/Road travel from .+ could not be verified|No drivable connection was found/i.test(text)) {
    const job = text.match(/job #(\d+)/i)?.[1];
    const segment = /pickup to job #\d+'s dropoff/.test(text) ? "between pickup and drop-off"
      : /to .+route finish/.test(text) ? "from drop-off to the route finish" : "to the pickup";
    return info("Couldn't check road travel", `${job ? `Job #${job}: travel` : "Travel"} ${segment} couldn't be checked.`,
      "Check the map locations, then try again.");
  }
  if ((match = text.match(/Job #(\d+)'s (pickup|drop-off) must be (.+?), but its earliest possible (?:pickup|drop-off) is (.+?) using/))) {
    const deadline = match[3].split("–").at(-1) || match[3];
    return info("Can't arrive in time", `Job #${match[1]} needs ${match[2]} by ${clock(deadline)}. Earliest arrival is ${clock(match[4])}.`,
      "Check the map locations or adjust the job time.");
  }
  if ((match = text.match(/Job #(\d+) cannot share (.+?)'s trip\. Conflicts with job #(\d+)/))) {
    const timing = text.match(/both (pickups|drop-offs) must be (.+?), but travel between them needs at least (\d+)m/);
    return info("Jobs can't share this trip", timing
      ? `Jobs #${match[1]} and #${match[3]} need ${timing[1]} at ${clock(timing[2])}, but are at least ${timing[3]} minutes apart.`
      : `Jobs #${match[1]} and #${match[3]} are too far apart for their pickup or drop-off times.`,
      "Choose another trip or driver, or adjust a job time.");
  }

  if ((match = text.match(/Job #(\d+)'s (pickup|drop-off) must be (.+?), but existing driver or vehicle bookings block that window for (.+?)\./))) {
    const blocker = text.match(/Existing booking: ([^,;\n]+)/)?.[1];
    if (blocker?.startsWith("Vehicle ")) return info("Vehicle already booked",
      `${blocker.slice(8)} is booked during job #${match[1]}'s ${match[2]}.`, "Choose another available vehicle or move the conflicting trip.");
    if (blocker === match[4] || blocker?.startsWith("Active trip")) return info("Driver already booked",
      `${match[4]} is booked during job #${match[1]}'s ${match[2]} (${clock(match[3])}).`, "Choose another driver or move the conflicting trip.");
    return info("Trip overlaps a booking", `Job #${match[1]}'s ${match[2]} overlaps an existing driver or vehicle booking.`,
      "Choose another driver or vehicle, or move the conflicting trip.");
  }
  if ((match = text.match(/Job #(\d+)'s (pickup|drop-off) window (.+?) is outside (.+?)'s working hours/))) return info("Driver is off duty",
    `${match[4]} isn't working during job #${match[1]}'s ${match[2]} (${clock(match[3])}).`,
    "Choose another driver or review extra working time in More options.");
  if ((match = text.match(/Job #(\d+)'s pickup window is [\s\S]+?cannot fit one working slot/))) return info("More working time needed",
    `The driver's working hours don't cover job #${match[1]} and its travel.`,
    "Choose another driver or review extra working time in More options.");
  if ((match = text.match(/^(.+?) already has a trip during this time\./))) return info("Trip overlaps a booking",
    `${match[1]} already has a trip at this time.`, "Choose another driver or vehicle, or move the conflicting trip.");
  if (/needs an available vehicle|Choose an available vehicle in More options/i.test(text)) return info("Choose a vehicle",
    "An available vehicle is needed for this trip.", "Select a driver and an available vehicle.");
  if (/No driver with an available, compatible vehicle|No eligible driver and vehicle/i.test(text)) return info("No available match",
    "No driver and vehicle match these job times and requirements.", "Review the required driver, vehicle and working hours.");
  if (/No route was found|do not fit .+free working hours|No feasible route/i.test(text)) return info("No matching trip found",
    "We couldn't find a trip that fits these jobs.", "Try another driver or assign fewer jobs at once.");
  if (/trip exceeds the 48-hour planning horizon/i.test(text)) return info("Check the job date and time",
    "This trip runs past the end of the plan.", "Check the job date, return time and route finish location.");

  // Unknown cases remain honest. Keep a useful first sentence and an existing
  // remedy, rather than guessing a constraint or displaying multiple attempts.
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
  const message = sentences[0]?.length <= 200 ? sentences[0] : "This assignment couldn't be completed.";
  const remedy = sentences.slice(1).find(sentence => /^(?:Choose|Check|Adjust|Refresh|Review|Open|Select|Try|Use|Keep|Split|Merge|Update|Add|Set|Correct|Wait)\b/.test(sentence));
  return info("Can't assign job", message || "This assignment couldn't be checked.", remedy && remedy.length <= 160
    ? remedy : "Review the driver, vehicle and job times, then try again.");
}
