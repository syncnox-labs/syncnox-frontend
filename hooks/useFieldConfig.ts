import { useState, useEffect, useCallback } from "react";
import { CustomFieldDefinition, getCustomFields, FieldSurfaces } from "@/apis/custom-fields.api";
import {
  EntityTab,
  DEFAULT_BASE_FIELDS,
  TEMPLATE_BASE_FIELDS,
  BaseFieldDefinition,
} from "@/components/CustomFields/custom-fields.constants";
import { useIndexStore } from "@/store/index.store";

export interface ResolvedFieldConfig {
  field_key: string;
  label: string;
  isRequired: boolean;
  isVisible: boolean;
  surfaces?: FieldSurfaces | null;
  data_type?: string;
  options?: string[] | number[] | null;
  description?: string;
  isCustomField?: boolean;
}

export function useFieldConfig(
  entity: EntityTab = "job",
  templateSlug: string = "pickup_delivery_job"
) {
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [baseFieldOverrides, setBaseFieldOverrides] = useState<
    Record<string, { is_required?: boolean; surfaces?: FieldSurfaces | null }>
  >({});
  const [hiddenBaseFields, setHiddenBaseFields] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getCustomFields(entity);
      setCustomFields(data || []);

      if (entity === "job" && data && data.length > 0) {
        const shuttleKeys = [
          "pickup_type",
          "drop_off_address",
          "pick_up_address",
          "go_pickup_point",
          "quant_id",
          "dress_code",
        ];
        const hasShuttleKey = data.some((f) => shuttleKeys.includes(f.field_key));
        const detectedTemplate = hasShuttleKey ? "worker_shuttle" : "pickup_delivery_job";

        // Access the store directly since hooks are used inside components
        const store = useIndexStore.getState();
        if (store.activeJobTemplate !== detectedTemplate) {
          store.updateActiveJobTemplate(detectedTemplate);
        }
      }

      if (typeof window !== "undefined") {
        const storedOverrides = localStorage.getItem(`syncnox_base_field_overrides_${entity}`);
        if (storedOverrides) {
          try {
            setBaseFieldOverrides(JSON.parse(storedOverrides));
          } catch (e) {
            setBaseFieldOverrides({});
          }
        } else {
          setBaseFieldOverrides({});
        }

        const storedHidden = localStorage.getItem(`syncnox_hidden_base_fields_${entity}`);
        if (storedHidden) {
          try {
            setHiddenBaseFields(JSON.parse(storedHidden));
          } catch (e) {
            setHiddenBaseFields([]);
          }
        } else {
          setHiddenBaseFields([]);
        }
      }
    } catch (err) {
      console.error(`Failed to load field configs for ${entity}:`, err);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs, templateSlug]);

  const getFieldConfig = useCallback(
    (fieldKey: string): ResolvedFieldConfig => {
      // 1. Check default base fields definitions
      const defaultBaseFields: BaseFieldDefinition[] =
        entity === "job"
          ? TEMPLATE_BASE_FIELDS[templateSlug] || DEFAULT_BASE_FIELDS.job
          : DEFAULT_BASE_FIELDS[entity] || [];

      const baseDef = defaultBaseFields.find((f) => f.field_key === fieldKey);

      // 2. Check custom field definitions returned from API
      const customDef = customFields.find((f) => f.field_key === fieldKey);

      // 3. Check local overrides from localStorage
      const override = baseFieldOverrides[fieldKey];
      const isHidden = hiddenBaseFields.includes(fieldKey);

      // Resolve label priority: customDef label > baseDef label > formatted key
      let label =
        customDef?.label ||
        baseDef?.label ||
        fieldKey
          .split("_")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");

      // Resolve isRequired priority: override > customDef > baseDef > false
      let isRequired = baseDef?.is_required ?? false;
      if (customDef?.is_required !== undefined) {
        isRequired = customDef.is_required;
      }
      if (override?.is_required !== undefined) {
        isRequired = override.is_required;
      }

      // Resolve surfaces / visibility
      const surfaces =
        override?.surfaces ??
        customDef?.surfaces ??
        baseDef?.surfaces ?? { disp: true, driver: true, track: true };

      const isVisible = !isHidden && surfaces?.disp !== false;

      return {
        field_key: fieldKey,
        label,
        isRequired,
        isVisible,
        surfaces,
        data_type: customDef?.data_type || baseDef?.data_type,
        options: customDef?.options || baseDef?.options,
        description: customDef?.description || baseDef?.description,
        isCustomField: Boolean(customDef && !baseDef),
      };
    },
    [entity, templateSlug, customFields, baseFieldOverrides, hiddenBaseFields]
  );

  return {
    customFields,
    baseFieldOverrides,
    hiddenBaseFields,
    loading,
    getFieldConfig,
    reloadConfigs: loadConfigs,
  };
}
