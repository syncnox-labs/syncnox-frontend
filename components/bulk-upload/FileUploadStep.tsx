"use client";

import { useState } from "react";
import { Upload, message, DatePicker } from "antd";
import { ArrowRight, Upload as UploadIcon } from "lucide-react";
import type { UploadFile } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useBulkUploadStore } from "@/store/bulkUpload.store";
import { uploadBulkFile } from "@/apis/bulk-upload.api";

const { Dragger } = Upload;

const FileUploadStep = () => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const {
    setUploadedFile,
    setUploadResponse,
    setCurrentStep,
    setColumnMapping,
    defaultScheduledDate,
    setDefaultScheduledDate,
  } = useBulkUploadStore();

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const response = await uploadBulkFile(file);

      setUploadedFile(file);
      setUploadResponse(response);
      setColumnMapping({});

      message.success("File uploaded successfully!");
      setCurrentStep(2);
    } catch (error: any) {
      message.error(error.response?.data?.detail || "Failed to upload file");
    } finally {
      setIsUploading(false);
    }
  };

  const customRequest = async (options: any) => {
    const { file, onSuccess, onError } = options;
    try {
      await handleUpload(file);
      onSuccess("ok");
    } catch (err) {
      onError(err);
    }
  };

  const beforeUpload = (file: File) => {
    if (!defaultScheduledDate) {
      message.error("Please select a default scheduled date before uploading!");
      return Upload.LIST_IGNORE;
    }

    const isValidType =
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    if (!isValidType) {
      message.error("You can only upload CSV or Excel files!");
      return Upload.LIST_IGNORE;
    }

    const isLt10M = file.size / 1024 / 1024 < 10;
    if (!isLt10M) {
      message.error("File must be smaller than 10MB!");
      return Upload.LIST_IGNORE;
    }

    return true;
  };

  return (
    <div className="flex flex-col gap-6 pb-1 pt-4">
      {/* 1. The date these jobs are for */}
      <div>
        <label htmlFor="bulk-upload-date" className="block text-[13px] font-medium text-[#12211A]">
          Scheduled date <span className="text-[#C9372C]" aria-hidden="true">*</span>
        </label>
        <DatePicker
          id="bulk-upload-date"
          value={defaultScheduledDate ? dayjs(defaultScheduledDate) : null}
          onChange={(date: Dayjs | null) => {
            setDefaultScheduledDate(date ? date.format("YYYY-MM-DD") : null);
          }}
          format="YYYY-MM-DD"
          className="mt-1.5 w-full sm:w-[240px]"
          placeholder="Select date for imported jobs"
          disabled={isUploading}
          aria-required="true"
          aria-describedby="bulk-upload-date-help"
        />
        <p id="bulk-upload-date-help" className="m-0 mt-1.5 text-xs text-[#626E67]">Used for every row that has no date of its own in the file.</p>
      </div>

      {/* 2. The file */}
      <div>
        <p className="m-0 text-[13px] font-medium text-[#12211A]">File</p>
        <div className="bulk-dropzone mt-1.5">
          <Dragger
            name="file"
            fileList={fileList}
            onChange={({ fileList }) => setFileList(fileList)}
            beforeUpload={beforeUpload}
            customRequest={customRequest}
            accept=".csv,.xlsx,.xls"
            disabled={isUploading}
            showUploadList={{
              showRemoveIcon: !isUploading,
            }}
          >
            <div className="flex flex-col items-center justify-center px-4 py-9">
              <UploadIcon size={26} className="text-[#12211A]" aria-hidden="true" />
              <p className="m-0 mt-3 text-sm font-medium text-[#12211A]">
                Drop your file here, or <span className="underline decoration-[#9AA8A0] underline-offset-4">browse</span>
              </p>
              <p className="m-0 mt-1 text-xs text-[#626E67]">CSV, XLSX or XLS, up to 10 MB</p>
            </div>
          </Dragger>
        </div>
        <p className="m-0 mt-2 text-xs text-[#626E67]">Column headers are detected and matched in the next step.</p>
      </div>

      {/* The sample file, as a link: it is help, not a step */}
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[#E3E8E5] pt-4 text-[13px] text-[#4A5750]">
        Not sure how to lay out the file?
        <a href="/sample-bulk-upload.csv" download className="inline-flex items-center gap-1.5 font-medium !text-[#12211A] underline decoration-[#9AA8A0] underline-offset-4 hover:decoration-[#12211A]">
          Download the sample CSV <ArrowRight size={14} aria-hidden="true" />
        </a>
      </p>
    </div>
  );
};

export default FileUploadStep;
