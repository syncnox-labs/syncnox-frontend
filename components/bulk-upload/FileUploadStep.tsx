"use client";

import { useState } from "react";
import { Upload, message, DatePicker, Button } from "antd";
import {
  CloudUploadOutlined,
  CalendarOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
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
    <div className="flex flex-col gap-6 py-3 h-full min-h-0">
      {/* 2-Column Top Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 shrink-0">
        {/* Scheduled Date Section */}
        <div className="bg-white border border-gray-200 p-3.5 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <CalendarOutlined className="text-[#003220] text-sm" />
            <span className="text-xs font-bold text-gray-900 tracking-wider uppercase">
              Scheduled Date for Jobs <span className="text-red-500">*</span>
            </span>
          </div>
          <DatePicker
            value={defaultScheduledDate ? dayjs(defaultScheduledDate) : null}
            onChange={(date: Dayjs | null) => {
              setDefaultScheduledDate(date ? date.format("YYYY-MM-DD") : null);
            }}
            format="YYYY-MM-DD"
            className="w-full text-xs rounded-none"
            placeholder="Select date for imported jobs"
            disabled={isUploading}
          />
          <span className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
            <InfoCircleOutlined className="text-[10px]" />
            Default date applied unless specified in file.
          </span>
        </div>

        {/* Template Download Section */}
        <div className="bg-white border border-gray-200 p-3.5 responsive-toolbar flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 text-[#003220] flex items-center justify-center shrink-0 border border-emerald-100">
              <FileExcelOutlined style={{ fontSize: 18 }} />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-900">Need a Sample Template?</div>
              <div className="text-[11px] text-gray-500">Download formatted CSV to structure your file</div>
            </div>
          </div>

          <a
            href="/sample-bulk-upload.csv"
            download
            className="no-underline shrink-0"
          >
            <Button
              size="small"
              icon={<DownloadOutlined />}
              className="rounded-none bg-gray-50 text-xs font-medium border-gray-300 hover:border-[#003220] hover:text-[#003220]"
            >
              Download CSV
            </Button>
          </a>
        </div>
      </div>

      {/* Main Drag & Drop Zone */}
      <div className="flex-1 min-h-[180px] sm:min-h-[300px]">
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
          className="bg-gray-50/60 hover:bg-emerald-50/20 border-2 border-dashed border-gray-300 hover:border-[#003220] transition-all h-full flex flex-col justify-center items-center rounded-none"
        >
          <div className="flex flex-col items-center justify-center py-6 px-4">
            <div className="w-16 h-16 bg-white text-[#003220] flex items-center justify-center mb-3 border border-gray-200 shadow-2xs">
              <CloudUploadOutlined style={{ fontSize: 34 }} />
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">
              Drag & drop your order file here, or <span className="text-[#003220] underline cursor-pointer">Browse</span>
            </p>
            <p className="text-xs text-gray-500 max-w-md text-center mb-4">
              All column headers will be detected and automatically matched in the next mapping step.
            </p>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">CSV</span>
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">XLSX</span>
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">XLS</span>
              <span className="text-gray-400 text-xs">• Max 10MB</span>
            </div>
          </div>
        </Dragger>
      </div>
    </div>
  );
};

export default FileUploadStep;
