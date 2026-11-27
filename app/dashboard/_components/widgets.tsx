"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DatePicker, Spin } from "antd";
import { StatusLozenge } from "@/components/Jobs/StatusBanner";
import { AboutButton, CalendarHeat, Card, Columns, Donut, Empty, Figure, Initials, Meter, RankBars, Segmented, ShareBar, TrendLine, ink, type About, type Tone } from "@/components/ui/kit";
import type { Job } from "@/types/job.type";
import type { Team } from "@/types/team.type";
import type { Vehicle } from "@/types/vehicle.type";
import type { DashboardData, RecentRoute } from "@/types/dashboard.type";
import type { AllRoutes } from "@/types/routes.type";

/** The back end sends "None" when a route has no plan behind it; such a row has nothing to open. */
const hasRouteId = (key?: string | number | null) => key !== undefined && key !== null && !["", "none", "null", "undefined"].includes(String(key).toLowerCase());

/** Everything a widget may read or do. Widgets only show what the back end already sends to this page. */
export type WidgetContext = {
  data: DashboardData;
  go: (path: string, tab?: string) => () => void;
  selectedDate: Dayjs | null;
  onDateChange: (date: Dayjs | null) => void;
  dateRoutes: AllRoutes[];
  loadingDateRoutes: boolean;
  /** Lists other screens already use. `undefined` = still loading, `null` = could not be loaded. Fetched only when a widget on the dashboard needs them. */
  extras: { routes?: AllRoutes[] | null; jobsToday?: Job[] | null; team?: Team[] | null; vehicles?: Vehicle[] | null };
  /** Number of days the route widgets look back over */
  period: number;
  /** Last day of the chosen period (today for the presets, any past day for a custom range) */
  periodEnd: Dayjs;
  /** The period in words, for labels: "last 14 days" or "Nov 3 to Nov 16" */
  periodLabel: string;
};

export type Need = keyof WidgetContext["extras"];

export type WidgetSize = "half" | "full";
export type WidgetDefinition = { id: string; title: string; description: string; size: WidgetSize; needs?: Need[]; usesPeriod?: boolean; about?: About; render: (ctx: WidgetContext) => ReactNode };
export type LayoutItem = { id: string; size: WidgetSize };

const isoDay = (value: string) => /^\d{4}-\d{2}-\d{2}/.test(value) && dayjs(value).isValid();
const progressOf = (route: RecentRoute) => (route.stops > 0 ? Math.min(100, Math.round((route.completed / route.stops) * 100)) : 0);
const toneOf = (status: string): Tone => (status === "completed" ? "success" : "info");
const words = (value: string) => { const text = String(value ?? "").split("_").join(" "); return text.charAt(0).toUpperCase() + text.slice(1); };

// ── Helpers for widgets built from the routes, jobs, team and vehicle lists ──────────────────────────────
const dayKey = (value: string | undefined | null) => String(value ?? "").slice(0, 10);
// The days of the chosen period, and the same number of days immediately before it (what it is compared with)
const daysOf = (ctx: WidgetContext) => Array.from({ length: ctx.period }, (_, index) => ctx.periodEnd.subtract(ctx.period - 1 - index, "day"));
const daysBefore = (ctx: WidgetContext) => Array.from({ length: ctx.period }, (_, index) => ctx.periodEnd.subtract(ctx.period * 2 - 1 - index, "day"));
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const sumBy = (routes: AllRoutes[], measure: "stops" | "routes") => {
  const map = new Map<string, number>();
  routes.forEach((route) => map.set(dayKey(route.scheduled_date), (map.get(dayKey(route.scheduled_date)) || 0) + (measure === "stops" ? Number(route.total_stops) || 0 : 1)));
  return map;
};
const inWindow = (routes: AllRoutes[], days: Dayjs[]) => { const keys = new Set(days.map((day) => day.format("YYYY-MM-DD"))); return routes.filter((route) => keys.has(dayKey(route.scheduled_date))); };

