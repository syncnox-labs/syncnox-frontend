"use client";
import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

/**
 * Syncnox interface kit: the few building blocks every screen is made from.
 * Rules they carry: white surfaces, one thin gray line, square corners, no box behind icons,
 * dark ink for values and gray ink for labels, color only where it means something.
 * Use these instead of writing new boxes, so every product and template looks like one system.
 */
export const ink = {
  text: "#12211A",      // values, names: near-black with a green cast, from the brand green
  subtle: "#4A5750",    // secondary text
  muted: "#626E67",     // labels, hints
  surface: "#F3F6F4",   // the fill a block sits on; blocks have no outline
  line: "#D5DCD8",      // the few lines that remain (table head, axis)
  hairline: "#E3E8E5",  // row dividers on a surface
  track: "#DDE4E0",     // empty part of a meter
  hover: "#EAEFEC",
  brand: "#003220",     // the one accent: main action, selected item
  accent: "#0B5D3B",    // accent on white where the dark green is too heavy
  tint: "#E7F3ED",
  info: "#0C66E4",      // status only: under way
  success: "#1F845A",   // status only: done
  warning: "#B38600",
  danger: "#C9372C",
} as const;

export type Tone = "neutral" | "info" | "success" | "warning" | "danger";
const TONE: Record<Tone, string> = { neutral: ink.muted, info: ink.info, success: ink.success, warning: ink.warning, danger: ink.danger };

