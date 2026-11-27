"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DatePicker, Drawer, Input, Spin, Tooltip, Typography } from "antd";
import dayjs, { Dayjs } from "dayjs";
import {
  ArrowDown, ArrowUp, CalendarBlank, CaretDown, ArrowsInLineHorizontal, ArrowsOutLineHorizontal, ArrowCounterClockwise, Check, DotsSixVertical,
  MagnifyingGlass, Plus, SlidersHorizontal, SquaresFour, X,
} from "@phosphor-icons/react/ssr";
import { useIndexStore } from "@/store/index.store";
import AddJobsModal from "@/app/plan/AddJobsModal";
import { useDashboardStore, defaultDashboard } from "@/store/dashboard.store";
import { fetchRoutes } from "@/apis/routes.api";
import { fetchJobs } from "@/apis/jobs.api";
import { fetchTeams } from "@/apis/team.api";
import { fetchVehicles } from "@/apis/vehicle.api";
import { AllRoutes } from "@/types/routes.type";
import { AboutContext, ActionButton, PageHeader, ink } from "@/components/ui/kit";
import { DEFAULT_LAYOUT, WIDGETS, type LayoutItem, type Need, type WidgetContext } from "./widgets";

const { Text } = Typography;

// The arrangement is kept in this browser. Keeping it per account needs a small back-end addition.
const STORAGE_KEY = "syncnox.dashboard.layout.v1";
const PERIOD_KEY = "syncnox.dashboard.period.v2";
const PRESETS = [7, 14, 30];
const MAX_DAYS = 92; // one comparison needs twice the range; three months keeps the chart readable
// What is remembered: a preset ("the last 14 days", which moves with today) or two fixed dates
type SavedPeriod = { days: number } | { start: string; end: string };
const known = (items: unknown): LayoutItem[] | null => {
  if (!Array.isArray(items)) return null;
  const seen = new Set<string>();
  const clean = items.filter((item): item is LayoutItem =>
    !!item && typeof item.id === "string" && WIDGETS.some((w) => w.id === item.id) && !seen.has(item.id) && !!seen.add(item.id))
    .map((item) => ({ id: item.id, size: item.size === "full" ? "full" as const : "half" as const }));
  return clean;
};

