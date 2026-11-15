import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { Job, JobStatus, FetchJobsParams } from "@/types/job.type";
import dayjs from "dayjs";
import {
  fetchJobs,
  fetchJobsCalendar,
  createJob,
  updateJob,
  deleteJob as deleteJobApi,
  deleteJobsBulk,
} from "@/apis/jobs.api";
import { findClosestDateToToday } from "@/utils/date.utils";
import { refreshRoutesAfterDeletion } from "@/utils/refreshRoutesAfterDeletion.utils";

// Legacy consumers may still request a complete history; the Jobs screen uses its scoped loader.
async function fetchAllJobPages(
  params: Pick<FetchJobsParams, "status" | "date"> = {},
): Promise<Job[]> {
  const jobs: Job[] = [];
  const limit = 1000;
  let page: Job[];
  do {
    page = await fetchJobs({ ...params, skip: jobs.length, limit });
    jobs.push(...page);
  } while (page.length === limit);
  return jobs;
}

type JobsListStatus = JobStatus | "all";
export const UNSCHEDULED_JOBS_DATE = "unscheduled";
let jobsListGeneration = 0;
let jobsListPending: { key: string; generation: number; promise: Promise<void> } | null = null;

interface JobsState {
  // Data
  jobs: Job[];
  draftJobs: Job[];
  allDraftJobs: Job[];
  allJobs: Job[];
  draftJobDates: string[];
  selectedDate: string | null;
  jobsListActive: boolean;
  jobsListStatus: JobsListStatus;
  jobsListDate: string | null;
  unscheduledJobsCount: number;

  isLoading: boolean;
  error: string | null;

  // Actions
  initializeJobs: () => Promise<void>;
  startJobsList: () => Promise<void>;
  stopJobsList: () => void;
  loadJobsList: (date: string, status: JobsListStatus, chooseClosest?: boolean, force?: boolean) => Promise<void>;
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
      jobsListActive: false,
      jobsListStatus: "draft",
      jobsListDate: null,
      unscheduledJobsCount: 0,
      isLoading: false,
      error: null,

      startJobsList: () => {
        const currentDate = get().selectedDate || (get().jobsListDate === UNSCHEDULED_JOBS_DATE ? UNSCHEDULED_JOBS_DATE : null);
        set(state => {
          state.jobsListActive = true;
          state.jobs = []; state.draftJobs = []; state.allJobs = []; state.allDraftJobs = [];
          state.draftJobDates = [];
          state.unscheduledJobsCount = 0;
        });
        return get().loadJobsList(currentDate || dayjs().format("YYYY-MM-DD"), "draft", !currentDate);
      },

      stopJobsList: () => {
        jobsListGeneration++;
        const wasLoadingList = Boolean(jobsListPending);
        jobsListPending = null;
        set(state => { state.jobsListActive = false; if (wasLoadingList) state.isLoading = false; });
      },

      loadJobsList: (date, status, chooseClosest = false, force = false) => {
        const key = `${date}:${status}`;
        if (!force && jobsListPending?.key === key) return jobsListPending.promise;
        const generation = ++jobsListGeneration;
        set(state => {
          if (state.jobsListStatus !== status) { state.draftJobDates = []; state.unscheduledJobsCount = 0; }
          if (state.jobsListDate !== date || state.jobsListStatus !== status) {
            state.jobs = []; state.draftJobs = []; state.allJobs = []; state.allDraftJobs = [];
          }
          state.jobsListDate = date;
          state.selectedDate = date === UNSCHEDULED_JOBS_DATE ? null : date;
          state.jobsListStatus = status;
          state.isLoading = true;
          state.error = null;
        });
        const isCurrent = () => generation === jobsListGeneration && get().jobsListActive;
        const promise = (async () => {
          try {
            let result = await fetchJobsCalendar(date === UNSCHEDULED_JOBS_DATE ? null : date, status);
            if (!isCurrent()) return;
            let resolvedDate = date;
            if (chooseClosest && result.available_dates.length && !result.available_dates.includes(date)) {
              resolvedDate = findClosestDateToToday(result.available_dates);
              result = await fetchJobsCalendar(resolvedDate, status);
              if (!isCurrent()) return;
            } else if (chooseClosest && !result.available_dates.length && result.unscheduled_count > 0) {
              resolvedDate = UNSCHEDULED_JOBS_DATE;
              result = await fetchJobsCalendar(null, status);
              if (!isCurrent()) return;
            }
            const items = [...result.jobs];
            while (items.length < result.total) {
              const page = resolvedDate === UNSCHEDULED_JOBS_DATE
                ? (await fetchJobsCalendar(null, status, items.length)).jobs
                : await fetchJobs({ date: resolvedDate, status: status === "all" ? undefined : status,
                  skip: items.length, limit: 1000 });
              if (!isCurrent()) return;
              if (!page.length) throw new Error("Could not load all jobs for this date. Please retry.");
              items.push(...page);
            }
            if (!isCurrent()) return;
            set(state => {
              state.jobsListDate = resolvedDate;
              state.selectedDate = resolvedDate === UNSCHEDULED_JOBS_DATE ? null : resolvedDate;
              state.jobs = items;
              state.draftJobs = items;
              state.allJobs = items;
              state.allDraftJobs = items;
              state.draftJobDates = result.available_dates;
              state.unscheduledJobsCount = result.unscheduled_count || 0;
              state.isLoading = false;
            });
          } catch (error) {
            if (isCurrent()) set(state => {
              state.error = error instanceof Error ? error.message : "Failed to load jobs";
              state.isLoading = false;
            });
          } finally {
            if (jobsListPending?.generation === generation) jobsListPending = null;
          }
        })();
        jobsListPending = { key, generation, promise };
        return promise;
      },

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
          const jobsData = await fetchAllJobPages({ status });

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

