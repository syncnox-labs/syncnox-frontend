"use client";
import BaseTable from "@/components/Table/BaseTable";
import { AllRoutes } from "@/types/routes.type";
import { useRouteStore } from "@/store/routes.store";
import { Typography, Progress, Button, Select, Flex, Popover, Checkbox, Modal, message } from "antd";
import { ColDef } from "ag-grid-community";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/Jobs/StatusBanner";
import { useState } from "react";
import { createActionsColumn } from "@/components/Table/ActionsColumn";
import Link from "next/link";
import { useIndexStore } from "@/store/index.store";
import { FilterFilled, DeleteOutlined, ExclamationCircleFilled } from "@ant-design/icons";

const { Title } = Typography;

export const statusStyleMap: Record<string, string> = {
  processing: "bg-gray-100 text-gray-700 border border-gray-200",
  scheduled: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  in_transit: "bg-blue-100 text-blue-800 border border-blue-200",
  completed: "bg-green-100 text-green-700 border border-green-200",
  failed: "bg-red-100 text-red-800 border border-red-200",
  default: "bg-gray-100 text-gray-700 border border-gray-200",
};

const STATUS_FILTER_OPTIONS = [
  { value: "scheduled", label: "Scheduled", dot: "bg-amber-400" },
  { value: "in_transit", label: "In Transit", dot: "bg-blue-500" },
  { value: "completed", label: "Completed", dot: "bg-emerald-500" },
  { value: "all", label: "All", dot: "" },
] as const;

