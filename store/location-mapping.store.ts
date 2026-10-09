import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import {
  LocationMapping,
  LocationMappingCreate,
  LocationMappingUpdate,
  LocationTypeOption,
  LOCATION_TYPE_OPTIONS,
  fetchLocationMappings,
  createLocationMapping,
  updateLocationMapping,
  batchCreateLocationMappings,
  deleteLocationMapping,
  fetchLocationTypes,
  createCustomLocationType,
} from "@/apis/location-mapping.api";

interface LocationMappingStore {
  locationMappings: LocationMapping[];
  locationTypes: LocationTypeOption[];
  isLoading: boolean;
  isLoadingTypes: boolean;
  isSaving: boolean;
  error: string | null;
  hasFetched: boolean;
  hasFetchedTypes: boolean;

  fetchLocationMappings: () => Promise<void>;
  initializeLocationMappings: () => Promise<void>;
  fetchLocationTypes: () => Promise<void>;
  createCustomLocationTypeAction: (name: string) => Promise<LocationTypeOption | null>;
  createLocationMapping: (payload: LocationMappingCreate) => Promise<boolean>;
  updateLocationMapping: (id: number, payload: LocationMappingUpdate) => Promise<boolean>;
  batchCreateLocationMappingsAction: (payloads: LocationMappingCreate[]) => Promise<number>;
  deleteLocationMapping: (id: number) => Promise<boolean>;
  bulkDeleteLocationMappings: (ids: number[]) => Promise<boolean>;
}

export const useLocationMappingStore = create(
  devtools(
    immer<LocationMappingStore>((set, get) => ({
      locationMappings: [],
      locationTypes: LOCATION_TYPE_OPTIONS,
      isLoading: false,
      isLoadingTypes: false,
      isSaving: false,
      error: null,
      hasFetched: false,
      hasFetchedTypes: false,

      fetchLocationMappings: async () => {
        set({ isLoading: true, error: null });
        try {
          const items = await fetchLocationMappings();
          set({ locationMappings: items, hasFetched: true });
        } catch (error) {
          set({ error: (error as Error).message });
        } finally {
          set({ isLoading: false });
        }
      },

      initializeLocationMappings: async () => {
        const { hasFetched, isLoading } = get();
        if (hasFetched || isLoading) return;
        await get().fetchLocationMappings();
      },

      fetchLocationTypes: async () => {
        set({ isLoadingTypes: true });
        try {
          const types = await fetchLocationTypes();
          if (types && types.length > 0) {
            set({ locationTypes: types, hasFetchedTypes: true });
          }
        } catch (error) {
          console.error("Error fetching location types in store:", error);
        } finally {
          set({ isLoadingTypes: false });
        }
      },

      createCustomLocationTypeAction: async (name: string) => {
        try {
          const newType = await createCustomLocationType(name);
          if (newType) {
            set((state) => {
              const existingIdx = state.locationTypes.findIndex(
                (t) => t.value.toLowerCase() === newType.value.toLowerCase()
              );
              if (existingIdx !== -1) {
                state.locationTypes[existingIdx] = newType;
              } else {
                state.locationTypes.push(newType);
              }
            });
            return newType;
          }
          return null;
        } catch (error) {
          console.error("Error creating custom location type:", error);
          throw error;
        }
      },

      createLocationMapping: async (payload: LocationMappingCreate) => {
        set({ isSaving: true, error: null });
        try {
          const newItem = await createLocationMapping(payload);
          set((state) => {
            state.locationMappings.push(newItem);
          });
          return true;
        } catch (error) {
          set({ error: (error as Error).message });
          return false;
        } finally {
          set({ isSaving: false });
        }
      },

      updateLocationMapping: async (id: number, payload: LocationMappingUpdate) => {
        set({ isSaving: true, error: null });
        try {
          const updated = await updateLocationMapping(id, payload);
          set((state) => {
            const idx = state.locationMappings.findIndex((m) => m.id === id);
            if (idx !== -1) {
              state.locationMappings[idx] = updated;
            }
          });
          return true;
        } catch (error) {
          set({ error: (error as Error).message });
          return false;
        } finally {
          set({ isSaving: false });
        }
      },

      batchCreateLocationMappingsAction: async (payloads: LocationMappingCreate[]) => {
        set({ isSaving: true, error: null });
        try {
          const count = await batchCreateLocationMappings(payloads);
          await get().fetchLocationMappings();
          return count;
        } catch (error) {
          set({ error: (error as Error).message });
          return 0;
        } finally {
          set({ isSaving: false });
        }
      },


      deleteLocationMapping: async (id: number) => {
        set({ isSaving: true, error: null });
        try {
          await deleteLocationMapping(id);
          set((state) => {
            state.locationMappings = state.locationMappings.filter((m) => m.id !== id);
          });
          return true;
        } catch (error) {
          set({ error: (error as Error).message });
          return false;
        } finally {
          set({ isSaving: false });
        }
      },

      bulkDeleteLocationMappings: async (ids: number[]) => {
        set({ isSaving: true, error: null });
        try {
          for (const id of ids) {
            await deleteLocationMapping(id);
          }
          set((state) => {
            state.locationMappings = state.locationMappings.filter((m) => !ids.includes(m.id));
          });
          return true;
        } catch (error) {
          set({ error: (error as Error).message });
          return false;
        } finally {
          set({ isSaving: false });
        }
      },
    }))
  )
);
