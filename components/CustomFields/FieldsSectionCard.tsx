"use client";

import React from "react";
import { Plus } from "lucide-react";
import { CustomFieldDefinition, FieldSurfaces } from "@/apis/custom-fields.api";
import { BaseFieldDefinition } from "./custom-fields.constants";
import { FieldsTable } from "./FieldsTable";

interface FieldsSectionCardProps {
  /** Kept for callers that still pass it; the number is no longer drawn. */
  badgeNumber?: string | number;
  title: string;
  /** Small uppercase line above the title saying what this group of fields is for. */
  categoryTag?: string;
  description: string;
  showAddButton?: boolean;
  onAddField?: () => void;
  emptyText?: string;
  markAdded?: boolean;
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

/** One group of fields: what the group is for, how many fields it has, then the fields. */
export const FieldsSectionCard: React.FC<FieldsSectionCardProps> = ({
  title,
  categoryTag,
  description,
  showAddButton = false,
  onAddField,
  emptyText,
  markAdded,
  baseItems,
  customItems,
  ...tableProps
}) => {
  const count = baseItems.length + customItems.length;
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-3">
        <div className="min-w-0">
          {categoryTag && (
            <p className="m-0 mb-1 text-[11px] font-medium uppercase leading-4 tracking-[0.09em] text-[#626E67]">{categoryTag}</p>
          )}
          <h2 className="m-0 flex items-baseline gap-2 text-[15px] font-medium leading-6 text-[#12211A]">
            {title}
            <span className="text-xs font-normal tabular-nums text-[#626E67]">{count} field{count !== 1 ? "s" : ""}</span>
          </h2>
          <p className="m-0 mt-0.5 max-w-[640px] text-xs leading-5 text-[#626E67]">{description}</p>
        </div>

        {showAddButton && (
          <button
            type="button"
            onClick={onAddField}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[#0B5D3B] outline-none hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]"
          >
            <Plus size={14} aria-hidden="true" /> Add field
          </button>
        )}
      </div>

      <FieldsTable baseItems={baseItems} customItems={customItems} emptyText={emptyText} markAdded={markAdded} {...tableProps} />
    </section>
  );
};
