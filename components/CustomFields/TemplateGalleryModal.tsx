"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Alert, Modal, Spin } from "antd";
import {
  FieldSurfaces,
  FieldTemplate,
  getFieldTemplates,
} from "@/apis/custom-fields.api";
import { ApplyTemplateModal } from "./ApplyTemplateModal";

import { Check, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

interface TemplateGalleryModalProps {
  open: boolean;
  entityType: "job" | "vehicle" | "team_member" | "depot";
  onClose: () => void;
  onApplied: () => void;
}

/** The record type in the words used on the page behind this window. */
const ENTITY_WORDS: Record<string, string> = { job: "jobs", vehicle: "vehicles", team_member: "team members", depot: "depots" };

/** The stored type in plain words (same wording as the fields table on the page). */
const TYPE_WORDS: Record<string, string> = { string: "Text", number: "Number", boolean: "Yes / No", select: "Dropdown", date: "Date", geo: "Coordinates" };

/** The three places a field can appear. */
const AUDIENCES: { key: keyof FieldSurfaces; label: string }[] = [
  { key: "disp", label: "Dispatcher" },
  { key: "driver", label: "Driver app" },
  { key: "track", label: "Customer" },
];

/** A tick for yes, a faint dash for no. Words for screen readers. */
function Mark({ on, yes, no }: { on: boolean; yes: string; no: string }) {
  return on ? (
    <span className="inline-flex text-[#12211A]"><Check size={16} aria-hidden="true" /><span className="sr-only">{yes}</span></span>
  ) : (
    <span className="text-[#B4BEB8]"><span aria-hidden="true">–</span><span className="sr-only">{no}</span></span>
  );
}

export const TemplateGalleryModal: React.FC<TemplateGalleryModalProps> = ({
  open,
  entityType,
  onClose,
  onApplied,
}) => {
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedTemplateId, setExpandedTemplateId] = useState<number | null>(null);
  const [selectedTemplateForApply, setSelectedTemplateForApply] = useState<FieldTemplate | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const data = await getFieldTemplates(entityType);
      setTemplates(data);
      // Preview off by default
      setExpandedTemplateId(null);
    } catch (err: unknown) {
      setTemplates([]);
      setLoadError(true);
      console.error("Failed to load templates", err);
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open, loadTemplates]);

  const entityWord = ENTITY_WORDS[entityType] ?? entityType;

  return (
    <>
      <Modal
        rootClassName="lang"
        open={open}
        onCancel={onClose}
        footer={null}
        centered
        width={820}
        title={
          <div className="pr-8 font-sans">
            <p className="m-0 text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67]">Templates for {entityWord}</p>
            <h3 className="m-0 mt-1 text-lg font-medium leading-6 text-[#12211A]">Start from a template</h3>
            <p className="m-0 mt-1 text-[13px] font-normal leading-5 text-[#626E67]">
              A template is a ready-made set of fields. You can change any field after you apply it.
            </p>
          </div>
        }
      >
        <div className="custom-scrollbar max-h-[70vh] overflow-y-auto pt-2 font-sans">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spin size="default" />
            </div>
          ) : loadError ? (
            <Alert type="error" showIcon title="Templates could not be loaded. Close this window and try again." />
          ) : templates.length === 0 ? (
            <p className="m-0 bg-[#F3F6F4] px-4 py-6 text-[13px] text-[#626E67]">
              There are no templates for {entityWord} yet. Add the fields you need with Add field.
            </p>
          ) : (
            <ul className="m-0 list-none border-0 border-t border-solid border-[#D5DCD8] p-0">
              {templates.map((tpl) => {
                const isExpanded = expandedTemplateId === tpl.id;
                const isApplied = tpl.is_applied;
                const count = tpl.fields.length;
                const showAudiences = tpl.fields.some((f) => f.surfaces);
                const previewId = `template-preview-${tpl.id}`;

                return (
                  <li
                    key={tpl.id}
                    // The template in use carries the green line, the same "you are here" mark used across the app.
                    className={`border-0 border-b border-solid border-[#D5DCD8] ${isApplied ? "shadow-[inset_2px_0_0_#0B5D3B]" : ""}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4">
                      <div className="min-w-0 flex-1 basis-[280px]">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <h4 className="m-0 text-[15px] font-medium leading-6 text-[#12211A]">{tpl.name}</h4>
                          {isApplied && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1F845A]">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Currently applied
                            </span>
                          )}
                        </div>
                        <p className="m-0 text-xs leading-5 text-[#626E67]">
                          {tpl.category ? <span className="capitalize">{String(tpl.category).toLowerCase()} · </span> : null}
                          <span className="tabular-nums">{count} field{count !== 1 ? "s" : ""}</span>
                        </p>
                        <p className="m-0 mt-1 text-[13px] leading-5 text-[#4A5750]">
                          {tpl.description || "A ready-made set of fields."}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={previewId}
                          onClick={() => setExpandedTemplateId(isExpanded ? null : tpl.id)}
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 text-[13px] font-medium text-[#12211A] outline-none hover:bg-[#F3F6F4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]"
                        >
                          <span>{isExpanded ? "Hide fields" : "See fields"}</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>

                        {/* Applying a new template is the main action; applying the current one again is not. */}
                        <button
                          type="button"
                          onClick={() => setSelectedTemplateForApply(tpl)}
                          className={`action-button ${isApplied ? "action-button-secondary" : "action-button-primary"}`}
                        >
                          <span>{isApplied ? "Reapply Template" : "Use Template"}</span>
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div id={previewId} className="px-4 pb-5">
                        {count === 0 ? (
                          <p className="m-0 bg-[#F3F6F4] px-4 py-4 text-[13px] text-[#626E67]">This template has no fields.</p>
                        ) : (
                          <table className="fields-table w-full border-collapse text-left">
                            <thead>
                              <tr className="bg-[#F3F6F4] text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">
                                <th scope="col" className="px-4 py-2.5 font-medium">Field</th>
                                <th scope="col" className="fields-wide px-3 py-2.5 font-medium">Type</th>
                                <th scope="col" className="px-3 py-2.5 text-center font-medium">Required</th>
                                {showAudiences && AUDIENCES.map((a) => (
                                  <th key={a.key} scope="col" className="fields-wide px-3 py-2.5 text-center font-medium">{a.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="text-[13px] text-[#12211A]">
                              {tpl.fields.map((f, idx) => {
                                const type = TYPE_WORDS[f.data_type] ?? f.data_type;
                                const choices = f.data_type === "select" && f.options ? `${f.options.length} choice${f.options.length !== 1 ? "s" : ""}` : "";
                                const seenBy = AUDIENCES.filter((a) => Boolean(f.surfaces?.[a.key])).map((a) => a.label);
                                return (
                                  <tr key={idx} className="border-0 border-b border-solid border-[#E3E8E5]">
                                    <td className="px-4 py-2.5 align-middle">
                                      <div className="font-medium">{f.label}</div>
                                      {f.description ? <div className="mt-0.5 text-xs leading-4 text-[#626E67]">{f.description}</div> : null}
                                      <div className="fields-narrow mt-1 text-xs leading-4 text-[#4A5750]">
                                        {type}{choices ? `, ${choices}` : ""}{showAudiences ? ` · ${seenBy.length ? `Seen by ${seenBy.join(", ")}` : "Not shown anywhere"}` : ""}
                                      </div>
                                    </td>
                                    <td className="fields-wide whitespace-nowrap px-3 py-2.5 align-middle text-[#4A5750]">
                                      {type}
                                      {choices ? <div className="text-[11px] leading-4 text-[#626E67]">{choices}</div> : null}
                                    </td>
                                    <td className="px-3 py-2.5 text-center align-middle">
                                      <Mark on={Boolean(f.is_required)} yes="Required" no="Optional" />
                                    </td>
                                    {showAudiences && AUDIENCES.map((a) => (
                                      <td key={a.key} className="fields-wide px-3 py-2.5 text-center align-middle">
                                        <Mark on={Boolean(f.surfaces?.[a.key])} yes={`Shown to: ${a.label}`} no={`Not shown to: ${a.label}`} />
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>

      {/* Confirmation & Apply Mode Modal */}
      <ApplyTemplateModal
        open={Boolean(selectedTemplateForApply)}
        template={selectedTemplateForApply}
        onClose={() => setSelectedTemplateForApply(null)}
        onApplied={() => {
          setSelectedTemplateForApply(null);
          onApplied();
          onClose();
        }}
      />
    </>
  );
};
