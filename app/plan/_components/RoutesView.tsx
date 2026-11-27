"use client";
import { tableTheme } from "@/components/ui/tableTheme";
import RoutesToolbar from "@/components/plan/RoutesToolbar";
import BaseTable from "@/components/Table/BaseTable";
import { AllRoutes } from "@/types/routes.type";
import { useRouteStore } from "@/store/routes.store";
import { Typography, Button, Select, Flex, Popover, Checkbox, Modal, message } from "antd";
import { ColDef } from "ag-grid-community";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/Jobs/StatusBanner";
import { useEffect, useState } from "react";
import { createActionsColumn } from "@/components/Table/ActionsColumn";
import Link from "next/link";
import { useIndexStore } from "@/store/index.store";
import { FilterFilled, DeleteOutlined, ExclamationCircleFilled, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { formatPlanDate } from "@/utils/app.utils";
import { planActionsClassName, planToolbarClassName } from "./planStyles";

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
  const [search, setSearch] = useState("");
  const { setCurrentTab } = useIndexStore();
  const { routes, isLoading, refreshRoutes, deleteRoute, deleteRoutesBulk, selectedStatus, setSelectedStatus } =
    useRouteStore();
  const [distanceUnit, setDistanceUnit] = useState<"km" | "mi">("km");
  const [selectedRouteIds, setSelectedRouteIds] = useState<number[]>([]);

  // The store persists across route detail navigation, so refresh the active
  // status when this list remounts instead of displaying a stale pre-optimization result.
  useEffect(() => {
    void refreshRoutes();
  }, [refreshRoutes]);

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
      headerName: "Date",
      headerTooltip: "Scheduled date",
      field: "scheduled_date",
      valueFormatter: (params: any) => formatPlanDate(params.value),
      width: 150,
    },
    {
      headerName: "Status",
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
      // Search still matches every name, including the ones behind "+N"
      getQuickFilterText: (params) => params.value?.map((m: any) => m.name).join(" ") || "",
      width: 170,
      cellRenderer: (params: any) => {
        const members: { id?: number; name: string }[] = params.value || [];
        if (members.length === 0) return <span className="text-[#626F86]">-</span>;
        const initials = (name: string) => name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
        const tile = "inline-flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-semibold leading-none";
        const shown = members.length > 4 ? members.slice(0, 3) : members;
        const hidden = members.length - shown.length;
        return (
          <Popover
            placement="bottomLeft"
            mouseEnterDelay={0.15}
            title={<span className="text-xs font-semibold text-[#44546F]">{members.length} team {members.length === 1 ? "member" : "members"}</span>}
            content={
              <div className="flex max-h-64 min-w-[180px] flex-col gap-1.5 overflow-auto">
                {members.map((m, i) => (
                  <div key={m.id ?? i} className="flex items-center gap-2 text-[13px] text-[#172B4D]">
                    <span className={`${tile} bg-[#F1F2F4] text-[#44546F]`} aria-hidden="true">{initials(m.name)}</span>
                    {m.name}
                  </div>
                ))}
              </div>
            }
          >
            <div className="flex h-full w-fit cursor-default items-center gap-[3px]" aria-label={members.map((m) => m.name).join(", ")}>
              {shown.map((m, i) => (
                <span key={m.id ?? i} className={`${tile} bg-[#F1F2F4] text-[#44546F]`}>{initials(m.name)}</span>
              ))}
              {hidden > 0 && <span className={`${tile} w-auto min-w-6 border border-[#DCDFE4] bg-white px-1 text-[#44546F]`}>+{hidden}</span>}
            </div>
          </Popover>
        );
      },
    },
    {
      headerName: "Created At",
      field: "created_at",
      valueFormatter: (params) => {
        if (!params.value) return "-";
        const d = dayjs(params.value);
        return d.isValid() ? d.format("MMM D, YYYY · h:mm A") : String(params.value);
      },
      comparator: (valueA, valueB) => {
        if (!valueA && !valueB) return 0;
        if (!valueA) return -1;
        if (!valueB) return 1;
        return new Date(valueA).getTime() - new Date(valueB).getTime();
      },
      width: 180,
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
        return h > 0 ? `${h} h ${m} min` : `${m} min`;
      },
      width: 120,
    },
    {
      headerName: "Progress",
      minWidth: 180,
      cellRenderer: (params: any) => {
        // Square, thin bar; the figure sits in a fixed-width slot so every bar is the same length and the numbers line up
        const percent = Math.max(0, Math.min(100, Math.round(Number(params.data?.progress_percentage) || 0)));
        const done = percent >= 100;
        return (
          <div className="flex h-full w-full items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${percent}% of stops completed`}>
            <div className="h-1.5 min-w-0 flex-1 bg-[#DCDFE4]">
              <div className="h-full" style={{ width: `${percent}%`, background: done ? "#1F845A" : "#0C66E4" }} />
            </div>
            <span className="w-10 shrink-0 text-right text-[13px] tabular-nums" style={{ color: done ? "#1F845A" : percent === 0 ? "#626F86" : "#172B4D", fontWeight: done ? 600 : 400 }}>
              {percent}%
            </span>
          </div>
        );
      },
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
    <div className="flex flex-col h-full min-h-[360px] min-w-0">
      <RoutesToolbar
        count={isLoading ? undefined : routes.length}
        search={search}
        onSearch={setSearch}
        status={selectedStatus}
        onStatusChange={value => setSelectedStatus(value as typeof selectedStatus)}
        selectedCount={selectedRouteIds.length}
        onDelete={handleDeleteRoutesRequest}
        onCreateRoute={() => setCurrentTab("jobs")}
      />
      <div className="flex-1 min-h-0">
        <BaseTable<AllRoutes>
          columnDefs={columns}
          themeParams={tableTheme}
          rowData={routes}
          rowSelection="multiple"
          quickFilterText={search}
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
