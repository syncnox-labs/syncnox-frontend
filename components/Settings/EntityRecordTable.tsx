"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button } from "antd";
import type { ColDef, GridApi, ICellRendererParams, SelectionChangedEvent } from "ag-grid-community";
import BaseTable from "@/components/Table/BaseTable";
import { createActionsColumn } from "@/components/Table/ActionsColumn";
import { useEntityTableFields } from "@/hooks/useEntityTableFields";
import { reconcileSettingsFilters, resolveSettingsColumns } from "@/utils/settingsTable.columns";

interface Props<T> {
  active: boolean;
  label: string;
  records: T[];
  columns: ColDef<T>[];
  checkedIds: number[];
  onCheckedIdsChange: (ids: number[]) => void;
  onOpenRecord: (record: T) => void;
  customFieldEntity?: "team_member" | "vehicle" | "depot";
}

export default function EntityRecordTable<T extends { id: number; name: string; custom_fields?: Record<string, unknown> }>({
  active, label, records, columns, checkedIds, onCheckedIdsChange, onOpenRecord, customFieldEntity,
}: Props<T>) {
  const [mounted, setMounted] = useState(active);
  const [api, setApi] = useState<GridApi<T> | null>(null);
  const syncingSelection = useRef(false);
  const fieldConfig = useEntityTableFields(customFieldEntity, mounted);
  const recordIds = useMemo(() => new Set(records.map(record => record.id)), [records]);

  // Preserve form drafts and grid state after the first visit to either view.
  useEffect(() => { if (active) setMounted(true); }, [active]);

  const tableColumns = useMemo<ColDef<T>[]>(() => [
    ...resolveSettingsColumns(columns, fieldConfig.fields, fieldConfig.preferences).map(column => column.colId === "name" ? {
      ...column,
      cellRenderer: ({ data, value }: ICellRendererParams<T>) => data ? (
        <button type="button" onClick={() => onOpenRecord(data)} className="text-blue-600 hover:underline font-semibold cursor-pointer border-none bg-transparent p-0 text-left" aria-label={"Edit " + data.name}>{value || "-"}</button>
      ) : null,
    } : column),
    createActionsColumn<T>({ actions: [{ key: "edit", label: "Edit", onClick: onOpenRecord }] }),
  ], [columns, fieldConfig.fields, fieldConfig.preferences, onOpenRecord]);

  const syncSelection = useCallback((grid: GridApi<T>) => {
    if (grid.isDestroyed()) return;
    const selected = new Set(checkedIds);
    syncingSelection.current = true;
    try {
      for (const node of grid.getSelectedNodes()) {
        if (node.data && !selected.has(node.data.id)) node.setSelected(false);
      }
      for (const id of selected) {
        const node = grid.getRowNode(String(id));
        if (node && !node.isSelected()) node.setSelected(true);
      }
    } finally { syncingSelection.current = false; }
  }, [checkedIds]);

  useEffect(() => {
    if (api && !api.isDestroyed()) syncSelection(api);
    const valid = checkedIds.filter(id => recordIds.has(id));
    if (valid.length !== checkedIds.length) onCheckedIdsChange(valid);
  }, [api, recordIds, checkedIds, onCheckedIdsChange, syncSelection]);

  useEffect(() => {
    if (!api || api.isDestroyed()) return;
    const model = api.getFilterModel();
    const valid = reconcileSettingsFilters(model, tableColumns);
    if (Object.keys(valid).length !== Object.keys(model).length) api.setFilterModel(valid);
  }, [api, tableColumns]);

  const onSelectionChanged = useCallback((event: SelectionChangedEvent<T>) => {
    if (syncingSelection.current || event.source === "rowDataChanged") return;
    const ids = event.api.getSelectedRows().map(row => row.id);
    const current = new Set(checkedIds);
    if (ids.length !== current.size || ids.some(id => !current.has(id))) onCheckedIdsChange(ids);
  }, [checkedIds, onCheckedIdsChange]);

  if (!mounted) return null;

  return (
    <section aria-label={label + " table"} className={(active ? "flex" : "hidden") + " min-h-0 min-w-0 flex-1 flex-col mt-2"}>
      {fieldConfig.error && <Alert type="warning" showIcon className="mb-2" title="Field settings could not be loaded." action={<Button size="small" onClick={() => void fieldConfig.reload()}>Retry</Button>} />}
      {(!fieldConfig.error || fieldConfig.ready) && (
        <BaseTable<T>
          columnDefs={tableColumns}
          rowData={records}
          loading={fieldConfig.loading && !fieldConfig.ready}
          pagination
          paginationPageSize={100}
          rowSelection="multiple"
          onGridReady={({ api: grid }: { api: GridApi<T> }) => { setApi(grid); syncSelection(grid); }}
          onRowDataUpdated={({ api: grid }: { api: GridApi<T> }) => syncSelection(grid)}
          onSelectionChanged={onSelectionChanged}
          onRowDoubleClicked={({ data }: { data?: T }) => { if (data) onOpenRecord(data); }}
          containerClassName="h-full w-full flex-1 min-h-0 min-w-0"
          containerStyle={{ height: "100%", width: "100%" }}
          emptyMessage={"No " + label.toLowerCase() + " to show"}
          minHeight={0}
        />
      )}
    </section>
  );
}
