"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import { AgGridReact } from "ag-grid-react";
import { Button, message, Tooltip, Alert } from "antd";
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  FilterOutlined,
} from "@ant-design/icons";

import { useBulkUploadStore } from "@/store/bulkUpload.store";
import type { JobCreate } from "@/types/bulk-upload.type";
import { useJobsStore } from "@/store/jobs.store";
import { useIndexStore } from "@/store/index.store";
import { importBulkJobs, resolveBulkRow } from "@/apis/bulk-upload.api";
import type { ColDef, RowClassParams, CellValueChangedEvent } from "ag-grid-community";
import AddressCellEditor from "./AddressCellEditor";
import {
  isTripValidationError,
  validateTripRequirements,
} from "@/utils/tripValidation";

interface DataPreviewStepProps {
  onFinish: () => void;
  onBack?: () => void;
}

// Row keys holding coordinates resolved by the backend rather than user input.
// Mirrors BulkUploadService.RESOLVED_LOCATION_FIELDS in
// syncnox-be/app/services/bulk_upload.py — keep the two in sync.
const RESOLVED_LOCATION_FIELDS = [
  "location",
  "client_location",
  "go_pickup_location",
  "go_pickup_metro_id",
  "return_dropoff_location",
  "return_dropoff_metro_id",
  "pick_up_location",
  "drop_off_location",
];

// Editing any of these changes where a coordinate should come from, so the row
// must be re-resolved server-side: a pickup/drop-off point may be a metro
// station name or the candidate's home, which only the backend can resolve.
const LOCATION_SOURCE_FIELDS = new Set([
  "address",
  "formattedAddress",
  "client_address",
  "candidate_address",
  "go_pickup_point",
  "pick_up_address",
  "return_dropoff_point",
  "drop_off_address",
  "pickup_type",
  "job_type",
]);

// Row status types for clarity
type RowStatus =
  | "success"
  | "geocoding_error"
  | "validation_error"
  | "duplicate";

interface ProcessedRow {
  id: number;
  address: string;
  lat: number | null;
  lng: number | null;
  formattedAddress: string | null;
  geocodingError: string | null;
  warning: string | null;
  isDuplicate: boolean;
  validationErrors: string[];
  status: RowStatus;
  statusMessage: string;
  [key: string]: any;
}

// One palette for row states: green ready, amber worth a look, red skipped.
const STATUS_LOOK: Record<string, { color: string; icon: typeof CheckCircleOutlined }> = {
  success: { color: "#1F845A", icon: CheckCircleOutlined },
  duplicate: { color: "#B38600", icon: WarningOutlined },
  validation_error: { color: "#C9372C", icon: ExclamationCircleOutlined },
  geocoding_error: { color: "#C9372C", icon: CloseCircleOutlined },
};
const STATUS_ORDER = ["geocoding_error", "validation_error", "duplicate", "success"];

/**
 * Which column says who or what a row is, for any template. Nothing here names a field: the
 * template's own labels, its required marks and the sheet's values decide.
 *  - a "name" in the field label or key counts most;
 *  - a required field counts;
 *  - values that differ row to row identify a row (a client shared by 30 rows does not);
 *  - addresses, dates, times and numbers never identify a row.
 */
export function pickIdentityField(
  fields: { identifier: string; label: string; required: boolean; position: number }[],
  rows: Record<string, any>[],
): string | null {
  // Whole words only: "candidate" must not read as "date".
  const NOT_IDENTITY = new Set(["address", "location", "point", "date", "time", "hour", "phone", "email", "duration", "type",
    "priority", "lat", "lng", "latitude", "longitude", "note", "notes", "start", "end", "window", "minutes"]);
  const words = (text: string) => text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  let best: { id: string; score: number; position: number } | null = null;
  for (const field of fields) {
    const text = `${field.identifier} ${field.label}`;
    if (words(text).some(word => NOT_IDENTITY.has(word))) continue;
    const values = rows.map(row => String(row?.[field.identifier] ?? row?.custom_fields?.[field.identifier] ?? "").trim()).filter(Boolean);
    if (!values.length) continue;
    if (values.every(v => /^[\d\s.,:+\-/()]+$/.test(v))) continue;
    const distinct = new Set(values).size / values.length;
    const score = (words(text).some(word => word === "name" || word === "nom") ? 3 : 0) + (field.required ? 1 : 0) + (distinct > 0.6 ? 2 : distinct > 0.3 ? 1 : 0);
    if (!best || score > best.score || (score === best.score && field.position < best.position)) best = { id: field.identifier, score, position: field.position };
  }
  return best?.id ?? null;
}

