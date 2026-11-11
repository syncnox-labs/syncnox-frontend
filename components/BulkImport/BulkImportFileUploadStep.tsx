"use client";

import { useState } from "react";
import { Upload, message, Button } from "antd";
import { CloudUploadOutlined, DownloadOutlined, FileExcelOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { downloadVehicleTemplate } from "@/apis/vehicle.api";
import { downloadTeamTemplate } from "@/apis/team.api";

interface BulkImportFileUploadStepProps {
  entityType: "vehicle" | "driver" | "location";
  onFileParsed: (data: { rawHeaders: string[]; rawRows: Record<string, any>[] }) => void;
}

export default function BulkImportFileUploadStep({
  entityType,
  onFileParsed,
}: BulkImportFileUploadStepProps) {
  const [fileList, setFileList] = useState<any[]>([]);
  const [isParsing, setIsParsing] = useState(false);

  const entityTitle =
    entityType === "vehicle"
      ? "Vehicles"
      : entityType === "driver"
      ? "Drivers"
      : "Locations & Stations";

  const handleDownloadTemplate = async () => {
    try {
      if (entityType === "vehicle") {
        await downloadVehicleTemplate();
      } else if (entityType === "driver") {
        await downloadTeamTemplate();
      } else {
        const csvContent =
          "Location Name,Station Code,Address,Latitude,Longitude,Category,Service Zone,Operating Hours\n" +
          'Metro Center Station,MTR-01,"100 S Wacker Dr, Chicago, IL 60606",41.88168,-87.63747,Metro Station,Central,05:00 - 23:30\n' +
          'North Transit Hub,HUB-N,"1000 W Fulton St, Chicago, IL 60607",41.88682,-87.66220,Transit Hub,North,06:00 - 22:00\n' +
          'Downtown Logistics Depot,DEP-01,"1 N Franklin St, Chicago, IL 60606",41.88221,-87.63500,Depot,Downtown,24 Hours\n' +
          'O\'Hare Terminal Waypoint,WAY-03,"Terminal 1, Chicago, IL 60666",41.97563,-87.88236,Waypoint,Airport,06:00 - 24:00\n';

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "sample-location-mapping.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      message.success("Sample template downloaded");
    } catch (err) {
      message.error("Failed to download template");
    }
  };

  const processFile = (file: File) => {
    setIsParsing(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Parse JSON rows with raw values
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawJson.length === 0) {
          message.error("The uploaded file is empty");
          setIsParsing(false);
          return;
        }

        // Extract raw headers from first row keys
        const headers: string[] = Object.keys(rawJson[0]);

        onFileParsed({
          rawHeaders: headers,
          rawRows: rawJson,
        });
      } catch (err: any) {
        message.error("Failed to parse file: " + (err.message || "Invalid file format"));
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 py-1">
      {/* Top Banner Card */}
      <div className="bg-white border border-gray-200 p-3.5 responsive-toolbar flex items-center justify-between gap-4 rounded-none shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-50 text-[#003220] flex items-center justify-center shrink-0 border border-emerald-100">
            <FileExcelOutlined style={{ fontSize: 18 }} />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-900">Sample Template for {entityTitle}</div>
            <div className="text-[11px] text-gray-500">Download standard format template before uploading</div>
          </div>
        </div>

        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={handleDownloadTemplate}
          className="rounded-none bg-gray-50 text-xs font-medium border-gray-300 hover:border-[#003220] hover:text-[#003220] shrink-0"
        >
          Download CSV Template
        </Button>
      </div>

      {/* Main Drag & Drop Zone */}
      <div className="flex-1 min-h-[180px] sm:min-h-[220px]">
        <Upload.Dragger
          name="file"
          multiple={false}
          fileList={fileList}
          beforeUpload={(file) => {
            setFileList([file]);
            processFile(file);
            return false;
          }}
          onRemove={() => setFileList([])}
          accept=".csv,.xlsx,.xls"
          className="bg-gray-50/60 hover:bg-emerald-50/20 border-2 border-dashed border-gray-300 hover:border-[#003220] transition-all h-full flex flex-col justify-center items-center rounded-none"
          disabled={isParsing}
        >
          <div className="flex flex-col items-center justify-center py-6 px-4">
            <div className="w-16 h-16 bg-white text-[#003220] flex items-center justify-center mb-3 border border-gray-200 shadow-2xs">
              <CloudUploadOutlined style={{ fontSize: 34 }} />
            </div>
            <p className="text-sm font-bold text-gray-900 mb-1">
              Drag & drop your {entityTitle.toLowerCase()} file here, or <span className="text-[#003220] underline cursor-pointer">Browse</span>
            </p>
            <p className="text-xs text-gray-500 max-w-md text-center mb-4">
              All records will be validated and mapped in the next step.
            </p>

            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">CSV</span>
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">XLSX</span>
              <span className="px-2 py-0.5 bg-gray-200/70 text-gray-700 text-[11px] font-semibold tracking-wider">XLS</span>
              <span className="text-gray-400 text-xs">• Max 10MB</span>
            </div>
          </div>
        </Upload.Dragger>
      </div>
    </div>
  );
}