/** Shows a spinner while a list loads and a plain line if it could not be loaded; otherwise renders the widget body. */
function Loaded<T>({ value, what, children }: { value: T | null | undefined; what: string; children: (value: T) => ReactNode }) {
  if (value === undefined) return <div className="flex justify-center py-10"><Spin size="small" /></div>;
  if (value === null) return <Empty>Could not load {what}. Reload the page to try again.</Empty>;
  return <>{children(value)}</>;
}

function RouteTrend({ ctx }: { ctx: WidgetContext }) {
  const [measure, setMeasure] = useState<"stops" | "routes">("stops");
  const { period } = ctx;
  return (
    <Card kicker={`${ctx.periodLabel} against the ${period} days before`} title="Route activity"
      link={{ label: "View all routes", onClick: ctx.go("/plan", "routes") }}
      action={<Segmented label="Measure" value={measure} onChange={setMeasure} options={[{ value: "stops", label: "Stops" }, { value: "routes", label: "Routes" }]} />}>
      <Loaded value={ctx.extras.routes} what="routes">{(routes) => {
        const days = daysOf(ctx), earlier = daysBefore(ctx);
        const map = sumBy(routes, measure);
        const current = days.map((day) => map.get(day.format("YYYY-MM-DD")) || 0), previous = earlier.map((day) => map.get(day.format("YYYY-MM-DD")) || 0);
        const now = current.reduce((a, b) => a + b, 0), before = previous.reduce((a, b) => a + b, 0);
        if (now === 0 && before === 0) return <Empty>No routes were scheduled in this period or the {period} days before it.</Empty>;
        return (
          <>
            <p className="m-0 mb-4 text-sm tabular-nums" style={{ color: ink.subtle }}>
              <span className="kit-num" style={{ color: ink.text }}>{now.toLocaleString()}</span> {measure}
              {before > 0 && (() => {
                // The arrow follows the rounded figure, so a change that rounds to 0% shows no arrow
                const change = Math.round(((now - before) / before) * 100);
                return <span className="ml-3 font-medium" style={{ color: ink.text }}>{change > 0 ? "▲ " : change < 0 ? "▼ " : ""}{Math.abs(change)}%</span>;
              })()}
              <span className="ml-1.5">vs {before.toLocaleString()} in the previous {period} days</span>
            </p>
            <TrendLine current={current} previous={previous} valueLabel={measure} currentName={cap(ctx.periodLabel)} previousName={`${period} days before`}
              labels={days.map((day) => day.format("MMM D"))} titles={days.map((day) => day.format("dddd, MMM D"))} />
          </>
        );
      }}</Loaded>
    </Card>
  );
}

