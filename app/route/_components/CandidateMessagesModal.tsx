"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Modal, Spin, message } from "antd";
import { candidateMessageStatus, previewCandidateMessages, retryCandidateMessageQueue, sendCandidateMessages,
  type CandidateMessageItem, type MessageStatus } from "@/apis/candidateMessages.api";
import { manualRoutingError } from "./manualRouting.utils";

const key = (item: CandidateMessageItem) => `${item.publication_id}:${item.job_id}`;
const previous = (item: CandidateMessageItem) => item.last_status === "accepted" || item.last_status === "unknown";
const inFlight = (item: CandidateMessageItem) => item.last_status === "queued" || item.last_status === "sending";

export default function CandidateMessagesModal({ selection, onClose }: {
  selection: { planId: number; driverId?: number } | null; onClose: () => void;
}) {
  const [items, setItems] = useState<CandidateMessageItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [resend, setResend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [token, setToken] = useState<string>();
  const [statuses, setStatuses] = useState<MessageStatus[]>([]);
  const [queueFailed, setQueueFailed] = useState(false);

  useEffect(() => {
    if (!selection) return;
    let canceled = false;
    setItems([]); setSelected([]); setResend(false); setError(undefined); setToken(undefined);
    setStatuses([]); setQueueFailed(false); setBusy(true);
    previewCandidateMessages(selection.planId, selection.driverId).then(data => {
      if (canceled) return;
      setItems(data);
      setSelected(data.filter(item => !item.errors.length && !previous(item) && !inFlight(item)).map(key));
    }).catch(reason => { if (!canceled) setError(manualRoutingError(reason)); })
      .finally(() => { if (!canceled) setBusy(false); });
    return () => { canceled = true; };
  }, [selection]);

  useEffect(() => {
    if (!selection || !token) return;
    let canceled = false;
    const poll = () => candidateMessageStatus(selection.planId, token)
      .then(data => { if (!canceled) setStatuses(data); })
      .catch(reason => { if (!canceled) setError(manualRoutingError(reason)); });
    void poll();
    const timer = window.setInterval(poll, 3000);
    return () => { canceled = true; window.clearInterval(timer); };
  }, [selection, token]);

  const send = async () => {
    if (!selection || busy || !selected.length) return;
    const chosen = items.filter(item => selected.includes(key(item)));
    if (chosen.some(previous) && !resend) { setError("Confirm that you want to resend previously sent or uncertain messages."); return; }
    setBusy(true); setError(undefined);
    const requestToken = crypto.randomUUID();
    try {
      const result = await sendCandidateMessages(selection.planId, requestToken, selection.driverId,
        chosen.map(item => ({ publication_id: item.publication_id, job_id: item.job_id,
          revision: item.revision, allow_resend: previous(item) && resend })));
      setToken(requestToken); setQueueFailed(!result.enqueued); setSelected([]);
    } catch (reason) { setError(manualRoutingError(reason)); }
    finally { setBusy(false); }
  };

  const retry = async () => {
    if (!selection) return;
    setBusy(true);
    try {
      const result = await retryCandidateMessageQueue(selection.planId);
      setQueueFailed(!result.enqueued);
      if (result.enqueued) message.success("Queued messages submitted to the worker.");
      else setError("The message queue is unavailable. Try again shortly.");
    } catch (reason) { setError(manualRoutingError(reason)); }
    finally { setBusy(false); }
  };

  return <Modal open={selection !== null} title="Send WhatsApp confirmations" onCancel={onClose} width={820} centered
    footer={<div className="flex flex-wrap justify-end gap-2">
      <Button onClick={onClose}>Close</Button>
      {(queueFailed || items.some(item => item.last_status === "queued")) && <Button onClick={retry} loading={busy}>Retry queue</Button>}
      {!token && <Button type="primary" onClick={send} disabled={!selected.length || busy} loading={busy}>Send {selected.length || ""} confirmation{selected.length === 1 ? "" : "s"}</Button>}
    </div>}>
    <div className="max-h-[65dvh] space-y-3 overflow-y-auto">
      {error && <Alert type="error" showIcon title="Unable to complete this action" description={error} />}
      {busy && !items.length && <div className="py-6 text-center"><Spin /></div>}
      {token ? <>
        <Alert type={queueFailed ? "warning" : "info"} showIcon title={queueFailed ? "Messages saved; the queue is unavailable" : "Confirmations queued"}
          description="Accepted means respond.io accepted the request. Check respond.io for delivery. If a result is uncertain, check the inbox before resending." />
        <div className="divide-y divide-gray-200">{statuses.map(status => <div key={status.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <span>{items.find(item => item.job_id === status.job_id)?.name || `Job #${status.job_id}`}</span><span>{status.status}{status.error ? ` — ${status.error}` : ""}</span>
        </div>)}</div>
      </> : <>
        <p className="text-sm text-gray-600">Review the shared pickup details and select recipients. Each candidate receives the template in their job’s language.</p>
        {items.some(previous) && <Checkbox checked={resend} onChange={event => {
          setResend(event.target.checked);
          if (!event.target.checked) setSelected(old => old.filter(id => !items.some(item => key(item) === id && previous(item))));
        }}>
          Allow resend for previously accepted or uncertain confirmations after checking respond.io
        </Checkbox>}
        {!busy && !items.length && <Alert type="info" showIcon title="No shared candidate trips found" />}
        <div className="space-y-2">{items.map(item => {
          const id = key(item);
          const disabled = Boolean(item.errors.length) || inFlight(item) || (previous(item) && !resend);
          const overnight = item.pickup_date && item.shift_date && item.pickup_date !== item.shift_date;
          return <div key={id} className="rounded border border-gray-200 p-3 text-sm">
            <div className="flex items-start gap-3">
              <Checkbox aria-label={`Select ${item.name || `job ${item.job_id}`}`} disabled={disabled} checked={selected.includes(id) && !disabled}
                onChange={event => setSelected(old => event.target.checked ? [...old, id] : old.filter(value => value !== id))} />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap justify-between gap-2"><strong>{item.name || `Job #${item.job_id}`}</strong><span>{item.language || "Language missing"} · #{item.job_id}</span></div>
                <div>{item.phone || "Phone missing"} · {item.driver || "Driver missing"}</div>
                <div>Shift: {item.shift_date || "—"} · Pickup: {item.pickup_time || "—"}{overnight ? ` on ${item.pickup_date}` : ""}</div>
                <div className="break-words">{item.pickup_location || "Pickup missing"} → {item.destination || "Destination missing"}</div>
                {item.last_status && <div className="text-amber-700">Previous confirmation: {item.last_status}{item.last_status === "unknown" ? " — check respond.io before resending" : ""}</div>}
                {item.errors.map(issue => <div key={issue} className="text-red-700">{issue}</div>)}
              </div>
            </div>
          </div>;
        })}</div>
      </>}
    </div>
  </Modal>;
}
