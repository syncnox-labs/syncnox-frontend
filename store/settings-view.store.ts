import { create } from "zustand";

export type EntityView = "form" | "table";

interface SettingsViewState {
  view: EntityView;
  setView: (view: EntityView) => void;
}

/** Keep the selected view consistent while navigating between settings pages. */
export const useSettingsViewStore = create<SettingsViewState>((set) => ({
  view: "form",
  setView: (view) => set({ view }),
}));
