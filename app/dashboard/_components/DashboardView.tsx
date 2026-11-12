"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Spin, DatePicker, Typography, Flex } from "antd";
import { Dayjs } from "dayjs";
import {
  FileTextOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileAddOutlined,
  RocketOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  UserOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
} from "@ant-design/icons";
import { useIndexStore } from "@/store/index.store";
import { useDashboardStore, defaultDashboard } from "@/store/dashboard.store";
import { RecentRoute } from "@/types/dashboard.type";
import { fetchRoutes } from "@/apis/routes.api";
import { AllRoutes } from "@/types/routes.type";
import AddJobsModal from "@/app/plan/AddJobsModal";
import { useJobsStore } from "@/store/jobs.store";

const { Title, Text } = Typography;

const routeProgress = (route: RecentRoute) => route.stops > 0
  ? Math.min(100, Math.round((route.completed / route.stops) * 100)) : 0;

export default function DashboardView() {
  const router = useRouter();
  const { setCurrentTab } = useIndexStore();
  const { dashboardData, isLoading, error, fetchDashboard } =
    useDashboardStore();
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [selectedDateRoutes, setSelectedDateRoutes] = useState<AllRoutes[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false);
  const { fetchAllJobs } = useJobsStore();

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleDateChange = async (date: Dayjs | null) => {
    setSelectedDate(date);
    if (date) {
      setIsLoadingRoutes(true);
      try {
        const formattedDate = date.format("YYYY-MM-DD");
        const routes = await fetchRoutes(undefined, formattedDate);
        setSelectedDateRoutes(routes);
      } catch (error) {
        console.error("Failed to fetch routes for date:", error);
      } finally {
        setIsLoadingRoutes(false);
      }
    } else {
      setSelectedDateRoutes([]);
    }
  };

  const data = dashboardData ?? defaultDashboard;
  const { kpi, optimization_impact, recent_routes, top_drivers, upcoming } =
    data;

  const quickActions = [
    {
      icon: <FileAddOutlined />,
      label: "Add Job",
      onClick: () => setIsAddJobModalOpen(true),
    },
    {
      icon: <RocketOutlined />,
      label: "Plan Route",
      onClick: () => {
        router.push("/plan");
        setCurrentTab("jobs");
      },
    },
    {
      icon: <TeamOutlined />,
      label: "All Members",
      onClick: () => {
        router.push("/team");
        setCurrentTab("team");
      },
    },
    {
      icon: <EnvironmentOutlined />,
      label: "All Routes",
      onClick: () => {
        router.push("/plan");
        setCurrentTab("routes");
      },
    },
    {
      icon: <FileTextOutlined />,
      label: "All Jobs",
      onClick: () => {
        router.push("/plan");
        setCurrentTab("jobs");
      },
    },
    {
      icon: <CalendarOutlined />,
      label: "Schedule",
      onClick: () => {
        router.push("/plan");
        setCurrentTab("schedule");
      },
    },
  ];

  const getStatusStrokeColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#22c55e";
      case "in_transit":
        return "#3b82f6";
      default:
        return "#d1d5db";
    }
  };

  const kpiCards = [
    {
      label: "Active Routes",
      value: kpi.active_routes,
      icon: <CarOutlined />,
      bg: "#f0fdf4",
      color: "#16a34a",
      badge: "Live",
      badgeColor: "#dcfce7",
      badgeText: "#15803d",
    },
    {
      label: "Total Jobs",
      value: kpi.total_jobs.toLocaleString(),
      icon: <FileTextOutlined />,
      bg: "#eff6ff",
      color: "#2563eb",
      badge: "All time",
      badgeColor: "#dbeafe",
      badgeText: "#1d4ed8",
    },
    {
      label: "Completed",
      value: kpi.completed_jobs,
      icon: <CheckCircleOutlined />,
      bg: "#f0fdf4",
      color: "#16a34a",
      badge: `${kpi.total_jobs > 0 ? ((kpi.completed_jobs / kpi.total_jobs) * 100).toFixed(1) : 0}%`,
      badgeColor: "#dcfce7",
      badgeText: "#15803d",
    },
    {
      label: "Scheduled",
      value: kpi.scheduled_jobs,
      icon: <ClockCircleOutlined />,
      bg: "#fef3c7",
      color: "#b45309",
      badge: "Pending",
      badgeColor: "#fef3c7",
      badgeText: "#b45309",
    },
    {
      label: "Drivers",
      value: kpi.total_drivers,
      icon: <TeamOutlined />,
      bg: "#f3f4f6",
      color: "#374151",
      badge: "Active",
      badgeColor: "#f3f4f6",
      badgeText: "#374151",
    },
    {
      label: "Depots",
      value: kpi.total_depots,
      icon: <EnvironmentOutlined />,
      bg: "#f3f4f6",
      color: "#374151",
      badge: "Locations",
      badgeColor: "#f3f4f6",
      badgeText: "#374151",
    },
  ];

  const statusStyleMap: Record<string, { bg: string; color: string }> = {
    completed: { bg: "#dcfce7", color: "#15803d" },
    in_transit: { bg: "#dbeafe", color: "#1d4ed8" },
    scheduled: { bg: "#f3f4f6", color: "#374151" },
  };

  return (
    <div className="relative flex min-h-full min-w-0 flex-col gap-4 pb-2">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60">
          <Spin size="large" />
        </div>
      )}

      {/* Title row */}
      <Flex justify="space-between" align="center" wrap gap="small">
        <Title className="!m-0 !text-lg !font-bold sm:!text-xl" level={4}>
          Dashboard
        </Title>
        {error && <Text role="alert" className="min-w-0 break-words" type="danger">{error}</Text>}
      </Flex>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        {kpiCards.map((k) => (
          <div
            key={k.label}
            className="flex min-w-0 flex-col items-center border-[1.5px] border-gray-100 bg-white p-3 text-center sm:p-4"
          >
            <div
              className="w-7 h-7 flex items-center justify-center mb-1.5 text-sm"
              style={{ background: k.bg, color: k.color, borderRadius: 7 }}
            >
              {k.icon}
            </div>
            <span className="text-[11px] text-gray-500 font-bold">
              {k.label}
            </span>
            <span className="mt-0.5 max-w-full break-all text-xl font-semibold leading-tight text-gray-900 tabular-nums sm:text-2xl">
              {k.value}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 mt-1"
              style={{
                background: k.badgeColor,
                color: k.badgeText,
                borderRadius: 4,
              }}
            >
              {k.badge}
            </span>
          </div>
        ))}
      </div>

      {/* Middle Row */}
      <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        {/* Quick Actions */}
        <div className="min-w-0 border-[1.5px] border-gray-100 bg-white p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3">
            <ThunderboltOutlined /> Quick Actions
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                type="button"
                className="flex min-h-20 min-w-0 cursor-pointer flex-col items-center justify-center gap-2 border-[1.5px] border-gray-200 bg-white px-2 py-3 font-[inherit] transition-all duration-150 hover:-translate-y-px hover:border-green-300 hover:bg-green-50 focus-visible:outline-2 focus-visible:outline-primary sm:p-3"
              >
                <span className="text-gray-800 text-lg">{action.icon}</span>
                <span className="text-center text-xs font-bold text-gray-600">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Optimization Impact */}
        <div className="flex min-w-0 flex-col border-[1.5px] border-gray-100 bg-white p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
            <DashboardOutlined /> Optimization Impact
          </div>
          <div className="grid flex-1 grid-cols-3 gap-2 sm:gap-3">
            {[
              {
                icon: (
                  <DashboardOutlined
                    style={{ fontSize: 20, color: "#4ade80" }}
                  />
                ),
                value:
                  optimization_impact.total_distance_saved_km.toLocaleString(),
                unit: "KM SAVED",
                sub: "Distance reduction",
              },
              {
                icon: (
                  <FieldTimeOutlined
                    style={{ fontSize: 20, color: "#4ade80" }}
                  />
                ),
                value: optimization_impact.total_time_saved_hours,
                unit: "HRS SAVED",
                sub: "Time reduction",
              },
              {
                icon: (
                  <CarOutlined style={{ fontSize: 20, color: "#4ade80" }} />
                ),
                value: optimization_impact.vehicles_saved,
                unit: "VEHICLES SAVED",
                sub: "Fleet efficiency",
              },
            ].map((item) => (
              <div
                key={item.unit}
                className="flex min-w-0 flex-col items-center justify-center border-[1.5px] border-gray-100 bg-white px-2 py-4 text-center sm:p-3"
              >
                <div className="mb-1">{item.icon}</div>
                <div className="max-w-full break-all text-lg font-semibold text-gray-900 tabular-nums sm:text-xl">
                  {item.value}
                </div>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                  {item.unit}
                </div>
                <div className="text-[10px] text-gray-400">{item.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div className="flex min-w-0 flex-col border-[1.5px] border-gray-100 bg-white p-4 md:col-span-2 xl:col-span-1">
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
            <span className="flex items-center gap-1.5">
              <CalendarOutlined /> Upcoming
            </span>
              <DatePicker
                size="small"
                onChange={handleDateChange}
                value={selectedDate}
                placeholder="Select Date"
                aria-label="Filter upcoming routes by date"
                className="!w-[132px] shrink-0 font-normal [&_input]:!text-xs"
                allowClear
              />
          </div>
          <div className="custom-scrollbar max-h-64 overflow-y-auto">
            {selectedDate ? (
              isLoadingRoutes ? (
                <div className="flex justify-center py-4">
                  <Spin size="small" />
                </div>
              ) : selectedDateRoutes.length === 0 ? (
                <span className="text-xs text-gray-400">
                  No routes for {selectedDate.format("MMM D")}
                </span>
              ) : (
                selectedDateRoutes.map((route: AllRoutes) => (
                  <div
                    key={route.id}
                    className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <Link
                        className="inline-flex min-h-11 items-center break-words text-sm font-medium text-blue-700 sm:text-xs"
                        href={`/route/${route.optimization_id}`}
                      >
                        {route.name}
                      </Link>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {route.total_stops} stops
                      </div>
                    </div>
                    <span className="shrink-0 bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600">
                      {route.status.replace("_", " ")}
                    </span>
                  </div>
                ))
              )
            ) : upcoming.length === 0 ? (
              <span className="text-xs text-gray-400">
                No upcoming schedule
              </span>
            ) : (
              upcoming.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0"
                >
                  <div>
                    <div className="text-xs font-semibold text-gray-800">
                      {item.date}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {item.jobs} jobs · {item.routes} routes
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                    {item.jobs}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* Recent Routes */}
        <div className="flex min-w-0 flex-col border-[1.5px] border-gray-100 bg-white p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
            <CarOutlined /> Recent Routes
          </div>
          <div className="divide-y divide-gray-100 sm:hidden">
            {recent_routes.length === 0 ? <p className="py-4 text-xs text-gray-400">No routes yet</p>
              : recent_routes.map(route => {
                const pct = routeProgress(route);
                const statusStyle = statusStyleMap[route.status] ?? statusStyleMap.scheduled;
                return <article key={route.key} className="min-w-0 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/route/${route.key}`} className="flex min-h-11 items-center break-words text-sm font-medium text-blue-700">
                        {route.name}
                      </Link>
                      <p className="break-words text-xs text-gray-500">{route.driver}</p>
                    </div>
                    <span className="mt-2 shrink-0 px-1.5 py-1 text-[10px] font-semibold" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                      {route.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div role="progressbar" aria-label={`${route.name} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                      className="h-1.5 min-w-0 flex-1 overflow-hidden bg-gray-200">
                      <div className="h-full" style={{ background: getStatusStrokeColor(route.status), width: `${pct}%` }} />
                    </div>
                    <span className="shrink-0 text-xs text-gray-500">{route.completed}/{route.stops} stops</span>
                  </div>
                </article>;
              })}
          </div>
          <div className="custom-scrollbar hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[480px] border-collapse text-xs">
              <caption className="sr-only">Recent routes, drivers, progress and status</caption>
              <thead>
                <tr>
                  {["Route", "Driver", "Progress", "Status"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wide px-2 py-1.5 border-b border-gray-200 bg-gray-50 sticky top-0"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent_routes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-4 text-xs text-gray-400">
                      No routes yet
                    </td>
                  </tr>
                ) : (
                  recent_routes.map((route: RecentRoute) => {
                    const pct = routeProgress(route);
                    const statusStyle =
                      statusStyleMap[route.status] ?? statusStyleMap.scheduled;
                    return (
                      <tr
                        key={route.key}
                        className="transition-colors duration-100 hover:bg-gray-100"
                      >
                        <td className="px-2 py-2 border-b border-gray-100">
                          <Link
                            className="inline-flex min-h-11 items-center text-xs font-medium text-blue-700"
                            href={`/route/${route.key}`}
                          >
                            {route.name}
                          </Link>
                        </td>
                        <td className="px-2 py-2 border-b border-gray-100 text-gray-500 text-xs">
                          {route.driver}
                        </td>
                        <td className="px-2 py-2 border-b border-gray-100">
                          <div className="flex items-center gap-1.5">
                            <div className="bg-gray-200 h-1 w-14 overflow-hidden">
                              <div
                                className="h-full"
                                style={{
                                  background: getStatusStrokeColor(
                                    route.status,
                                  ),
                                  width: `${pct}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-gray-400">
                              {route.completed}/{route.stops}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 border-b border-gray-100">
                          <span
                            className="text-[10px] font-semibold px-1.5 py-0.5"
                            style={{
                              background: statusStyle.bg,
                              color: statusStyle.color,
                            }}
                          >
                            {route.status.replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Drivers */}
        <div className="flex min-w-0 flex-col border-[1.5px] border-gray-100 bg-white p-4">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-3 flex-shrink-0">
            <UserOutlined /> Top Drivers
          </div>
          <div className="custom-scrollbar max-h-80 overflow-y-auto">
            {top_drivers.length === 0 ? (
              <span className="text-xs text-gray-400">No driver data yet</span>
            ) : (
              top_drivers.map((driver, index) => {
                const avatarColors = [
                  { bg: "#1a1a2e", color: "#4ade80" },
                  { bg: "#374151", color: "#d1fae5" },
                  { bg: "#6b7280", color: "#f9fafb" },
                ];
                const av = avatarColors[index] ?? avatarColors[2];
                const initials = driver.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")
                  .toUpperCase()
                  .slice(0, 2);
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-2.5 py-2.5 ${index < top_drivers.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{ background: av.bg, color: av.color }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">
                        {driver.name}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {driver.completion_rate}% completion
                      </div>
                      <div className="bg-gray-200 h-0.5 w-full overflow-hidden mt-1.5">
                        <div
                          className="h-full bg-green-400"
                          style={{
                            width: `${Math.min(100, driver.completion_rate)}%`,
                          }}
                        />
                      </div>
                    </div>
                    {/* On-time ring */}
                    <div className="relative w-9 h-9 flex-shrink-0">
                      <svg
                        width="36"
                        height="36"
                        viewBox="0 0 36 36"
                        className="-rotate-90"
                      >
                        <circle
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          stroke="#e5e7eb"
                          strokeWidth="3"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="14"
                          fill="none"
                          stroke="#4ade80"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeDasharray={`${(driver.on_time_rate / 100) * 87.96} 87.96`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-[8px] font-semibold text-gray-600">
                        {driver.on_time_rate}%
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <AddJobsModal
        open={isAddJobModalOpen}
        setOpen={setIsAddJobModalOpen}
        onJobCreated={() => {
          fetchDashboard();
          fetchAllJobs();
        }}
      />
    </div>
  );
}
