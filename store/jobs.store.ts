import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { Job, JobStatus } from "@/types/job.type";
import {
  fetchJobs,
  createJob,
  updateJob,
  deleteJob as deleteJobApi,
  deleteJobsBulk,
} from "@/apis/jobs.api";
import { findClosestDateToToday } from "@/utils/date.utils";

interface JobsState {
  // Data
  jobs: Job[];
  draftJobs: Job[];
  allDraftJobs: Job[];
  allJobs: Job[];
  draftJobDates: string[];
  selectedDate: string | null;

  isLoading: boolean;
  error: string | null;

  // Actions
  initializeJobs: () => Promise<void>;
  fetchJobsByStatus: (status: JobStatus) => Promise<void>;
  fetchAllJobs: () => Promise<void>;
  setSelectedDate: (date: string | null) => void;
  createJobAction: (job: any) => Promise<any>;
  updateJobAction: (job: { id: number } & Partial<Job>) => Promise<Job>;
  deleteJobAction: (jobId: number) => Promise<void>;
  deleteJobsAction: (jobIds: number[], status: JobStatus) => Promise<void>;
  refreshDraftJobs: () => Promise<void>;
  fetchJobsByDate: (date: string) => Promise<void>;
  fetchJobsByIds: (jobIds: number[]) => Promise<void>;
  patchJobLocally: (job: Job) => void;
  updateJobStatusLocally: (jobId: number, status: JobStatus) => void;
  resetAllJobs: () => void;
}

