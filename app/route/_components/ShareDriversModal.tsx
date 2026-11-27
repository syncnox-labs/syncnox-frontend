"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "antd";
import dayjs from "dayjs";
import { Send, Smartphone, MessageCircle, Users, ChevronDown, Info, Lock } from "lucide-react";
import DialogTitle from "@/components/ui/DialogTitle";

export interface ShareDriverOption {
  id: number;
  name: string;
  trips: number;
  stops: number;
  firstStart: string | null;
}

/**
 * Share the plan. Three questions, in the order a dispatcher thinks of them:
 *  1. Who gets it      everyone by default (one click), or a few people.
 *  2. How it reaches   the driver app always; passenger WhatsApp confirmations as a follow-up step,
 *                      only where the account has WhatsApp messaging switched on.
 *  3. Go               the button says exactly what will happen.
 * Only channels the back end can send today are shown. SMS and email are not offered until they exist.
 */
export default function ShareDriversModal({ open, drivers, lastSharedAt, sharing, whatsApp = false, onCancel, onShare, onWhatsAppOnly }: {
  open: boolean;
  drivers: ShareDriverOption[];
  lastSharedAt?: string | null;
  sharing: boolean;
  /** The account can send passenger confirmations on WhatsApp (worker shuttle with messaging on). */
  whatsApp?: boolean;
  onCancel: () => void;
  onShare: (driverIds: number[], everyone: boolean, thenWhatsApp: boolean) => void;
  /** Open the WhatsApp confirmations for the version drivers already have, without sharing again. */
  onWhatsAppOnly?: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(drivers.map(driver => driver.id)));
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [thenWhatsApp, setThenWhatsApp] = useState(false);
  useEffect(() => {
    if (open) { setSelected(new Set(drivers.map(driver => driver.id))); setQuery(""); setChoosing(false); setThenWhatsApp(false); }
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
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  const okText = count === 0 ? "Choose who gets it"
    : `${allSelected ? `Share with everyone (${count})` : `Share with ${people(count)}`}${thenWhatsApp ? ", then WhatsApp" : ""}`;

  return (
    <Modal open={open} onCancel={onCancel} width={540} rootClassName="lang" destroyOnHidden centered
      title={<DialogTitle icon={<Send />} title="Share the plan"
        subtitle={lastSharedAt ? `Drivers have the version from ${dayjs(lastSharedAt).format("ddd, MMM D [at] h:mm A")}.` : "Drivers have not received this plan yet."} />}
      okText={okText}
      okButtonProps={{ disabled: count === 0, loading: sharing }}
      cancelText="Cancel"
      onOk={() => onShare(drivers.filter(driver => selected.has(driver.id)).map(driver => driver.id), allSelected, thenWhatsApp)}>
      <div className="flex flex-col gap-4 pt-2">

        {/* 1. Who */}
        <section aria-label="Who gets it">
          <h3 className="m-0 mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">Who gets it</h3>
          <button type="button" onClick={() => setChoosing(value => !value)} aria-expanded={choosing}
            className="flex w-full cursor-pointer items-center gap-3 border border-[#D5DCD8] bg-white px-3.5 py-3 text-left hover:border-[#9AA59F]">
            <Users size={20} aria-hidden="true" className="shrink-0 text-[#0B5D3B]" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-[#12211A]">{allSelected ? "Everyone on this plan" : `${people(count)} chosen`}</span>
              <span className="block text-[12.5px] text-[#4A5750]">{allSelected ? `${people(drivers.length)} with trips` : `of ${people(drivers.length)} with trips`}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[13px] font-medium text-[#12211A]">
              {choosing ? "Done" : "Choose people"}
              <ChevronDown size={14} aria-hidden="true" className={choosing ? "rotate-180" : ""} />
            </span>
          </button>
          {choosing && <div className="border border-t-0 border-[#D5DCD8] px-3.5 pb-1">
            <div className="flex items-center gap-3 border-b border-[#E3E8E5] py-2">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#12211A]">
                <input type="checkbox" className="h-4 w-4 accent-[#003220]" checked={allVisibleSelected}
                  ref={element => { if (element) element.indeterminate = !allVisibleSelected && visible.some(driver => selected.has(driver.id)); }}
                  onChange={toggleVisible} aria-label={query ? "Select everyone shown" : "Select everyone"} />
                {query ? "Everyone shown" : "Everyone"}
              </label>
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search people" aria-label="Search people"
                className="ml-auto h-8 w-44 border-0 bg-[#F3F6F4] px-2 text-[13px] text-[#12211A] outline-none focus:bg-white focus:outline focus:outline-1 focus:outline-[#0B5D3B]" />
            </div>
            <ul className="m-0 max-h-[260px] list-none overflow-y-auto p-0" aria-label="People on this plan">
              {visible.map(driver => (
                <li key={driver.id} className="border-b border-[#E3E8E5] last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-3 py-2 hover:bg-[#F8FAF9]">
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
              {!visible.length && <li className="py-5 text-center text-[13px] text-[#626E67]">Nobody matches this search.</li>}
            </ul>
          </div>}
        </section>

        {/* 2. How it reaches them */}
        <section aria-label="How it reaches them">
          <h3 className="m-0 mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">How it reaches them</h3>
          <div className="flex flex-col border border-[#D5DCD8]">
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Smartphone size={20} aria-hidden="true" className="mt-px shrink-0 text-[#0B5D3B]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-[#12211A]">Driver app</span>
                <span className="block text-[12.5px] leading-snug text-[#4A5750]">Each person sees only their own trips. Phones that are online update right away.</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 text-[12px] text-[#626E67]" title="Sharing always updates the driver app">
                <Lock size={13} aria-hidden="true" /> Always
              </span>
            </div>
            {whatsApp && <label className={`flex cursor-pointer items-start gap-3 border-t border-[#E3E8E5] px-3.5 py-3 ${thenWhatsApp ? "bg-[#F1F8F4]" : "hover:bg-[#F8FAF9]"}`}>
              <MessageCircle size={20} aria-hidden="true" className="mt-px shrink-0 text-[#1F845A]" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-[#12211A]">WhatsApp to passengers</span>
                <span className="block text-[12.5px] leading-snug text-[#4A5750]">Pickup time and place, in each passenger&apos;s language. You check every message before it is sent.</span>
              </span>
              <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#003220]" checked={thenWhatsApp}
                onChange={event => setThenWhatsApp(event.target.checked)} aria-label="Then send WhatsApp confirmations to passengers" />
            </label>}
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#626E67]">
          <span className="inline-flex items-center gap-1.5"><Info size={13} aria-hidden="true" />Trips with open issues are skipped and listed after sharing.</span>
          {whatsApp && onWhatsAppOnly && lastSharedAt && (
            <button type="button" onClick={onWhatsAppOnly}
              className="cursor-pointer border-0 bg-transparent p-0 text-[12px] font-medium text-[#12211A] underline decoration-[#9AA8A0] underline-offset-4 hover:decoration-[#12211A]">
              Only send WhatsApp, don&apos;t share again
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
