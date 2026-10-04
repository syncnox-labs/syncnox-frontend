import JobForm from "@/components/Jobs/JobForm";
import { Modal } from "antd";
import type { Job } from "@/types/job.type";

interface AddJobsModalProps {
  open: boolean;
  setOpen?: (value: boolean) => void;
  onCancel?: () => void;
  /** Optional: called with the created Job after successful submission */
  onJobCreated?: (job: Job) => void;
  defaultTemplate?: string;
  defaultDate?: string;
  defaultJobType?: string;
}

const AddJobsModal = ({
  open,
  setOpen,
  onCancel,
  onJobCreated,
  defaultTemplate,
  defaultDate,
  defaultJobType,
}: AddJobsModalProps) => {
  const handleClose = () => {
    if (setOpen) setOpen(false);
    if (onCancel) onCancel();
  };

  return (
    <Modal
      footer={null}
      title="Add Job"
      open={open}
      onCancel={handleClose}
      width={700}
      centered
      styles={{ body: { overflow: "hidden", height: "80vh" } }}
    >
      <div style={{ height: "100%" }}>
        <JobForm
          defaultTemplate={defaultTemplate as any}
          defaultDate={defaultDate}
          defaultJobType={defaultJobType}
          onSubmit={(job) => {
            if (job && onJobCreated) {
              onJobCreated(job);
            }
            handleClose();
          }}
        />
      </div>
    </Modal>
  );
};

export default AddJobsModal;
