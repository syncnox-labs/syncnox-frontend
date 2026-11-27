"use client";

import { useEffect } from "react";
import { Modal } from "antd";
import { useBulkUploadStore } from "@/store/bulkUpload.store";
import { useIndexStore } from "@/store/index.store";
import FileUploadStep from "./bulk-upload/FileUploadStep";
import ColumnMappingStep from "./bulk-upload/ColumnMappingStep";
import DataPreviewStep from "./bulk-upload/DataPreviewStep";

interface BulkUploadModalProps {
  open: boolean;
  templateType?: string;
  onClose?: () => void;
  onCancel?: () => void;
}

const BulkUploadModal = ({ open, templateType, onClose, onCancel }: BulkUploadModalProps) => {
  const { currentStep, setCurrentStep, reset, setTemplateType } = useBulkUploadStore();

  useEffect(() => {
    if (open) {
      const activeTpl =
        templateType ||
        useIndexStore.getState().activeJobTemplate ||
        "worker_shuttle";
      setTemplateType(activeTpl);
    }
  }, [open, templateType, setTemplateType]);

  const handleClose = () => {
    if (onClose) onClose();
    if (onCancel) onCancel();
  };

  const handleFinish = () => {
    handleClose();
  };

  // The first step is one date and one file, so it gets a small window. The mapping and preview tables need the wide one.
  const getModalWidth = () => {
    return currentStep === 1 ? 680 : 1460;
  };

  const getModalClassName = () => {
    return "bulk-upload-modal-large";
  };

  const steps = [
    { title: "Upload file" },
    { title: "Map columns" },
    { title: "Preview and import" },
  ];

  return (
    <Modal
      rootClassName="lang"
      title={
        <span className="block">
          <span className="block text-[11px] font-medium uppercase leading-4 tracking-[0.09em] text-[#626E67]">Step {currentStep} of {steps.length}</span>
          <span className="mt-1 block text-xl font-medium leading-7 tracking-[-0.02em] text-[#12211A]">Bulk upload jobs</span>
        </span>
      }
      open={open}
      onCancel={handleClose}
      afterClose={reset}
      maskClosable={false}
      footer={null}
      width={getModalWidth()}
      centered
      className={getModalClassName()}
      styles={{
        body: currentStep === 1
          ? { display: 'flex', flexDirection: 'column', minHeight: 0 }
          : { flex: 1, height: '78vh', maxHeight: '78vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
        header: { borderRadius: 0, paddingBottom: '16px' },
        mask: { backdropFilter: 'blur(4px)' }
      }}
    >
      <div className="flex flex-col flex-1 min-h-0">
        {/* The three steps as plain words on one thin line; a green line marks the step you are on. Done steps stay dark. */}
        <ol aria-label="Steps" className="m-0 mb-1 flex shrink-0 list-none gap-1 p-0 shadow-[inset_0_-1px_0_#D5DCD8]">
          {steps.map((step, index) => {
            const number = index + 1, current = number === currentStep, done = number < currentStep;
            return (
              <li key={step.title} aria-current={current ? "step" : undefined}
                className={`inline-flex h-9 items-center gap-2 px-3 text-[13px] first:pl-0 ${current ? "font-medium text-[#12211A] shadow-[inset_0_-2px_0_#0B5D3B]" : done ? "text-[#12211A]" : "text-[#626E67]"}`}>
                <span className="tabular-nums">{number}</span>{step.title}
              </li>
            );
          })}
        </ol>

        {/* Render only the current step */}
        <div className="mt-2 flex-1 min-h-0 flex flex-col">
          {currentStep === 1 && <FileUploadStep />}
          {currentStep === 2 && (
            <ColumnMappingStep onNext={() => setCurrentStep(3)} />
          )}
          {currentStep === 3 && (
            <DataPreviewStep
              onFinish={handleFinish}
              onBack={() => setCurrentStep(2)}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default BulkUploadModal;
