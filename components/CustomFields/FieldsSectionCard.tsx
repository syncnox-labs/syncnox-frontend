"use client";

import React from "react";
import { Plus } from "lucide-react";
import { CustomFieldDefinition, FieldSurfaces } from "@/apis/custom-fields.api";
import { BaseFieldDefinition } from "./custom-fields.constants";
import { FieldsTable } from "./FieldsTable";

interface FieldsSectionCardProps {
  badgeNumber?: string | number;
  title: string;
  categoryTag?: string;
  description: string;
  showAddButton?: boolean;
  onAddField?: () => void;
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

export const FieldsSectionCard: React.FC<FieldsSectionCardProps> = ({
  badgeNumber,
  title,
  categoryTag,
  description,
  showAddButton = false,
  onAddField,
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
    <div className="border border-gray-200 rounded-none overflow-hidden bg-white font-sans">
      <div className="responsive-toolbar px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {badgeNumber && (
            <div className="w-5 h-5 bg-[#003220] text-white font-bold text-[11px] flex items-center justify-center rounded-none shrink-0">
              {badgeNumber}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-gray-900">{title}</span>
              {categoryTag && (
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                  {categoryTag}
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 m-0">{description}</p>
          </div>
        </div>

        {showAddButton && (
          <button
            onClick={onAddField}
            className="inline-flex items-center gap-1 border border-gray-300 hover:bg-gray-100 text-gray-800 text-[11px] font-semibold px-2.5 py-1 rounded-none bg-white cursor-pointer transition-colors"
          >
            <Plus size={12} />
            <span>Add field</span>
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
      <FieldsTable
        baseItems={baseItems}
        customItems={customItems}
        hiddenBaseFields={hiddenBaseFields}
        baseFieldOverrides={baseFieldOverrides}
        onToggleBaseRequired={onToggleBaseRequired}
        onToggleCustomRequired={onToggleCustomRequired}
        onOpenEditBaseModal={onOpenEditBaseModal}
        onOpenEditCustomModal={onOpenEditCustomModal}
        onDeleteBaseField={onDeleteBaseField}
        onDeleteCustomField={onDeleteCustomField}
        onToggleBaseVisibility={onToggleBaseVisibility}
      />
      </div>
    </div>
  );
};
