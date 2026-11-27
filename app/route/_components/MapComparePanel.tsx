"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "antd";
import { Info, MapPin, Search, X } from "lucide-react";
import type { MapCompareItem } from "./mapCompare.utils";

interface Props {
  items: MapCompareItem[];
  selected: MapCompareItem[];
  onToggle: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
}

export default function MapComparePanel({ items, selected, onToggle, onClear, onClose, loading, error }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const [visibleCount, setVisibleCount] = useState(60);
  // "" = every person. Kept after the other state so its order never shifts.
  const [person, setPerson] = useState<string | undefined>("");
  const personFilter = person ?? "";
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, []);
  const selectedKeys = useMemo(() => new Set(selected.map(item => item.key)), [selected]);
  const people = useMemo(() => [...new Set(items.flatMap(item => {
    const name = (item.marker as { comparison?: { driverName?: string } } | null)?.comparison?.driverName;
    return !item.unassigned && name ? [name] : [];
  }))].sort((a, b) => a.localeCompare(b)), [items]);
  const matches = useMemo(() => {
    const terms = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(item => (filter === "all" || (filter === "unassigned") === item.unassigned) &&
      (!personFilter || (!item.unassigned && (item.marker as { comparison?: { driverName?: string } } | null)?.comparison?.driverName === personFilter)) &&
      terms.every(term => item.searchText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)));
  }, [items, query, filter, personFilter]);
  const addable = matches.filter(item => item.marker && !selectedKeys.has(item.key));

  return <section aria-label="Compare map stops" onKeyDown={event => event.stopPropagation()}
    className="flex max-h-full w-[360px] max-w-[calc(100vw-32px)] flex-col overflow-hidden border border-slate-200 bg-white shadow-lg">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-1 border-b border-slate-200 px-3 py-2">
      <div className="flex items-center gap-1.5">
        <h2 ref={headingRef} tabIndex={-1} className="m-0 text-sm font-semibold text-slate-900 focus:outline-none">Compare stops</h2>
        <Tooltip title="Choose stops from any driver or unassigned job." trigger={["hover", "focus", "click"]}>
          <button type="button" aria-label="Choose stops from any driver or unassigned job."
            className="inline-flex h-6 w-6 items-center justify-center text-slate-500 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700">
            <Info size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <span className="whitespace-nowrap text-xs font-semibold text-slate-800" aria-live="polite">{selected.length} selected</span>
        <Tooltip title="Selected stops will appear on the map." trigger={["hover", "focus", "click"]}>
          <button type="button" aria-label="Selected stops will appear on the map."
            className="inline-flex h-6 w-6 items-center justify-center text-slate-500 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-emerald-700">
            <Info size={15} aria-hidden="true" />
          </button>
        </Tooltip>
        <button type="button" onClick={onClear} disabled={!selected.length}
          className="cursor-pointer whitespace-nowrap text-xs font-medium text-emerald-800 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline">Clear all</button>
        <button type="button" onClick={onClose} aria-label="Close comparison"
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700"><X size={17} /></button>
      </div>
    </header>
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
    {selected.length > 0 && <div className="border-b border-slate-200 px-4 py-2">
      <ul className="custom-scrollbar m-0 max-h-28 space-y-1 overflow-y-auto p-0">
        {selected.map((item, index) => <li key={item.key} className="flex items-center gap-2 text-xs text-slate-700">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-[10px] font-bold text-white">{index + 1}</span>
          <span className="min-w-0 flex-1 truncate" title={`${item.title} — ${item.subtitle}`}>{item.title} <span className="text-slate-500">· {item.subtitle}</span></span>
          <button type="button" onClick={() => onToggle(item.key)} aria-label={`Remove ${item.title}, ${item.subtitle}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700"><X size={14} /></button>
        </li>)}
      </ul>
    </div>}
    <div className="shrink-0 space-y-2 px-4 py-3">
      <label className="relative block">
        <span className="sr-only">Search stops by name, job ID, driver or address</span>
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(60); }} placeholder="Search name, job ID, driver or address"
          className="h-9 w-full border border-slate-300 bg-white pl-9 pr-3 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700" />
      </label>
      <div role="group" aria-label="Filter comparison stops" className="flex gap-1">
        {([ ["all", "All"], ["assigned", "Drivers"], ["unassigned", "Unassigned"] ] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setVisibleCount(60); }}
            className={`cursor-pointer border px-2.5 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-emerald-700 ${filter === value ? "border-emerald-800 bg-emerald-50 text-emerald-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>)}
      </div>
      {people.length > 0 && <div className="flex items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-slate-600">
          <span className="shrink-0">Team member</span>
          <select value={personFilter} onChange={event => { setPerson(event.target.value); setVisibleCount(60); if (event.target.value && filter === "unassigned") setFilter("all"); }}
            aria-label="Show stops of one team member"
            className="h-8 min-w-0 flex-1 border border-slate-300 bg-white px-2 text-xs text-slate-900 outline-none focus:border-emerald-700">
            <option value="">Everyone</option>
            {people.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <button type="button" disabled={!addable.length || addable.length > 60}
          title={addable.length > 60 ? "Narrow the list to 60 stops or fewer to add them all" : undefined}
          onClick={() => addable.forEach(item => onToggle(item.key))}
          className="shrink-0 cursor-pointer whitespace-nowrap text-xs font-medium text-emerald-800 hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline">
          Add all shown{addable.length ? ` (${addable.length})` : ""}
        </button>
      </div>}
      {error && <p role="alert" className="m-0 text-xs text-red-700">Job details could not be loaded. Refresh the plan to see all unassigned jobs.</p>}
      {loading && <p role="status" className="m-0 text-xs text-slate-500">Loading job details…</p>}
    </div>
    <div className="border-t border-slate-100" aria-label="Available stops">
      {matches.slice(0, visibleCount).map(item => <label key={item.key}
        className={`flex items-start gap-2.5 border-b border-slate-100 px-4 py-2.5 ${item.marker ? "cursor-pointer hover:bg-slate-50" : "cursor-not-allowed opacity-60"}`}>
        <input type="checkbox" checked={selectedKeys.has(item.key)} disabled={!item.marker} onChange={() => onToggle(item.key)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-800" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-900">{item.title}</span>
          <span className="mt-0.5 block text-[11px] text-slate-600">{item.subtitle}</span>
          <span className="mt-0.5 flex items-start gap-1 text-[11px] text-slate-500"><MapPin size={12} className="mt-0.5 shrink-0" /><span className="line-clamp-2">{item.address}</span></span>
          {!item.marker && <span className="mt-0.5 block text-[11px] text-amber-700">No map coordinates available</span>}
        </span>
      </label>)}
      {!matches.length && <p className="px-4 py-4 text-xs text-slate-500">{loading ? "Loading stops…" : "No stops found. Try another search or filter."}</p>}
      {matches.length > visibleCount && <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-slate-500">
        <span>Showing {visibleCount} of {matches.length} stops</span>
        <button type="button" onClick={() => setVisibleCount(count => count + 60)} className="font-semibold text-emerald-800 hover:underline">Show more</button>
      </div>}
    </div>
    </div>
  </section>;
}
