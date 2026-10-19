"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Alert, Modal, Spin } from "antd";
import {
  FieldTemplate,
  getFieldTemplates,
} from "@/apis/custom-fields.api";
import { ApplyTemplateModal } from "./ApplyTemplateModal";

import {
  LayoutTemplate,
  Package,
  Users,
  Truck,
  Building,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Layers,
} from "lucide-react";

interface TemplateGalleryModalProps {
  open: boolean;
  entityType: "job" | "vehicle" | "team_member" | "depot";
  onClose: () => void;
  onApplied: () => void;
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

  const getIconComponent = (iconName?: string | null) => {
    switch (iconName) {
      case "Users":
        return <Users className="w-5 h-5 text-indigo-600" />;
      case "Truck":
        return <Truck className="w-5 h-5 text-blue-600" />;
      case "Building":
        return <Building className="w-5 h-5 text-amber-600" />;
      case "Package":
      default:
        return <Package className="w-5 h-5 text-[#003220]" />;
    }
  };

  const getEntityLabel = (type: string) => {
    switch (type) {
      case "job":
        return "Jobs";
      case "vehicle":
        return "Vehicles";
      case "team_member":
        return "Team Members";
      case "depot":
        return "Depots";
      default:
        return type;
    }
  };

  return (
    <>
      <Modal
        open={open}
        onCancel={onClose}
        footer={null}
        centered
        width={860}
        styles={{
          container: { padding: "24px", borderRadius: "0px" },
          body: { paddingTop: "12px" },
        }}
        title={
          <div className="flex items-center gap-3 pb-3 border-b border-gray-100 pr-6 font-sans">
            <div className="w-9 h-9 bg-[#003220]/10 border border-[#003220]/20 flex items-center justify-center rounded-none shrink-0">
              <LayoutTemplate className="w-5 h-5 text-[#003220]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 m-0 tracking-tight">
                Custom Field Templates — {getEntityLabel(entityType)}
              </h3>
              <p className="text-xs text-gray-500 font-normal m-0 mt-0.5">
                Pick a pre-configured template tailored to your industry use case. You can customize fields after applying.
              </p>
            </div>
          </div>
        }
      >
        <div className="py-2 custom-scrollbar max-h-[72vh] overflow-y-auto font-sans text-xs pr-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Spin size="default" />
            </div>
          ) : loadError ? (
            <Alert type="error" showIcon title="Templates could not be loaded. Close this window and try again." />
          ) : templates.length === 0 ? (
            <div className="text-center py-14 bg-gray-50/50 border border-dashed border-gray-200">
              <Layers className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600 font-semibold text-xs m-0">No templates available for {entityType}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {templates.map((tpl) => {
                const isExpanded = expandedTemplateId === tpl.id;
                const isApplied = tpl.is_applied;

                return (
                  <div
                    key={tpl.id}
                    className={`border transition-all duration-200 bg-white ${
                      isExpanded || isApplied
                        ? "border-[#003220] ring-1 ring-[#003220]/20 shadow-sm"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {/* Header bar of template card */}
                    <div className="p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 flex-1 min-w-0">
                        <div className="p-2.5 bg-gray-50 border border-gray-200/80 shrink-0">
                          {getIconComponent(tpl.icon)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="text-sm font-bold text-gray-900 m-0 tracking-tight">{tpl.name}</h4>
                            {isApplied && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-[#003220] bg-emerald-50 border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                                Currently applied
                              </span>
                            )}
                            {tpl.category && (
                              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#003220] bg-emerald-50 border border-emerald-200">
                                {tpl.category}
                              </span>
                            )}
                            <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium text-gray-600 bg-gray-100 border border-gray-200">
                              {tpl.fields.length} Fields
                            </span>
                          </div>

                          <p className="text-xs text-gray-500 m-0 leading-relaxed truncate">
                            {tpl.description || "Pre-configured industry fields ready for immediate use."}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setExpandedTemplateId(isExpanded ? null : tpl.id)}
                          className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold px-3 py-1.5 rounded-none transition-colors cursor-pointer bg-white"
                        >
                          <span>{isExpanded ? "Collapse" : "Preview"}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                          )}
                        </button>

                        <button
                          onClick={() => setSelectedTemplateForApply(tpl)}
                          className="inline-flex items-center gap-1.5 bg-[#003220] hover:bg-[#002417] text-white text-xs font-semibold px-4 py-1.5 rounded-none transition-colors cursor-pointer border-none shadow-xs"
                        >
                          {/* <Sparkles className="w-3.5 h-3.5" /> */}
                          <span>{isApplied ? "Reapply Template" : "Use Template"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Expandable Preview Section */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 bg-gray-50/50 p-4">
                        <div className="flex items-center justify-between mb-2.5">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#003220]">
                            INCLUDED CUSTOM FIELDS ({tpl.fields.length})
                          </span>
                        </div>

                        <div className="border border-gray-200 bg-white overflow-hidden">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50/80 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                                <th className="py-2.5 px-3.5">Field Label</th>
                                <th className="py-2.5 px-3.5">Field Key</th>
                                <th className="py-2.5 px-3.5">Data Type</th>
                                <th className="py-2.5 px-3.5">Required</th>
                                <th className="py-2.5 px-3.5">Description / Note</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-gray-800">
                              {tpl.fields.map((f, idx) => (
                                <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                                  <td className="py-2.5 px-3.5 font-semibold text-gray-900">{f.label}</td>
                                  <td className="py-2.5 px-3.5 font-mono text-[11px] text-gray-500">{f.field_key}</td>
                                  <td className="py-2.5 px-3.5 capitalize font-mono text-[11px] text-gray-700">
                                    {f.data_type}
                                    {f.data_type === "select" && f.options && (
                                      <span className="text-gray-400 font-sans ml-1 text-[10px]">
                                        ({f.options.length} options)
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3.5">
                                    {f.is_required ? (
                                      <span className="inline-block text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5">
                                        Required
                                      </span>
                                    ) : (
                                      <span className="inline-block text-[10px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5">
                                        Optional
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3.5 text-gray-500 text-[11px]">
                                    {f.description || "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
