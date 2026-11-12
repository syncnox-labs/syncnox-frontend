"use client";

import { useState, useEffect } from "react";
import { Table, Select, Button, Checkbox, Alert, message } from "antd";
import { useBulkUploadStore } from "@/store/bulkUpload.store";
import { geocodeBulkData } from "@/apis/bulk-upload.api";

interface ColumnMappingStepProps {
  onNext: () => void;
}

const ColumnMappingStep = ({ onNext }: ColumnMappingStepProps) => {
  const {
    uploadResponse,
    uploadedFile,
    columnMapping,
    setColumnMapping,
    saveAsDefault,
    setSaveAsDefault,
    setGeocodedData,
    setIsGeocoding,
    defaultScheduledDate,
    setCurrentStep,
  } = useBulkUploadStore();

  const [localMapping, setLocalMapping] = useState<Record<string, string>>({});
  const [hasLocationColumn, setHasLocationColumn] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (uploadResponse) {
      // If store already has user mapping (e.g., coming back from step 3), preserve it!
      if (columnMapping && Object.keys(columnMapping).length > 0) {
        setLocalMapping(columnMapping);
        checkLocationMapping(columnMapping);
      } else {
        // Initialize local mapping with detected mappings from backend
        const initial: Record<string, string> = {};
        uploadResponse.columns.forEach((col) => {
          if (col.mapping) {
            // Use the mapping value directly from backend response
            initial[col.identifier] = col.mapping;
          }
        });
        setLocalMapping(initial);
        setColumnMapping(initial);
        checkLocationMapping(initial);
      }
    }
  }, [uploadResponse]);

  const checkLocationMapping = (mapping: Record<string, string>) => {
    const locationKeys = [
      "address_formatted",
      "client_address",
      "pick_up_address",
      "drop_off_address",
      "candidate_address",
      "go_pickup_point",
      "return_dropoff_point",
      "location",
    ];
    const hasAddress = locationKeys.some(
      (key) => key in mapping && mapping[key] && mapping[key] !== "not_mapped"
    );
    setHasLocationColumn(hasAddress);
  };

  const handleMappingChange = (
    excelColumn: string,
    selectedJobField: string | undefined,
  ) => {
    const updated = { ...localMapping };

    // Find if this excel column was previously mapped to any other job field and remove it
    const previousJobField = Object.keys(updated).find(
      (jf) => updated[jf] === excelColumn,
    );
    if (previousJobField && previousJobField !== selectedJobField) {
      delete updated[previousJobField];
    }

    if (selectedJobField) {
      updated[selectedJobField] = excelColumn;
    } else if (previousJobField) {
      delete updated[previousJobField];
    }

    setLocalMapping(updated);
    checkLocationMapping(updated);
  };

  const handleContinue = async () => {
    if (!hasLocationColumn) {
      message.error("There has to be at least one column defining location");
      return;
    }

    if (!uploadedFile || !uploadResponse) {
      message.error("No file uploaded");
      return;
    }

    setIsProcessing(true);
    setIsGeocoding(true);

    try {
      // Create reverse mapping for API
      const apiMapping: Record<string, string> = {};
      Object.entries(localMapping).forEach(([identifier, columnName]) => {
        apiMapping[identifier] = columnName;
      });

      const response = await geocodeBulkData(
        uploadedFile,
        apiMapping,
        defaultScheduledDate,
      );

      setColumnMapping(apiMapping);
      setGeocodedData(response.data);
      setIsGeocoding(false);
      onNext();
    } catch (error: any) {
      message.error(error.response?.data?.detail || "Failed to geocode data");
      setIsGeocoding(false);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!uploadResponse) {
    return null;
  }

  const excelColumns = uploadResponse.sample_data[0]
    ? Object.keys(uploadResponse.sample_data[0])
    : [];

  const jobFieldOptions = uploadResponse.columns.map((col) => ({
    value: col.identifier,
    label: col.description,
  }));

  const getJobFieldForExcelColumn = (excelColumn: string) => {
    return (
      Object.keys(localMapping).find(
        (jobField) => localMapping[jobField] === excelColumn,
      ) || undefined
    );
  };

  const dynamicColumns = excelColumns.map((excelCol) => ({
    title: (
      <div className="flex flex-col gap-2 min-w-[200px] mb-2">
        <Select
          showSearch
          optionFilterProp="label"
          filterOption={(input, option) =>
            (option?.label ?? "").toString().toLowerCase().includes(input.toLowerCase())
          }
          value={getJobFieldForExcelColumn(excelCol)}
          onChange={(val) => handleMappingChange(excelCol, val)}
          options={jobFieldOptions}
          style={{ width: "100%" }}
          placeholder="Not Mapped"
          allowClear
          className="font-normal [&_.ant-select-selector]:!rounded-none"
        />
        <div className="font-semibold text-gray-700">{excelCol}</div>
      </div>
    ),
    dataIndex: excelCol,
    key: excelCol,
    width: 250,
    ellipsis: true,
    render: (value: any) => (
      <div className="truncate" title={value?.toString()}>
        {value === null || value === undefined ? "" : value.toString()}
      </div>
    ),
  }));

  const tableColumns = [
    {
      title: "",
      key: "index",
      render: (_: any, __: any, index: number) => (
        <span className="font-semibold text-gray-500">{index + 1}</span>
      ),
      width: 60,
      fixed: "left" as const,
    },
    ...dynamicColumns,
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="mb-2 text-gray-600 font-medium shrink-0">
        Review Mapped Columns
      </div>
      {/* Location Error Alert */}
      {!hasLocationColumn && (
        <Alert
          description="There has to be at least one column defining location (address)"
          type="warning"
          showIcon
          className="mb-4 rounded-none"
        />
      )}

      {/* Scrollable Table Container */}
      <div className="flex-1 min-h-0 relative mb-3 border border-gray-200 overflow-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-track]:rounded [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb:hover]:bg-gray-400 [scrollbar-width:thin] [scrollbar-color:#c1c1c1_#f1f1f1] [&_.ant-table-thead>tr>th]:sticky [&_.ant-table-thead>tr>th]:top-0 [&_.ant-table-thead>tr>th]:z-10 [&_.ant-table-thead>tr>th]:!bg-gray-50 [&_.ant-table-container]:!overflow-visible [&_.ant-table-content]:!overflow-visible [&_.ant-table-cell-fix-left]:!sticky [&_.ant-table-cell-fix-left]:!z-11 [&_.ant-table-thead>tr>.ant-table-cell-fix-left]:!z-20 [&_.ant-table-thead>tr>.ant-table-cell-fix-left]:!top-0">
        <Table
          columns={tableColumns}
          dataSource={uploadResponse.sample_data.map((row, idx) => ({
            ...row,
            key: idx,
          }))}
          pagination={false}
          size="small"
          scroll={{ x: "max-content" }}
        />
      </div>

      {/* Sticky Footer */}
      <div className="import-step-footer flex justify-between items-center pt-4 border-t bg-white shrink-0">
        <Checkbox
          style={{display: "none"}}
          checked={saveAsDefault}
          onChange={(e) => setSaveAsDefault(e.target.checked)}
        >
          Save this mapping as my default mapping
        </Checkbox>

        <div className="ml-auto flex gap-2">
          <Button onClick={() => setCurrentStep(1)} className="rounded-none">
            Back
          </Button>
          <Button
            type="primary"
            onClick={handleContinue}
            disabled={!hasLocationColumn}
            loading={isProcessing}
            className="rounded-none"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ColumnMappingStep;
