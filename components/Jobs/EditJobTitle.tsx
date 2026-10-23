import type { Job } from "@/types/job.type";
import { getJobLeg } from "@/utils/jobPickupType.utils";

export default function EditJobTitle({ job }: { job?: Job | null }) {
  const leg = job?.template_type === "worker_shuttle" ? getJobLeg(job) : undefined;

  return <span className="flex flex-wrap items-center gap-3">
    <span>Edit Job #{job?.id || ""}</span>
    {leg && <span className="inline-flex items-center gap-2 text-sm">
      <span className="font-normal text-slate-500">Leg</span>
      <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{leg}</span>
    </span>}
  </span>;
}
