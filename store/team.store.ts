import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { Team } from "@/types/team.type";
import { useJobsStore } from "@/store/jobs.store";
import { refreshRoutesAfterDeletion } from "@/utils/refreshRoutesAfterDeletion.utils";
import {
  fetchTeams,
  createTeam,
  updateTeam,
  deleteTeam as deleteTeamApi,
  bulkDeleteTeams,
  bulkImportTeams,
  batchCreateTeams,
} from "@/apis/team.api";

interface TeamStore {
  teams: Team[];
  activeTeams: Team[] | null;
  isLoading: boolean;
  error: string | null;
  fetchTeams: () => Promise<void>;
  initializeTeams: () => Promise<void>;
  createTeamAction: (team: Team) => Promise<Team>; // Create team with API call + state update
  updateTeamAction: (team: Team) => Promise<Team>; // Update team with API call + state update
  deleteTeamAction: (teamId: number) => Promise<void>; // Delete team with API call + state update
  bulkDeleteTeamsAction: (ids: number[]) => Promise<void>;
  bulkImportTeamsAction: (file: File) => Promise<Team[]>;
  batchCreateTeamsAction: (teams: Partial<Team>[]) => Promise<Team[]>;
  hasFetched: boolean;
  getTeamsMap: () => Record<number, string>;
}

export const useTeamStore = create(
  devtools(
    immer<TeamStore>((set, get) => ({
      teams: [],
      activeTeams: [],
      isLoading: false,
      error: null,
      hasFetched: false,

      fetchTeams: async () => {
        set({ isLoading: true });
        try {
          const teams = await fetchTeams();
          const activeTeams = await fetchTeams({ status: "active" });
          set({ teams });
          set({ hasFetched: true });
        } catch (error) {
          set({ error: error as string });
        } finally {
          set({ isLoading: false });
        }
      },

      // Create team: API call + state update
      createTeamAction: async (team: Team) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const newTeam = await createTeam(team);

          // Update state with the new team
          set((state) => {
            state.teams = [newTeam, ...state.teams];
            state.isLoading = false;
          });

          return newTeam;
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to create team";
          });
          throw error; // Re-throw so component can handle the error
        }
      },

      // Update team: API call + state update
      updateTeamAction: async (team: Team) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const updatedTeam = await updateTeam(team);

          // Update state with the updated team
          set((state) => {
            const index = state.teams.findIndex((t) => t.id === updatedTeam.id);
            if (index !== -1) {
              state.teams[index] = updatedTeam;
            }
            state.isLoading = false;
          });

          return updatedTeam;
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to update team";
          });
          throw error; // Re-throw so component can handle the error
        }
      },

      // Delete team: API call + state update
      deleteTeamAction: async (teamId: number) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          await deleteTeamApi(teamId);

          // Update state by removing the deleted team
          set((state) => {
            state.teams = state.teams.filter((team) => team.id !== teamId);
            state.isLoading = false;
          });
          await Promise.all([useJobsStore.getState().fetchAllJobs(), refreshRoutesAfterDeletion()]);
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to delete team";
          });
          throw error; // Re-throw so component can handle the error
        }
      },

      bulkDeleteTeamsAction: async (ids: number[]) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          await bulkDeleteTeams(ids);
          set((state) => {
            state.teams = state.teams.filter((team) => !ids.includes(team.id));
            state.isLoading = false;
          });
          await Promise.all([useJobsStore.getState().fetchAllJobs(), refreshRoutesAfterDeletion()]);
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to delete team members";
          });
          throw error;
        }
      },

      initializeTeams: async () => {
        const { hasFetched, isLoading } = get();
        if (hasFetched || isLoading) return;
        await get().fetchTeams();
      },

      bulkImportTeamsAction: async (file: File) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const imported = await bulkImportTeams(file);
          set((state) => {
            state.teams.push(...imported);
            state.isLoading = false;
          });
          return imported;
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to import drivers";
          });
          throw error;
        }
      },

      batchCreateTeamsAction: async (teams: Partial<Team>[]) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const created = await batchCreateTeams(teams);
          set((state) => {
            state.teams.unshift(...created);
            state.isLoading = false;
          });
          return created;
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to create drivers";
          });
          throw error;
        }
      },

      getTeamsMap: () => {
        const { teams } = get();
        return teams.reduce((acc, team) => {
          acc[team.id] = team.name;
          return acc;
        }, {} as Record<number, string>);
      },
    }))
  )
);