export const useJobsStore = create<JobsState>()(
  devtools(
    immer((set, get) => ({
      // Initial state
      jobs: [],
      draftJobs: [],
      allDraftJobs: [],
      allJobs: [],
      draftJobDates: [],
      selectedDate: null,
      isLoading: false,
      error: null,

      // Initialize with all jobs
      initializeJobs: async () => {
        const { isLoading } = get();

        if (isLoading) {
          return;
        }

        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          await get().fetchAllJobs();
        } catch (error) {
          set((state) => {
            state.error =
              error instanceof Error ? error.message : "Failed to fetch jobs";
            state.isLoading = false;
          });
        }
      },

      // Fetch jobs by status and update jobs state
      fetchJobsByStatus: async (status: JobStatus) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const { selectedDate } = get();
          const jobsData = await fetchJobs({
            status,
            date: selectedDate || undefined,
            limit: 1000,
          });

          set((state) => {
            state.jobs = jobsData;
            state.allDraftJobs = jobsData;

            const dates = [
              ...new Set(
                jobsData
                  .map((job) => job.scheduled_date)
                  .filter((d): d is string => Boolean(d))
              ),
            ].sort();

            if (dates.length > 0) {
              state.draftJobDates = dates;
              if (
                !state.selectedDate ||
                !dates.includes(state.selectedDate)
              ) {
                state.selectedDate = findClosestDateToToday(dates);
              }

              state.draftJobs = jobsData.filter(
                (job) => job.scheduled_date === state.selectedDate,
              );
            } else {
              state.draftJobs = jobsData;
            }

            state.isLoading = false;
          });
        } catch (error) {
          set((state) => {
            state.error =
              error instanceof Error
                ? error.message
                : `Failed to fetch ${status} jobs`;
            state.isLoading = false;
          });
        }
      },

      // Fetch all jobs without status filter
      fetchAllJobs: async () => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const { selectedDate } = get();
          const jobsData = await fetchJobs({
            date: selectedDate || undefined,
            limit: 1000,
          });

          set((state) => {
            state.jobs = jobsData;
            state.allJobs = jobsData;
            state.allDraftJobs = jobsData;

            // Extract unique scheduled_date entries
            const dates = [
              ...new Set(
                jobsData
                  .map((job) => job.scheduled_date)
                  .filter((d): d is string => Boolean(d))
              ),
            ].sort();

            if (dates.length > 0) {
              state.draftJobDates = dates;
              if (
                !state.selectedDate ||
                !dates.includes(state.selectedDate)
              ) {
                state.selectedDate = findClosestDateToToday(dates);
              }

              state.draftJobs = jobsData.filter(
                (job) => job.scheduled_date === state.selectedDate,
              );
            } else {
              state.draftJobs = jobsData;
            }

            state.isLoading = false;
          });
        } catch (error) {
          set((state) => {
            state.error =
              error instanceof Error ? error.message : "Failed to fetch all jobs";
            state.isLoading = false;
          });
        }
      },

      // Set selected date and filter jobs
      setSelectedDate: (date: string | null) => {
        set((state) => {
          state.selectedDate = date;

          if (date) {
            state.draftJobs = state.allJobs.filter(
              (job) => job.scheduled_date === date,
            );
          } else {
            state.draftJobs = state.allJobs;
          }
        });
      },

      // Create job and refresh
      createJobAction: async (job: any) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const res = await createJob(job);
          const firstJob = Array.isArray(res) ? res[0] : res;

          // Refresh all jobs so allStores remain in sync
          await get().fetchAllJobs();

          // Auto-select scheduled_date of the newly created job
          if (firstJob && firstJob.scheduled_date) {
            get().setSelectedDate(firstJob.scheduled_date);
          }

          return res;
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to create job";
          });
          throw error;
        }
      },

      // Update job and refresh
      updateJobAction: async (job: { id: number } & Partial<Job>) => {
        const originalDate = get().jobs.find(item => item.id === job.id)?.scheduled_date;
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const updatedJob = await updateJob(job);

          // The API returns every leg changed in the same booking edit. Merge
          // them without replacing this route's job list with another date's
          // global table filter or making an additional fetch for each leg.
          const savedJobs = updatedJob.updated_jobs?.length ? updatedJob.updated_jobs : [updatedJob];
          savedJobs.forEach(saved => get().patchJobLocally(saved));
          if (originalDate && originalDate !== updatedJob.scheduled_date) {
            await get().fetchAllJobs();
          }
          set((state) => { state.isLoading = false; });

          return updatedJob;
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to update job";
          });
          throw error;
        }
      },

      // Delete job and refresh
      deleteJobAction: async (jobId: number) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          await deleteJobApi(jobId);
          await get().fetchAllJobs();
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to delete job";
          });
          throw error;
        }
      },

      // Bulk delete jobs
      deleteJobsAction: async (jobIds: number[], status: JobStatus) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          await deleteJobsBulk(jobIds);
          await get().fetchAllJobs();
        } catch (error) {
          set((state) => {
            state.isLoading = false;
            state.error =
              error instanceof Error ? error.message : "Failed to delete jobs";
          });
          throw error;
        }
      },

      // Refresh draft jobs (used after bulk upload)
      refreshDraftJobs: async () => {
        await get().fetchAllJobs();
      },

      // Fetch all jobs for a specific date
      fetchJobsByDate: async (date: string) => {
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const jobsData = await fetchJobs({
            date,
            limit: 1000,
          });

          set((state) => {
            state.jobs = jobsData;
            state.isLoading = false;
          });
        } catch (error) {
          set((state) => {
            state.error =
              error instanceof Error
                ? error.message
                : "Failed to fetch jobs by date";
            state.isLoading = false;
          });
        }
      },

      fetchJobsByIds: async (jobIds: number[]) => {
        if (jobIds.length === 0) return;

        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const jobsData = await fetchJobs({
            job_ids: jobIds.join(","),
            limit: 1000,
          });

          set((state) => {
            state.jobs = jobsData;
            state.isLoading = false;
          });
        } catch (error) {
          set((state) => {
            state.error =
              error instanceof Error
                ? error.message
                : "Failed to fetch jobs by IDs";
            state.isLoading = false;
          });
        }
      },

      patchJobLocally: (job: Job) => {
        set((state) => {
          const jobExists = state.jobs.some((j) => j.id === job.id);
          if (jobExists) {
            state.jobs = state.jobs.map((j) => (j.id === job.id ? job : j));
          } else {
            state.jobs.push(job);
          }

          const draftExists = state.draftJobs.some((j) => j.id === job.id);
          if (draftExists) {
            state.draftJobs = state.draftJobs.map((j) =>
              j.id === job.id ? job : j,
            );
          }

          const allJobsExists = state.allJobs.some(
            (j) => j.id === job.id,
          );
          if (allJobsExists) {
            state.allJobs = state.allJobs.map((j) =>
              (j.id === job.id ? job : j),
            );
          }

          const allDraftExists = state.allDraftJobs.some(
            (j) => j.id === job.id,
          );
          if (allDraftExists) {
            state.allDraftJobs = state.allDraftJobs.map((j) =>
              (j.id === job.id ? job : j),
            );
          }
        });
      },

      updateJobStatusLocally: (jobId: number, status: JobStatus) => {
        set((state) => {
          state.jobs = state.jobs.map((j) => (j.id === jobId ? { ...j, status } : j));
          state.draftJobs = state.draftJobs.map((j) => (j.id === jobId ? { ...j, status } : j));
          state.allDraftJobs = state.allDraftJobs.map((j) => (j.id === jobId ? { ...j, status } : j));
          state.allJobs = state.allJobs.map((j) => (j.id === jobId ? { ...j, status } : j));
        });
      },

      resetAllJobs: () => {
        set((state) => {
          state.jobs = state.allJobs;
          state.draftJobs = state.selectedDate
            ? state.allDraftJobs.filter(
                (job) => job.scheduled_date === state.selectedDate,
              )
            : state.allDraftJobs;
        });
      },
    })),
    {
      name: "jobs-store",
    },
  ),
);