export const WIDGETS: WidgetDefinition[] = [
  {
    id: "headline", title: "Headline figures", size: "full",
    about: {"source": "The dashboard summary from the Syncnox server.", "how": "Four counts sent by the server: active routes, scheduled jobs, completed jobs and drivers. The share under Completed jobs is completed divided by all jobs. Depots is also the server's count.", "note": "The server decides what counts as active and as scheduled. These figures cover all time and do not change with the period control."},
    description: "Active routes, completed and scheduled jobs, and drivers, each as one line.",
    render: ({ data: { kpi }, go }) => {
      const share = kpi.total_jobs > 0 ? Math.round((kpi.completed_jobs / kpi.total_jobs) * 100) : 0;
      return (
        <div className="kit-gap relative grid min-w-0 grid-cols-2 xl:grid-cols-4">
          <span className="absolute right-2 top-2 z-10 [&>span>div]:left-auto [&>span>div]:right-0"><AboutButton title="the key figures" about={WIDGETS[0].about!} /></span>
          <Figure label="Active routes" value={kpi.active_routes.toLocaleString()} note="running now" onClick={go("/plan", "routes")} />
          <Figure label="Scheduled jobs" value={kpi.scheduled_jobs.toLocaleString()} note="not yet run" onClick={go("/plan", "schedule")} />
          <Figure label="Completed jobs" value={kpi.completed_jobs.toLocaleString()} note={`${share}% of all ${kpi.total_jobs.toLocaleString()} jobs`} onClick={go("/plan", "jobs")} />
          <Figure label="Drivers" value={kpi.total_drivers.toLocaleString()} note={`across ${kpi.total_depots.toLocaleString()} ${kpi.total_depots === 1 ? "depot" : "depots"}`} onClick={go("/team", "team")} />
        </div>
      );
    },
  },
  {
    id: "jobs-overview", title: "Jobs overview", size: "half",
    about: {"source": "The dashboard summary from the Syncnox server.", "how": "Completed and Scheduled are the server's counts. Other (drafts, failed, cancelled and the rest) is all jobs minus completed minus scheduled. Each percent is that count divided by all jobs.", "note": "Covers all time. It does not change with the period control."},
    description: "A ring showing how all jobs split between completed, scheduled and the rest.",
    render: ({ data: { kpi }, go }) => (
      <Card kicker="All time" title="Jobs overview" link={{ label: "View all jobs", onClick: go("/plan", "jobs") }}>
        
        <Donut totalLabel="Total jobs" segments={[
          { label: "Completed", value: kpi.completed_jobs, color: "#0B5D3B" },
          { label: "Scheduled", value: kpi.scheduled_jobs, color: "#8FA097" },
          { label: "Other", value: Math.max(0, kpi.total_jobs - kpi.completed_jobs - kpi.scheduled_jobs), color: "#CFD8D3" },
        ]} />
      </Card>
    ),
  },
  {
    id: "upcoming", title: "Upcoming", size: "half",
    about: {"source": "The server's list of coming days, with the jobs and routes planned on each.", "how": "One column per day, exactly as the server sends it. The figure above the chart is the sum of those days. If you pick a date, the list shows the routes scheduled on that date.", "note": "How many days ahead are shown is decided by the server."},
    description: "Jobs planned per day for the days ahead, or the routes on a date you pick.",
    render: ({ data: { upcoming }, go, selectedDate, onDateChange, dateRoutes, loadingDateRoutes }) => (
      <Card kicker={selectedDate ? selectedDate.format("dddd, MMM D") : "Next days with jobs"} title="Upcoming jobs" link={{ label: "Open schedule", onClick: go("/plan", "schedule") }}
        
        action={<DatePicker size="small" onChange={onDateChange} value={selectedDate} placeholder="Select date" aria-label="Filter upcoming routes by date" className="!w-[132px] shrink-0" allowClear />}>
        {selectedDate ? (
          loadingDateRoutes ? <div className="flex justify-center py-6"><Spin size="small" /></div>
          : dateRoutes.length === 0 ? <Empty>No routes for {selectedDate.format("MMM D")}</Empty>
          : <div className="custom-scrollbar max-h-56 overflow-y-auto">
              {dateRoutes.map((route) => (
                <div key={route.id} className="flex items-center justify-between gap-3 border-b py-2.5 last:border-0" style={{ borderColor: ink.hairline }}>
                  <div className="min-w-0">
                    <Link className="inline-flex min-h-7 items-center break-words text-sm font-medium" style={{ color: ink.text }} href={`/route/${route.optimization_id}`}>{route.name}</Link>
                    <div className="text-xs tabular-nums" style={{ color: ink.muted }}>{route.total_stops} stops</div>
                  </div>
                  <span className="shrink-0"><StatusLozenge value={route.status} /></span>
                </div>
              ))}
            </div>
        ) : upcoming.length === 0 ? <Empty>No upcoming schedule</Empty> : (
          <Columns valueLabel="jobs"
            headline={upcoming.reduce((sum, item) => sum + item.jobs, 0).toLocaleString()}
            caption={`jobs on the next ${upcoming.length} ${upcoming.length === 1 ? "day" : "days"} that have work`}
            data={upcoming.map((item) => isoDay(item.date)
              ? { label: dayjs(item.date).format("ddd"), sub: dayjs(item.date).format("D"), title: dayjs(item.date).format("dddd, MMM D"), value: item.jobs, detail: `${item.routes} routes` }
              : { label: item.date, value: item.jobs, detail: `${item.routes} routes` })} />
        )}
      </Card>
    ),
  },
  {
    id: "recent-routes", title: "Recent routes", size: "full",
    about: {"source": "The server's list of recent routes.", "how": "Progress is completed stops divided by all stops on that route. Status is the route's current status.", "note": "Which routes count as recent, and how many are listed, is decided by the server."},
    description: "Your latest routes with driver, progress and status.",
    render: ({ data: { recent_routes }, go }) => (
      <Card kicker={`Latest ${recent_routes.length}`} title="Recent routes" link={{ label: "View all routes", onClick: go("/plan", "routes") }}>
        
        {recent_routes.length === 0 ? <Empty>No routes yet</Empty> : (
          <>
            <div className="sm:hidden">
              {recent_routes.map((route, index) => (
                <article key={`${route.key}-${index}`} className="border-b py-3 last:border-0" style={{ borderColor: ink.hairline }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {hasRouteId(route.key)
                        ? <Link href={`/route/${route.key}`} className="flex min-h-11 items-center break-words text-sm font-medium" style={{ color: ink.accent }}>{route.name}</Link>
                        : <span className="flex min-h-11 items-center break-words text-sm font-medium" style={{ color: ink.text }}>{route.name}</span>}
                      <p className="m-0 break-words text-xs" style={{ color: ink.muted }}>{route.driver}</p>
                    </div>
                    <span className="mt-3 shrink-0"><StatusLozenge value={route.status} /></span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Meter percent={progressOf(route)} tone={toneOf(route.status)} label={`${route.name} progress`} />
                    <span className="shrink-0 text-xs tabular-nums" style={{ color: ink.muted }}>{route.completed}/{route.stops} stops</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="custom-scrollbar hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[520px] border-collapse text-[13px]">
                <caption className="sr-only">Recent routes, drivers, progress and status</caption>
                <thead>
                  <tr>{["Route", "Driver", "Progress", "Status"].map((heading) => (
                    <th key={heading} className="border-b py-2 pr-4 text-left text-xs font-medium" style={{ color: ink.muted, borderColor: ink.line }}>{heading}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {recent_routes.map((route, index) => (
                    <tr key={`${route.key}-${index}`} className="hover:bg-[#EAEFEC]">
                      <td className="border-b py-0 pr-4" style={{ borderColor: ink.hairline }}>
                        {hasRouteId(route.key)
                          ? <Link className="inline-flex min-h-9 items-center font-medium underline decoration-[#B7C2BC] underline-offset-4 hover:decoration-[#12211A]" style={{ color: ink.text }} href={`/route/${route.key}`}>{route.name}</Link>
                          : <span className="inline-flex min-h-9 items-center font-medium" style={{ color: ink.text }} title="This route has no plan to open">{route.name}</span>}
                      </td>
                      <td className="border-b py-0 pr-4" style={{ borderColor: ink.hairline, color: ink.text }}>
                        {route.driver}
                      </td>
                      <td className="border-b py-0 pr-4" style={{ borderColor: ink.hairline }}>
                        <div className="flex items-center gap-3">
                          <Meter percent={progressOf(route)} tone={toneOf(route.status)} label={`${route.name} progress`} width={96} />
                          <span className="tabular-nums" style={{ color: ink.subtle }}>{route.completed}/{route.stops}</span>
                        </div>
                      </td>
                      <td className="border-b py-0" style={{ borderColor: ink.hairline }}><span className="flex items-center"><StatusLozenge value={route.status} /></span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    ),
  },
  {
    id: "top-drivers", title: "Top drivers", size: "half",
    about: {"source": "The server's list of top drivers.", "how": "Completed and On time are rates the server calculates for each driver. The page shows them in the order received.", "note": "What counts as on time, and over what period, is defined on the server. Confirm the definition before using these to judge a driver."},
    description: "Drivers ranked by completion, with their on-time rate.",
    render: ({ data: { top_drivers }, go }) => (
      <Card kicker="By completion rate" title="Top drivers" link={{ label: "View all members", onClick: go("/team", "team") }}>
        
        {top_drivers.length === 0 ? <Empty>No driver data yet</Empty> : (
          <div className="custom-scrollbar max-h-80 overflow-y-auto">
            <div className="flex items-center gap-3 border-b pb-2 text-xs font-medium" style={{ color: ink.muted, borderColor: ink.line }}>
              <span className="min-w-0 flex-1">Driver</span><span className="w-[132px]">Completed</span><span className="w-14 text-right">On time</span>
            </div>
            {top_drivers.map((driver, index) => (
              <div key={index} className="flex items-center gap-3 border-b py-1.5 last:border-0" style={{ borderColor: ink.hairline }}>
                <Initials name={driver.name} size={24} />
                <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: ink.text }}>{driver.name}</span>
                <span className="flex w-[132px] shrink-0 items-center gap-2">
                  <Meter percent={driver.completion_rate} tone="success" label={`${driver.name} completion rate`} />
                  <span className="w-9 text-right text-[13px] tabular-nums" style={{ color: ink.text }}>{driver.completion_rate}%</span>
                </span>
                <span className="w-14 shrink-0 text-right text-[13px] tabular-nums" style={{ color: ink.text }}>{driver.on_time_rate}%</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    ),
  },
  {
    id: "optimization-impact", title: "Optimization impact", size: "half",
    about: {"source": "The dashboard summary from the Syncnox server.", "how": "Three totals sent by the server: distance, time and vehicles saved by route optimization.", "note": "What the savings are measured against is defined on the server. Treat these as estimates until that baseline is confirmed."},
    description: "Distance, time and vehicles saved by route optimization so far.",
    render: ({ data: { optimization_impact } }) => (
      <Card kicker="All time" title="Optimization impact">
        {!optimization_impact.total_distance_saved_km && !optimization_impact.total_time_saved_hours && !optimization_impact.vehicles_saved
          ? <Empty>Nothing measured yet. Savings appear once completed routes can be compared with a baseline.</Empty> : (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Distance saved", value: optimization_impact.total_distance_saved_km, unit: "km" },
            { label: "Time saved", value: optimization_impact.total_time_saved_hours, unit: "hours" },
            { label: "Vehicles saved", value: optimization_impact.vehicles_saved, unit: "" },
          ].map((item) => (
            <div key={item.label} className="min-w-0">
              <div className="flex items-baseline gap-1">
                <span className="truncate kit-num tabular-nums" style={{ color: ink.text }}>{item.value.toLocaleString()}</span>
                {item.unit && <span className="text-sm" style={{ color: ink.subtle }}>{item.unit}</span>}
              </div>
              <div className="mt-1 text-sm" style={{ color: ink.subtle }}>{item.label}</div>
            </div>
          ))}
        </div>
        )}
      </Card>
    ),
  },
  {
    id: "routes-by-status", title: "Routes by status", size: "half",
    about: {"source": "The server's list of recent routes.", "how": "The recent routes are counted by status. Each bar is that count divided by the number of recent routes.", "note": "Covers only the recent routes listed, not every route."},
    description: "How your most recent routes split by status.",
    render: ({ data: { recent_routes }, go }) => {
      const order = ["completed", "in_transit", "in_progress", "scheduled", "processing", "failed", "cancelled"];
      const counts = new Map<string, number>();
      recent_routes.forEach((route) => counts.set(route.status, (counts.get(route.status) || 0) + 1));
      const rows = [...counts.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99);
      return (
        <Card kicker={`Latest ${recent_routes.length} routes`} title="Routes by status" link={{ label: "View all routes", onClick: go("/plan", "routes") }}>
          
          {rows.length === 0 ? <Empty>No routes yet</Empty> : (
            <div className="flex flex-col gap-3">
              {rows.map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <span className="w-[120px] shrink-0"><StatusLozenge value={status} label={words(status)} /></span>
                  <Meter percent={(count / recent_routes.length) * 100} tone={status === "failed" ? "danger" : toneOf(status)} label={`${words(status)} share`} />
                  <span className="w-6 shrink-0 text-right text-sm font-medium tabular-nums" style={{ color: ink.text }}>{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      );
    },
  },
  {
    id: "stops-progress", title: "Stops completed", size: "half",
    about: {"source": "The server's list of recent routes.", "how": "Completed stops on the recent routes added together, divided by all stops on those routes.", "note": "Covers only the recent routes listed, not every route."},
    description: "Stops done out of all stops on your most recent routes.",
    render: ({ data: { recent_routes } }) => {
      const done = recent_routes.reduce((sum, route) => sum + route.completed, 0), all = recent_routes.reduce((sum, route) => sum + route.stops, 0);
      const percent = all > 0 ? Math.round((done / all) * 100) : 0;
      return (
        <Card kicker={`Latest ${recent_routes.length} routes`} title="Stops completed">
          {all === 0 ? <Empty>No stops yet</Empty> : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="kit-figure tabular-nums" style={{ color: ink.text }}>{percent}%</span>
                <span className="text-sm tabular-nums" style={{ color: ink.subtle }}>{done.toLocaleString()} of {all.toLocaleString()} stops</span>
              </div>
              <div className="mt-4 flex"><Meter percent={percent} tone="success" label="Stops completed" /></div>
            </>
          )}
        </Card>
      );
    },
  },
  {
    id: "shortcuts", title: "Shortcuts", size: "half",
    description: "One-click links to jobs, routes, schedule, team, vehicles and locations.",
    render: ({ go }) => (
      <Card kicker="Go to" title="Shortcuts">
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {[
            { label: "All jobs", go: go("/plan", "jobs") }, { label: "All routes", go: go("/plan", "routes") }, { label: "Schedule", go: go("/plan", "schedule") },
            { label: "Team", go: go("/team", "team") }, { label: "Vehicles", go: go("/vehicle") }, { label: "Locations", go: go("/locations") },
          ].map((link) => (
            <button key={link.label} type="button" onClick={link.go}
              className="flex min-h-10 cursor-pointer items-center border-0 border-b bg-transparent p-0 text-left text-sm font-medium hover:underline" style={{ color: ink.text, borderColor: ink.hairline }}>
              {link.label}
            </button>
          ))}
        </div>
      </Card>
    ),
  },
  {
    id: "route-trend", title: "Route activity", size: "full", needs: ["routes"], usesPeriod: true,
    about: {"source": "The routes list, the same one the Routes tab shows.", "how": "For each day, the stops on every route scheduled that day are added up (or the routes are counted, if you switch to Routes). The solid line is the chosen period ending today. The dashed line is the same number of days just before it. The percent is this period minus the previous one, divided by the previous one.", "note": "Days follow each route's scheduled date, not the day the driving happened. All stops on a route are counted, done or not."},
    description: "A line of stops or routes per day, with the previous period drawn behind it for comparison.",
    render: (ctx) => <RouteTrend ctx={ctx} />,
  },
  {
    id: "stop-outcomes", title: "Stop outcomes", size: "half", needs: ["routes"], usesPeriod: true,
    about: {"source": "The routes list, the same one the Routes tab shows.", "how": "Takes the routes scheduled in the chosen period and adds up their stops. Completed and Failed are the counts stored on each route. Remaining is all stops minus completed minus failed.", "note": "Attempted stops are shown as a separate line because they may overlap with completed or failed."},
    description: "Completed, failed and remaining stops across the routes in the chosen period.",
    render: (ctx) => (
      <Card kicker={ctx.periodLabel} title="Stop outcomes">
        <Loaded value={ctx.extras.routes} what="routes">{(all) => {
          const routes = inWindow(all, daysOf(ctx));
          const total = routes.reduce((sum, route) => sum + (Number(route.total_stops) || 0), 0);
          const completed = routes.reduce((sum, route) => sum + (Number(route.completed_stops) || 0), 0);
          const failed = routes.reduce((sum, route) => sum + (Number(route.failed_stops) || 0), 0);
          const attempted = routes.reduce((sum, route) => sum + (Number(route.attempted_stops) || 0), 0);
          if (total === 0) return <Empty>No stops on routes in this period.</Empty>;
          return (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="kit-num tabular-nums" style={{ color: ink.text }}>{Math.round((completed / total) * 100)}%</span>
                <span className="text-sm tabular-nums" style={{ color: ink.subtle }}>completed · {total.toLocaleString()} stops on {routes.length} routes</span>
              </div>
              <ShareBar segments={[
                { label: "Completed", value: completed, color: "#22A06B" },
                { label: "Failed", value: failed, color: "#C9372C" },
                { label: "Remaining", value: Math.max(0, total - completed - failed), color: "#B3B9C4" },
              ]} />
              {attempted > 0 && <p className="m-0 mt-3 text-sm tabular-nums" style={{ color: ink.subtle }}>{attempted.toLocaleString()} stops were attempted.</p>}
            </>
          );
        }}</Loaded>
      </Card>
    ),
  },
  {
    id: "team-workload", title: "Team workload", size: "half", needs: ["routes"], usesPeriod: true,
    about: {"source": "The routes list, the same one the Routes tab shows.", "how": "For routes scheduled in the chosen period, each route counts once for every team member assigned to it.", "note": "A route with several members counts for each of them, so the figures add up to more than the number of routes. Stops per person are not shown: the routes list only has the stop total of the whole plan, which would show the same number for everyone."},
    description: "Team members ranked by how many routes they were on in the chosen period.",
    render: (ctx) => (
      <Card kicker={`Routes per member, ${ctx.periodLabel}`} title="Team workload" link={{ label: "View all members", onClick: ctx.go("/team", "team") }}>
        <Loaded value={ctx.extras.routes} what="routes">{(all) => {
          const tally = new Map<string, { name: string; routes: number; stops: number }>();
          inWindow(all, daysOf(ctx)).forEach((route) => (route.assigned_team_members || []).forEach((member) => {
            const row = tally.get(String(member.id)) || { name: member.name, routes: 0, stops: 0 };
            row.routes += 1; row.stops += Number(route.total_stops) || 0; tally.set(String(member.id), row);
          }));
          const rows = [...tally.values()].sort((a, b) => b.routes - a.routes || b.stops - a.stops).slice(0, 8);
          if (rows.length === 0) return <Empty>No team members were on routes in this period.</Empty>;
          return <RankBars valueLabel="Routes" rows={rows.map((row) => ({ name: row.name, value: row.routes, lead: <Initials name={row.name} size={24} /> }))} />;
        }}</Loaded>
      </Card>
    ),
  },
  {
    id: "activity-calendar", title: "Activity calendar", size: "half", needs: ["routes"],
    about: {"source": "The routes list, the same one the Routes tab shows.", "how": "Each square is one day. Its shade shows the stops on routes scheduled that day, compared with the busiest day in view. Five weeks are shown, Monday to Sunday, ending with this week.", "note": "Later days this week show what is scheduled, not what has been done."},
    description: "A five-week calendar where a darker square means more stops scheduled that day.",
    render: (ctx) => (
      <Card kicker="Stops per day, five weeks" title="Activity calendar" link={{ label: "Open schedule", onClick: ctx.go("/plan", "schedule") }}>
        <Loaded value={ctx.extras.routes} what="routes">{(routes) => {
          const map = sumBy(routes, "stops");
          const monday = dayjs().subtract((dayjs().day() + 6) % 7, "day").subtract(28, "day");
          const days = Array.from({ length: 35 }, (_, index) => monday.add(index, "day"));
          return <CalendarHeat valueLabel="stops" days={days.map((day) => ({ date: day.format("YYYY-MM-DD"), title: day.format("dddd, MMM D"), value: map.get(day.format("YYYY-MM-DD")) || 0 }))} />;
        }}</Loaded>
      </Card>
    ),
  },
  {
    id: "today-jobs", title: "Today's jobs", size: "half", needs: ["jobsToday"],
    about: {"source": "The jobs list for today's date, the same one the Jobs tab shows.", "how": "Today's jobs are counted by status. Under way combines in progress and in transit. The priority line counts the same jobs by priority.", "note": "Only jobs whose scheduled date is today are included."},
    description: "Today's jobs split by status, with the count at each priority.",
    render: (ctx) => (
      <Card kicker={dayjs().format("dddd, MMM D")} title="Today's jobs" link={{ label: "View all jobs", onClick: ctx.go("/plan", "jobs") }}>
        <Loaded value={ctx.extras.jobsToday} what="today's jobs">{(jobs) => {
          if (jobs.length === 0) return <Empty>No jobs are scheduled for today.</Empty>;
          const by = (status: string[]) => jobs.filter((job) => status.includes(job.status)).length;
          const priority = (level: string) => jobs.filter((job) => String(job.priority_level ?? "").toLowerCase() === level).length;
          return (
            <>
              <div className="mb-4 flex items-baseline gap-2">
                <span className="kit-num tabular-nums" style={{ color: ink.text }}>{jobs.length.toLocaleString()}</span>
                <span className="text-sm" style={{ color: ink.subtle }}>{jobs.length === 1 ? "job" : "jobs"} today</span>
              </div>
              <ShareBar segments={[
                { label: "Draft", value: by(["draft"]), color: "#8590A2" },
                { label: "Assigned", value: by(["assigned"]), color: "#85B8FF" },
                { label: "Under way", value: by(["in_progress", "in_transit"]), color: "#0C66E4" },
                { label: "Completed", value: by(["completed"]), color: "#22A06B" },
                ...(by(["failed", "cancelled"]) > 0 ? [{ label: "Failed or cancelled", value: by(["failed", "cancelled"]), color: "#C9372C" }] : []),
              ]} />
              {priority("high") + priority("medium") + priority("low") > 0 && (
                <p className="m-0 mt-4 border-t pt-3 text-sm tabular-nums" style={{ color: ink.subtle, borderColor: ink.hairline }}>
                  Priority: <span className="font-medium" style={{ color: ink.text }}>{priority("high")}</span> high · <span className="font-medium" style={{ color: ink.text }}>{priority("medium")}</span> medium · <span className="font-medium" style={{ color: ink.text }}>{priority("low")}</span> low
                </p>
              )}
            </>
          );
        }}</Loaded>
      </Card>
    ),
  },
  {
    id: "team-fleet", title: "Team and fleet readiness", size: "half", needs: ["team", "vehicles"],
    about: {"source": "The team members list and the vehicles list.", "how": "Active is team members whose status is active. A driver without a vehicle is a member with the driver role and no vehicle assigned. A vehicle without a driver has no team member assigned.", "note": "This shows how records are set up, not who is on shift today."},
    description: "Active team members, drivers without a vehicle, and vehicles without a driver.",
    render: (ctx) => (
      <Card kicker="Right now" title="Team and fleet readiness" link={{ label: "View vehicles", onClick: ctx.go("/vehicle") }}>
        <Loaded value={ctx.extras.team} what="team members">{(team) => (
          <Loaded value={ctx.extras.vehicles} what="vehicles">{(vehicles) => {
            const active = team.filter((member) => member.status === "active").length;
            const drivers = team.filter((member) => member.role_type === "driver");
            const driversWithoutVehicle = drivers.filter((member) => !member.vehicle_id).length;
            const vehiclesWithoutDriver = vehicles.filter((vehicle) => !vehicle.team_member_id).length;
            const figure = (value: number, label: string, alert: boolean) => (
              <div className="min-w-0">
                <div className="kit-num tabular-nums" style={{ color: alert ? "#974F0C" : ink.text }}>{value.toLocaleString()}</div>
                <div className="mt-1 text-sm" style={{ color: ink.subtle }}>{label}</div>
              </div>
            );
            return (
              <>
                <div className="flex items-center gap-3">
                  <Meter percent={team.length > 0 ? (active / team.length) * 100 : 0} tone="success" label="Active team members" />
                  <span className="shrink-0 text-sm tabular-nums" style={{ color: ink.subtle }}><span className="font-medium" style={{ color: ink.text }}>{active}</span> of {team.length} team members active</span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-4">
                  {figure(vehicles.length, vehicles.length === 1 ? "vehicle" : "vehicles", false)}
                  {figure(driversWithoutVehicle, "drivers without a regular vehicle", driversWithoutVehicle > 0)}
                  {figure(vehiclesWithoutDriver, "vehicles without a regular driver", vehiclesWithoutDriver > 0)}
                </div>
              </>
            );
          }}</Loaded>
        )}</Loaded>
      </Card>
    ),
  },
];

export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: "headline", size: "full" }, { id: "route-trend", size: "full" }, { id: "jobs-overview", size: "half" }, { id: "upcoming", size: "half" },
  { id: "recent-routes", size: "full" }, { id: "top-drivers", size: "half" }, { id: "optimization-impact", size: "half" },
];
