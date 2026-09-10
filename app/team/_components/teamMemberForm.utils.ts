import dayjs from "dayjs";
import { Team } from "@/types/team.type";
import { COUNTRY_CODES } from "@/constants/country";
import { Depot } from "@/types/depots.type";

export const statusStyleMap = {
  active: "bg-green-100 text-green-700 border border-green-200",
  inactive: "bg-red-100 text-red-700 border border-red-200",
  online: "bg-blue-100 text-blue-700 border border-blue-200",
  offline: "bg-gray-100 text-gray-700 border border-gray-200",
};

interface LocationOptions {
  startLocationSameAsDepot: boolean;
  endLocationSameAsDepot: boolean;
  startDepot?: Depot;
  endDepot?: Depot;
}

/**
 * Transform form values to API format for team member submission
 */
export const transformFormToApi = (
  values: any,
  skills: string[],
  scheduleBreak: boolean,
  initialData?: Team | null,
  locationOptions?: LocationOptions
): any => {
  const transformedValues: any = {
    ...values,
    id: initialData?.id,
    skills: skills,
  };

  // Transform work times: dayjs object -> string (HH:mm)
  if (values.work_start_time) {
    transformedValues.work_start_time = dayjs(values.work_start_time).format(
      "HH:mm"
    );
  }
  if (values.work_end_time) {
    transformedValues.work_end_time = dayjs(values.work_end_time).format(
      "HH:mm"
    );
  }

  // Transform day_schedules: dayjs objects -> string (HH:mm)
  if (values.day_schedules) {
    const formattedSchedules: Record<string, any> = {};
    for (const [day, item] of Object.entries(values.day_schedules as Record<string, any>)) {
      formattedSchedules[day] = {
        enabled: !!item?.enabled,
        start_time: item?.start_time ? dayjs(item.start_time).format("HH:mm") : null,
        end_time: item?.end_time ? dayjs(item.end_time).format("HH:mm") : null,
      };
    }
    transformedValues.day_schedules = formattedSchedules;
  }

  // Transform break times
  if (scheduleBreak && values.break_time_start) {
    transformedValues.break_time_start = dayjs(values.break_time_start).format(
      "HH:mm"
    );
  }
  if (scheduleBreak && values.break_time_end) {
    transformedValues.break_time_end = dayjs(values.break_time_end).format(
      "HH:mm"
    );
  }

  // Transform phone: object {countryCode, number} -> string phone_number or null
  if (values.phone && values.phone.number && values.phone.number.trim() !== "") {
    const { countryCode, number } = values.phone;
    const codeOnly = countryCode?.match(/\+\d+/)?.[0] || "";
    transformedValues.phone_number = `${codeOnly}-${number}`;
  } else {
    transformedValues.phone_number = null;
  }
  delete transformedValues.phone;

  // Handle start/end location based on "same as depot" checkboxes
  if (locationOptions) {
    const {
      startLocationSameAsDepot,
      endLocationSameAsDepot,
      startDepot,
      endDepot,
    } = locationOptions;

    if (startLocationSameAsDepot && startDepot) {
      // Use depot location when "same as depot" is checked
      transformedValues.start_address = startDepot.address?.formatted_address;
      transformedValues.start_location = startDepot.location;
    }

    if (endLocationSameAsDepot && endDepot) {
      // Use depot location when "same as depot" is checked
      transformedValues.end_address = endDepot.address?.formatted_address;
      transformedValues.end_location = endDepot.location;
    }
  }

  // Clean up start_location & end_location if empty or missing valid lat/lng
  if (
    transformedValues.start_location &&
    (transformedValues.start_location.lat === undefined ||
      transformedValues.start_location.lat === null ||
      transformedValues.start_location.lng === undefined ||
      transformedValues.start_location.lng === null)
  ) {
    transformedValues.start_location = null;
  }

  if (
    transformedValues.end_location &&
    (transformedValues.end_location.lat === undefined ||
      transformedValues.end_location.lat === null ||
      transformedValues.end_location.lng === undefined ||
      transformedValues.end_location.lng === null)
  ) {
    transformedValues.end_location = null;
  }

  return transformedValues;
};

/**
 * Transform API data to form format for editing
 */
export const transformApiToForm = (initialData: Team): any => {
  const formValues: any = { ...initialData };

  // Transform work times: string (HH:mm) -> dayjs object
  if (formValues.work_start_time) {
    formValues.work_start_time = dayjs(formValues.work_start_time, "HH:mm");
  }
  if (formValues.work_end_time) {
    formValues.work_end_time = dayjs(formValues.work_end_time, "HH:mm");
  }

  // Transform day_schedules: string (HH:mm) -> dayjs objects
  if (formValues.day_schedules) {
    const parsedSchedules: Record<string, any> = {};
    for (const [day, item] of Object.entries(formValues.day_schedules as Record<string, any>)) {
      parsedSchedules[day] = {
        enabled: !!item?.enabled,
        start_time: item?.start_time ? dayjs(item.start_time, "HH:mm") : dayjs("08:00", "HH:mm"),
        end_time: item?.end_time ? dayjs(item.end_time, "HH:mm") : dayjs("16:00", "HH:mm"),
      };
    }
    formValues.day_schedules = parsedSchedules;
  }

  // Transform break times
  if (formValues.break_time_start) {
    formValues.break_time_start = dayjs(formValues.break_time_start, "HH:mm");
  }
  if (formValues.break_time_end) {
    formValues.break_time_end = dayjs(formValues.break_time_end, "HH:mm");
  }

  // Transform phone_number: string "+1-298372138" -> object {countryCode, number}
  if (formValues.phone_number) {
    const [code, number] = formValues.phone_number.split("-");
    const country = COUNTRY_CODES.find((c) => c.code === code);
    formValues.phone = {
      countryCode: country ? `${country.flag} ${code}` : `🇺🇸 ${code}`,
      number: number || "",
    };
    delete formValues.phone_number;
  } else {
    formValues.phone = {
      countryCode: `🇺🇸 +1`,
      number: "",
    };
  }

  return formValues;
};
