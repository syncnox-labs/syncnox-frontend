"use client";

import React, { useState, useEffect } from "react";
import {
  CustomFieldDefinition,
  FieldSurfaces,
  getCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  resetCustomFields,
  notifyFieldChanges,
} from "@/apis/custom-fields.api";
import { Plus, RotateCcw, LayoutTemplate, Search } from "lucide-react";
import { ActionButton } from "@/components/ui/kit";
import { Modal, message, Spin } from "antd";
import { TemplateGalleryModal } from "@/components/CustomFields/TemplateGalleryModal";
import {
  EntityTab,
  BaseFieldDefinition,
  DEFAULT_BASE_FIELDS,
  TEMPLATE_BASE_FIELDS,
  DEFAULT_SURFACES,
} from "@/components/CustomFields/custom-fields.constants";
import { CustomFieldFormModal } from "@/components/CustomFields/CustomFieldFormModal";
import { FieldsSectionCard } from "@/components/CustomFields/FieldsSectionCard";
import { useIndexStore } from "@/store/index.store";
import SettingsPageTitle from "@/components/Settings/SettingsPageTitle";

export default function CustomFieldsSettingsPage() {
  const [selectedEntity, setSelectedEntity] = useState<EntityTab>("job");
  const { activeJobTemplate: storeActiveJobTemplate } = useIndexStore();
  const [activeJobTemplate, setActiveJobTemplate] = useState<string>("pickup_delivery_job");
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [hiddenBaseFields, setHiddenBaseFields] = useState<string[]>([]);
  const [baseFieldOverrides, setBaseFieldOverrides] = useState<
    Record<string, { is_required?: boolean; surfaces?: FieldSurfaces | null }>
  >({});
  const [loading, setLoading] = useState<boolean>(false);
  // Narrows the lists on this page by name or key. Nothing is saved; it only hides rows that do not match.
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    if (storeActiveJobTemplate) {
      setActiveJobTemplate(storeActiveJobTemplate);
    }
  }, [storeActiveJobTemplate]);

  const isBaseField = (f: CustomFieldDefinition) => {
    return f.group === "optimization";
  };

  const baseItemsFromApi: BaseFieldDefinition[] = customFields
    .filter(isBaseField)
    .map((f) => {
      const override = baseFieldOverrides[f.field_key];
      return {
        field_key: f.field_key,
        label: f.label,
        data_type: f.data_type,
        is_required: selectedEntity === "job" ? f.is_required : override?.is_required ?? f.is_required,
        description: f.description || "",
        group: (f.group as BaseFieldDefinition["group"]) || "optimization",
        surfaces: selectedEntity === "job" ? f.surfaces : override?.surfaces ?? f.surfaces,
      };
    });

  const fallbackBaseFields =
    selectedEntity === "job"
      ? TEMPLATE_BASE_FIELDS[activeJobTemplate] || DEFAULT_BASE_FIELDS.job
      : DEFAULT_BASE_FIELDS[selectedEntity];

  const currentBaseFields: BaseFieldDefinition[] =
    selectedEntity === "job" || customFields.length > 0 ? baseItemsFromApi : fallbackBaseFields;

  const baseFieldKeys = new Set(currentBaseFields.map((f) => f.field_key));
  const allCustomFields = customFields.filter((f) => !isBaseField(f) && !baseFieldKeys.has(f.field_key));

  const needle = query.trim().toLowerCase();
  const matches = (f: { label: string; field_key: string }) =>
    !needle || f.label.toLowerCase().includes(needle) || f.field_key.toLowerCase().includes(needle);
  const shownBaseFields = currentBaseFields.filter(matches);
  const filteredCustomFields = allCustomFields.filter(matches);
  const totalFields = currentBaseFields.length + allCustomFields.length;
  const shownFields = shownBaseFields.length + filteredCustomFields.length;
  const emptyText = needle ? "No fields here match your search." : undefined;
  // While searching, a section with no match is left out so the matches are not buried between empty boxes.
  const inSection = (group: string) => (f: { group?: string }) => (group === "additional" ? !f.group || f.group === "additional" : f.group === group);
  const sectionHasRows = (group: string) => !needle || shownBaseFields.some(inSection(group)) || filteredCustomFields.some(inSection(group));

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isTemplateGalleryOpen, setIsTemplateGalleryOpen] = useState<boolean>(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [editingBaseFieldKey, setEditingBaseFieldKey] = useState<string | null>(null);

  // Form State
  const [label, setLabel] = useState<string>("");
  const [fieldKey, setFieldKey] = useState<string>("");
  const [dataType, setDataType] = useState<CustomFieldDefinition["data_type"]>("string");
  const [defaultValue, setDefaultValue] = useState<string>("");
  const [isRequired, setIsRequired] = useState<boolean>(false);
  const [isVisibleInList, setIsVisibleInList] = useState<boolean>(true);
  const [optionsStr, setOptionsStr] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [groupSection, setGroupSection] = useState<"additional" | "optimization" | "pod">("additional");
  const [surfacesState, setSurfacesState] = useState<FieldSurfaces>(DEFAULT_SURFACES);

  // Load custom fields & hidden base fields & overrides from localStorage
  const loadFields = async (entity: EntityTab) => {
    try {
      setLoading(true);
      const data = await getCustomFields(entity);
      setCustomFields(data);
      if (entity === "job") {
        // The API owns the job schema; browser-only overrides must not hide
        // fields or disagree with forms in another browser.
        setHiddenBaseFields([]);
        setBaseFieldOverrides({});
        await useIndexStore.getState().fetchTenant();
        return;
      }

      const storedHidden = localStorage.getItem(`syncnox_hidden_base_fields_${entity}`);
      setHiddenBaseFields(storedHidden ? JSON.parse(storedHidden) : []);

      const storedOverrides = localStorage.getItem(`syncnox_base_field_overrides_${entity}`);
      setBaseFieldOverrides(storedOverrides ? JSON.parse(storedOverrides) : {});
    } catch (err: unknown) {
      console.error("Failed to load custom fields", err);
      message.error("Failed to load custom fields");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFields(selectedEntity);
  }, [selectedEntity]);

  const handleToggleBaseRequired = async (key: string, currentRequired: boolean, fieldLabel: string) => {
    const field = customFields.find(item => item.field_key === key);
    if (selectedEntity === "job" && field) {
      await handleToggleCustomRequired(field);
      return;
    }
    const updated = {
      ...baseFieldOverrides,
      [key]: {
        ...baseFieldOverrides[key],
        is_required: !currentRequired,
      },
    };
    setBaseFieldOverrides(updated);
    localStorage.setItem(`syncnox_base_field_overrides_${selectedEntity}`, JSON.stringify(updated));
    notifyFieldChanges(selectedEntity);
    message.success(`Set '${fieldLabel}' to ${!currentRequired ? "Required" : "Optional"} on this browser only. Other people do not see this change yet.`);
  };

  const handleToggleCustomRequired = async (field: CustomFieldDefinition) => {
    try {
      await updateCustomField(field.id, { is_required: !field.is_required });
      message.success(`Set '${field.label}' to ${!field.is_required ? "Required" : "Optional"}`);
      loadFields(selectedEntity);
    } catch {
      message.error("Failed to update custom field requirement");
    }
  };

  const handleLabelChange = (val: string) => {
    setLabel(val);
    if (!editingField && !editingBaseFieldKey) {
      const slug = val.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_");
      if (!fieldKey || fieldKey === label.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_")) {
        setFieldKey(slug);
      }
    }
  };

  const handleSave = async () => {
    if (!label.trim() || (!editingField && !editingBaseFieldKey && !fieldKey.trim())) {
      message.warning("Label and Field Key are required");
      return;
    }

    if (!editingField && !editingBaseFieldKey && baseFieldKeys.has(fieldKey.trim())) {
      message.warning(`"${fieldKey.trim()}" is already a system Base Field.`);
      return;
    }

    try {
      const optionsArr =
        dataType === "select"
          ? optionsStr.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;

      if (editingBaseFieldKey) {
        const updated = {
          ...baseFieldOverrides,
          [editingBaseFieldKey]: {
            ...baseFieldOverrides[editingBaseFieldKey],
            is_required: isRequired,
            surfaces: surfacesState,
          },
        };
        setBaseFieldOverrides(updated);
        localStorage.setItem(`syncnox_base_field_overrides_${selectedEntity}`, JSON.stringify(updated));
        notifyFieldChanges(selectedEntity);
        message.success("Saved on this browser only. Other people do not see this change yet.");
      } else if (editingField) {
        await updateCustomField(editingField.id, {
          label: label.trim(),
          data_type: dataType,
          default_value: defaultValue.trim() || null,
          is_required: isRequired,
          is_visible_in_list: Boolean(surfacesState.disp),
          options: optionsArr,
          description: description.trim() || null,
          group: groupSection,
          surfaces: surfacesState,
        });
        message.success("Custom field updated successfully!");
      } else {
        await createCustomField({
          entity_type: selectedEntity,
          display_order: customFields.reduce((maxOrder, field) => Math.max(maxOrder, field.display_order), -1) + 1,
          field_key: fieldKey.trim(),
          label: label.trim(),
          data_type: dataType,
          default_value: defaultValue.trim() || undefined,
          is_required: isRequired,
          is_visible_in_list: Boolean(surfacesState.disp),
          options: optionsArr,
          description: description.trim() || undefined,
          group: groupSection,
          surfaces: surfacesState,
        });
        message.success("Custom field created successfully!");
      }

      setIsModalOpen(false);
      resetForm();
      loadFields(selectedEntity);
    } catch (err: unknown) {
      const detail = (err as { detail?: unknown; response?: { data?: { detail?: unknown } } })?.response?.data?.detail
        ?? (err as { detail?: unknown })?.detail;
      message.error(typeof detail === "string" ? detail : "Failed to save field");
    }
  };

  const handleOpenEditModal = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setEditingBaseFieldKey(null);
    setLabel(field.label);
    setFieldKey(field.field_key);
    setDataType(field.data_type as typeof dataType);
    setDefaultValue(field.default_value || "");
    setIsRequired(field.is_required);
    setIsVisibleInList(field.is_visible_in_list);
    setOptionsStr(Array.isArray(field.options) ? field.options.join(", ") : "");
    setDescription(field.description || "");
    setGroupSection((field.group as typeof groupSection) || "additional");
    setSurfacesState(field.surfaces || DEFAULT_SURFACES);
    setIsModalOpen(true);
  };

  const handleOpenEditBaseModal = (
    bf: BaseFieldDefinition,
    currentRequired: boolean,
    currentSurfaces?: FieldSurfaces | null
  ) => {
    const configuredField = customFields.find(field => field.field_key === bf.field_key);
    if (selectedEntity === "job" && configuredField) {
      handleOpenEditModal(configuredField);
      return;
    }
    setEditingBaseFieldKey(bf.field_key);
    setEditingField(null);
    setLabel(bf.label);
    setFieldKey(bf.field_key);
    setDataType(bf.data_type as typeof dataType);
    setDefaultValue("");
    setIsRequired(currentRequired);
    setIsVisibleInList(true);
    setOptionsStr("");
    setDescription(bf.description || "");
    setGroupSection((bf.group as typeof groupSection) || "additional");
    setSurfacesState(currentSurfaces || DEFAULT_SURFACES);
    setIsModalOpen(true);
  };

  const handleDeleteCustomField = async (id: number, fieldName: string) => {
    Modal.confirm({
      title: "Delete Custom Field",
      content: `Are you sure you want to delete "${fieldName}"? This will permanently remove this field definition and its stored values.`,
      okText: "Delete",
      okType: "danger",
      cancelText: "Cancel",
      okButtonProps: { danger: true, style: { borderRadius: 0 } },
      cancelButtonProps: { style: { borderRadius: 0 } },
      onOk: async () => {
        try {
          await deleteCustomField(id);
          message.success("Custom field deleted");
          loadFields(selectedEntity);
        } catch {
          message.error("Failed to delete custom field");
        }
      },
    });
  };

  const handleDeleteBaseField = (fieldKey: string, fieldLabel: string) => {
    message.warning(`Base field '${fieldLabel}' cannot be deleted.`);
    return;
  };

  const handleToggleBaseField = async (key: string) => {
    const field = customFields.find(item => item.field_key === key);
    if (selectedEntity === "job" && field) {
      try {
        await updateCustomField(field.id, { surfaces: { ...field.surfaces, disp: field.surfaces?.disp === false } });
        await loadFields(selectedEntity);
      } catch {
        message.error("Failed to update field visibility");
      }
      return;
    }
    const updated = hiddenBaseFields.includes(key)
      ? hiddenBaseFields.filter((k) => k !== key)
      : [...hiddenBaseFields, key];

    setHiddenBaseFields(updated);
    localStorage.setItem(`syncnox_hidden_base_fields_${selectedEntity}`, JSON.stringify(updated));
    notifyFieldChanges(selectedEntity);
    message.info(`${updated.includes(key) ? "Hidden" : "Shown again"} on this browser only. Other people do not see this change yet.`);
  };

  const handleResetToDefault = () => {
    const entityLabel = tabs.find((t) => t.key === selectedEntity)?.label;

    Modal.confirm({
      title: `Reset ${entityLabel} Fields to Default`,
      content: `Are you sure you want to reset all field configurations for ${entityLabel}? All custom fields will be deleted and all standard base fields will be restored to default settings.`,
      okText: "Reset to Default",
      okType: "danger",
      cancelText: "Cancel",
      okButtonProps: { danger: true, style: { borderRadius: 0 } },
      cancelButtonProps: { style: { borderRadius: 0 } },
      onOk: async () => {
        try {
          await resetCustomFields(selectedEntity);
          localStorage.removeItem(`syncnox_hidden_base_fields_${selectedEntity}`);
          localStorage.removeItem(`syncnox_base_field_overrides_${selectedEntity}`);
          notifyFieldChanges(selectedEntity);
          setHiddenBaseFields([]);
          setBaseFieldOverrides({});
          message.success(`Custom fields for ${entityLabel} reset to default`);
          loadFields(selectedEntity);
        } catch (err: unknown) {
          console.error(err);
          message.error("Failed to reset fields to default");
        }
      },
    });
  };

  const resetForm = (presetGroup?: "additional" | "pod") => {
    setEditingField(null);
    setEditingBaseFieldKey(null);
    setLabel("");
    setFieldKey("");
    setDataType("string");
    setDefaultValue("");
    setIsRequired(false);
    setIsVisibleInList(true);
    setOptionsStr("");
    setDescription("");
    setGroupSection(presetGroup || "additional");
    setSurfacesState(DEFAULT_SURFACES);
  };

  const tabs: { key: EntityTab; label: string }[] = [
    { key: "job", label: "Jobs" },
    { key: "vehicle", label: "Vehicles" },
    { key: "team_member", label: "Team members" },
    { key: "depot", label: "Depots" },
  ];
  const entityLabel = tabs.find((t) => t.key === selectedEntity)?.label ?? "";
  const entitySingular = { job: "Job", vehicle: "Vehicle", team_member: "Team member", depot: "Depot" }[selectedEntity];


  return (
    <div className="lang kit-fluid responsive-settings flex flex-col h-full min-h-0 min-w-0 overflow-hidden font-sans">
      {/* ── Page header: one main action, one secondary, and the rare destructive one kept quiet ── */}
      <div className="responsive-toolbar flex items-end justify-between pb-3 shrink-0">
        <SettingsPageTitle
          title="Custom fields"
          description="Choose what each record asks for, which fields must be filled in, and who sees each one: the dispatcher, the driver app or the customer's tracking page."
        />
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton variant="quiet" icon={<RotateCcw size={14} aria-hidden="true" />} onClick={handleResetToDefault}>
            Reset to default
          </ActionButton>
          <ActionButton variant="secondary" icon={<LayoutTemplate size={14} aria-hidden="true" />} onClick={() => setIsTemplateGalleryOpen(true)}>
            Browse templates
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={<Plus size={15} aria-hidden="true" />}
            onClick={() => {
              resetForm("additional");
              setIsModalOpen(true);
            }}
          >
            Add field
          </ActionButton>
        </div>
      </div>

      {/* ── Which kind of record, and a search over its fields ── */}
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 shadow-[inset_0_-1px_0_#D5DCD8]">
        <div role="tablist" aria-label="Record type" className="flex max-w-full gap-5 overflow-x-auto whitespace-nowrap">
          {tabs.map((tab) => {
            const isActive = selectedEntity === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setSelectedEntity(tab.key);
                  setQuery("");
                }}
                className={`inline-flex h-9 shrink-0 cursor-pointer items-center border-0 bg-transparent px-0 text-sm outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0B5D3B] ${
                  isActive ? "font-medium text-[#12211A] shadow-[inset_0_-2px_0_#0B5D3B]" : "text-[#4A5750] hover:text-[#12211A]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="fields-search flex items-center gap-3 pb-1.5">
          <span className="text-xs tabular-nums text-[#626E67]" aria-live="polite">
            {needle ? `${shownFields} of ${totalFields} fields` : `${totalFields} fields`}
          </span>
          <label className="relative flex items-center">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-[#626E67]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields"
              aria-label={`Search ${entityLabel} fields`}
              className="h-8 w-[200px] rounded-none border border-transparent bg-[#F3F6F4] pl-8 pr-2.5 text-[13px] text-[#12211A] outline-none placeholder:text-[#626E67] focus:border-[#0B5D3B] focus:bg-white"
            />
          </label>
        </div>
      </div>

      {/* ── The fields ── */}
      <div className="flex-1 overflow-y-auto pt-6 pb-8 space-y-10 custom-scrollbar pr-1">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spin size="default" />
          </div>
        ) : needle && shownFields === 0 ? (
          <p className="m-0 bg-[#F3F6F4] px-4 py-5 text-[13px] text-[#626E67]">
            No {entityLabel.toLowerCase()} field matches &ldquo;{query.trim()}&rdquo;. Search looks at the field name and its key.
          </p>
        ) : selectedEntity === "job" ? (
          <>
            {sectionHasRows("optimization") && <FieldsSectionCard
              title="Routing fields"
              categoryTag="Used to build routes"
              description="The optimizer reads these to plan routes. You can rename them, make them required and choose who sees them. They cannot be deleted."
              baseItems={shownBaseFields.filter((f) => f.group === "optimization")}
              customItems={filteredCustomFields.filter((f) => f.group === "optimization")}
              hiddenBaseFields={hiddenBaseFields}
              baseFieldOverrides={baseFieldOverrides}
              onToggleBaseRequired={handleToggleBaseRequired}
              onToggleCustomRequired={handleToggleCustomRequired}
              onOpenEditBaseModal={handleOpenEditBaseModal}
              onOpenEditCustomModal={handleOpenEditModal}
              onDeleteBaseField={handleDeleteBaseField}
              onDeleteCustomField={handleDeleteCustomField}
              onToggleBaseVisibility={handleToggleBaseField}
              emptyText={emptyText}
            />}

            {sectionHasRows("additional") && <FieldsSectionCard
              title="Additional fields"
              categoryTag="Shown on the job"
              description="Information for people, not for the optimizer: names, phone numbers, notes. Add your own here."
              showAddButton
              onAddField={() => {
                resetForm("additional");
                setIsModalOpen(true);
              }}
              baseItems={shownBaseFields.filter((f) => !f.group || f.group === "additional")}
              customItems={filteredCustomFields.filter((f) => !f.group || f.group === "additional")}
              hiddenBaseFields={hiddenBaseFields}
              baseFieldOverrides={baseFieldOverrides}
              onToggleBaseRequired={handleToggleBaseRequired}
              onToggleCustomRequired={handleToggleCustomRequired}
              onOpenEditBaseModal={handleOpenEditBaseModal}
              onOpenEditCustomModal={handleOpenEditModal}
              onDeleteBaseField={handleDeleteBaseField}
              onDeleteCustomField={handleDeleteCustomField}
              onToggleBaseVisibility={handleToggleBaseField}
              emptyText={emptyText}
            />}

            {sectionHasRows("pod") && <FieldsSectionCard
              title="Proof of delivery"
              categoryTag="Filled in by the driver"
              description="What the driver records to complete a job. Some of it can be shown to the customer."
              showAddButton
              onAddField={() => {
                resetForm("pod");
                setIsModalOpen(true);
              }}
              baseItems={shownBaseFields.filter((f) => f.group === "pod")}
              customItems={filteredCustomFields.filter((f) => f.group === "pod")}
              hiddenBaseFields={hiddenBaseFields}
              baseFieldOverrides={baseFieldOverrides}
              onToggleBaseRequired={handleToggleBaseRequired}
              onToggleCustomRequired={handleToggleCustomRequired}
              onOpenEditBaseModal={handleOpenEditBaseModal}
              onOpenEditCustomModal={handleOpenEditModal}
              onDeleteBaseField={handleDeleteBaseField}
              onDeleteCustomField={handleDeleteCustomField}
              onToggleBaseVisibility={handleToggleBaseField}
              emptyText={emptyText}
            />}
          </>
        ) : (
          <FieldsSectionCard
            title={`${entitySingular} fields`}
            description="Built-in fields can be changed but not deleted. Add your own for anything else you need to record."
            showAddButton
            onAddField={() => {
              resetForm("additional");
              setIsModalOpen(true);
            }}
            markAdded
            baseItems={shownBaseFields}
            customItems={filteredCustomFields}
            hiddenBaseFields={hiddenBaseFields}
              baseFieldOverrides={baseFieldOverrides}
              onToggleBaseRequired={handleToggleBaseRequired}
              onToggleCustomRequired={handleToggleCustomRequired}
              onOpenEditBaseModal={handleOpenEditBaseModal}
              onOpenEditCustomModal={handleOpenEditModal}
              onDeleteBaseField={handleDeleteBaseField}
              onDeleteCustomField={handleDeleteCustomField}
              onToggleBaseVisibility={handleToggleBaseField}
              emptyText={emptyText}
          />
        )}
      </div>

      {/* ── Add / Edit Custom Field Modal ───────────────────────────────── */}
      <CustomFieldFormModal
        open={isModalOpen}
        selectedEntity={selectedEntity}
        editingField={editingField}
        editingBaseFieldKey={editingBaseFieldKey}
        label={label}
        fieldKey={fieldKey}
        dataType={dataType}
        defaultValue={defaultValue}
        isRequired={isRequired}
        isVisibleInList={isVisibleInList}
        optionsStr={optionsStr}
        description={description}
        groupSection={groupSection}
        surfacesState={surfacesState}
        onClose={() => {
          setIsModalOpen(false);
          resetForm();
        }}
        onSave={handleSave}
        onLabelChange={handleLabelChange}
        setFieldKey={setFieldKey}
        setDataType={setDataType}
        setDefaultValue={setDefaultValue}
        setIsRequired={setIsRequired}
        setIsVisibleInList={setIsVisibleInList}
        setOptionsStr={setOptionsStr}
        setDescription={setDescription}
        setGroupSection={setGroupSection}
        setSurfacesState={setSurfacesState}
      />

      {/* ── Template Gallery Modal ─────────────────────────────────────── */}
      <TemplateGalleryModal
        open={isTemplateGalleryOpen}
        entityType={selectedEntity}
        onClose={() => setIsTemplateGalleryOpen(false)}
        onApplied={() => {
          loadFields(selectedEntity);
        }}
      />
    </div>
  );
}
