import { useEffect, useRef, useState } from "react";
import JobForm from "@/components/Jobs/JobForm";
import { Modal } from "antd";
import type { Job } from "@/types/job.type";

interface AddJobsModalProps {
  open: boolean;
  setOpen?: (value: boolean) => void;
  onCancel?: () => void;
  /** Optional: called with the created Job after successful submission */
  onJobCreated?: (job: Job, jobs: Job[]) => void | Promise<void>;
  createJobs?: (payload: Record<string, unknown>, requestToken: string) => Promise<Job | Job[]>;
  defaultTemplate?: string;
  defaultDate?: string;
  defaultJobType?: string;
}

const AddJobsModal = ({
  open,
  setOpen,
  onCancel,
  onJobCreated,
  createJobs,
  defaultTemplate,
  defaultDate,
  defaultJobType,
}: AddJobsModalProps) => {
  const [submitting, setSubmitting] = useState(false);
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (open) tokenRef.current = crypto.randomUUID();
  }, [open]);
  const handleClose = () => {
    if (setOpen) setOpen(false);
    if (onCancel) onCancel();
  };

  return (
    <Modal
      footer={null}
      title="Add Job"
      open={open}
      onCancel={submitting ? undefined : handleClose}
      closable={!submitting}
      maskClosable={!submitting}
      keyboard={!submitting}
      destroyOnHidden
      width={700}
      centered
      styles={{ body: { overflow: "hidden", height: "80vh" } }}
    >
      <div style={{ height: "100%" }}>
        <JobForm
          defaultTemplate={defaultTemplate}
          onSubmittingChange={setSubmitting}
          createJobs={createJobs ? payload => {
            tokenRef.current ??= crypto.randomUUID();
            return createJobs(payload, tokenRef.current);
          } : undefined}
          defaultDate={defaultDate}
          defaultJobType={defaultJobType}
          onSubmit={async (job, jobs) => {
            if (job && onJobCreated) {
              await onJobCreated(job, jobs || [job]);
            }
            handleClose();
          }}
        />
      </div>
    </Modal>
  );
};

export default AddJobsModal;
