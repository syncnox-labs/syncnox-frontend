"use client";

import React, { useState } from "react";
import { Modal, Radio, message, Alert } from "antd";
import { FieldTemplate, applyFieldTemplate } from "@/apis/custom-fields.api";
import { Sparkles, Replace, GitMerge, AlertTriangle } from "lucide-react";
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
        const slug = res.template_slug || template.slug || "";
        const targetTemplate = slug.includes("shuttle") ? "worker_shuttle" : "pickup_delivery_job";
        const store = useIndexStore.getState();
        store.updateActiveJobTemplate(targetTemplate);
      }

      message.success(
        `Applied "${template.name}" template successfully! (${res.added_count} fields added)`
      );
      onApplied();
      onClose();
    } catch (err: any) {
      console.error(err);
      message.error(err?.response?.data?.detail || "Failed to apply template");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleApply}
      confirmLoading={submitting}
      okText="Apply Template"
      cancelText="Cancel"
      okButtonProps={{
        style: {
          backgroundColor: "#003220",
          borderColor: "#003220",
          borderRadius: 0,
          fontSize: "12px",
          height: "34px",
          fontWeight: 600,
        },
      }}
      cancelButtonProps={{
        style: { borderRadius: 0, fontSize: "12px", height: "34px" },
      }}
      centered
      width={500}
      title={
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">
          <Sparkles className="w-4 h-4 text-[#003220]" />
          <span>Apply Template: {template.name}</span>
        </div>
      }
    >
      <div className="py-3 font-sans text-xs space-y-4">
        <p className="text-gray-600 leading-relaxed">
          You are about to apply the <strong className="text-gray-900">{template.name}</strong> template (
          {template.fields.length} pre-configured fields) to your{" "}
          <strong className="uppercase text-[#003220]">{template.entity_type}</strong> settings.
        </p>

        <div className="bg-gray-50 border border-gray-200 p-3 rounded-none space-y-2.5">
          <label className="block font-bold text-gray-800 text-[11px] uppercase tracking-wider">
            Choose Application Mode:
          </label>

          <Radio.Group
            value={applyMode}
            onChange={(e) => setApplyMode(e.target.value)}
            className="w-full flex flex-col gap-2.5"
          >
            <div
              onClick={() => setApplyMode("replace")}
              className={`p-3 border cursor-pointer transition-colors flex items-start gap-3 ${
                applyMode === "replace"
                  ? "border-[#003220] bg-emerald-50/40"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <Radio value="replace" className="mt-0.5" />
              <div>
                <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                  {/* <Replace className="w-3.5 h-3.5 text-[#003220]" /> */}
                  <span>Replace Existing Custom Fields</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Removes all existing custom field definitions for this tab and applies this template fresh.
                </p>
              </div>
            </div>

            <div
              onClick={() => setApplyMode("merge")}
              className={`p-3 border cursor-pointer transition-colors flex items-start gap-3 ${
                applyMode === "merge"
                  ? "border-[#003220] bg-emerald-50/40"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <Radio value="merge" className="mt-0.5" />
              <div>
                <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                  {/* <GitMerge className="w-3.5 h-3.5 text-blue-700" /> */}
                  <span>Merge with Existing Custom Fields</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Keeps your current custom fields intact and appends template fields that don't already exist.
                </p>
              </div>
            </div>
          </Radio.Group>
        </div>

        {applyMode === "replace" && (
          <Alert
            type="warning"
            showIcon
            icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
            message={<span className="font-semibold text-xs text-amber-900">Replace Notice</span>}
            description={
              <span className="text-[11px] text-amber-800">
                Any existing custom fields for {template.entity_type} will be cleared. Stored data on past records will remain safe in the database.
              </span>
            }
            className="rounded-none border-amber-200 bg-amber-50"
          />
        )}
      </div>
    </Modal>
  );
};
