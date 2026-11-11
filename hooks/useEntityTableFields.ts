"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CUSTOM_FIELDS_CHANGED_EVENT, getCustomFields, type CustomFieldDefinition } from "@/apis/custom-fields.api";
import { useIndexStore } from "@/store/index.store";
import { readSettingsFieldPreferences, type SettingsFieldPreferences } from "@/utils/settingsTable.columns";

type Entity = Exclude<CustomFieldDefinition["entity_type"], "job">;
const EMPTY_FIELDS: CustomFieldDefinition[] = [];
interface Snapshot {
  scope: string;
  fields: CustomFieldDefinition[];
  preferences: SettingsFieldPreferences;
}

/** Scope requests to the current tenant and let only the latest request publish a schema. */
export function useEntityTableFields(entity: Entity | undefined, enabled: boolean) {
  const tenant = useIndexStore(state => state.user?.tenant_id ?? null);
  const scope = JSON.stringify([tenant, entity]);
  const request = useRef(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [errorScope, setErrorScope] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled || !entity) return;
    const current = ++request.current;
    setLoading(true);
    try {
      const fields = await getCustomFields(entity);
      if (current !== request.current) return;
      if (!Array.isArray(fields)) throw new Error("Invalid field settings response");
      let preferences: SettingsFieldPreferences = { hiddenFields: [], surfaceOverrides: {} };
      try { preferences = readSettingsFieldPreferences(window.localStorage, entity); } catch { /* Storage can be disabled independently of the API. */ }
      setSnapshot({ scope, fields, preferences });
      setErrorScope(null);
    } catch {
      if (current === request.current) setErrorScope(scope);
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [enabled, entity, scope]);

  useEffect(() => {
    if (!enabled || !entity) return;
    const version = request;
    void reload();
    const onChange = (event: Event) => {
      const changed = (event as CustomEvent<{ entityType?: string }>).detail?.entityType;
      if (!changed || changed === entity) void reload();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === `syncnox_hidden_base_fields_${entity}` || event.key === `syncnox_base_field_overrides_${entity}`) void reload();
    };
    window.addEventListener(CUSTOM_FIELDS_CHANGED_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reload);
    return () => {
      ++version.current;
      window.removeEventListener(CUSTOM_FIELDS_CHANGED_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reload);
    };
  }, [enabled, entity, reload]);

  const current = snapshot?.scope === scope ? snapshot : null;
  return {
    fields: current?.fields || EMPTY_FIELDS,
    preferences: current?.preferences,
    ready: !entity || current !== null,
    loading: Boolean(enabled && entity && (loading || !current && errorScope !== scope)),
    error: errorScope === scope,
    reload,
  };
}
