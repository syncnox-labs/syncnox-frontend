"use client";

import React from "react";
import { Modal, Select, Checkbox } from "antd";
import { CustomFieldDefinition, FieldSurfaces } from "@/apis/custom-fields.api";
import { EntityTab } from "./custom-fields.constants";

interface CustomFieldFormModalProps {
  open: boolean;
  selectedEntity: EntityTab;
  editingField: CustomFieldDefinition | null;
  editingBaseFieldKey: string | null;
  label: string;
  fieldKey: string;
  dataType: CustomFieldDefinition["data_type"];
  defaultValue: string;
  isRequired: boolean;
  isVisibleInList: boolean;
  optionsStr: string;
  description: string;
  groupSection: "additional" | "optimization" | "pod";
  surfacesState: FieldSurfaces;
  onClose: () => void;
  onSave: () => void;
  onLabelChange: (val: string) => void;
  setFieldKey: (val: string) => void;
  setDataType: (val: CustomFieldDefinition["data_type"]) => void;
  setDefaultValue: (val: string) => void;
  setIsRequired: (val: boolean) => void;
  setIsVisibleInList: (val: boolean) => void;
  setOptionsStr: (val: string) => void;
  setDescription: (val: string) => void;
  setGroupSection: (val: "additional" | "optimization" | "pod") => void;
  setSurfacesState: (val: FieldSurfaces) => void;
}

export const CustomFieldFormModal: React.FC<CustomFieldFormModalProps> = ({
  open,
  selectedEntity,
  editingField,
  editingBaseFieldKey,
  label,
  fieldKey,
  dataType,
  defaultValue,
  isRequired,
  optionsStr,
  description,
  groupSection,
  surfacesState,
  onClose,
  onSave,
  onLabelChange,
  setFieldKey,
  setDataType,
  setDefaultValue,
  setIsRequired,
  setOptionsStr,
  setDescription,
  setGroupSection,
  setSurfacesState,
}) => {
  const isEditing = Boolean(editingField || editingBaseFieldKey);
  const entityWord = { job: "jobs", vehicle: "vehicles", team_member: "team members", depot: "depots" }[selectedEntity];

  const labelClass = "mb-1 block text-xs font-medium text-[#12211A]";
  const hintClass = "m-0 mt-1 text-xs leading-4 text-[#626E67]";
  const inputClass =
    "h-9 w-full rounded-none border border-transparent bg-[#F3F6F4] px-3 text-[13px] text-[#12211A] outline-none placeholder:text-[#626E67] focus:border-[#0B5D3B] focus:bg-white disabled:text-[#626E67]";

  // Who can see the field. One line each, with what that place is, so the three letters never need decoding.
  const audiences: { key: keyof FieldSurfaces; title: string; hint: string }[] = [
    { key: "disp", title: "Dispatcher", hint: "In this web app: the job form and the jobs table." },
    { key: "driver", title: "Driver app", hint: "On the driver's phone." },
    { key: "track", title: "Customer", hint: "On the tracking page sent to the customer." },
  ];

  return (
    <Modal
      rootClassName="lang"
      title={
        <div>
          <p className="m-0 text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67]">{isEditing ? "Edit field" : `New field for ${entityWord}`}</p>
          <p className="m-0 mt-1 text-lg font-medium leading-6 text-[#12211A]">{isEditing ? label || "Field" : "Add field"}</p>
        </div>
      }
      open={open}
      onOk={onSave}
      onCancel={onClose}
      okText={isEditing ? "Save changes" : "Add field"}
      centered
      width={520}
    >
      <div className="custom-scrollbar max-h-[70vh] space-y-4 overflow-y-auto py-2 pr-1 font-sans">
        <div>
          <label htmlFor="cf-label" className={labelClass}>
            Label <span className="text-[#C9372C]">*</span>
          </label>
          <input
            id="cf-label"
            type="text"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="For example: Gate pass number"
            className={inputClass}
          />
          <p className={hintClass}>The name people see on forms and tables.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cf-type" className={labelClass}>Type</label>
            <Select
              id="cf-type"
              value={dataType}
              onChange={setDataType}
              className="w-full"
              disabled={Boolean(editingBaseFieldKey)}
              options={[
                { value: "string", label: "Text" },
                { value: "number", label: "Number" },
                { value: "boolean", label: "Yes / No" },
                { value: "select", label: "Dropdown" },
                { value: "date", label: "Date" },
                { value: "geo", label: "Coordinates" },
              ]}
            />
          </div>
          {selectedEntity === "job" && (
            <div>
              <label htmlFor="cf-group" className={labelClass}>Section</label>
              <Select
                id="cf-group"
                value={groupSection}
                onChange={setGroupSection}
                className="w-full"
                options={[
                  ...(editingField?.group === "optimization" ? [{ value: "optimization", label: "Routing fields" }] : []),
                  { value: "additional", label: "Additional fields" },
                  { value: "pod", label: "Proof of delivery" },
                ]}
              />
            </div>
          )}
        </div>

        {dataType === "select" && (
          <div>
            <label htmlFor="cf-options" className={labelClass}>Choices</label>
            <input
              id="cf-options"
              type="text"
              value={optionsStr}
              onChange={(e) => setOptionsStr(e.target.value)}
              placeholder="Option 1, Option 2, Option 3"
              className={inputClass}
            />
            <p className={hintClass}>Separate the choices with commas.</p>
          </div>
        )}

        <div>
          <label htmlFor="cf-default" className={labelClass}>Default value</label>
          <input
            id="cf-default"
            type="text"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="cf-help" className={labelClass}>Help text</label>
          <input
            id="cf-help"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional. Shown under the field to explain what to enter."
            className={inputClass}
          />
        </div>

        <fieldset className="m-0 border-0 border-t border-solid border-[#E3E8E5] p-0 pt-4">
          <legend className="sr-only">Who sees this field</legend>
          <p className="m-0 mb-2 text-[11px] font-medium uppercase tracking-[0.09em] text-[#626E67]">Who sees it</p>
          <div className="flex flex-col gap-3 pb-1">
            {audiences.map((a) => (
              <Checkbox
                key={a.key}
                checked={Boolean(surfacesState[a.key])}
                onChange={(e) => setSurfacesState({ ...surfacesState, [a.key]: e.target.checked })}
                className="!flex items-start"
              >
                <span className="block text-[13px] font-medium leading-5 text-[#12211A]">{a.title}</span>
                <span className="block text-xs leading-4 text-[#626E67]">{a.hint}</span>
              </Checkbox>
            ))}
          </div>
        </fieldset>

        <div className="border-0 border-t border-solid border-[#E3E8E5] pt-4">
          <Checkbox checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="!flex items-start">
            <span className="block text-[13px] font-medium leading-5 text-[#12211A]">Required</span>
            <span className="block text-xs leading-4 text-[#626E67]">A record cannot be saved while this field is empty.</span>
          </Checkbox>
        </div>

        <div className="border-0 border-t border-solid border-[#E3E8E5] pt-4">
          <label htmlFor="cf-key" className={labelClass}>
            Key <span className="text-[#C9372C]">*</span>
          </label>
          <input
            id="cf-key"
            type="text"
            value={fieldKey}
            disabled={isEditing}
            onChange={(e) => setFieldKey(e.target.value)}
            placeholder="gate_pass_number"
            className={`${inputClass} font-mono`}
          />
          <p className={hintClass}>
            {isEditing
              ? "The name used in imports and by other systems. It cannot be changed after the field is created."
              : "Filled in from the label. Used as the column name in imports and by other systems. It cannot be changed later."}
          </p>
        </div>
      </div>
    </Modal>
  );
};
