"use client";

import { useEffect } from "react";
import { Modal, Steps } from "antd";
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

  const getModalWidth = () => {
    return 1460;
  };

  const getModalClassName = () => {
    return "bulk-upload-modal-large";
  };

  const steps = [
    { title: "Upload File" },
    { title: "Map Columns" },
    { title: "Preview & Import" },
  ];

  return (
    <Modal
      title={<span className="text-xl font-semibold">Bulk Upload Jobs</span>}
      open={open}
      onCancel={handleClose}
      afterClose={reset}
      maskClosable={false}
      footer={null}
      width={getModalWidth()}
      centered
      className={getModalClassName()}
      styles={{
        body: { flex: 1, height: '78vh', maxHeight: '78vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 },
        header: { borderRadius: 0, paddingBottom: '16px' },
        mask: { backdropFilter: 'blur(4px)' }
      }}
    >
      <div className="flex flex-col flex-1 min-h-0">
        <Steps
          current={currentStep - 1}
          items={steps}
          className="mb-6 shrink-0"
          size="small"
        />

        {/* Render only the current step */}
        <div className="mt-6 flex-1 min-h-0 flex flex-col">
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
