"use client";

import React from "react";
import { Checkbox } from "antd";
import { Check, Edit2, Trash2 } from "lucide-react";
import { CustomFieldDefinition, FieldSurfaces } from "@/apis/custom-fields.api";
import { BaseFieldDefinition, DEFAULT_SURFACES } from "./custom-fields.constants";

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
  /** Shown instead of the rows when the section has none. */
  emptyText?: string;
  /** Mark the fields the company added. Only set where built-in and added fields can really be told apart. */
  markAdded?: boolean;
}

/** The stored type in plain words. */
const TYPE_WORDS: Record<string, string> = {
  string: "Text",
  number: "Number",
  boolean: "Yes / No",
  select: "Dropdown",
  date: "Date",
  geo: "Coordinates",
};
export const typeWord = (dataType: string) => TYPE_WORDS[dataType] ?? dataType;

/** The three places a field can appear, in the order the columns are drawn. */
const AUDIENCES: { key: keyof FieldSurfaces; label: string }[] = [
  { key: "disp", label: "Dispatcher" },
  { key: "driver", label: "Driver app" },
  { key: "track", label: "Customer" },
];

/** A tick where the field is shown, a faint dash where it is not. Words for screen readers. */
function Seen({ on, where }: { on: boolean; where: string }) {
  return on ? (
    <span className="inline-flex text-[#12211A]"><Check size={16} aria-hidden="true" /><span className="sr-only">Shown to: {where}</span></span>
  ) : (
    <span className="text-[#B4BEB8]"><span aria-hidden="true">–</span><span className="sr-only">Not shown to: {where}</span></span>
  );
}

const iconButton =
  "tip inline-flex h-8 w-8 cursor-pointer items-center justify-center border-0 bg-transparent text-[#626E67] outline-none hover:bg-[#EAEFEC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0B5D3B]";

interface Row {
  id: string;
  label: string;
  fieldKey: string;
  dataType: string;
  defaultValue?: string | null;
  required: boolean;
  surfaces: FieldSurfaces;
  custom: boolean;
  dimmed: boolean;
  onToggleRequired: () => void;
  onEdit: () => void;
  onDelete?: () => void;
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
  onDeleteCustomField,
  emptyText = "No fields in this section.",
  markAdded = false,
}) => {
  // Built-in and added fields become one list of rows; the same row is drawn for both.
  const rows: Row[] = [
    ...baseItems.map((bf): Row => {
      const override = baseFieldOverrides[bf.field_key];
      const required = override?.is_required ?? bf.is_required;
      const surfaces = override?.surfaces ?? bf.surfaces;
      return {
        id: `base-${bf.field_key}`,
        label: bf.label,
        fieldKey: bf.field_key,
        dataType: bf.data_type,
        required,
        surfaces: surfaces || DEFAULT_SURFACES,
        custom: false,
        dimmed: hiddenBaseFields.includes(bf.field_key),
        onToggleRequired: () => onToggleBaseRequired(bf.field_key, required, bf.label),
        onEdit: () => onOpenEditBaseModal(bf, required, surfaces),
      };
    }),
    ...customItems.map((f): Row => ({
      id: `custom-${f.id}`,
      label: f.label,
      fieldKey: f.field_key,
      dataType: f.data_type,
      defaultValue: f.default_value,
      required: f.is_required,
      surfaces: f.surfaces || DEFAULT_SURFACES,
      custom: true,
      dimmed: false,
      onToggleRequired: () => onToggleCustomRequired(f),
      onEdit: () => onOpenEditCustomModal(f),
      onDelete: () => onDeleteCustomField(f.id, f.label),
    })),
  ];

  if (rows.length === 0) {
    return <p className="m-0 bg-[#F3F6F4] px-4 py-5 text-[13px] text-[#626E67]">{emptyText}</p>;
  }

  return (
    <table className="fields-table w-full border-collapse text-left">
      <thead>
        <tr className="bg-[#F3F6F4] text-[11px] font-medium uppercase tracking-[0.06em] text-[#626E67]">
          <th scope="col" className="px-4 py-2.5 font-medium">Field</th>
          <th scope="col" className="fields-wide px-3 py-2.5 font-medium">Type</th>
          <th scope="col" className="px-3 py-2.5 text-center font-medium">Required</th>
          {AUDIENCES.map((a) => (
            <th key={a.key} scope="col" className="fields-wide px-3 py-2.5 text-center font-medium">{a.label}</th>
          ))}
          <th scope="col" className="px-2 py-2.5"><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody className="text-[13px] text-[#12211A]">
        {rows.map((row) => {
          const seenBy = AUDIENCES.filter((a) => Boolean(row.surfaces[a.key])).map((a) => a.label);
          return (
            <tr key={row.id} className={`border-b border-[#E3E8E5] hover:bg-[#F8FAF9] ${row.dimmed ? "opacity-60" : ""}`}>
              <td className="px-4 py-2.5 align-middle">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="font-medium">{row.label}</span>
                  {/* Only the exception is marked: a field the company added itself. */}
                  {markAdded && row.custom && <span className="bg-[#E7F3ED] px-1.5 py-px text-[11px] font-medium text-[#0B5D3B]">Added by you</span>}
                </div>
                <div className="mt-0.5 font-mono text-[11px] leading-4 text-[#626E67]">{row.fieldKey}</div>
                {/* On a phone the hidden columns are said here in one line. */}
                <div className="fields-narrow mt-1 text-xs leading-4 text-[#4A5750]">
                  {typeWord(row.dataType)} · {seenBy.length ? `Seen by ${seenBy.join(", ")}` : "Not shown anywhere"}
                </div>
              </td>
              <td className="fields-wide px-3 py-2.5 align-middle text-[#4A5750]">
                {typeWord(row.dataType)}
                {row.defaultValue ? <div className="text-[11px] leading-4 text-[#626E67]">Default: {row.defaultValue}</div> : null}
              </td>
              <td className="px-3 py-2.5 text-center align-middle">
                <Checkbox checked={row.required} onChange={row.onToggleRequired} aria-label={`${row.label} is required`} />
              </td>
              {AUDIENCES.map((a) => (
                <td key={a.key} className="fields-wide px-3 py-2.5 text-center align-middle">
                  <Seen on={Boolean(row.surfaces[a.key])} where={a.label} />
                </td>
              ))}
              <td className="whitespace-nowrap px-2 py-1.5 text-right align-middle">
                <button type="button" onClick={row.onEdit} aria-label={`Edit ${row.label}`} data-tip="Edit" className={`${iconButton} hover:text-[#12211A]`}>
                  <Edit2 size={15} aria-hidden="true" />
                </button>
                {row.onDelete ? (
                  <button type="button" onClick={row.onDelete} aria-label={`Delete ${row.label}`} data-tip="Delete" className={`${iconButton} hover:text-[#C9372C]`}>
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                ) : (
                  <span aria-hidden="true" className="fields-wide inline-block h-8 w-8" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
