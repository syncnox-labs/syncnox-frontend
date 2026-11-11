"use client";

import React from "react";
import { Tooltip } from "antd";
import { Edit2, Trash2 } from "lucide-react";
import { CustomFieldDefinition, FieldSurfaces } from "@/apis/custom-fields.api";
import { BaseFieldDefinition } from "./custom-fields.constants";
import { SurfacesBadges } from "./SurfacesBadges";

interface FieldsTableProps {
  baseItems: BaseFieldDefinition[];
  customItems: CustomFieldDefinition[];
  hiddenBaseFields: string[];
  baseFieldOverrides: Record<string, { is_required?: boolean; surfaces?: FieldSurfaces | null }>;
  onToggleBaseRequired: (key: string, currentRequired: boolean, label: string) => void;
  onToggleCustomRequired: (field: CustomFieldDefinition) => void;
  onOpenEditBaseModal: (bf: BaseFieldDefinition, currentRequired: boolean, currentSurfaces?: FieldSurfaces | null) => void;
  onOpenEditCustomModal: (field: CustomFieldDefinition) => void;
  onDeleteBaseField: (key: string, label: string, isReq: boolean) => void;
  onDeleteCustomField: (id: number, label: string) => void;
  onToggleBaseVisibility: (key: string) => void;
}

export const FieldsTable: React.FC<FieldsTableProps> = ({
  baseItems,
  customItems,
  hiddenBaseFields,
  baseFieldOverrides,
  onToggleBaseRequired,
  onToggleCustomRequired,
  onOpenEditBaseModal,
  onOpenEditCustomModal,
  onDeleteBaseField,
  onDeleteCustomField,
  onToggleBaseVisibility,
}) => {
  return (
    <table className="min-w-[760px] w-full text-left border-collapse font-sans">
      <thead>
        <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-[11px] uppercase font-bold tracking-wider">
          <th className="py-2.5 px-4">Field Label</th>
          <th className="py-2.5 px-4">Field Key</th>
          <th className="py-2.5 px-4">Type</th>
          <th className="py-2.5 px-4">Data Type</th>
          <th className="py-2.5 px-4">Default Value</th>
          <th className="py-2.5 px-4">Required</th>
          <th className="py-2.5 px-4">Visibility</th>
          <th className="py-2.5 px-4 text-right">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 text-xs text-gray-800">
        {/* Base Fields */}
        {baseItems.map((bf) => {
          const isHidden = hiddenBaseFields.includes(bf.field_key);
          const override = baseFieldOverrides[bf.field_key];
          const effectiveRequired = override?.is_required ?? bf.is_required;
          const effectiveSurfaces = override?.surfaces ?? bf.surfaces;

          return (
            <tr
              key={`base-${bf.field_key}`}
              className={`hover:bg-gray-50/70 transition-colors ${
                isHidden ? "bg-gray-50/40 opacity-60" : ""
              }`}
            >
              <td className="py-3 px-4 font-semibold text-gray-900">{bf.label}</td>
              <td className="py-3 px-4 font-mono text-[11px] text-gray-500">{bf.field_key}</td>
              <td className="py-3 px-4">
                <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold">
                  Base Field
                </span>
              </td>
              <td className="py-3 px-4 capitalize">{bf.data_type}</td>
              <td className="py-3 px-4 text-gray-400 font-mono text-[11px]">-</td>
              <td className="py-3 px-4">
                <Tooltip title="Click to toggle Required / Optional">
                  <button
                    onClick={() => onToggleBaseRequired(bf.field_key, effectiveRequired, bf.label)}
                    className="cursor-pointer border-none bg-transparent hover:opacity-80 transition-opacity p-0"
                  >
                    {effectiveRequired ? (
                      <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-none">
                        Required
                      </span>
                    ) : (
                      <span className="text-[11px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-none hover:bg-gray-200">
                        Optional
                      </span>
                    )}
                  </button>
                </Tooltip>
              </td>
              <td className="py-3 px-4">
                <SurfacesBadges surfaces={effectiveSurfaces} />
              </td>
              <td className="py-3 px-4 text-right flex items-center justify-end gap-1">
                <Tooltip title="Edit Field Properties">
                  <button
                    onClick={() => onOpenEditBaseModal(bf, effectiveRequired, effectiveSurfaces)}
                    className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-none transition-colors cursor-pointer border-none bg-transparent"
                  >
                    <Edit2 size={15} />
                  </button>
                </Tooltip>

                <Tooltip title="Base fields cannot be deleted">
                  <button
                    disabled={true}
                    className="p-1.5 rounded-none transition-colors border-none bg-transparent text-gray-300 cursor-not-allowed opacity-40"
                  >
                    <Trash2 size={15} />
                  </button>
                </Tooltip>
              </td>
            </tr>
          );
        })}

        {/* Custom Fields */}
        {customItems.map((f) => (
          <tr
            key={`custom-${f.id}`}
            className="hover:bg-gray-50/70 transition-colors bg-emerald-50/10"
          >
            <td className="py-3 px-4 font-semibold text-gray-900">{f.label}</td>
            <td className="py-3 px-4 font-mono text-[11px] text-gray-500">{f.field_key}</td>
            <td className="py-3 px-4">
              <span className="inline-block px-2 py-0.5 bg-emerald-50 text-[#003220] border border-emerald-200 text-[11px] font-semibold">
                Custom Field
              </span>
            </td>
            <td className="py-3 px-4 capitalize">{f.data_type}</td>
            <td className="py-3 px-4 font-mono text-[11px] text-gray-600">
              {f.default_value || <span className="text-gray-400">-</span>}
            </td>
            <td className="py-3 px-4">
              <Tooltip title="Click to toggle Required / Optional">
                <button
                  onClick={() => onToggleCustomRequired(f)}
                  className="cursor-pointer border-none bg-transparent hover:opacity-80 transition-opacity p-0"
                >
                  {f.is_required ? (
                    <span className="text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-none">
                      Required
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-none hover:bg-gray-200">
                      Optional
                    </span>
                  )}
                </button>
              </Tooltip>
            </td>

            <td className="py-3 px-4">
              <SurfacesBadges surfaces={f.surfaces} />
            </td>
            <td className="py-3 px-4 text-right flex items-center justify-end gap-1">
              <Tooltip title="Edit Custom Field">
                <button
                  onClick={() => onOpenEditCustomModal(f)}
                  className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-none transition-colors cursor-pointer border-none bg-transparent"
                >
                  <Edit2 size={15} />
                </button>
              </Tooltip>

              <Tooltip title="Delete Custom Field">
                <button
                  onClick={() => onDeleteCustomField(f.id, f.label)}
                  className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-none transition-colors cursor-pointer border-none bg-transparent"
                >
                  <Trash2 size={15} />
                </button>
              </Tooltip>
            </td>
          </tr>
        ))}

        {baseItems.length === 0 && customItems.length === 0 && (
          <tr>
            <td colSpan={8} className="py-6 text-center text-gray-400 italic font-sans">
              No fields in this section.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};
