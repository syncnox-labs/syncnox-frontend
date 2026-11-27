"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import dayjs from "dayjs";

export interface ShareDriverOption {
  id: number;
  name: string;
  trips: number;
  stops: number;
  firstStart: string | null;
}

/**
 * Choose who receives the plan. Everyone is selected by default, so the common
 * case is one click; a dispatcher can untick people or share a single person.
 */
export default function ShareDriversModal({ open, drivers, lastSharedAt, sharing, onCancel, onShare }: {
  open: boolean;
  drivers: ShareDriverOption[];
  lastSharedAt?: string | null;
  sharing: boolean;
  onCancel: () => void;
  onShare: (driverIds: number[], everyone: boolean) => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(drivers.map(driver => driver.id)));
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) { setSelected(new Set(drivers.map(driver => driver.id))); setQuery(""); }
  }, [open, drivers]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? drivers.filter(driver => driver.name.toLowerCase().includes(term)) : drivers;
  }, [drivers, query]);
  const allSelected = drivers.length > 0 && selected.size === drivers.length;
  const allVisibleSelected = visible.length > 0 && visible.every(driver => selected.has(driver.id));
  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleVisible = () => setSelected(current => {
    const next = new Set(current);
    visible.forEach(driver => { if (allVisibleSelected) next.delete(driver.id); else next.add(driver.id); });
    return next;
  });
  const count = selected.size;

  return (
    <Modal open={open} onCancel={onCancel} width={520} rootClassName="lang" destroyOnHidden
      title="Share routes"
      okText={allSelected ? `Share with everyone (${count})` : `Share with ${count} ${count === 1 ? "person" : "people"}`}
      okButtonProps={{ disabled: count === 0, loading: sharing }}
      cancelText="Cancel"
      onOk={() => onShare(drivers.filter(driver => selected.has(driver.id)).map(driver => driver.id), allSelected)}>
      <p className="m-0 mb-3 text-[13px] text-[#4A5750]">
        Each person gets their own trips in the driver app.
        {lastSharedAt ? ` This plan was last shared ${dayjs(lastSharedAt).format("ddd, MMM D [at] h:mm A")}.` : " This plan has not been shared yet."}
      </p>
      <div className="flex items-center gap-3 border-b border-[#E3E8E5] pb-2">
        <label className="flex items-center gap-2 text-[13px] text-[#12211A] cursor-pointer">
          <input type="checkbox" className="h-4 w-4 accent-[#003220]" checked={allVisibleSelected}
            ref={element => { if (element) element.indeterminate = !allVisibleSelected && visible.some(driver => selected.has(driver.id)); }}
            onChange={toggleVisible} aria-label={query ? "Select everyone shown" : "Select everyone"} />
          {query ? "Everyone shown" : "Everyone"}
        </label>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search team"
          aria-label="Search team"
          className="ml-auto h-8 w-44 border-0 bg-[#F3F6F4] px-2 text-[13px] text-[#12211A] outline-none focus:bg-white focus:outline focus:outline-1 focus:outline-[#0B5D3B]" />
      </div>
      <ul className="m-0 max-h-[340px] list-none overflow-y-auto p-0" aria-label="People on this plan">
        {visible.map(driver => (
          <li key={driver.id} className="border-b border-[#E3E8E5] last:border-b-0">
            <label className="flex cursor-pointer items-center gap-3 py-2.5 hover:bg-[#F8FAF9]">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#003220]" checked={selected.has(driver.id)} onChange={() => toggle(driver.id)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-[#12211A]">{driver.name}</span>
                <span className="block text-[12px] text-[#626E67] tabular-nums">
                  {driver.trips} {driver.trips === 1 ? "trip" : "trips"} · {driver.stops} {driver.stops === 1 ? "stop" : "stops"}
                  {driver.firstStart ? ` · starts ${dayjs(driver.firstStart).format("ddd h:mm A")}` : ""}
                </span>
              </span>
            </label>
          </li>
        ))}
        {!visible.length && <li className="py-6 text-center text-[13px] text-[#626E67]">Nobody matches this search.</li>}
      </ul>
      <p className="m-0 mt-3 text-[12px] text-[#626E67]">
        People without stops on this plan are not listed. Trips with open issues are skipped and listed after sharing.
      </p>
    </Modal>
  );
}
