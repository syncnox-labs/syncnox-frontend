"use client";
import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Search, X, MapPin, Phone, User, ChevronRight, Plus } from "lucide-react";
import { Tooltip } from "antd";

export interface MapSearchResult {
  id: string;
  candidateName: string;
  candidatePhone: string;
  candidateId: string;
  pickupAddress: string;
  dropoffAddress: string;
  driverName: string;
  leg?: string;
  routeIndex: number;
  stopIndex: number;
  /** 1-based display stop number (excludes depots) — matches timeline */
  displayStopNumber: number;
  stop: any;
  job: any;
  searchableText: string;
}

interface MapSearchProps {
  /** Full candidate index built by OptimizationView */
  candidates: MapSearchResult[];
  /** Called when the user selects a result */
  onSelect: (item: MapSearchResult) => void;
  onOpenAddJob?: () => void;
}


const RECENT_KEY = "syncnox_map_search_recent";
const MAX_RECENT = 5;

function getRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    const prev = getRecent().filter((q) => q !== query);
    localStorage.setItem(
      RECENT_KEY,
      JSON.stringify([query, ...prev].slice(0, MAX_RECENT)),
    );
  } catch {}
}

const MapSearch: React.FC<MapSearchProps> = ({
  candidates,
  onSelect,
  onOpenAddJob,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIdx, setHighlightedIdx] = useState(-1);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Filter results ────────────────────────────────────────────────────────
  const searchResults = useMemo((): MapSearchResult[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return candidates.filter((c) => c.searchableText.includes(q)).slice(0, 40);
  }, [candidates, query]);

  // Group by driver
  const groupedResults = useMemo(() => {
    const map = new Map<string, MapSearchResult[]>();
    searchResults.forEach((r) => {
      const key = r.driverName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return map;
  }, [searchResults]);

  // Flat list for keyboard navigation
  const flatResults = searchResults;

  // ── Open / close logic ────────────────────────────────────────────────────
  const open = useCallback(() => {
    setIsOpen(true);
    setRecentSearches(getRecent());
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setHighlightedIdx(-1);
  }, []);

  // Click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, close]);

  // ── Keyboard navigation ───────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (flatResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((prev) => Math.min(prev + 1, flatResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightedIdx >= 0) {
      e.preventDefault();
      handleSelect(flatResults[highlightedIdx]);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIdx < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(
      `[data-result-idx="${highlightedIdx}"]`,
    ) as HTMLElement;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightedIdx]);

  // ── Select handler ────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (item: MapSearchResult) => {
      if (query.trim()) saveRecent(query.trim());
      onSelect(item);
      close();
    },
    [onSelect, close, query],
  );

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIdx(-1);
  }, [query]);

  const handleClearRecent = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
    setRecentSearches([]);
  };

  const showDropdown =
    isOpen && (query.trim() !== "" || recentSearches.length > 0);

  return (
    <div
      ref={containerRef}
      className="flex flex-col"
    >
      {/* ── Toggle button / expanded input row ── */}
      <div className="flex items-center gap-1.5">
        <div
          className={`
            flex items-center bg-white/95 backdrop-blur-sm border border-gray-200
            shadow-lg transition-all duration-300 ease-out overflow-hidden
            ${isOpen ? "rounded-none w-72" : "rounded-none w-9 h-9"}
          `}
        >
          {/* Search icon button */}
          <button
            type="button"
            aria-label="Search candidates"
            onClick={() => (isOpen ? undefined : open())}
            className={`
              flex items-center justify-center shrink-0 transition-colors cursor-pointer
              ${isOpen
                ? "w-9 h-9 text-emerald-700 hover:bg-emerald-50"
                : "w-9 h-9 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-none"
              }
            `}
          >
            <Search size={15} strokeWidth={2.2} />
          </button>

        {/* Input — only rendered when open to avoid tab-focus on hidden input */}
        {isOpen && (
          <>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search candidate, phone, ID…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 min-w-0 text-xs text-gray-800 placeholder-gray-400 bg-transparent outline-none border-none py-2 pr-1"
              style={{ fontSize: "12px" }}
            />
            {/* Clear / close button */}
            <button
              type="button"
              aria-label="Close search"
              onClick={close}
              className="flex items-center justify-center w-7 h-7 mr-1 rounded-none text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0 cursor-pointer"
            >
              <X size={13} />
            </button>
          </>
        )}
        </div>

        {/* Plus / Add Candidate button beside search */}
        {onOpenAddJob && !isOpen && (
          <Tooltip title="Add New Candidate / Job">
            <button
              type="button"
              onClick={onOpenAddJob}
              aria-label="Add Candidate"
              className="flex items-center justify-center w-9 h-9 bg-white/95 backdrop-blur-sm border border-gray-200 text-gray-700 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer shadow-lg rounded-none"
            >
              <Plus size={16} strokeWidth={2.2} />
            </button>
          </Tooltip>
        )}
      </div>

      {/* ── Dropdown ── */}
      {showDropdown && (
        <div
          ref={listRef}
          className="mt-1.5 bg-white border border-gray-200 rounded-none shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ maxHeight: 340, overflowY: "auto", width: 300 }}
        >
          {/* ── No results ── */}
          {query.trim() !== "" && searchResults.length === 0 && (
            <div className="px-4 py-5 text-center">
              <Search
                size={20}
                className="mx-auto text-gray-300 mb-2"
                strokeWidth={1.5}
              />
              <p className="text-xs text-gray-400">
                No results for{" "}
                <span className="font-semibold text-gray-600">
                  &ldquo;{query}&rdquo;
                </span>
              </p>
            </div>
          )}

          {/* ── Recent searches (shown when input is empty) ── */}
          {query.trim() === "" && recentSearches.length > 0 && (
            <div className="px-3 pt-2.5 pb-1">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Recent
                </p>
                <button
                  type="button"
                  onClick={handleClearRecent}
                  className="text-[10px] text-gray-400 hover:text-emerald-700 hover:underline cursor-pointer transition-colors"
                >
                  Clear recents
                </button>
              </div>
              {recentSearches.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  className="w-full text-left px-2 py-1.5 rounded-none text-xs text-gray-600 hover:bg-gray-50 flex items-center gap-2 cursor-pointer transition-colors"
                  onClick={() => setQuery(r)}
                >
                  <Search size={11} className="text-gray-300 shrink-0" />
                  {r}
                </button>
              ))}
            </div>
          )}

          {/* ── Grouped results ── */}
          {query.trim() !== "" && searchResults.length > 0 && (() => {
            let globalIdx = 0;
            return Array.from(groupedResults.entries()).map(
              ([driverName, items]) => (
                <div key={driverName}>
                  {/* Driver group header */}
                  <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-none shrink-0"
                      style={{
                        backgroundColor: `hsl(${(items[0].routeIndex * 47 + 140) % 360}, 60%, 45%)`,
                      }}
                    />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                      {driverName}
                    </span>
                    <span className="ml-auto text-[9px] bg-gray-100 text-gray-500 rounded-none px-1.5 py-0.5 font-semibold shrink-0">
                      {items.length}
                    </span>
                  </div>

                  {/* Results */}
                  {items.map((item) => {
                    const idx = globalIdx++;
                    const isHighlighted = idx === highlightedIdx;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-result-idx={idx}
                        onClick={() => handleSelect(item)}
                        onMouseEnter={() => setHighlightedIdx(idx)}
                        className={`
                          w-full text-left px-3 py-2 transition-colors cursor-pointer border-b border-gray-50 last:border-0
                          ${isHighlighted
                            ? "bg-emerald-50"
                            : "hover:bg-gray-50"
                          }
                        `}
                      >
                        {/* Name row */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[11.5px] text-gray-800 truncate flex items-center gap-1">
                            <User
                              size={11}
                              className="text-gray-400 shrink-0"
                            />
                            {item.candidateName}
                          </span>
                          {/* Stop badge — uses display number matching the timeline */}
                          <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 rounded-none px-1.5 py-0.5 shrink-0 flex items-center gap-0.5">
                            Stop #{item.displayStopNumber}
                            <ChevronRight size={9} />
                          </span>
                        </div>

                        {/* ID + phone */}
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.candidateId && (
                            <span className="text-[10px] text-gray-500 truncate">
                              ID: {item.candidateId}
                            </span>
                          )}
                          {item.candidatePhone && (
                            <span className="text-[10px] text-gray-400 flex items-center gap-0.5 truncate">
                              <Phone size={9} className="shrink-0" />
                              {item.candidatePhone}
                            </span>
                          )}
                        </div>

                        {/* Address */}
                        {item.pickupAddress && (
                          <div className="flex items-start gap-1 mt-0.5">
                            <MapPin
                              size={9}
                              className="text-gray-300 shrink-0 mt-0.5"
                            />
                            <span className="text-[10px] text-gray-400 truncate leading-tight">
                              {item.pickupAddress}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ),
            );
          })()}

          {/* Footer count */}
          {query.trim() !== "" && searchResults.length > 0 && (
            <div className="px-3 py-1.5 border-t border-gray-100 bg-gray-50/80">
              <p className="text-[10px] text-gray-400">
                {searchResults.length} result
                {searchResults.length !== 1 ? "s" : ""}
                {searchResults.length === 40 ? " (showing top 40)" : ""}
                &nbsp;·&nbsp;
                <kbd className="text-[9px] bg-gray-200 text-gray-500 rounded-none px-1 py-0.5">
                  ↑↓
                </kbd>{" "}
                navigate &nbsp;
                <kbd className="text-[9px] bg-gray-200 text-gray-500 rounded-none px-1 py-0.5">
                  Enter
                </kbd>{" "}
                select &nbsp;
                <kbd className="text-[9px] bg-gray-200 text-gray-500 rounded-none px-1 py-0.5">
                  Esc
                </kbd>{" "}
                close
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MapSearch;
