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

  return (
    <Modal
      title={
        <div className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">
          {isEditing ? `Edit Field: ${label}` : `Add Custom Field (${selectedEntity.replace("_", " ").toUpperCase()})`}
        </div>
      }
      open={open}
      onOk={onSave}
      onCancel={onClose}
      okText={isEditing ? "Update Field" : "Add Field"}
      okButtonProps={{
        style: {
          backgroundColor: "#003220",
          borderColor: "#003220",
          borderRadius: 0,
          fontSize: "12px",
          height: "32px",
        },
      }}
      cancelButtonProps={{
        style: { borderRadius: 0, fontSize: "12px", height: "32px" },
      }}
      centered
      width={540}
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1 space-y-3.5 py-2 font-sans text-xs custom-scrollbar">
        {selectedEntity === "job" && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Section Group</label>
            <Select
              value={groupSection}
              onChange={setGroupSection}
              className="w-full text-xs"
              options={[
                ...(editingField?.group === "optimization" ? [{ value: "optimization", label: "Optimization Fields" }] : []),
                { value: "additional", label: "Additional Fields (Display)" },
                { value: "pod", label: "Proof of Delivery (POD)" },
              ]}
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Field Label <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="e.g. Gate pass number or Delivery photo"
            className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Field Key (Database identifier) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={fieldKey}
            disabled={isEditing}
            onChange={(e) => setFieldKey(e.target.value)}
            placeholder="e.g. gate_pass_number"
            className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none font-mono focus:border-[#003220] disabled:bg-gray-100 disabled:text-gray-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Data Type</label>
          <Select
            value={dataType}
            onChange={setDataType}
            className="w-full text-xs"
            disabled={Boolean(editingBaseFieldKey)}
            options={[
              { value: "string", label: "Text (String)" },
              { value: "number", label: "Number" },
              { value: "boolean", label: "Boolean (Yes / No)" },
              { value: "select", label: "Dropdown (Select)" },
              { value: "date", label: "Date" },
              { value: "geo", label: "Coordinates (Latitude, Longitude)" },
            ]}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Default Value</label>
          <input
            type="text"
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
            placeholder="Optional default value"
            className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220]"
          />
        </div>

        {dataType === "select" && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Options (comma-separated)</label>
            <input
              type="text"
              value={optionsStr}
              onChange={(e) => setOptionsStr(e.target.value)}
              placeholder="Option 1, Option 2, Option 3"
              className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220]"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Description / Help Text</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional help text for inputs"
            className="w-full text-xs border border-gray-200 rounded-none px-3 py-2 outline-none focus:border-[#003220]"
          />
        </div>

        {/* Visibility Surfaces Configurator */}
        <div className="pt-3 border-t border-gray-100">
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
            Visibility Across Apps
          </label>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center space-x-2 border border-gray-200 px-2.5 py-1.5 bg-white">
              <Checkbox
                checked={Boolean(surfacesState.disp)}
                onChange={(e) =>
                  setSurfacesState({ ...surfacesState, disp: e.target.checked })
                }
              >
                <span className="text-xs text-gray-800 font-medium">Dispatch Manager (D)</span>
              </Checkbox>
            </div>

            <div className="flex items-center space-x-2 border border-gray-200 px-2.5 py-1.5 bg-white">
              <Checkbox
                checked={Boolean(surfacesState.driver)}
                onChange={(e) =>
                  setSurfacesState({ ...surfacesState, driver: e.target.checked })
                }
              >
                <span className="text-xs text-gray-800 font-medium">Driver App (V)</span>
              </Checkbox>
            </div>

            <div className="flex items-center space-x-2 border border-gray-200 px-2.5 py-1.5 bg-white">
              <Checkbox
                checked={Boolean(surfacesState.track)}
                onChange={(e) =>
                  setSurfacesState({ ...surfacesState, track: e.target.checked })
                }
              >
                <span className="text-xs text-gray-800 font-medium">Customer Tracking (C)</span>
              </Checkbox>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100">
          <Checkbox
            checked={isRequired}
            onChange={(e) => setIsRequired(e.target.checked)}
          >
            <span className="text-xs text-gray-700 font-semibold">Field is Required</span>
          </Checkbox>
        </div>
      </div>
    </Modal>
  );
};
