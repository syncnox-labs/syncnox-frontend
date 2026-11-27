import { ChevronDown, ChevronUp, Equal } from "lucide-react";
import { CheckCircle, Circle, CircleDashed, CircleHalf, CircleNotch, WarningCircle, XCircle } from "@phosphor-icons/react/ssr";

// Status cell in the manner of the Atlassian Design System:
// a status is a lozenge (a compact sentence-case label on a tint with a thin border), a priority is an arrow icon plus its name.
type Tone = "neutral" | "progress" | "success" | "moved" | "removed" | "new";

const LOZENGE: Record<Tone, string> = {
  neutral: "bg-[#F1F2F4] border-[#B3B9C4] text-[#172B4D]",
  progress: "bg-[#E9F2FF] border-[#85B8FF] text-[#09326C]",
  success: "bg-[#DCFFF1] border-[#7EE2B8] text-[#164B35]",
  moved: "bg-[#FFF7D6] border-[#F5CD47] text-[#533F04]",
  removed: "bg-[#FFECEB] border-[#FD9891] text-[#5D1F1A]",
  new: "bg-[#F3F0FF] border-[#B8ACF6] text-[#352C63]",
};

// Existing style maps describe a status with Tailwind color classes; the tone is read from them
// so every caller keeps working without changes.
const toneFromStyle = (style: string): Tone => {
  if (/\b(bg|text)-(red|rose)-/.test(style)) return "removed";
  if (/\b(bg|text)-(yellow|amber|orange)-/.test(style)) return "moved";
  if (/\b(bg|text)-(green|emerald|teal)-/.test(style)) return "success";
  if (/\b(bg|text)-(blue|sky|indigo|cyan)-/.test(style)) return "progress";
  if (/\b(bg|text)-(purple|violet)-/.test(style)) return "new";
  return "neutral";
};

// One rule for every workflow status, as Jira does it: gray has not started, blue is under way, green is done, red went wrong.
// One icon family for jobs and routes, a circle that fills as the work moves on: dashed (draft), outline (planned), half (under way), full check (done).
// The icon carries the same meaning as the color, so the status never depends on color alone. Only "done" and "failed" are filled.
type PhosphorIcon = React.ComponentType<{ size?: number; weight?: "light" | "regular" | "bold" | "fill"; className?: string }>;
const STATUS: Record<string, { tone: Tone; icon: PhosphorIcon; fill?: boolean }> = {
  draft: { tone: "neutral", icon: CircleDashed },
  processing: { tone: "neutral", icon: CircleNotch },
  scheduled: { tone: "progress", icon: Circle },
  // Owner choice (2026-11-25): a job on a trip is green; the circle fills as it moves on (outline, half, check).
  assigned: { tone: "success", icon: Circle },
  // Not placed on any trip yet: the same circle, dashed (not placed) and red (needs action).
  // Red outline only; "Failed" keeps the filled red mark and box, so the two never look alike.
  unassigned: { tone: "removed", icon: CircleDashed },
  in_progress: { tone: "success", icon: CircleHalf },
  in_transit: { tone: "success", icon: CircleHalf },
  completed: { tone: "success", icon: CheckCircle, fill: true },
  cancelled: { tone: "neutral", icon: XCircle },
  failed: { tone: "removed", icon: WarningCircle, fill: true },
};

// A status is a colored icon and a plain word, with no box behind it, the same way the Priority column works.
// Rows then line up on the left and no label has a width to mismatch. "Failed" alone keeps a red box, because it must not be missed.
const INK: Record<Tone, string> = {
  neutral: "#626F86", progress: "#0C66E4", success: "#1F845A", moved: "#B38600", removed: "#C9372C", new: "#6E5DC6",
};

export const StatusLozenge = ({ value, tone, label }: { value: string; tone?: Tone; label?: string }) => {
  const key = String(value ?? "").toLowerCase();
  const known = STATUS[key];
  const Icon = known?.icon;
  const ink = INK[known?.tone ?? tone ?? "neutral"];
  const mark = Icon
    ? <span className="inline-flex shrink-0" style={{ color: ink }}><Icon size={16} weight={known.fill ? "fill" : "regular"} aria-hidden="true" /></span>
    : <span className="mx-1 inline-block h-2 w-2 shrink-0" style={{ background: ink }} aria-hidden="true" />;
  if (key === "failed") {
    return (
      <span className={`inline-flex h-[22px] max-w-[200px] items-center gap-1.5 truncate rounded-none border pl-1 pr-2 text-[13px] font-medium leading-none ${LOZENGE.removed}`}>
        {mark}{label ?? words(value)}
      </span>
    );
  }
  return (
    // The word takes its icon's colour (owner choice), so status reads as one unit.
    <span className="inline-flex max-w-[200px] items-center gap-1.5 truncate text-[13px] font-normal leading-none" style={{ color: ink }}>
      {mark}{label ?? words(value)}
    </span>
  );
};

const PRIORITY: Record<string, { icon: typeof ChevronUp; color: string }> = {
  high: { icon: ChevronUp, color: "#C9372C" },
  medium: { icon: Equal, color: "#E2B203" },
  low: { icon: ChevronDown, color: "#1D7AFC" },
};

// Sentence case, as Atlassian writes labels: "In transit", not "IN TRANSIT" or "In Transit"
const words = (value: string) => {
  const text = String(value ?? "").split("_").join(" ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const StatusBadge = ({
  value,
  styleMap,
}: {
  value: string;
  styleMap: Record<string, string>;
}) => {
  const key = String(value ?? "").toLowerCase();
  const isPriority = "low" in styleMap && "medium" in styleMap && "high" in styleMap;
  if (isPriority && PRIORITY[key]) {
    const { icon: Icon, color } = PRIORITY[key];
    return (
      <div className="flex h-full w-full items-center justify-start gap-1.5 text-[13px] text-[#172B4D]">
        <Icon size={16} strokeWidth={2.5} color={color} aria-hidden="true" />
        {words(value)}
      </div>
    );
  }
  const tone = toneFromStyle(styleMap[value] || styleMap.default || "");
  return (
    <div className="flex h-full w-full items-center justify-start">
      <StatusLozenge value={value} tone={tone} />
    </div>
  );
};

export default StatusBadge;
