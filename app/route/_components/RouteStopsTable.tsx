import React from "react";
import { Table, Tag, Typography } from "antd";
import { StopDetail } from "@/utils/exportPreview.utils";

const { Text } = Typography;

interface RouteStopsTableProps {
  stops: StopDetail[];
}

const RouteStopsTable: React.FC<RouteStopsTableProps> = ({ stops }) => {
  const columns = [
    {
      title: "No.",
      dataIndex: "serialNo",
      key: "serialNo",
      width: 60,
      align: "center" as const,
      render: (serialNo: number, record: StopDetail) => {
        if (record.isDepot) {
          return <Tag color="blue">Depot</Tag>;
        }
        return serialNo;
      },
    },
    {
      title: "Address",
      dataIndex: "address",
      key: "address",
      width: 250,
      render: (address: string) => (
        <div style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
          {address}
        </div>
      ),
    },
    {
      title: "Latitude",
      dataIndex: "latitude",
      key: "latitude",
      width: 100,
      render: (lat: number) => lat?.toFixed(6) || "-",
    },
    {
      title: "Longitude",
      dataIndex: "longitude",
      key: "longitude",
      width: 100,
      render: (lng: number) => lng?.toFixed(6) || "-",
    },
    {
      title: "ETA",
      dataIndex: "eta",
      key: "eta",
      width: 100,
    },
    {
      title: "Next Stop Name",
      dataIndex: "nextStopName",
      key: "nextStopName",
      width: 200,
      render: (nextStop: string) => (
        <div style={{ wordBreak: "break-word", whiteSpace: "normal" }}>
          {nextStop}
        </div>
      ),
    },
    {
      title: "Next Stop Distance",
      dataIndex: "nextStopDistance",
      key: "nextStopDistance",
      width: 120,
      align: "right" as const,
    },
    {
      title: "Next Stop Time",
      dataIndex: "nextStopTime",
      key: "nextStopTime",
      width: 100,
      align: "right" as const,
    },
  ];

  return (
    <div className="mb-6">
      <Table
        columns={columns}
        dataSource={stops}
        scroll={{ x: 1100 }}
        pagination={false}
        size="small"
        bordered
        rowKey="serialNo"
        className="route-stops-table"
      />
    </div>
  );
};

export default RouteStopsTable;
