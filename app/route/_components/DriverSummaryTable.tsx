import React from "react";
import { Table, Typography, Tag } from "antd";
import { DriverSummary } from "@/utils/exportPreview.utils";

const { Text } = Typography;

interface DriverSummaryTableProps {
  driverSummary: DriverSummary;
}

const DriverSummaryTable: React.FC<DriverSummaryTableProps> = ({
  driverSummary,
}) => {
  const vehicleDisplay = driverSummary.vehicleName ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Text strong className="text-gray-900">{driverSummary.vehicleName}</Text>
      {driverSummary.vehicleType && (
        <Tag color="blue" className="m-0 font-medium">
          {driverSummary.vehicleType}
        </Tag>
      )}
      {driverSummary.licensePlate && (
        <Tag color="volcano" className="m-0 font-bold tracking-wide border-amber-500">
          Plate: {driverSummary.licensePlate}
        </Tag>
      )}
      {driverSummary.seatCapacity && (
        <Tag color="green" className="m-0 font-medium">
          {driverSummary.seatCapacity}
        </Tag>
      )}
    </div>
  ) : (
    "Not Assigned"
  );

  const data = [
    {
      key: "1",
      label: "Driver Name",
      value: driverSummary.driverName,
    },
    {
      key: "2",
      label: "Assigned Vehicle",
      value: vehicleDisplay,
    },
    {
      key: "3",
      label: "Route Date",
      value: driverSummary.routeDate,
    },
    {
      key: "4",
      label: "Distance",
      value: driverSummary.distance,
    },
    {
      key: "5",
      label: "Total Stops",
      value: driverSummary.totalStops.toString(),
    },
    {
      key: "6",
      label: "Expected Travel Time",
      value: driverSummary.expectedTravelTime,
    },
  ];

  const columns = [
    {
      title: "Property",
      dataIndex: "label",
      key: "label",
      width: "40%",
      render: (text: string) => <Text strong>{text}</Text>,
    },
    {
      title: "Value",
      dataIndex: "value",
      key: "value",
      width: "60%",
      render: (val: any) =>
        typeof val === "string" ? <Text>{val}</Text> : val,
    },
  ];

  return (
    <div className="mb-6">
      <Table
        columns={columns}
        dataSource={data}
        scroll={{ x: 900 }}
        pagination={false}
        size="small"
        bordered
        className="driver-summary-table"
      />
    </div>
  );
};

export default DriverSummaryTable;
