"use client";

import { useState } from "react";
import { Upload, message, Button } from "antd";
import type { UploadFile, UploadProps } from "antd";
import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  InfoCircleOutlined,
  ProfileOutlined,
} from "@ant-design/icons";

const { Dragger } = Upload;

interface TransportImportUploadStepProps {
  isUploading: boolean;
  onFileSelected: (file: File) => Promise<void>;
}

/** Generate a sample transport import CSV (headers match the auto-detection aliases). */
const downloadTemplate = () => {
  const headers = [
    "Quart ID",
    "Scheduled Date",
    "Start Hour",
    "End Hour",
    "Candidate ID",
    "Candidate Name",
    "Candidate Phone",
    "Candidate Address",
    "Client Name",
    "Client Address",
    "Dress Code",
    "Pickup Type",
    "Pickup Point",
    "Drop Off Point 2",
  ].join(",");
  const rows = [
    [
      "Q-1001",
      "2026-08-15",
      "6",
      "14",
      "C-2210",
      "Jean Dupont",
      "+2125550010",
      "123 Main St",
      "Acme Pharma",
      "555 Industrial Ave",
      "Corporate",
      "Aller/Retour",
      "Berri-UQAM",
      "Terminus Centre-Ville",
    ],
    [
      "Q-1002",
      "2026-08-15",
      "7",
      "15",
      "C-2211",
      "Marie Lopez",
      "+2125550011",
      "456 Oak Ave",
      "Northwind Logistics",
      "789 Harbour Rd",
      "Casual",
      "Aller Simple",
      "Place-d'Armes",
      "",
    ],
  ];
  const csv = [headers, ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "sample-transport-import.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function TransportImportUploadStep({
  isUploading,
  onFileSelected,
}: TransportImportUploadStepProps) {
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const customRequest: NonNullable<UploadProps["customRequest"]> = async ({ file, onSuccess, onError }) => {
    const uploadFile = file as File;
    try {
      await onFileSelected(uploadFile);
      onSuccess?.("ok");
    } catch (err) {
      onError?.(err as Error);
    }
  };

  const beforeUpload = (file: File) => {
    const isValidType =
      file.type === "text/csv" ||
      file.type === "application/vnd.ms-excel" ||
      file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
        {/* Supported Columns Section */}
        <div className="bg-white border border-gray-200 p-3.5 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2">
            <ProfileOutlined className="text-[#003220] text-sm" />
            <span className="text-xs font-bold text-gray-900 tracking-wider uppercase">
              Supported File Columns
            </span>
          </div>
          <span className="text-[11px] text-gray-600 leading-relaxed">
            Quart / Shift ID, Scheduled Date, Start &amp; End Hour, Candidate Name / Phone,
            Pickup &amp; Dropoff Points, Pickup Type, Dress Code and more.
          </span>
          <span className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-1">
            <InfoCircleOutlined className="text-[10px]" />
            Station names auto-resolve via your Location Mappings.
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
              <div className="text-[11px] text-gray-500">
                Download formatted CSV to structure your file
              </div>
            </div>
          </div>

          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={downloadTemplate}
            className="rounded-none bg-gray-50 text-xs font-medium border-gray-300 hover:border-[#003220] hover:text-[#003220] shrink-0"
          >
            Download CSV
          </Button>
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
          multiple={false}
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
              Drag &amp; drop your transport file here, or{" "}
              <span className="text-[#003220] underline cursor-pointer">Browse</span>
            </p>
            <p className="text-xs text-gray-500 max-w-md text-center mb-4">
              All column headers will be detected and automatically matched in the next mapping
              step.
            </p>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">
                CSV
              </span>
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">
                XLSX
              </span>
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">
                XLS
              </span>
              <span className="text-gray-400 text-xs">• Max 10MB</span>
            </div>
          </div>
        </Dragger>
      </div>
    </div>
  );
}