            state.draftJobDates = dates;
            if (dates.length > 0) {
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
        if (get().jobsListActive && get().jobsListDate) {
          return get().loadJobsList(get().jobsListDate!, get().jobsListStatus, false, true);
        }
        const listGenerationAtStart = jobsListGeneration;
        set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const jobsData = await fetchAllJobPages();
          if (get().jobsListActive && listGenerationAtStart !== jobsListGeneration) return;

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

            state.draftJobDates = dates;
            if (dates.length > 0) {
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
          if (get().jobsListActive && listGenerationAtStart !== jobsListGeneration) return;
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
        if (date && get().jobsListActive) void get().loadJobsList(date, get().jobsListStatus);
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

          if (get().jobsListActive) {
            const date = firstJob?.scheduled_date || get().jobsListDate || dayjs().format("YYYY-MM-DD");
            await get().loadJobsList(date, get().jobsListStatus, false, true);
          } else {
            await get().fetchAllJobs();
            if (firstJob?.scheduled_date) get().setSelectedDate(firstJob.scheduled_date);
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
          if (get().jobsListActive && get().jobsListDate) {
            await get().loadJobsList(get().jobsListDate!, get().jobsListStatus, false, true);
          } else if (originalDate && originalDate !== updatedJob.scheduled_date) {
            await get().fetchAllJobs();
          }
          if (!get().jobsListActive || !jobsListPending) set((state) => { state.isLoading = false; });

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
          const reload = get().jobsListActive && get().jobsListDate
            ? get().loadJobsList(get().jobsListDate!, get().jobsListStatus, false, true) : get().fetchAllJobs();
          await Promise.all([reload, refreshRoutesAfterDeletion()]);
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
          const reload = get().jobsListActive && get().jobsListDate
            ? get().loadJobsList(get().jobsListDate!, get().jobsListStatus, false, true) : get().fetchAllJobs();
          await Promise.all([reload, refreshRoutesAfterDeletion()]);
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
        if (get().jobsListActive && get().jobsListDate) {
          await get().loadJobsList(get().jobsListDate!, get().jobsListStatus, false, true);
        } else {
          await get().fetchAllJobs();
        }
      },

      // Fetch all jobs for a specific date
      fetchJobsByDate: async (date: string) => {
        const updateList = !get().jobsListActive;
        if (updateList) set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const jobsData = await fetchAllJobPages({ date });
          if (!updateList || get().jobsListActive) return;

          set((state) => {
            state.jobs = jobsData;
            state.isLoading = false;
          });
        } catch (error) {
          if (!updateList || get().jobsListActive) return;
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
        const updateList = !get().jobsListActive;

        if (updateList) set((state) => {
          state.isLoading = true;
          state.error = null;
        });

        try {
          const jobsData = await fetchJobs({
            job_ids: jobIds.join(","),
            limit: 1000,
          });
          if (!updateList || get().jobsListActive) return;

          set((state) => {
            state.jobs = jobsData;
            state.isLoading = false;
          });
        } catch (error) {
          if (!updateList || get().jobsListActive) return;
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