const DataPreviewStep = ({ onFinish, onBack }: DataPreviewStepProps) => {
  const gridRef = useRef<AgGridReact>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Rows whose coordinates are being re-resolved after an address edit.
  const [resolvingRows, setResolvingRows] = useState<Set<number>>(new Set());
  // Latest re-resolve request per row, so a slow response can't overwrite a
  // newer one.
  const resolveSeqRef = useRef<Record<number, number>>({});

  const { geocodedData, columnMapping, saveAsDefault, defaultScheduledDate, updateGeocodedRow } =
    useBulkUploadStore();
  const { refreshDraftJobs } = useJobsStore();

  type FilterType = "all" | "geocoding_error" | "validation_error" | "duplicate" | "ready";
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  // The column kept visible while scrolling sideways: suggested from the data, changeable, remembered per template.
  const templateKey = useBulkUploadStore.getState().templateType || useIndexStore.getState().activeJobTemplate || "default";
  const pinStorageKey = `syncnox.importKeepVisible.${templateKey}`;
  const [pinChoice, setPinChoiceState] = useState<string | null | undefined>(() => {
    try { const saved = window.localStorage.getItem(pinStorageKey); return saved === null ? undefined : saved === "" ? null : saved; } catch { return undefined; }
  });
  const setPinChoice = (value: string | null) => {
    setPinChoiceState(value);
    try { window.localStorage.setItem(pinStorageKey, value ?? ""); } catch { /* storage can be unavailable */ }
  };

  // Process and categorize row data
  const { rowData, stats } = useMemo(() => {
    let geocodingErrors = 0;
    let validationErrors = 0;
    let duplicates = 0;
    let readyToImport = 0;

    const rows: ProcessedRow[] = geocodedData.map((row, index) => {
      const hasGeocodingError =
        row.geocode_result.error ||
        row.geocode_result.lat == null ||
        row.geocode_result.lng == null;

      const hasValidationErrors =
        row.validation_errors && row.validation_errors.length > 0;

      // Determine status and message
      let status: RowStatus = "success";
      let statusMessage = "Ready to import";

      if (hasGeocodingError) {
        status = "geocoding_error";
        statusMessage =
          row.geocode_result.error || "Invalid address - could not geocode";
        geocodingErrors++;
      } else if (hasValidationErrors) {
        status = "validation_error";
        statusMessage = row.validation_errors.join("\n");
        validationErrors++;
      } else if (row.is_duplicate) {
        status = "duplicate";
        statusMessage = row.duplicate_message || "Duplicate entry detected";
        duplicates++;
        readyToImport++; // Duplicates can still be imported
      } else {
        readyToImport++;
      }

      const customFieldVals = row.original_data?.custom_fields || {};

      return {
        id: index,
        address: row.geocode_result.address,
        lat: row.geocode_result.lat,
        lng: row.geocode_result.lng,
        formattedAddress: row.geocode_result.formatted_address,
        geocodingError: row.geocode_result.error,
        warning: row.geocode_result.warning,
        isDuplicate: row.is_duplicate,
        validationErrors: row.validation_errors || [],
        status,
        statusMessage,
        ...customFieldVals,
        ...row.original_data,
      };
    });

    return {
      rowData: rows,
      stats: {
        total: geocodedData.length,
        geocodingErrors,
        validationErrors,
        duplicates,
        readyToImport,
        hasErrors: geocodingErrors > 0 || validationErrors > 0,
      },
    };
  }, [geocodedData]);

  // What the import will create, in plain numbers.
  const facts = useMemo(() => {
    const ready = rowData.filter(r => r.status === "success" || r.status === "duplicate");
    const pick = (r: ProcessedRow, key: string) => String(r[key] ?? r.custom_fields?.[key] ?? "").trim();
    const dates = [...new Set(ready.map(r => pick(r, "scheduled_date") || defaultScheduledDate || "").filter(Boolean))].sort();
    const clients = new Set(ready.map(r => pick(r, "client_name")).filter(Boolean)).size;
    const tripCounts = new Map<string, number>();
    ready.forEach(r => { const t = pick(r, "pickup_type") || pick(r, "job_type"); if (t) tripCounts.set(t, (tripCounts.get(t) ?? 0) + 1); });
    const dayLabel = (value: string) => {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
      return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : value;
    };
    return {
      dates: dates.length === 0 ? null : dates.length === 1 ? dayLabel(dates[0]) : `${dates.length} dates, ${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])}`,
      clients,
      trips: [...tripCounts.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => `${n} ${type.replaceAll("_", " ").toLowerCase()}`),
    };
  }, [rowData, defaultScheduledDate]);

  // Filter row data based on selected status filter
  const displayedRowData = useMemo(() => {
    if (activeFilter === "all") return rowData;
    if (activeFilter === "ready") {
      return rowData.filter((r) => r.status === "success" || r.status === "duplicate");
    }
    return rowData.filter((r) => r.status === activeFilter);
  }, [rowData, activeFilter]);

  const handleFilterClick = (filter: FilterType) => {
    setActiveFilter((prev) => (prev === filter ? "all" : filter));
  };

  // Columns follow the user's own spreadsheet, so a new user recognises their file whatever the template.
  const uploadResponse = useBulkUploadStore.getState().uploadResponse;
  const sheetColumns = uploadResponse?.sample_data?.[0] ? Object.keys(uploadResponse.sample_data[0]) : [];
  const sheetPosition = (identifier: string) => {
    const i = sheetColumns.indexOf(columnMapping[identifier]);
    if (i !== -1) return i;
    const meta = uploadResponse?.columns?.find(c => c.identifier === identifier);
    return 1000 + (meta?.index ?? 0);
  };
  const keepVisibleOptions = Object.keys(columnMapping).filter(key => columnMapping[key] && key !== "address_formatted")
    .sort((a, b) => sheetPosition(a) - sheetPosition(b))
    .map(identifier => {
      const meta = uploadResponse?.columns?.find(c => c.identifier === identifier);
      return { identifier, label: meta?.description?.replace(/\s*\*$/, "") || identifier.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
        required: /\*\s*$/.test(meta?.description ?? ""), position: sheetPosition(identifier) };
    });
  const suggestedPin = useMemo(() => pickIdentityField(keepVisibleOptions, geocodedData.slice(0, 200).map(row => row.original_data || {})),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnMapping, geocodedData.length]);
  const pinnedField = pinChoice === undefined || (pinChoice !== null && !keepVisibleOptions.some(o => o.identifier === pinChoice))
    ? suggestedPin : pinChoice;

  // Column definitions with enhanced styling
  const columnDefs: ColDef[] = useMemo(() => {
    const activeTemplate =
      useBulkUploadStore.getState().templateType ||
      useIndexStore.getState().activeJobTemplate ||
      "worker_shuttle";

    const isWorkerShuttle = activeTemplate === "worker_shuttle";

    const columns: ColDef[] = [
      {
        headerName: "Status",
        field: "status",
        width: 190,
        pinned: "left",
        sortable: true,
        filter: false,
        // Problems first when sorted ascending.
        comparator: (a: string, b: string) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
        cellRenderer: (params: { data: ProcessedRow }) => {
          const { status, statusMessage } = params.data;
          const look = STATUS_LOOK[status] ?? STATUS_LOOK.success;
          const Icon = look.icon;
          const firstLine = String(statusMessage || "").split("\n")[0];
          const text = status === "success" ? "Ready" : status === "duplicate" ? "Possible duplicate"
            : status === "geocoding_error" ? "Address not found" : firstLine || "Needs fixing";
          return (
            <Tooltip title={status === "success" ? "Ready to import" : <div style={{ whiteSpace: "pre-line" }}>{statusMessage}</div>} overlayStyle={{ maxWidth: 400 }}>
              <span className="inline-flex max-w-full items-center gap-1.5 text-[12px]" style={{ color: look.color }}>
                <Icon style={{ fontSize: 14, flexShrink: 0 }} />
                <span className="truncate">{text}</span>
              </span>
            </Tooltip>
          );
        },
      },
    ];

    if (!isWorkerShuttle) {
      columns.push(
        {
          headerName: "Address",
          field: "address",
          flex: 2,
          minWidth: 200,
          pinned: "left",
          editable: true,
          cellEditor: AddressCellEditor,
          cellEditorPopup: true,
        },
        {
          headerName: "Formatted Address",
          field: "formattedAddress",
          flex: 2,
          minWidth: 200,
          editable: true,
          cellEditor: AddressCellEditor,
          cellEditorPopup: true,
        },
        {
          headerName: "Lat",
          field: "lat",
          width: 100,
          editable: true,
          valueParser: (params) => {
            const val = parseFloat(params.newValue);
            return isNaN(val) ? null : val;
          },
          valueFormatter: (params) =>
            params.value != null ? Number(params.value).toFixed(5) : "-",
        },
        {
          headerName: "Lng",
          field: "lng",
          width: 100,
          editable: true,
          valueParser: (params) => {
            const val = parseFloat(params.newValue);
            return isNaN(val) ? null : val;
          },
          valueFormatter: (params) =>
            params.value != null ? Number(params.value).toFixed(5) : "-",
        }
      );
    }

    // Field labels for dynamic columns
    const fieldLabels: Record<string, string> = {
      first_name: "First Name",
      last_name: "Last Name",
      client_name: "Client Name",
      phone_number: "Phone",
      client_phone: "Client Phone",
      email: "Email",
      business_name: "Business",
      time_window_start: "Time Start",
      time_window_end: "Time End",
      service_duration: "Duration",
      additional_notes: "Notes",
      customer_preferences: "Preferences",
      priority_level: "Priority",
      job_type: "Job Type",
      scheduled_date: "Date",
      pickup_type: "Pickup Type",
      quart_id: "Quart / Shift Ref",
      quant_id: "Quant ID",
      client_id: "Client ID",
      candidate_id: "Candidate ID",
      start_hour: "Shift Start Time",
      end_hour: "Shift End Time",
      dress_code: "Dress Code",
      go_pickup_point: "GO Pickup Point",
      return_dropoff_point: "RETURN Dropoff Point",
      candidate_address: "Candidate Address",
      client_address: "Client Address",
    };

    const uploadCols = useBulkUploadStore.getState().uploadResponse?.columns || [];

    // Add dynamic columns for mapped fields
    const mappedFields = new Set(Object.keys(columnMapping).filter(key => columnMapping[key]));
    if (uploadCols.some(col => col.identifier === "language")) mappedFields.add("language");
    const fieldOrder = [...mappedFields].filter(identifier => identifier !== "address_formatted");
    fieldOrder.sort((a, b) => sheetPosition(a) - sheetPosition(b));
    fieldOrder.forEach((identifier) => {
      if (identifier !== "address_formatted") {
        // Skip redundant first_name column if client_name is mapped or template is worker_shuttle
        if (identifier === "first_name" && (isWorkerShuttle || columnMapping["client_name"])) {
          return;
        }
        // Skip duplicate phone_number column if client_phone is mapped to same Excel column
        if (identifier === "phone_number" && columnMapping["client_phone"] && columnMapping["phone_number"] === columnMapping["client_phone"]) {
          return;
        }

        const colMeta = uploadCols.find((c) => c.identifier === identifier);
        const headerText =
          fieldLabels[identifier] ||
          colMeta?.description?.replace(/\s*\*$/, "") ||
          identifier
            .split("_")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

        const colDef: ColDef = {
          headerName: headerText,
          headerTooltip: headerText,
          field: identifier,
          width: identifier.includes("address") || identifier.endsWith("_point") ? 220 : identifier.includes("name") ? 180 : 150,
          wrapHeaderText: true,
          autoHeaderHeight: true,
          tooltipValueGetter: (params) => (params.value ? String(params.value) : undefined),
          editable: true,
          valueGetter: (params) => {
            const d = params.data;
            if (!d) return "";
            let val = d[identifier] ?? d.custom_fields?.[identifier];
            if ((val === undefined || val === null || val === "") && identifier === "client_name") {
              val = d.first_name ?? d.custom_fields?.first_name;
            }
            if ((val === undefined || val === null || val === "") && identifier === "first_name") {
              val = d.client_name ?? d.custom_fields?.client_name;
            }
            if ((val === undefined || val === null || val === "") && (identifier === "client_phone" || identifier === "phone_number")) {
              val = d.client_phone ?? d.phone_number ?? d.custom_fields?.client_phone ?? d.custom_fields?.phone_number;
            }
            return val ?? "";
          },
          valueSetter: (params) => {
            if (params.data) {
              params.data[identifier] = params.newValue;
              if (!params.data.custom_fields) {
                params.data.custom_fields = {};
              }
              params.data.custom_fields[identifier] = params.newValue;
              return true;
            }
            return false;
          },
        };

        if (identifier === "scheduled_date") {
          colDef.valueFormatter = (params) => {
            const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(params.value ?? ""));
            if (!match) return params.value ?? "";
            const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
            return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          };
        }
        if (identifier === pinnedField) { colDef.pinned = "left"; colDef.lockPosition = "left"; }
        if (identifier === "pickup_type") {
          colDef.cellEditor = "agSelectCellEditor";
          colDef.cellEditorParams = {
            values: ["Round trip", "One-way (go)", "One-way (return)"],
          };
        } else if (identifier === "job_type") {
          colDef.cellEditor = "agSelectCellEditor";
          colDef.cellEditorParams = {
            values: ["one_way", "return_only", "round_trip", "delivery", "pickup", "service"],
          };
        } else if (identifier === "priority_level") {
          colDef.cellEditor = "agSelectCellEditor";
          colDef.cellEditorParams = {
            values: ["low", "medium", "high", "urgent"],
          };
        }

        columns.push(colDef);
      }
    });

    return columns;
  }, [columnMapping, pinnedField]);

  /**
   * Re-resolve a row's coordinates from its current addresses.
   *
   * A grid edit only changes address text — the coordinates resolved in step 2
   * still belong to the address that was there before. This asks the backend to
   * resolve the row again and overlays the result.
   */
  const reResolveRow = useCallback(
    async (rowIndex: number) => {
      const seq = (resolveSeqRef.current[rowIndex] || 0) + 1;
      resolveSeqRef.current[rowIndex] = seq;
      setResolvingRows((prev) => new Set(prev).add(rowIndex));

      const isStale = () => resolveSeqRef.current[rowIndex] !== seq;

      try {
        const rowAtRequest =
          useBulkUploadStore.getState().geocodedData[rowIndex];
        if (!rowAtRequest) return;

        const known = rowAtRequest.geocode_result;
        const resolved = await resolveBulkRow(
          rowAtRequest.original_data || {},
          known.address,
          known.lat != null && known.lng != null
            ? { lat: known.lat, lng: known.lng }
            : null
        );

        // A newer edit already fired its own request; it will supply the row.
        if (isStale()) return;

        const latest = useBulkUploadStore.getState().geocodedData[rowIndex];
        if (!latest) return;

        // Overlay only the resolved keys, so an edit to another column made
        // while this was in flight keeps its new value.
        const updatedOriginal = { ...latest.original_data };
        RESOLVED_LOCATION_FIELDS.forEach((key) => {
          updatedOriginal[key] = resolved.resolved_fields[key] ?? null;
        });

        updateGeocodedRow(rowIndex, {
          original_data: updatedOriginal,
          geocode_result: resolved.geocode_result,
          validation_errors: [
            ...(latest.validation_errors || []).filter(error => !error.startsWith("Unresolved location:")),
            ...(resolved.location_errors || []),
          ],
          is_duplicate: false,
        });

        if (resolved.warnings.length > 0) {
          message.warning(`Row ${rowIndex + 1}: ${resolved.warnings.join("; ")}`);
        }
      } catch (error: any) {
        if (isStale()) return;

        // Drop the coordinates rather than leave the old ones under the new
        // address — a visible error beats a row that imports to the wrong spot.
        const latest = useBulkUploadStore.getState().geocodedData[rowIndex];
        if (latest) {
          const clearedOriginal = { ...latest.original_data };
          RESOLVED_LOCATION_FIELDS.forEach((key) => {
            clearedOriginal[key] = null;
          });
          updateGeocodedRow(rowIndex, {
            original_data: clearedOriginal,
            geocode_result: {
              ...latest.geocode_result,
              lat: null,
              lng: null,
              error: "Could not resolve the updated address",
            },
          });
        }

        message.error(
          error.response?.data?.detail ||
            `Row ${rowIndex + 1}: could not resolve the updated address`
        );
      } finally {
        if (!isStale()) {
          setResolvingRows((prev) => {
            const next = new Set(prev);
            next.delete(rowIndex);
            return next;
          });
        }
      }
    },
    [updateGeocodedRow]
  );

  // Handle cell edits
  const handleCellValueChanged = useCallback(
    (params: CellValueChangedEvent<ProcessedRow>) => {
      const { data, colDef, newValue, oldValue } = params;
      if (!data || newValue === oldValue) return;

      const field = colDef.field;
      const rowIndex = data.id;

      const latestStoreData = useBulkUploadStore.getState().geocodedData;
      const storeRow = latestStoreData[rowIndex];
      if (!storeRow) return;

      const updatedRow = { ...storeRow };

      if (field === "lat" || field === "lng") {
        updatedRow.geocode_result = {
          ...updatedRow.geocode_result,
          [field]: newValue,
        };
        // If both lat and lng are now present, clear the geocoding error
        if (
          updatedRow.geocode_result.lat != null &&
          updatedRow.geocode_result.lng != null
        ) {
          updatedRow.geocode_result.error = null;
        }
        updatedRow.is_duplicate = false;
      } else if (field === "address" || field === "formattedAddress") {
        // AddressCellEditor writes the coordinates for a picked address to the
        // store before the cell commits, so geocode_result already names this
        // value in that case and its coordinates are good. Free-typed text does
        // not: those coordinates belong to the address being replaced, so they
        // go, and the re-resolve below supplies new ones.
        const coordinatesMatchNewAddress =
          storeRow.geocode_result.address === newValue;

        updatedRow.geocode_result = {
          ...updatedRow.geocode_result,
          [field === "address" ? "address" : "formatted_address"]: newValue,
          ...(coordinatesMatchNewAddress ? {} : { lat: null, lng: null }),
        };
        // original_data holds the address the re-resolve geocodes from, so keep
        // it in step with what the grid shows.
        updatedRow.original_data = {
          ...updatedRow.original_data,
          address_formatted: newValue,
        };
        updatedRow.is_duplicate = false;
      } else if (field) {
        // Update original_data for dynamic columns (both top-level and custom_fields if present)
        const updatedOriginal = {
          ...updatedRow.original_data,
          [field]: newValue,
        };
        if (updatedOriginal.custom_fields) {
          updatedOriginal.custom_fields = {
            ...updatedOriginal.custom_fields,
            [field]: newValue,
          };
        }
        updatedRow.original_data = updatedOriginal;
      }

      // Re-check the trip-type rules: an edit to pickup_type or to any of the
      // addresses it requires can resolve (or introduce) these errors.
      const keptErrors = (updatedRow.validation_errors || []).filter(
        (err) => !isTripValidationError(err)
      );
      updatedRow.validation_errors = [
        ...keptErrors,
        ...validateTripRequirements(updatedRow.original_data || {}),
      ];
      if (field === "language") {
        updatedRow.validation_errors = updatedRow.validation_errors.filter(error => !error.startsWith("Language must be"));
        const language = String(newValue ?? "").normalize("NFC").trim().toLocaleLowerCase();
        if (language !== "english" && language !== "français") {
          updatedRow.validation_errors.push("Language must be English or Français; set a valid value or custom-field default.");
        }
      }

      // Other field errors clear when the field they refer to is edited
      if (field && updatedRow.validation_errors.length > 0) {
        const fieldToErrorKeyword: Record<string, string> = {
          service_duration: "Service Duration",
          time_window_start: "Time Window",
          time_window_end: "Time Window",
          scheduled_date: "Scheduled Date",
          email: "Email",
          priority_level: "Priority Level",
          job_type: "Job Type",
        };

        const errorKeyword = fieldToErrorKeyword[field];
        if (errorKeyword) {
          updatedRow.validation_errors = updatedRow.validation_errors.filter(
            (err) => !err.startsWith(errorKeyword)
          );
        }
      }

      updateGeocodedRow(rowIndex, updatedRow);

      // An edited address needs its coordinates resolved again — the ones on
      // the row belong to the address that was there a moment ago.
      const hasManualCoordinate = (field === "lat" || field === "lng") &&
        updatedRow.geocode_result.lat != null && updatedRow.geocode_result.lng != null;
      if (field && (LOCATION_SOURCE_FIELDS.has(field) || hasManualCoordinate)) {
        void reResolveRow(rowIndex);
      }
    },
    [updateGeocodedRow, reResolveRow]
  );

  // Row styling based on status
  const getRowClass = useCallback((params: RowClassParams<ProcessedRow>) => {
    if (!params.data) return "";

    switch (params.data.status) {
      case "geocoding_error":
      case "validation_error":
        return "bg-[#FDECEA]";
      case "duplicate":
        return "bg-[#FFF8E6]";
      default:
        return "";
    }
  }, []);

  // Import handler
  const handleImport = async () => {
    // Guard against importing coordinates that are still being resolved.
    if (resolvingRows.size > 0) {
      message.warning("Still updating locations for edited rows — one moment.");
      return;
    }

    setIsImporting(true);

    try {
      const validRows = geocodedData.filter(
        (row) =>
          !row.geocode_result.error &&
          row.geocode_result.lat != null &&
          row.geocode_result.lng != null &&
          (!row.validation_errors || row.validation_errors.length === 0)
      );

      const activeTemplate =
        useBulkUploadStore.getState().templateType ||
        useIndexStore.getState().activeJobTemplate ||
        "worker_shuttle";

      const jobs = validRows.map((row) => {
        const jobData: JobCreate = {
          ...row.original_data,
          template_type: activeTemplate,
          location: {
            lat: row.geocode_result.lat!,
            lng: row.geocode_result.lng!,
          },
          address_formatted:
            row.geocode_result.formatted_address || row.geocode_result.address,
        };

        if (!jobData.scheduled_date && defaultScheduledDate) {
          jobData.scheduled_date = defaultScheduledDate;
        }

        return jobData;
      });

      const response = await importBulkJobs({
        jobs,
        save_mapping: saveAsDefault,
        mapping_config: saveAsDefault ? columnMapping : null,
      });

      if (response.failed && response.failed > 0) {
        message.warning(`Imported ${response.created} jobs, but ${response.failed} failed.`);
      } else {
        message.success(`Successfully imported ${response.created} jobs!`);
      }

      const importedDate = jobs.find((j) => j.scheduled_date)?.scheduled_date;
      if (importedDate) {
        useJobsStore.getState().setSelectedDate(importedDate);
      }

      await refreshDraftJobs();
      onFinish();
    } catch (error: any) {
      message.error(error.response?.data?.detail || "Failed to import jobs");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      {/* Answer first: what will happen, then what needs a look */}
      <div className="lang mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[18px] font-medium text-[#12211A]">
            {stats.readyToImport === stats.total
              ? `${stats.total} ${stats.total === 1 ? "job is" : "jobs are"} ready to import`
              : `${stats.readyToImport} of ${stats.total} jobs ready · ${stats.geocodingErrors + stats.validationErrors} need fixing`}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-[#4A5750]">
            {facts.dates && <span>{facts.dates}</span>}
            {facts.clients > 0 && <span>· {facts.clients} {facts.clients === 1 ? "client" : "clients"}</span>}
            {facts.trips.length > 0 && <span>· {facts.trips.join(", ")}</span>}
            {stats.duplicates > 0 && <span className="text-[#8A6700]">· {stats.duplicates} possible {stats.duplicates === 1 ? "duplicate" : "duplicates"} (still imported)</span>}
          </div>
        </div>
        <div role="tablist" aria-label="Show rows" className="flex items-stretch border-b border-[#E3E8E5]">
          {([
            ["all", "All", stats.total, "#12211A"],
            ["ready", "Ready", stats.readyToImport, "#1F845A"],
            ...(stats.geocodingErrors ? [["geocoding_error", "Address not found", stats.geocodingErrors, "#C9372C"]] : []),
            ...(stats.validationErrors ? [["validation_error", "Needs fixing", stats.validationErrors, "#C9372C"]] : []),
            ...(stats.duplicates ? [["duplicate", "Possible duplicates", stats.duplicates, "#B38600"]] : []),
          ] as [FilterType, string, number, string][]).map(([key, label, count, color]) => {
            const on = activeFilter === key;
            return <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setActiveFilter(key)}
              className={`-mb-px inline-flex items-center gap-1.5 border-0 border-b-2 bg-transparent px-2.5 py-1.5 text-[13px] cursor-pointer ${on ? "font-medium" : "text-[#4A5750] hover:text-[#12211A]"}`}
              style={{ borderBottomColor: on ? color : "transparent", color: on ? color : undefined }}>
              {label}<span className="tabular-nums text-[12px] opacity-80">{count}</span>
            </button>;
          })}
        </div>
      </div>
      {stats.hasErrors && (
        <p className="lang m-0 mb-2 border-l-2 border-[#C9372C] bg-[#FDECEA] px-3 py-2 text-[13px] text-[#12211A]">
          {stats.geocodingErrors + stats.validationErrors} {stats.geocodingErrors + stats.validationErrors === 1 ? "row is" : "rows are"} skipped unless fixed.
          Double-click a cell to correct it; the address is checked again straight away.
        </p>
      )}
      <div className="lang mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        {!stats.hasErrors ? <p className="m-0 text-[12px] text-[#626E67]">Double-click any cell to correct it before importing. Changed addresses are checked again.</p> : <span />}
        {keepVisibleOptions.length > 1 && <label className="flex items-center gap-2 text-[12px] text-[#4A5750]"
          title="This column stays on the left while you scroll sideways. Your choice is remembered for this job type.">
          Keep visible
          <select value={pinnedField ?? ""} onChange={e => setPinChoice(e.target.value || null)} aria-label="Column to keep visible while scrolling"
            className="h-7 border border-[#D5DCD8] bg-white px-1.5 text-[12px] text-[#12211A]">
            <option value="">No column</option>
            {keepVisibleOptions.map(o => <option key={o.identifier} value={o.identifier}>{o.label}{o.identifier === suggestedPin ? " (suggested)" : ""}</option>)}
          </select>
        </label>}
      </div>

      {/* Data Grid Container */}
      <div className="flex-1 min-h-0 relative mb-3 border border-gray-200 overflow-hidden">
        <div
          className="h-full w-full [&_.ag-root-wrapper]:!border-0 [&_.ag-header]:!bg-gray-50 [&_.ag-header-cell]:!font-semibold [&_.ag-header-cell-text]:!text-xs [&_.ag-header-cell-text]:!text-gray-700"
          style={{ "--ag-wrapper-border-radius": "0" } as React.CSSProperties}
        >
          <AgGridReact
            ref={gridRef}
            rowData={displayedRowData}
            columnDefs={columnDefs}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
            }}
            animateRows={true}
            rowSelection="multiple"
            suppressRowClickSelection={true}
            getRowClass={getRowClass}
            onCellValueChanged={handleCellValueChanged}
            rowHeight={40}
            tooltipShowDelay={400}
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="import-step-footer flex items-center justify-between pt-4 border-t mt-4">
        <span className="text-[13px] text-[#4A5750]">
          {resolvingRows.size > 0
            ? `Updating locations for ${resolvingRows.size} edited row${
                resolvingRows.size > 1 ? "s" : ""
              }...`
            : stats.readyToImport > 0
            ? `${stats.readyToImport} ${stats.readyToImport === 1 ? "job" : "jobs"} will be added to the plan as drafts${stats.total > stats.readyToImport ? ` · ${stats.total - stats.readyToImport} skipped` : ""}`
            : "Nothing can be imported yet. Fix the rows marked in red."}
        </span>

        <div className="flex gap-2">
          {onBack && (
            <Button onClick={onBack} className="rounded-none">
              Back
            </Button>
          )}
          <Button onClick={onFinish} className="rounded-none">
            Cancel
          </Button>
          <Tooltip
            title={
              resolvingRows.size > 0
                ? "Waiting for edited addresses to be resolved"
                : ""
            }
          >
            <Button
              type="primary"
              onClick={handleImport}
              loading={isImporting}
              disabled={stats.readyToImport === 0 || resolvingRows.size > 0}
              className="rounded-none"
            >
              {stats.readyToImport > 0 ? `Import ${stats.readyToImport} ${stats.readyToImport === 1 ? "job" : "jobs"}` : "Import"}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default DataPreviewStep;
