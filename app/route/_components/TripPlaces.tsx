/**
 * Where a trip starts and where it ends, as two separate lines that cannot be read as one address.
 * A filled dot marks the pickup and a hollow dot the drop-off, joined by a line. In each address the street
 * (the part before the first comma) is dark and the rest (city, postal code, country) is grey.
 */
export function splitAddress(address?: string | null): { main: string; rest: string } {
  const text = (address || "").trim();
  const comma = text.indexOf(",");
  return comma < 0 ? { main: text, rest: "" } : { main: text.slice(0, comma).trim(), rest: text.slice(comma + 1).trim() };
}

export default function TripPlaces({ from, to, labels = false, wrap = false, className = "" }: {
  from?: string | null;
  to?: string | null;
  /** Show the words "Pickup" and "Drop-off" before each address. */
  labels?: boolean;
  /** Let a long address take a second line instead of being cut. */
  wrap?: boolean;
  className?: string;
}) {
  if (!from && !to) return null;
  const rows = [
    { key: "from", word: "Pickup", address: from, missing: "Pickup not set", last: !to },
    ...(to ? [{ key: "to", word: "Drop-off", address: to, missing: "", last: true }] : []),
  ];
  return (
    <div className={`text-xs leading-4 ${className}`}>
      {rows.map((row, index) => {
        const { main, rest } = splitAddress(row.address);
        return (
          <div key={row.key} className="flex items-stretch gap-2">
            {/* The rail: dot, and a line down to the next dot */}
            <div className="flex w-2.5 shrink-0 flex-col items-center" aria-hidden="true">
              <span className={`mt-[4px] h-2 w-2 shrink-0 rounded-full border border-solid border-[#4A5750] ${index === 0 ? "bg-[#4A5750]" : "bg-white"}`} style={{ borderRadius: 9999 }} />
              {!row.last && <span className="mt-0.5 w-px flex-1 bg-[#B4BEB8]" />}
            </div>
            <div className={`min-w-0 flex-1 ${row.last ? "" : "pb-1.5"} ${wrap ? "" : "truncate"}`} title={row.address || undefined}>
              {labels && <span className="mr-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#626E67]">{row.word}</span>}
              <span className="sr-only">{labels ? "" : `${row.word}: `}</span>
              <span className="font-medium text-[#12211A]">{main || row.missing || "Not set"}</span>
              {rest && <span className="text-[#626E67]">{wrap ? <><br />{rest}</> : <> · {rest}</>}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
