import { useState, useEffect, useCallback, useRef } from "react";
import { CustomFieldDefinition, getCustomFields, FieldSurfaces, CUSTOM_FIELDS_CHANGED_EVENT } from "@/apis/custom-fields.api";
import { EntityTab, DEFAULT_BASE_FIELDS } from "@/components/CustomFields/custom-fields.constants";
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

export function useFieldConfig(entity: EntityTab = "job") {
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  const loadConfigs = useCallback(async () => {
    const current = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const data = await getCustomFields(entity);
      if (current !== request.current) return;
      setCustomFields(data || []);
      // Reading fields must never guess or change the applied template.
      if (entity === "job") await useIndexStore.getState().fetchTenant();
    } catch {
      if (current === request.current) {
        setCustomFields([]);
        setError("Unable to load field settings. Please try again.");
      }
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    const counter = request;
    void loadConfigs();
    const refresh = (event: Event) => {
      const changed = (event as CustomEvent<{ entityType?: string }>).detail?.entityType;
      if (!changed || changed === entity) void loadConfigs();
    };
    window.addEventListener(CUSTOM_FIELDS_CHANGED_EVENT, refresh);
    return () => {
      ++counter.current;
      window.removeEventListener(CUSTOM_FIELDS_CHANGED_EVENT, refresh);
    };
  }, [loadConfigs, entity]);

  const getFieldConfig = useCallback((key: string): ResolvedFieldConfig => {
    const definition = customFields.find(field => field.field_key === key);
    const base = entity === "job" ? undefined : DEFAULT_BASE_FIELDS[entity]?.find(field => field.field_key === key);
    return {
      field_key: key,
      label: definition?.label || base?.label || key.replaceAll("_", " "),
      isRequired: definition?.is_required ?? base?.is_required ?? false,
      isVisible: Boolean(definition || base) && (definition?.surfaces ?? base?.surfaces)?.disp !== false,
      data_type: definition?.data_type ?? base?.data_type,
      options: definition?.options ?? base?.options,
      surfaces: definition?.surfaces ?? base?.surfaces,
      description: definition?.description ?? base?.description ?? undefined,
      isCustomField: Boolean(definition),
    };
  }, [customFields, entity]);

  return { customFields, loading, error, getFieldConfig, reloadConfigs: loadConfigs };
}