export default function DashboardView() {
  const router = useRouter();
  const { setCurrentTab } = useIndexStore();
  const { dashboardData, isLoading, error, fetchDashboard } = useDashboardStore();
  const [selectedDate, setSelectedDate] = useState<Dayjs | null>(null);
  const [selectedDateRoutes, setSelectedDateRoutes] = useState<AllRoutes[]>([]);
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false);

  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const [extras, setExtras] = useState<WidgetContext["extras"]>({});
  const requested = useRef(new Set<Need>());
  const [savedPeriod, setSavedPeriod] = useState<SavedPeriod>({ days: 14 });
  const [periodOpen, setPeriodOpen] = useState(false);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Lists that other screens already load (routes, today's jobs, team, vehicles) are fetched here only when a widget on the dashboard needs them, once each
  useEffect(() => {
    const loaders: Record<Need, () => Promise<unknown>> = {
      routes: () => fetchRoutes(),
      // The jobs endpoint returns 100 rows unless asked for more; page through so "jobs today" is the real total.
      jobsToday: async () => {
        const date = dayjs().format("YYYY-MM-DD"), limit = 1000, all: Awaited<ReturnType<typeof fetchJobs>> = [];
        for (;;) { const page = await fetchJobs({ date, skip: all.length, limit }); all.push(...page); if (page.length < limit) return all; }
      },
      team: () => fetchTeams(),
      vehicles: () => fetchVehicles(),
    };
    const needs = new Set(layout.flatMap((item) => WIDGETS.find((w) => w.id === item.id)?.needs ?? []));
    needs.forEach((need) => {
      if (requested.current.has(need)) return;
      requested.current.add(need);
      loaders[need]()
        .then((value) => setExtras((current) => ({ ...current, [need]: Array.isArray(value) ? value : [] })))
        .catch((reason) => { console.error(`Dashboard could not load ${need}`, reason); setExtras((current) => ({ ...current, [need]: null })); });
    });
  }, [layout]);

  // Read the saved arrangement after the first paint, so the server and the browser render the same first page
  useEffect(() => {
    try { const saved = known(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null")); if (saved) setLayout(saved); } catch { /* keep the default */ }
    try {
      const saved = JSON.parse(window.localStorage.getItem(PERIOD_KEY) || "null");
      if (saved && PRESETS.includes(saved.days)) setSavedPeriod({ days: saved.days });
      else if (saved && dayjs(saved.start).isValid() && dayjs(saved.end).isValid() && !dayjs(saved.end).isBefore(saved.start)) setSavedPeriod({ start: saved.start, end: saved.end });
    } catch { /* keep the last 14 days */ }
  }, []);
  const save = (next: LayoutItem[]) => {
    setLayout(next);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private window: the change still applies for this visit */ }
  };

  const handleDateChange = async (date: Dayjs | null) => {
    setSelectedDate(date);
    if (date) {
      setIsLoadingRoutes(true);
      try {
        const routes = await fetchRoutes(undefined, date.format("YYYY-MM-DD"));
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

  const today = dayjs().startOf("day");
  const range: [Dayjs, Dayjs] = "days" in savedPeriod
    ? [today.subtract(savedPeriod.days - 1, "day"), today]
    : [dayjs(savedPeriod.start).startOf("day"), dayjs(savedPeriod.end).startOf("day")];
  const period = Math.min(MAX_DAYS, range[1].diff(range[0], "day") + 1);
  const periodLabel = "days" in savedPeriod ? `last ${savedPeriod.days} days`
    : range[0].isSame(range[1], "day") ? range[1].format("MMM D")
    : range[0].isSame(range[1], "month") ? `${range[0].format("MMM D")} to ${range[1].format("D")}`   // "Nov 5 to 14"
    : `${range[0].format("MMM D")} to ${range[1].format("MMM D")}`;
  const choosePeriod = (next: SavedPeriod) => {
    setSavedPeriod(next);
    try { window.localStorage.setItem(PERIOD_KEY, JSON.stringify(next)); } catch { /* applies for this visit */ }
  };

  const [addJobOpen, setAddJobOpen] = useState(false);
  const go = (path: string, tab?: string) => () => { router.push(path); if (tab) setCurrentTab(tab as Parameters<typeof setCurrentTab>[0]); };
  const context: WidgetContext = {
    data: dashboardData ?? defaultDashboard, go, selectedDate, onDateChange: handleDateChange, dateRoutes: selectedDateRoutes, loadingDateRoutes: isLoadingRoutes, extras, period, periodEnd: range[1], periodLabel,
  };

  const move = (id: string, by: number) => {
    const from = layout.findIndex((item) => item.id === id), to = from + by;
    if (from < 0 || to < 0 || to >= layout.length) return;
    const next = [...layout]; const [item] = next.splice(from, 1); next.splice(to, 0, item); save(next);
  };
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = layout.filter((item) => item.id !== dragId);
    const dragged = layout.find((item) => item.id === dragId);
    if (dragged) { next.splice(next.findIndex((item) => item.id === targetId), 0, dragged); save(next); }
  };
  const resize = (id: string) => save(layout.map((item) => (item.id === id ? { ...item, size: item.size === "full" ? "half" : "full" } : item)));
  const remove = (id: string) => save(layout.filter((item) => item.id !== id));
  const add = (id: string) => { const widget = WIDGETS.find((w) => w.id === id); if (widget && !layout.some((item) => item.id === id)) save([...layout, { id, size: widget.size }]); };

  const paletteItems = useMemo(() => {
    const query = paletteSearch.trim().toLowerCase();
    return WIDGETS.filter((w) => !query || `${w.title} ${w.description}`.toLowerCase().includes(query));
  }, [paletteSearch]);
  const tool = "inline-flex h-7 w-7 cursor-pointer items-center justify-center border-0 bg-transparent text-[#44546F] hover:bg-[#DCDFE4] hover:text-[#172B4D] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#2A8361]";

  return (
    <div className="lang kit-fluid kit-gap-lg relative mx-auto flex min-h-full w-full min-w-0 max-w-[1840px] flex-col pb-8">
      {isLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/60">
          <Spin size="large" />
        </div>
      )}

      <PageHeader
        kicker={<span suppressHydrationWarning>{dayjs().format("dddd, MMMM D")}</span>}
        title={editing ? "Arrange your dashboard" : "Dashboard"}
        description={editing ? "Drag a widget by its bar to move it, change its width, or remove it. Changes save as you go." : undefined}
        actions={editing ? (
          <>
            <ActionButton variant="quiet" icon={<ArrowCounterClockwise size={16} weight="light" />} onClick={() => save(DEFAULT_LAYOUT)}>Reset to default</ActionButton>
            <ActionButton icon={<Plus size={16} weight="light" />} onClick={() => setPaletteOpen(true)}>Add widget</ActionButton>
            <ActionButton variant="primary" icon={<Check size={16} weight="bold" />} onClick={() => { setEditing(false); setPaletteOpen(false); }}>Done</ActionButton>
          </>
        ) : (
          <>
            {error && <Text role="alert" className="min-w-0 break-words" type="danger">{error}</Text>}
            {layout.some((item) => WIDGETS.find((w) => w.id === item.id)?.usesPeriod) && (
              // A short button names the period ("Last 14 days"); the calendar opens from it. The date fields themselves are not shown.
              <span className="relative inline-flex">
                <button type="button" aria-haspopup="dialog" aria-expanded={periodOpen} aria-label={`Period: ${periodLabel}. Change period`}
                  onClick={() => setPeriodOpen((open) => !open)}
                  className="inline-flex h-8 cursor-pointer items-center gap-2 border-0 bg-[#F3F6F4] px-3 text-[13px] font-medium text-[#12211A] hover:bg-[#EAEFEC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]">
                  <CalendarBlank size={16} weight="light" aria-hidden="true" />
                  {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}
                  <CaretDown size={11} weight="bold" aria-hidden="true" className="text-[#626E67]" />
                </button>
                <DatePicker.RangePicker aria-hidden tabIndex={-1} open={periodOpen} onOpenChange={setPeriodOpen} allowClear={false} value={range} placement="bottomRight"
                  className="!pointer-events-none !absolute !inset-0 !h-8 !w-full !opacity-0" disabledDate={(day) => day.isAfter(today, "day")}
                  presets={PRESETS.map((days) => ({ label: `Last ${days} days`, value: [today.subtract(days - 1, "day"), today] as [Dayjs, Dayjs] }))}
                  onChange={(dates) => {
                    if (!dates || !dates[0] || !dates[1]) return;
                    const start = dates[0].startOf("day"), end = dates[1].startOf("day"), length = end.diff(start, "day") + 1;
                    // Picking a range that ends today with a preset length keeps it rolling ("last 14 days"); anything else is kept as fixed dates
                    if (end.isSame(today, "day") && PRESETS.includes(length)) choosePeriod({ days: length });
                    else choosePeriod({ start: (length > MAX_DAYS ? end.subtract(MAX_DAYS - 1, "day") : start).format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") });
                  }} />
              </span>
            )}
            <Tooltip title="Customize dashboard">
              <button type="button" aria-label="Customize dashboard" onClick={() => setEditing(true)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-0 bg-transparent text-[#4A5750] hover:bg-[#F3F6F4] hover:text-[#12211A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]">
                <SlidersHorizontal size={18} weight="light" />
              </button>
            </Tooltip>
            <ActionButton variant="primary" icon={<Plus size={16} weight="light" />} onClick={() => setAddJobOpen(true)}>Add job</ActionButton>
          </>
        )}
      />

      {layout.length === 0 ? (
        <div className="flex flex-col items-center gap-3 border border-dashed px-6 py-16 text-center" style={{ borderColor: "#B3B9C4" }}>
          <SquaresFour size={32} weight="light" color={ink.muted} aria-hidden="true" />
          <div>
            <p className="m-0 text-base font-medium" style={{ color: ink.text }}>Your dashboard is empty</p>
            <p className="m-0 mt-1 text-sm" style={{ color: ink.subtle }}>Add the widgets you want to see when you open Syncnox.</p>
          </div>
          <ActionButton variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => { setEditing(true); setPaletteOpen(true); }}>Add widget</ActionButton>
        </div>
      ) : (
        <div className="kit-gap grid min-w-0 grid-cols-1 xl:grid-cols-2">
          {layout.map((item, index) => {
            const widget = WIDGETS.find((w) => w.id === item.id);
            if (!widget) return null;
            return (
              <div key={item.id} data-widget={item.id}
                className={`flex min-w-0 flex-col ${item.size === "full" ? "xl:col-span-2" : ""} ${editing && overId === item.id && dragId !== item.id ? "outline outline-2 outline-offset-2 outline-[#2A8361]" : ""} ${dragId === item.id ? "opacity-40" : ""}`}
                onDragOver={editing ? (event) => { if (dragId) { event.preventDefault(); setOverId(item.id); } } : undefined}
                onDrop={editing ? (event) => { event.preventDefault(); dropOn(item.id); setDragId(null); setOverId(null); } : undefined}>
                {editing && (
                  <div draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); setDragId(item.id); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                    className="flex h-9 cursor-grab items-center gap-1 border border-b-0 bg-[#F1F2F4] pl-2 pr-1 active:cursor-grabbing" style={{ borderColor: "#B3B9C4" }}>
                    <DotsSixVertical size={16} weight="bold" color={ink.muted} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium" style={{ color: ink.subtle }}>{widget.title}</span>
                    <button type="button" className={tool} disabled={index === 0} onClick={() => move(item.id, -1)} aria-label={`Move ${widget.title} earlier`} title="Move earlier"><ArrowUp size={16} weight="light" /></button>
                    <button type="button" className={tool} disabled={index === layout.length - 1} onClick={() => move(item.id, 1)} aria-label={`Move ${widget.title} later`} title="Move later"><ArrowDown size={16} weight="light" /></button>
                    <button type="button" className={`${tool} hidden xl:inline-flex`} onClick={() => resize(item.id)}
                      aria-label={item.size === "full" ? `Make ${widget.title} half width` : `Make ${widget.title} full width`} title={item.size === "full" ? "Half width" : "Full width"}>
                      {item.size === "full" ? <ArrowsInLineHorizontal size={16} weight="light" /> : <ArrowsOutLineHorizontal size={16} weight="light" />}
                    </button>
                    <button type="button" className={tool} onClick={() => remove(item.id)} aria-label={`Remove ${widget.title}`} title="Remove"><X size={16} weight="light" /></button>
                  </div>
                )}
                <div className={`flex min-w-0 flex-1 flex-col [&>section]:flex-1 ${editing ? "pointer-events-none select-none outline outline-1 outline-[#B7C2BC]" : ""}`} aria-hidden={editing || undefined}>
                  <AboutContext.Provider value={editing ? null : widget.about ?? null}>{widget.render(context)}</AboutContext.Provider>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Drawer title="Add widget" open={paletteOpen} onClose={() => setPaletteOpen(false)} size={400} mask={false}>
        <Input allowClear aria-label="Search widgets" placeholder="Search widgets" prefix={<MagnifyingGlass size={14} color={ink.muted} />}
          value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} />
        <div className="mt-4 flex flex-col">
          {paletteItems.length === 0 ? (
            <div className="py-8 text-center">
              <p className="m-0 text-sm" style={{ color: ink.subtle }}>No widget matches &ldquo;{paletteSearch}&rdquo;.</p>
              <button type="button" onClick={() => setPaletteSearch("")} className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-sm font-medium hover:underline" style={{ color: ink.accent }}>Clear search</button>
            </div>
          ) : paletteItems.map((widget) => {
            const added = layout.some((item) => item.id === widget.id);
            return (
              <div key={widget.id} className="flex items-start gap-3 border-b py-3.5 last:border-0" style={{ borderColor: ink.hairline }}>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-sm font-medium" style={{ color: ink.text }}>{widget.title}</p>
                  <p className="m-0 mt-0.5 text-[13px] leading-[18px]" style={{ color: ink.subtle }}>{widget.description}</p>
                </div>
                {added
                  ? <span className="inline-flex h-[34px] shrink-0 items-center gap-1.5 text-[13px] font-medium" style={{ color: ink.success }}><Check size={14} weight="bold" aria-hidden="true" /> Added</span>
                  : <ActionButton onClick={() => add(widget.id)} icon={<Plus size={14} weight="bold" />} aria-label={`Add ${widget.title}`}>Add</ActionButton>}
              </div>
            );
          })}
        </div>
        <p className="m-0 mt-5 text-xs leading-[18px]" style={{ color: ink.muted }}>Your arrangement is saved in this browser on this device.</p>
      </Drawer>

      {/* Same Add job dialog as the Plan screen; the dashboard counts refresh after a job is saved. */}
      <AddJobsModal open={addJobOpen} setOpen={setAddJobOpen} onJobCreated={() => { fetchDashboard(); }} />
    </div>
  );
}
