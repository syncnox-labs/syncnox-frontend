"use client";

import { useEffect, useState } from "react";
import { Check, Route } from "lucide-react";

/**
 * One progress view for every optimization: building a plan, re-optimizing a trip, saving an order.
 * Ticks follow real events only (request accepted, result received). While the optimizer works, a line
 * underneath names what it is weighing, using the plan's own numbers, so the screen is never static
 * without claiming progress it cannot see.
 */
export default function OptimizationProgress({ title, context, accepted, queued, done, activities, note }: {
  title: string;
  /** Who and what, e.g. "14 jobs · Nareg Djabourian · keep stop order". */
  context?: string;
  /** The server has accepted the request. */
  accepted: boolean;
  /** The server says it is waiting for a free optimizer. */
  queued?: boolean;
  /** The result has arrived. */
  done: boolean;
  /** What the optimizer weighs, in plain words with real numbers. Cycled while working. */
  activities: string[];
  note?: string;
}) {
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [savedAt, setSavedAt] = useState<number | null>(null);
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [done]);
  // When the result lands, tick "working" first and "saving" a moment later, so each step is seen.
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => setSavedAt(Date.now()), 450);
    return () => clearTimeout(timer);
  }, [done]);
  const savedShown = done && savedAt !== null;

  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const list = activities.filter(Boolean);
  const activity = list.length ? list[Math.floor(seconds / 4) % list.length] : null;

  const steps: { key: string; label: string; state: "done" | "active" | "waiting"; detail?: string | null }[] = [
    { key: "sent", label: accepted || done ? "Request accepted" : "Sending the request", state: accepted || done ? "done" : "active" },
    {
      key: "work", label: queued && !done ? "Waiting for a free optimizer" : "Working out the routes",
      state: done ? "done" : "active",
      detail: !done && !queued ? activity : null,
    },
    { key: "save", label: "Saving and updating the plan", state: savedShown ? "done" : done ? "active" : "waiting" },
  ];

  return (
    <div className="lang flex flex-col gap-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center">
          {!savedShown && <span className="absolute inset-0 animate-spin rounded-full border-2 border-[#E3E8E5] border-t-[#0B5D3B]" />}
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-white ${savedShown ? "bg-[#1F845A]" : "bg-[#003220]"}`}>
            {savedShown ? <Check size={15} /> : <Route size={15} />}
          </span>
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-[#12211A]">{savedShown ? "Done" : title}</div>
          <div className="text-[12px] text-[#4A5750] tabular-nums">
            {savedShown ? "Opening the result…" : `${clock}${context ? ` · ${context}` : ""}`}
          </div>
        </div>
      </div>
      <ol className="m-0 list-none border-t border-[#E3E8E5] p-0 text-[13px]">
        {steps.map(step => (
          <li key={step.key} className="flex items-start gap-2.5 border-b border-[#E3E8E5] py-2">
            <span aria-hidden="true" className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors ${
              step.state === "done" ? "bg-[#1F845A] text-white" : step.state === "active" ? "border-2 border-[#0B5D3B]" : "border border-[#C4CCC7]"}`}>
              {step.state === "done" && <Check size={10} />}
              {step.state === "active" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#0B5D3B]" />}
            </span>
            <span className="min-w-0">
              <span className={`block ${step.state === "done" ? "text-[#4A5750]" : step.state === "active" ? "font-medium text-[#12211A]" : "text-[#626E67]"}`}>{step.label}</span>
              {step.detail && <span key={step.detail} className="mt-0.5 block text-[12px] text-[#4A5750] animate-in fade-in duration-500">{step.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {note && <p className="m-0 text-[12px] text-[#626E67]">{note}</p>}
    </div>
  );
}
