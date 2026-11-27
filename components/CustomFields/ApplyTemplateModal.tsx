"use client";

import React, { useState } from "react";
import { Modal, Radio, message } from "antd";
import { FieldTemplate, applyFieldTemplate } from "@/apis/custom-fields.api";
import { AlertTriangle } from "lucide-react";
import { useIndexStore } from "@/store/index.store";

interface ApplyTemplateModalProps {
  open: boolean;
  template: FieldTemplate | null;
  onClose: () => void;
  onApplied: () => void;
}

export const ApplyTemplateModal: React.FC<ApplyTemplateModalProps> = ({
  open,
  template,
  onClose,
  onApplied,
}) => {
  const [applyMode, setApplyMode] = useState<"replace" | "merge">("replace");
  const [submitting, setSubmitting] = useState<boolean>(false);

  if (!template) return null;

  const handleApply = async () => {
    try {
      setSubmitting(true);
      const res = await applyFieldTemplate(template.id, applyMode);

      if (template.entity_type === "job" || res.entity_type === "job") {
        const store = useIndexStore.getState();
        // The apply endpoint saves selection together with the field schema.
        store.setActiveJobTemplate(res.active_job_template || res.template_slug || template.slug);
      }

      message.success(
        `Applied "${template.name}" template successfully! (${res.added_count} fields added)`
      );
      onApplied();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      message.error(typeof detail === "string" ? detail : "Failed to apply template");
    } finally {
      setSubmitting(false);
    }
  };

  const entityWord = { job: "jobs", vehicle: "vehicles", team_member: "team members", depot: "depots" }[template.entity_type] ?? template.entity_type;
  const count = template.fields.length;

  // The two ways to apply. One line each on what happens to the fields already there.
  const modes: { value: "replace" | "merge"; title: string; hint: string }[] = [
    { value: "replace", title: "Replace the current fields", hint: `Removes the fields set up for ${entityWord} now, then adds this template's fields.` },
    { value: "merge", title: "Add to the current fields", hint: "Keeps every field you have and adds only the template fields you do not have yet." },
  ];

  return (
    <Modal
      rootClassName="lang"
      open={open}
      onCancel={onClose}
      onOk={handleApply}
      confirmLoading={submitting}
      okText="Apply template"
      cancelText="Cancel"
      centered
      width={480}
      title={
        <div className="pr-8 font-sans">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67]">Apply template to {entityWord}</p>
          <p className="m-0 mt-1 text-lg font-medium leading-6 text-[#12211A]">{template.name}</p>
          <p className="m-0 mt-1 text-[13px] font-normal leading-5 text-[#626E67]">{count} field{count !== 1 ? "s" : ""}</p>
        </div>
      }
    >
      <div className="py-2 font-sans">
        <Radio.Group value={applyMode} onChange={(e) => setApplyMode(e.target.value)} className="!flex w-full flex-col">
          {modes.map((mode) => {
            const on = applyMode === mode.value;
            return (
              <label
                key={mode.value}
                className={`flex cursor-pointer items-start gap-3 px-3 py-3 ${on ? "bg-[#F3F6F4] shadow-[inset_2px_0_0_#0B5D3B]" : "hover:bg-[#F8FAF9]"}`}
              >
                <Radio value={mode.value} className="mt-0.5" />
                <span>
                  <span className="block text-[13px] font-medium leading-5 text-[#12211A]">{mode.title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#626E67]">{mode.hint}</span>
                </span>
              </label>
            );
          })}
        </Radio.Group>

        {applyMode === "replace" && (
          <p role="note" className="m-0 mt-4 flex items-start gap-2 text-xs leading-5 text-[#4A5750]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#C9372C]" aria-hidden="true" />
            <span>
              The fields you added for {entityWord} will be removed from forms and tables. Values already saved on past records stay in the database.
            </span>
          </p>
        )}
      </div>
    </Modal>
  );
};