const StatusHeader = (props: any) => {
  const { selectedStatus, setSelectedStatus } = props;
  const [open, setOpen] = useState(false);

  const activeOption =
    STATUS_FILTER_OPTIONS.find((opt) => opt.value === selectedStatus) ||
    STATUS_FILTER_OPTIONS[3];

  const filterContent = (
    <div className="p-1 min-w-[150px] space-y-1 font-sans">
      <div className="px-2 py-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 mb-1">
        Filter by Status
      </div>
      {STATUS_FILTER_OPTIONS.map(({ value, label, dot }) => {
        const isChecked = selectedStatus === value;
        return (
          <div
            key={value}
            onClick={() => {
              setSelectedStatus(value);
              setOpen(false);
            }}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors text-xs ${
              isChecked
                ? "bg-emerald-50 text-emerald-900 font-semibold"
                : "hover:bg-gray-50 text-gray-700 font-medium"
            }`}
          >
            <Checkbox checked={isChecked} />
            {dot && <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );

  return (
    <Popover
      content={filterContent}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
      arrow={false}
      styles={{ container: { padding: 4, borderRadius: 8 } }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center justify-between w-full cursor-pointer group py-1"
      >
        <span className="font-bold text-sm text-[#003220]">Status</span>
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all text-xs ${
            selectedStatus !== "all"
              ? "bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold"
              : "bg-gray-50 border-gray-200 text-gray-600 group-hover:border-gray-300"
          }`}
        >
          {activeOption.dot && (
            <span className={`w-1.5 h-1.5 rounded-full ${activeOption.dot} shrink-0`} />
          )}
          <span className="text-[11px] truncate max-w-[70px]">
            {activeOption.label}
          </span>
          <span className="text-[9px] text-gray-400 group-hover:text-gray-600 transition-transform">
            {open ? "▲" : "▼"}
          </span>
        </div>
      </div>
    </Popover>
  );
};

const DistanceHeader = (props: any) => {
  const { displayName, unit, setUnit, progressSort } = props;

  const onSortRequested = (event: any) => {
    progressSort(event.shiftKey);
  };

  return (
    <div
      className="flex items-center gap-2 w-full cursor-pointer"
      onClick={onSortRequested}
    >
      <span className="grow flex items-center gap-1">{displayName}</span>
      <div onClick={(e) => e.stopPropagation()}>
        <Select
          value={unit}
          onChange={(val) => setUnit(val as "km" | "mi")}
          size="small"
          options={[
            { label: "km", value: "km" },
            { label: "mi", value: "mi" },
          ]}
          style={{ width: 60 }}
        />
      </div>
    </div>
  );
};

export default function RoutesView() {
  const router = useRouter();
  const { setCurrentTab } = useIndexStore();
  const { routes, isLoading, deleteRoute, deleteRoutesBulk, selectedStatus, setSelectedStatus } =
    useRouteStore();
  const [distanceUnit, setDistanceUnit] = useState<"km" | "mi">("km");
  const [selectedRouteIds, setSelectedRouteIds] = useState<number[]>([]);

  const handleDeleteRoutesRequest = () => {
    if (selectedRouteIds.length === 0) return;
    const count = selectedRouteIds.length;
    Modal.confirm({
      title: "Delete Routes",
      icon: <ExclamationCircleFilled />,
      content: `Are you sure you want to delete ${count} selected route(s)? All data associated with these routes will be permanently deleted.`,
      okText: "Delete",
      okType: "danger",
      okButtonProps: { danger: true, style: { borderRadius: 0 } },
      cancelText: "Cancel",
      cancelButtonProps: { style: { borderRadius: 0 } },
      onOk: async () => {
        try {
          await deleteRoutesBulk(selectedRouteIds);
          message.success(`Successfully deleted ${count} route(s)`);
          setSelectedRouteIds([]);
        } catch (err) {
          message.error("Failed to delete routes");
          console.error(err);
        }
      },
    });
  };

  const columns: ColDef<AllRoutes>[] = [
    {
      headerName: "Name",
      field: "name",
      cellRenderer: (params: any) => {
        return (
          <button
            type="button"
            onClick={() => {
              router.push(`/route/${params.data.optimization_id}`);
            }}
            className="text-blue-600 hover:underline font-semibold cursor-pointer border-none bg-transparent p-0 text-left"
          >
            {params.value || "-"}
          </button>
        );
      },
    },
    {
      headerName: "Scheduled Date",
      field: "scheduled_date",
      width: 150,
    },
    {
      headerName: "Status",
      headerComponent: StatusHeader,
      headerComponentParams: {
        selectedStatus,
        setSelectedStatus,
      },
      field: "status",
      cellRenderer: (params: any) => (
        <StatusBadge value={params.value} styleMap={statusStyleMap} />
      ),
      width: 180,
      minWidth: 160,
    },
    {
      headerName: "Team Members",
      field: "assigned_team_members",
      valueFormatter: (params) =>
        params.value?.map((m: any) => m.name).join(", ") || "-",
    },
    {
      headerName: "Distance",
      headerComponent: DistanceHeader,
      headerComponentParams: {
        unit: distanceUnit,
        setUnit: setDistanceUnit,
      },
      field: "total_distance",
      valueFormatter: (params) => {
        if (!params.value) return "-";
        const val = params.value / 1000;
        if (distanceUnit === "km") {
          return val.toFixed(2);
        } else {
          return (val * 0.621371).toFixed(2);
        }
      },
      width: 180,
    },
    {
      headerName: "Time",
      field: "total_time",
      valueFormatter: (params) => {
        if (!params.value) return "-";
        const totalSeconds = Number(params.value);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = Math.floor(totalSeconds % 60);
        return `${h} h ${m} m ${s} s`;
      },
      width: 120,
    },
    {
      headerName: "Progress",
      cellRenderer: (params: any) => (
        <Progress percent={params.data?.progress_percentage} />
      ),
    },
    {
      headerName: "Total Stops",
      field: "total_stops",
      width: 150,
    },
    {
      headerName: "Completed Stops",
      field: "completed_stops",
      width: 150,
    },
    {
      headerName: "Attempted Stops",
      field: "attempted_stops",
      width: 150,
    },
    {
      headerName: "Failed Stops",
      field: "failed_stops",
      width: 150,
    },
    {
      headerName: "Rating",
      field: "rating",
      width: 150,
    },
    createActionsColumn<AllRoutes>({
      actions: [
        {
          key: "view",
          label: "View",
          onClick: (route: AllRoutes) => {
            router.push(`/route/${route.id}`);
          },
        },
        {
          key: "delete",
          label: "Delete",
          type: "delete",
          onClick: (route: AllRoutes) => {
            Modal.confirm({
              title: "Delete Route",
              icon: <ExclamationCircleFilled />,
              content: `Are you sure you want to delete route "${route.name || route.id}"? All associated data will be permanently deleted.`,
              okText: "Delete",
              okType: "danger",
              okButtonProps: { danger: true, style: { borderRadius: 0 } },
              cancelText: "Cancel",
              cancelButtonProps: { style: { borderRadius: 0 } },
              onOk: async () => {
                try {
                  await deleteRoute(route.id);
                  message.success("Route deleted successfully");
                } catch (err) {
                  message.error("Failed to delete route");
                  console.error(err);
                }
              },
            });
          },
        },
      ],
      entityName: "Route",
    }),
  ];

  return (
    <div className="flex flex-col h-full">
      <Flex justify="space-between" gap={36} align="center" className="my-4">
        <Title level={4} className="m-0 pt-2">
          Routes
        </Title>
        <Flex gap={8} align="center">
          <Link href="/plan" onClick={() => setCurrentTab("jobs")}>
            <Button>Create New Route</Button>
          </Link>
          <Button
            danger
            icon={<DeleteOutlined />}
            disabled={selectedRouteIds.length === 0}
            onClick={handleDeleteRoutesRequest}
          />
        </Flex>
      </Flex>
      <div className="flex-1 min-h-0 mt-2">
        <BaseTable<AllRoutes>
          columnDefs={columns}
          rowData={routes}
          rowSelection="multiple"
          loading={isLoading}
          emptyMessage="No routes to show"
          pagination={true}
          containerStyle={{ height: "100%" }}
          onSelectionChanged={(event) => {
            if (event.api) {
              const selectedRows = event.api.getSelectedRows().map((r: AllRoutes) => r.id);
              setSelectedRouteIds(selectedRows);
            }
          }}
        />
      </div>
    </div>
  );
}
