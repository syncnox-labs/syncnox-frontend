import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { BulkUploadResponse, GeocodedRow } from "@/types/bulk-upload.type";

interface BulkUploadStore {
  // Current step (1: Upload, 2: Mapping, 3: Preview)
  currentStep: number;

  // File upload
  uploadedFile: File | null;
  uploadResponse: BulkUploadResponse | null;

  // Default scheduled date for bulk upload
  defaultScheduledDate: string | null;

  // Active template type for bulk upload
  templateType: string;

  // Column mapping
  columnMapping: Record<string, string>; // {identifier: excel_column_name}
  saveAsDefault: boolean;

  // Geocoded data
  geocodedData: GeocodedRow[];
  isGeocoding: boolean;

  // Actions
  setCurrentStep: (step: number) => void;
  setUploadedFile: (file: File | null) => void;
  setUploadResponse: (response: BulkUploadResponse | null) => void;
  setTemplateType: (type: string) => void;
  setDefaultScheduledDate: (date: string | null) => void;
  setColumnMapping: (mapping: Record<string, string>) => void;
  setSaveAsDefault: (save: boolean) => void;
  setGeocodedData: (data: GeocodedRow[]) => void;
  updateGeocodedRow: (index: number, row: Partial<GeocodedRow>) => void;
  setIsGeocoding: (loading: boolean) => void;
  reset: () => void;
}

/** Today in the browser's own calendar. toISOString() gives the UTC date, which is tomorrow after 7 PM in Montreal. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// A function, so "today" is worked out when an upload starts, not once when the app loads.
const initialState = () => ({
  currentStep: 1,
  uploadedFile: null,
  uploadResponse: null,
  templateType: "worker_shuttle",
  defaultScheduledDate: localToday(), // Today in YYYY-MM-DD, local calendar
  columnMapping: {},
  saveAsDefault: true, // Default to checked
  geocodedData: [],
  isGeocoding: false,
});

export const useBulkUploadStore = create<BulkUploadStore>()(
  immer((set) => ({
    ...initialState(),

    setCurrentStep: (step: number) => {
      set((state) => {
        state.currentStep = step;
      });
    },

    setUploadedFile: (file: File | null) => {
      set((state) => {
        state.uploadedFile = file;
      });
    },

    setUploadResponse: (response: BulkUploadResponse | null) => {
      set((state) => {
        state.uploadResponse = response;
      });
    },

    setTemplateType: (type: string) => {
      set((state) => {
        state.templateType = type;
      });
    },

    setDefaultScheduledDate: (date: string | null) => {
      set((state) => {
        state.defaultScheduledDate = date;
      });
    },

    setColumnMapping: (mapping: Record<string, string>) => {
      set((state) => {
        state.columnMapping = mapping;
      });
    },

    setSaveAsDefault: (save: boolean) => {
      set((state) => {
        state.saveAsDefault = save;
      });
    },

    setGeocodedData: (data: GeocodedRow[]) => {
      set((state) => {
        state.geocodedData = data;
      });
    },

    updateGeocodedRow: (index: number, row: Partial<GeocodedRow>) => {
      set((state) => {
        if (state.geocodedData[index]) {
          state.geocodedData[index] = {
            ...state.geocodedData[index],
            ...row,
          };
        }
      });
    },

    setIsGeocoding: (loading: boolean) => {
      set((state) => {
        state.isGeocoding = loading;
      });
    },

    reset: () => {
      set(() => initialState());
    },
  }))
);
