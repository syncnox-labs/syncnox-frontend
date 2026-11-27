import dayjs from "dayjs";

/**
 * Format any time string (e.g., "16:00:00", "22:30", "00:15", "2026-09-04T23:06:00Z")
 * into consistent 12-hour AM/PM format (e.g. "04:00 PM", "10:30 PM", "12:15 AM", "11:06 PM").
 */
export const formatTime12h = (
  timeInput?: string | null,
  fallback: string = "-"
): string => {
  if (!timeInput || timeInput === "-") return fallback;
  const str = String(timeInput).trim();
  if (!str) return fallback;

  // 1. If it already has AM or PM suffix, return as is
  if (/am|pm/i.test(str)) {
    return str;
  }

  // 2. Check for time-only format HH:mm or HH:mm:ss (e.g. "16:00:00", "22:30", "00:15")
  const timeOnlyMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (timeOnlyMatch) {
    const hours = parseInt(timeOnlyMatch[1], 10);
    const minutes = parseInt(timeOnlyMatch[2], 10);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      const period = hours >= 12 ? "PM" : "AM";
      const h12 = hours % 12 === 0 ? 12 : hours % 12;
      const hStr = String(h12);
      const mStr = String(minutes).padStart(2, "0");
      return `${hStr}:${mStr} ${period}`;
    }
  }

  // 3. Fallback to dayjs for full date-time / ISO strings
  const d = dayjs(str);
  if (d.isValid()) {
    return d.format("h:mm A");
  }

  return str;
};

export const formatTimeWindow = (
  timeWindow1: string | undefined,
  timeWindow2: string | undefined
) => {
  if (!timeWindow1 || !timeWindow2) return "";
  const t1 = formatTime12h(timeWindow1, "");
  const t2 = formatTime12h(timeWindow2, "");
  if (t1 && t2) return `${t1} - ${t2}`;
  return `${timeWindow1} - ${timeWindow2}`;
};


/**
 * One date format for tables: "Mon, Nov 30", with the year only when it is not this year.
 * A plain "YYYY-MM-DD" is read as a calendar day (no time zone shift); anything else is returned as is.
 */
export const formatPlanDate = (value?: string | null, fallback: string = "-"): string => {
  if (!value) return fallback;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return String(value);
  const d = dayjs(`${match[1]}-${match[2]}-${match[3]}`);
  if (!d.isValid()) return String(value);
  return d.year() === dayjs().year() ? d.format("ddd, MMM D") : d.format("ddd, MMM D, YYYY");
};
