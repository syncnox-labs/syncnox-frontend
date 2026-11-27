import React from "react";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

export type StopKind = "pickup" | "dropoff" | "stop";

/** Reads the stop kind from any spelling the back end uses. */
export function stopKindOf(stopType?: string | null): StopKind {
  const t = String(stopType ?? "").toLowerCase();
  if (t === "pickup" || t === "pick_up") return "pickup";
  if (t === "dropoff" || t === "drop_off") return "dropoff";
  return "stop";
}

/**
 * One confirmation for Mark Completed and Skip Stop, used by every place that offers them
 * (stop card, map popup, job drawer). The wording follows the ACTION first, then the stop kind,
 * so a skip can never be titled as a completion.
 *
 * Back end facts this relies on: status is set on the whole job. Completing a pickup sends
 * "in_transit"; skipping sends "failed", which closes the job, so its drop-off is skipped too.
 */
export function stopStatusConfirm({ action, kind, jobId, who, whenText, address, note }: {
  action: "completed" | "failed";
  kind: StopKind;
  jobId: number | string;
  /** Person or customer name; falls back to the job number. */
  who?: string | null;
  whenText?: string | null;
  address?: string | null;
  /** Amber line, e.g. "This plan has not been shared with drivers yet." */
  note?: string | null;
}) {
  const complete = action === "completed";
  const name = who && who.trim() ? who.trim() : `Job #${jobId}`;
  const word = kind === "pickup" ? "pickup" : kind === "dropoff" ? "drop-off" : "stop";
  const targetStatus = complete && kind === "pickup" ? "in_transit" : action;

  const outcome = complete
    ? kind === "pickup"
      ? `${name} shows as on board. The drop-off stays to do.`
      : `Job #${jobId} is closed as completed.`
    : kind === "pickup"
      ? `${name} is recorded as a no-show. Job #${jobId} is closed as failed, so its drop-off is skipped too.`
      : `Job #${jobId} is closed as failed.`;

  const flat = { borderRadius: 0, boxShadow: "none" };
  return {
    targetStatus,
    successText: complete
      ? kind === "pickup" ? `${name} is on board` : `Job #${jobId} completed`
      : kind === "pickup" ? `${name} recorded as a no-show` : `Job #${jobId} skipped`,
    errorText: complete ? "Could not mark the stop completed. Please retry." : "Could not skip the stop. Please retry.",
    modal: {
      title: complete ? `Mark this ${word} completed?` : `Skip this ${word}?`,
      icon: complete
        ? <CheckCircleOutlined style={{ color: "#1F845A" }} />
        : <CloseCircleOutlined style={{ color: "#C9372C" }} />,
      content: (
        <div className="lang flex flex-col gap-3 pt-1 text-[13px] text-[#4A5750]">
          <div className="border border-[#E3E8E5] bg-[#F8FAF9] px-3 py-2">
            <div className="text-[11px] font-medium uppercase tracking-wider text-[#626E67]">{word} · Job #{jobId}</div>
            <div className="mt-0.5 font-medium text-[#12211A]">{name}</div>
            {whenText && <div className="tabular-nums">{whenText}</div>}
            {address && <div className="break-words">{address}</div>}
          </div>
          <p className="m-0">{outcome}</p>
          {note && <p className="m-0 border-l-2 border-[#B38600] bg-[#FFF8E6] px-2.5 py-1.5 text-[12px] text-[#12211A]">{note}</p>}
        </div>
      ),
      okText: complete ? "Mark Completed" : "Skip Stop",
      cancelText: "Cancel",
      okButtonProps: complete
        ? { style: { backgroundColor: "#003220", borderColor: "#003220", ...flat } }
        : { danger: true, type: "primary" as const, style: flat },
      cancelButtonProps: { style: flat },
    },
  };
}