/** A titled white area. `action` sits at the right of the title (a link, a date picker, a button). */
export function Panel({ title, description, action, children, flush, className = "" }: {
  title?: string; description?: string; action?: ReactNode; children: ReactNode; flush?: boolean; className?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col border bg-white ${className}`} style={{ borderColor: ink.line }}>
      {(title || action) && (
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5" style={{ borderColor: ink.hairline }}>
          <div className="min-w-0">
            {title && <h2 className="m-0 text-[13px] font-medium leading-5" style={{ color: ink.text }}>{title}</h2>}
            {description && <p className="m-0 text-xs leading-4" style={{ color: ink.muted }}>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? "min-w-0" : "min-w-0 p-4"}>{children}</div>
    </section>
  );
}

/** One figure: small label, large number, optional unit and one-line hint. No icon, no badge. */
export function Stat({ label, value, unit, hint, tone }: { label: string; value: ReactNode; unit?: string; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="truncate text-xs font-medium" style={{ color: ink.muted }}>{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="truncate text-[26px] font-medium leading-8 tabular-nums tracking-[-0.01em]" style={{ color: tone ? TONE[tone] : ink.text }}>{value}</span>
        {unit && <span className="text-xs font-medium" style={{ color: ink.muted }}>{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 truncate text-xs" style={{ color: ink.muted }}>{hint}</div>}
    </div>
  );
}

/** A band of figures in one bordered strip, split by hairlines. Wraps to fewer columns on narrow screens. */
export function StatBand({ children, columns = 6, bare }: { children: ReactNode; columns?: 3 | 4 | 6; bare?: boolean }) {
  const grid = columns === 6 ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6" : columns === 4 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-3";
  return (
    <div className={`stat-band grid min-w-0 bg-white ${grid} ${bare ? "" : "border"}`} style={{ borderColor: ink.line, ["--hairline" as string]: ink.hairline } as CSSProperties}>
      {children}
    </div>
  );
}

/** Thin square bar for a share of 100. Pair it with the number; never use it alone. */
export function Meter({ percent, tone = "info", label, width }: { percent: number; tone?: Tone; label: string; width?: number | string }) {
  const value = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}
      className="h-1.5 min-w-0 flex-1" style={{ background: ink.track, width, flex: width ? "none" : undefined }}>
      <div className="h-full" style={{ width: `${value}%`, background: TONE[tone] }} />
    </div>
  );
}

/** Square initials for a person. Pass `color` to tie the person to a route color. */
export function Initials({ name, size = 28, color }: { name: string; size?: number; color?: string }) {
  const letters = String(name || "").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center font-medium leading-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), color: ink.subtle,
        background: color ? `${color}26` : "#FFFFFF", borderLeft: color ? `3px solid ${color}` : undefined }}>
      {letters}
    </span>
  );
}

/** Page header: a small gray line naming the page, then the page's main message as the headline, with the page's actions at the right. */
export function PageHeader({ kicker, title, description, actions }: { kicker?: ReactNode; title: ReactNode; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-[420px]">
        {kicker && <Eyebrow>{kicker}</Eyebrow>}
        <h1 className={`m-0 max-w-[30ch] font-medium ${kicker ? "kit-title mt-1" : "text-2xl leading-8 tracking-[-0.02em]"}`} style={{ color: ink.text }}>{title}</h1>
        {description && <p className="m-0 mt-1 text-sm" style={{ color: ink.subtle }}>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Empty state line inside a panel. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 py-6 text-center text-[13px]" style={{ color: ink.muted }}>{children}</p>;
}

/**
 * Column chart for daily or per-category totals (a total starts at zero, so columns, not a line).
 * A headline figure sits above the chart, so the gist never needs a hover; hovering or tabbing to a column adds the detail.
 * Slim square columns, three dashed guide lines with their values, the category under each column.
 */
export function Columns({ data, height = 150, valueLabel, headline, caption, highlight }: {
  data: { label: string; sub?: string; value: number; detail?: string; title?: string }[]; height?: number; valueLabel: string; headline?: ReactNode; caption?: string;
  /** Index of the one column the title is about. It is drawn in green and the others in gray. Leave out to draw all in green. */
  highlight?: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(1, ...data.map((item) => item.value));
  // Guide lines sit on round values (50, 100, 150...), never on thirds of an odd number
  const step = niceStep(peak / 3), lines = Math.max(1, Math.ceil(peak / step)), top = lines * step;
  const guides = Array.from({ length: lines }, (_, index) => (lines - index) * step);
  // Height comes from the page (--k-chart) when it sets one, so charts grow and shrink with the screen; `height` is the fallback
  const box = `var(--k-chart, ${height}px)`, plot = `calc(${box} - 44px)`;
  return (
    <div className="min-w-0">
      {(headline || caption) && (
        <div className="mb-3 flex items-baseline gap-2">
          {headline && <span className="kit-num tabular-nums" style={{ color: ink.text }}>{headline}</span>}
          {caption && <span className="text-sm" style={{ color: ink.subtle }}>{caption}</span>}
        </div>
      )}
      <div className="relative" style={{ height: box }} onMouseLeave={() => setActive(null)}>
        {/* guide lines */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0" style={{ height: plot }}>
          {guides.map((value, index) => (
            <div key={index} className="absolute inset-x-0 flex items-center gap-2" style={{ top: `${(index / lines) * 100}%`, transform: "translateY(-50%)" }}>
              <span className="w-8 shrink-0 text-right text-[11px] tabular-nums" style={{ color: ink.muted }}>{value.toLocaleString()}</span>
              <span className="h-px flex-1" style={{ backgroundImage: `linear-gradient(90deg, ${ink.line} 50%, transparent 50%)`, backgroundSize: "6px 1px" }} />
            </div>
          ))}
          <div className="absolute inset-x-0 bottom-0 ml-10 h-px" style={{ background: ink.line }} />
        </div>
        {/* columns */}
        <div className="absolute inset-y-0 left-10 right-0 flex">
          {data.map((item, index) => {
            const on = active === index, dim = active != null && !on;
            return (
              <button key={index} type="button" onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)} onBlur={() => setActive(null)}
                aria-label={`${item.title ?? item.label}: ${item.value} ${valueLabel}${item.detail ? `, ${item.detail}` : ""}`}
                className="group relative flex min-w-0 flex-1 cursor-default flex-col items-center border-0 bg-transparent p-0 outline-none">
                <span className="flex w-full items-end justify-center transition-colors" style={{ height: plot, background: on ? "rgba(9,30,66,0.04)" : "transparent" }}>
                  <span className="w-[42%] min-w-[6px] max-w-[26px] transition-[opacity,background-color] duration-150 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2"
                    style={{ height: `${Math.max(1.5, (item.value / top) * 100)}%`, background: on ? ink.brand : highlight == null || highlight === index ? "#0B5D3B" : "#BFC9C3", opacity: dim ? 0.5 : 1, outlineColor: ink.brand }} />
                </span>
                <span className="mt-2 w-full truncate text-center text-xs font-medium leading-4" style={{ color: on ? ink.text : ink.subtle }}>{item.label}</span>
                {item.sub && <span className="w-full truncate text-center text-[11px] leading-4" style={{ color: ink.muted }}>{item.sub}</span>}
                {on && (
                  <span role="tooltip" className="pointer-events-none absolute z-10 w-max max-w-[220px] px-2.5 py-2 text-left shadow-[0_4px_12px_rgba(9,30,66,0.25)]"
                    style={{ background: ink.text, bottom: `calc(52px + (${box} - 44px) * ${(Math.max(1.5, (item.value / top) * 100) / 100).toFixed(4)})`, left: "50%", transform: `translateX(${index === 0 ? "-20%" : index === data.length - 1 ? "-80%" : "-50%"})` }}>
                    <span className="block text-[11px] text-white/70">{item.title ?? item.label}</span>
                    <span className="block text-[13px] font-medium tabular-nums text-white">{item.value.toLocaleString()} {valueLabel}</span>
                    {item.detail && <span className="block text-[11px] tabular-nums text-white/70">{item.detail}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// A round step for chart guide lines: 1, 2, 2.5 or 5 times a power of ten
function niceStep(raw: number) {
  const power = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

/**
 * Action button for the top of a page. Three levels: primary (one per page), secondary, quiet.
 * 34px tall, square, with a fine inner highlight and a 1px shadow so it reads as a pressable surface; a clear focus ring.
 */
export function ActionButton({ children, icon, trailing, variant = "secondary", pressed, ...rest }: {
  children: ReactNode; icon?: ReactNode; trailing?: ReactNode; variant?: "primary" | "secondary" | "quiet"; pressed?: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button type="button" aria-pressed={pressed} {...rest}
      className={`action-button action-button-${variant} ${pressed ? "is-pressed" : ""} ${rest.className ?? ""}`}>
      {icon && <span className="inline-flex shrink-0" aria-hidden="true">{icon}</span>}
      <span className="truncate">{children}</span>
      {trailing && <span className="inline-flex shrink-0 opacity-80" aria-hidden="true">{trailing}</span>}
    </button>
  );
}

/**
 * A block of the page. No box around it: blocks are set apart by space alone, the way Apple groups content.
 * `kicker` names the subject in a few gray words. `title` states the finding in one sentence (an "action title":
 * the conclusion, not the topic), so reading the titles down the page tells the whole story. `link` is the next step.
 */
export function Card({ kicker, title, link, action, children, className = "" }: {
  kicker: string; title: ReactNode; link?: { label: string; onClick: () => void }; action?: ReactNode; children: ReactNode; className?: string;
}) {
  const about = useContext(AboutContext);
  return (
    <section className={`kit-pad flex min-w-0 flex-col ${className}`} style={{ background: ink.surface }}>
      <div className="flex items-start justify-between gap-4">
        <Eyebrow>{kicker}</Eyebrow>
        {link && <TextLink onClick={link.onClick}>{link.label}</TextLink>}
      </div>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className="m-0 flex min-w-0 max-w-[36ch] items-center kit-block-title" style={{ color: ink.text }}>
          <span className="min-w-0">{title}</span>
          {about && typeof title === "string" && <AboutButton about={about} title={title} />}
        </h2>
        {action}
      </div>
      <div className="mt-4 min-w-0 flex-1">{children}</div>
    </section>
  );
}

/** What a block is built from, in plain words, so anyone can check a number: where the data comes from, how it is worked out, and what to keep in mind. */
export type About = { source: string; how: string; note?: string };
export const AboutContext = createContext<About | null>(null);

/**
 * The small "i" beside a block's title. It opens a short panel that answers "what am I looking at?":
 * the source, the calculation and any caveat. Opens on click, closes on Escape or a click elsewhere.
 */
export function AboutButton({ about, title }: { about: About; title: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => { if (box.current && !box.current.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const row = (label: string, text: string) => (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-[0.09em]" style={{ color: ink.muted }}>{label}</dt>
      <dd className="m-0 mt-1 text-[13px] leading-[19px]" style={{ color: ink.text }}>{text}</dd>
    </div>
  );
  return (
    <span ref={box} className="relative inline-flex align-middle">
      <button type="button" aria-label={`About ${title}: where it comes from and how it is worked out`} aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="ml-1.5 inline-flex h-5 w-5 cursor-pointer items-center justify-center border-0 bg-transparent p-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]"
        style={{ color: open ? ink.text : ink.muted }}>
        <svg aria-hidden="true" width="15" height="15" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.1" /><path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" /><rect x="7.3" y="4.4" width="1.4" height="1.4" fill="currentColor" /></svg>
      </button>
      {open && (
        <div role="dialog" aria-label={`About ${title}`} className="absolute left-0 top-7 z-30 w-[320px] max-w-[80vw] border bg-white p-4 text-left shadow-[0_8px_24px_rgba(18,33,26,0.16)]" style={{ borderColor: ink.line }}>
          <dl className="m-0 flex flex-col gap-3.5 font-normal tracking-normal">
            {row("Where it comes from", about.source)}
            {row("How it is worked out", about.how)}
            {about.note && row("Keep in mind", about.note)}
          </dl>
        </div>
      )}
    </span>
  );
}

/** Small uppercase label above a title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="m-0 min-w-0 text-[11px] font-medium uppercase leading-4 tracking-[0.09em]" style={{ color: ink.muted }}>{children}</p>;
}

/** A text link: dark, underlined, with a small chevron. Color is kept for the one main action, so links are not green. */
export function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="group inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium leading-4 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5D3B]" style={{ color: ink.text }}>
      <span className="underline decoration-[#9AA8A0] underline-offset-4 group-hover:decoration-[#12211A]">{children}</span>
      <svg aria-hidden="true" width="7" height="11" viewBox="0 0 7 11" className="transition-transform group-hover:translate-x-0.5"><path d="M1 1l4.5 4.5L1 10" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </button>
  );
}

/** One key figure with no box and no icon: the number, what it counts, and at most one line of context. */
export function Figure({ value, label, note, onClick }: { value: ReactNode; label: string; note?: string; onClick?: () => void }) {
  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <span className="kit-figure mt-2.5 block tabular-nums" style={{ color: ink.text }}>{value}</span>
      <span className="mt-1 block min-h-4 text-xs leading-4" style={{ color: ink.subtle }}>{note}</span>
    </>
  );
  const box = "kit-pad-tile flex min-w-0 flex-col items-start text-left";
  return onClick
    ? <button type="button" onClick={onClick} className={`${box} cursor-pointer border-0 font-[inherit] transition-colors hover:!bg-[#EAEFEC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]`} style={{ background: ink.surface }}>{body}</button>
    : <div className={box} style={{ background: ink.surface }}>{body}</div>;
}

/** One headline figure in a small card: a bare icon, "9 active routes" in bold, and one gray line under it. */
export function IconStat({ icon, value, noun, hint, onClick }: { icon: ReactNode; value: ReactNode; noun: string; hint: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="mt-0.5 shrink-0" style={{ color: ink.subtle }} aria-hidden="true">{icon}</span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-base font-medium leading-5" style={{ color: ink.text }}><span className="tabular-nums">{value}</span> {noun}</span>
        <span className="mt-1 block truncate text-sm leading-5" style={{ color: ink.subtle }}>{hint}</span>
      </span>
    </>
  );
  const box = "flex min-w-0 items-start gap-3 border bg-white px-5 py-4";
  return onClick
    ? <button type="button" onClick={onClick} className={`${box} cursor-pointer font-[inherit] transition-colors hover:bg-[#F7F8F9]`} style={{ borderColor: ink.line }}>{body}</button>
    : <div className={box} style={{ borderColor: ink.line }}>{body}</div>;
}

/** Ring chart for a share of a whole, total in the middle, legend with every count beside it. Two to five segments. */
export function Donut({ segments, totalLabel, size = 132 }: { segments: { label: string; value: number; color: string }[]; totalLabel: string; size?: number }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const stroke = 12, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius, gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-x-10 gap-y-5">
      <div className="relative shrink-0" style={{ width: `var(--k-donut, ${size}px)`, height: `var(--k-donut, ${size}px)` }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img"
          aria-label={segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={ink.hairline} strokeWidth={stroke} />
          {total > 0 && segments.filter((segment) => segment.value > 0).map((segment) => {
            const length = (segment.value / total) * circumference;
            const arc = <circle key={segment.label} cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={segment.color} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`} strokeDashoffset={-offset} />;
            offset += length;
            return arc;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="kit-num tabular-nums" style={{ color: ink.text }}>{total.toLocaleString()}</span>
          <span className="text-xs" style={{ color: ink.subtle }}>{totalLabel}</span>
        </div>
      </div>
      <ul className="m-0 flex min-w-[160px] flex-1 list-none flex-col gap-3 p-0">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2.5 text-sm">
            <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0" style={{ background: segment.color }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: ink.text }}>{segment.label}</span>
            <span className="font-medium tabular-nums" style={{ color: ink.text }}>{segment.value.toLocaleString()}</span>
            <span className="w-10 text-right tabular-nums" style={{ color: ink.muted }}>{total > 0 ? Math.round((segment.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Trend line with a comparison line. `current` is drawn solid in green, `previous` dashed in gray, both on one axis
 * that starts at zero. Moving the pointer (or the arrow keys, when focused) shows a crosshair and both values for that point.
 */
export function TrendLine({ current, previous, labels, titles, height = 156, valueLabel, currentName, previousName }: {
  current: number[]; previous?: number[]; labels: string[]; titles?: string[]; height?: number; valueLabel: string; currentName: string; previousName?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const count = current.length;
  const peak = Math.max(1, ...current, ...(previous || []));
  const step = niceStep(peak / 3), lines = Math.max(1, Math.ceil(peak / step)), top = lines * step;
  const box = `var(--k-chart, ${height}px)`, plot = `calc(${box} - 28px)`;
  const x = (index: number) => (count <= 1 ? 50 : (index / (count - 1)) * 100);
  const y = (value: number) => 100 - (value / top) * 100;
  const path = (values: number[]) => values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)},${y(value).toFixed(2)}`).join(" ");
  const every = Math.max(1, Math.ceil(count / 7));
  const pick = (clientX: number, box: DOMRect) => setActive(Math.max(0, Math.min(count - 1, Math.round(((clientX - box.left) / box.width) * (count - 1)))));
  if (count === 0) return null;
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs" style={{ color: ink.subtle }}>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block h-0.5 w-4" style={{ background: "#2A8361" }} />{currentName}</span>
        {previous && previousName && <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "#8590A2" }} />{previousName}</span>}
      </div>
      <div className="relative flex" style={{ height: box }}>
        <div aria-hidden="true" className="relative w-8 shrink-0" style={{ height: plot }}>
          {Array.from({ length: lines + 1 }, (_, index) => (
            <span key={index} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums" style={{ top: `${(index / lines) * 100}%`, color: ink.muted }}>{((lines - index) * step).toLocaleString()}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <div tabIndex={0} role="img" aria-label={`${currentName}: ${current.map((value, index) => `${titles?.[index] ?? labels[index]} ${value}`).join(", ")}`}
            className="relative cursor-crosshair outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2A8361]" style={{ height: plot }}
            onMouseMove={(event) => pick(event.clientX, event.currentTarget.getBoundingClientRect())} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); setActive((value) => Math.min(count - 1, (value ?? -1) + 1)); }
              if (event.key === "ArrowLeft") { event.preventDefault(); setActive((value) => Math.max(0, (value ?? count) - 1)); }
              if (event.key === "Escape") setActive(null);
            }}>
            {Array.from({ length: lines + 1 }, (_, index) => (
              <span key={index} aria-hidden="true" className="absolute inset-x-0 h-px" style={{ top: `${(index / lines) * 100}%`,
                ...(index === lines ? { background: ink.line } : { backgroundImage: `linear-gradient(90deg, ${ink.line} 50%, transparent 50%)`, backgroundSize: "6px 1px" }) }} />
            ))}
            <svg aria-hidden="true" className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d={`${path(current)} L${x(count - 1)},100 L${x(0)},100 Z`} fill="#2A8361" opacity="0.07" />
              {previous && <path d={path(previous)} fill="none" stroke="#8590A2" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
              <path d={path(current)} fill="none" stroke="#2A8361" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            {active != null && (
              <>
                <span aria-hidden="true" className="absolute inset-y-0 w-px" style={{ left: `${x(active)}%`, background: "#8590A2" }} />
                {previous && <span aria-hidden="true" className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${x(active)}%`, top: `${y(previous[active] ?? 0)}%`, background: "#8590A2" }} />}
                <span aria-hidden="true" className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `${x(active)}%`, top: `${y(current[active])}%`, background: "#0B5D3B" }} />
                <span role="tooltip" className="pointer-events-none absolute top-0 z-10 w-max max-w-[240px] px-2.5 py-2 shadow-[0_4px_12px_rgba(9,30,66,0.25)]"
                  style={{ background: ink.text, left: `${x(active)}%`, transform: `translateX(${x(active) > 60 ? "calc(-100% - 10px)" : "10px"})` }}>
                  <span className="block text-[11px] text-white/70">{titles?.[active] ?? labels[active]}</span>
                  <span className="block text-[13px] font-medium tabular-nums text-white">{current[active].toLocaleString()} {valueLabel}</span>
                  {previous && <span className="block text-[11px] tabular-nums text-white/70">{(previous[active] ?? 0).toLocaleString()} in the previous period</span>}
                </span>
              </>
            )}
          </div>
          <div aria-hidden="true" className="relative mt-2 h-4">
            {labels.map((label, index) => (index % every === 0 || index === count - 1) && (index === count - 1 || count - 1 - index >= every * 0.6) ? (
              <span key={index} className="absolute whitespace-nowrap text-[11px]" style={{ left: `${x(index)}%`, color: ink.muted, transform: `translateX(${index === 0 ? "0" : index === count - 1 ? "-100%" : "-50%"})` }}>{label}</span>
            ) : null)}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Parts of a whole as one bar, with a legend that gives each part's count and share. For two to five parts. */
export function ShareBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  return (
    <div className="min-w-0">
      <div className="flex h-3 w-full gap-[2px]" role="img" aria-label={segments.map((segment) => `${segment.label} ${segment.value}`).join(", ")}>
        {total === 0 ? <div className="h-full w-full" style={{ background: ink.track }} />
          : segments.filter((segment) => segment.value > 0).map((segment) => (
            <div key={segment.label} className="h-full" title={`${segment.label}: ${segment.value}`} style={{ background: segment.color, width: `${(segment.value / total) * 100}%`, minWidth: 3 }} />
          ))}
      </div>
      <ul className="m-0 mt-4 grid list-none grid-cols-1 gap-x-8 gap-y-2.5 p-0 sm:grid-cols-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2.5 text-sm">
            <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0" style={{ background: segment.color }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: ink.text }}>{segment.label}</span>
            <span className="font-medium tabular-nums" style={{ color: ink.text }}>{segment.value.toLocaleString()}</span>
            <span className="w-10 text-right tabular-nums" style={{ color: ink.muted }}>{total > 0 ? Math.round((segment.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A ranked list drawn as horizontal bars: name, bar, value, and an optional second figure. Longest bar is the largest value. */
export function RankBars({ rows, valueLabel, noteLabel }: { rows: { name: string; value: number; note?: string; lead?: ReactNode }[]; valueLabel: string; noteLabel?: string }) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3 border-b-2 pb-2 text-xs font-medium" style={{ color: ink.muted, borderColor: ink.line }}>
        <span className="min-w-0 flex-1">Name</span><span className="w-[38%]">{valueLabel}</span>{noteLabel && <span className="w-16 text-right">{noteLabel}</span>}
      </div>
      {rows.map((row, index) => (
        <div key={index} className="flex items-center gap-3 border-b py-2 last:border-0" style={{ borderColor: ink.hairline }}>
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm" style={{ color: ink.text }}>{row.lead}<span className="truncate">{row.name}</span></span>
          <span className="flex w-[38%] shrink-0 items-center gap-2">
            <span className="h-2 min-w-[2px]" style={{ width: `${(row.value / peak) * 100}%`, background: "#0B5D3B", maxWidth: "calc(100% - 34px)" }} aria-hidden="true" />
            <span className="text-sm font-medium tabular-nums" style={{ color: ink.text }}>{row.value.toLocaleString()}</span>
          </span>
          {noteLabel && <span className="w-16 shrink-0 text-right text-sm tabular-nums" style={{ color: ink.subtle }}>{row.note}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * Calendar grid: one square per day, weeks as columns, darker green for a higher value. Five steps of one green,
 * with the scale shown underneath. Hover or focus a day for its exact value.
 */
export function CalendarHeat({ days, valueLabel }: { days: { date: string; title: string; value: number }[]; valueLabel: string }) {
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(0, ...days.map((day) => day.value));
  const steps = ["#EBECF0", "#C7E4D5", "#8CCBAB", "#3F9C74", "#0B5D3B"];
  const level = (value: number) => (value <= 0 || peak === 0 ? 0 : Math.min(4, 1 + Math.floor((value / peak) * 3.999)));
  const weeks: (typeof days[number] & { index: number })[][] = [];
  days.forEach((day, index) => { if (index % 7 === 0) weeks.push([]); weeks[weeks.length - 1].push({ ...day, index }); });
  return (
    <div className="min-w-0">
      <p className="m-0 mb-3 min-h-5 text-sm tabular-nums" style={{ color: ink.subtle }} aria-live="polite">
        {active != null ? <><span className="font-medium" style={{ color: ink.text }}>{days[active].title}</span> · {days[active].value.toLocaleString()} {valueLabel}</> : <>Each square is one day.</>}
      </p>
      <div className="flex gap-3">
        <div aria-hidden="true" className="grid shrink-0 grid-rows-7 gap-1 text-[11px]" style={{ color: ink.muted }}>
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((label, index) => <span key={index} className="flex h-5 items-center">{label}</span>)}
        </div>
        <div className="flex min-w-0 flex-1 gap-1" onMouseLeave={() => setActive(null)}>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid min-w-0 flex-1 grid-rows-7 gap-1">
              {week.map((day) => (
                <button key={day.date} type="button" aria-label={`${day.title}: ${day.value} ${valueLabel}`}
                  onMouseEnter={() => setActive(day.index)} onFocus={() => setActive(day.index)} onBlur={() => setActive(null)}
                  className="h-5 w-full cursor-default border-0 p-0 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#172B4D]"
                  style={{ background: steps[level(day.value)], boxShadow: active === day.index ? `inset 0 0 0 2px ${ink.text}` : undefined }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px]" style={{ color: ink.muted }}>
        <span>0</span>{steps.map((color) => <span key={color} aria-hidden="true" className="inline-block h-3 w-3" style={{ background: color }} />)}<span className="tabular-nums">{peak.toLocaleString()}</span>
      </div>
    </div>
  );
}

/** Small switch between two to four views of the same card (for example Stops and Routes). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 border" style={{ borderColor: ink.line }}>
      {options.map((option, index) => (
        <button key={option.value} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
          className={`h-7 cursor-pointer border-0 px-2.5 text-xs font-medium outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#2A8361] ${index > 0 ? "border-l" : ""}`}
          style={{ borderColor: ink.line, background: option.value === value ? ink.brand : "#fff", color: option.value === value ? "#fff" : ink.subtle }}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
