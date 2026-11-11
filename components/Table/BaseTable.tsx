"use client";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef, themeQuartz } from "ag-grid-community";
import { Spin } from "antd";

/**
 * Props interface for the BaseTable component
 * @template TData - The type of data for each row
 */
export interface BaseTableProps<TData = any> {
  // Required props
  columnDefs: ColDef<TData>[];
  rowData: TData[];

  // Optional - Container Styling (NEW - for custom layouts)
  containerClassName?: string; // Tailwind classes for the container
  containerStyle?: React.CSSProperties; // Inline styles for the container
  gridClassName?: string; // Tailwind classes for the grid wrapper
  gridStyle?: React.CSSProperties; // Inline styles for the grid wrapper

  // Optional - Theme Customization
  theme?: any; // Custom AG Grid theme
  themeParams?: Record<string, any>; // Override specific theme parameters

  // Optional - Grid Configuration
  defaultColDef?: ColDef<TData>; // Default column properties applied to all columns
  rowSelection?: any; // Row selection configuration
  pagination?: boolean; // Enable pagination (default: false)
  paginationPageSize?: number; // Number of rows per page (default: 100)

  // Optional - States
  loading?: boolean; // Show loading spinner
  emptyMessage?: string; // Message to display when there's no data
  minHeight?: number; // Minimum height for loading/empty states (default: 300)

  // Optional - Callbacks
  getRowId?: (params: any) => string;
  onRowClicked?: (event: any) => void;
  onSelectionChanged?: (event: any) => void;
  onGridReady?: (event: any) => void;

  // Forward all other AG Grid props
  [key: string]: any;
}

/**
 * BaseTable Component
 * A simplified, reusable AG Grid wrapper that's easy to use in custom layouts.
 *
 * @example
 * ```tsx
 * // Simple usage with auto height
 * <BaseTable
 *   columnDefs={columns}
 *   rowData={data}
 * />
 *
 * // Custom layout with explicit height
 * <BaseTable
 *   columnDefs={columns}
 *   rowData={data}
 *   containerStyle={{ height: '500px' }}
 * />
 *
 * // Full flex layout
 * <BaseTable
 *   columnDefs={columns}
 *   rowData={data}
 *   containerClassName="flex-1 min-h-0"
 * />
 * ```
 */
export default function BaseTable<TData = any>({
  columnDefs,
  rowData,
  containerClassName = "",
  containerStyle,
  gridClassName = "",
  gridStyle,
  theme,
  themeParams,
  defaultColDef,
  rowSelection,
  pagination = false,
  paginationPageSize = 100,
  loading = false,
  emptyMessage = "No data available",
  minHeight = 300,
  getRowId,
  onRowClicked,
  onSelectionChanged,
  onGridReady,
  ...otherGridProps
}: BaseTableProps<TData>) {
  const compact = useMediaQuery("(max-width: 1023px)");
  // Default theme configuration based on the app's design system
  const defaultTheme = useMemo(() => {
    const baseTheme = themeQuartz.withParams({
      borderColor: "#e5e7eb",
      headerRowBorder: true,
      rowBorder: { style: "solid", width: 1 },
      columnBorder: { style: "solid", width: 1 },
      accentColor: "#003220",
      backgroundColor: "#ffffff",
      foregroundColor: "#171717",
      selectedRowBackgroundColor: "#ecfdf5",
      rowHoverColor: "#ecfdf5",
      headerBackgroundColor: "#ffffff",
      headerTextColor: "#171717",
      headerFontSize: 14,
      headerHeight: 35,
      checkboxBorderRadius: 0,
      borderRadius: 0,
      wrapperBorderRadius: 0,
      headerColumnBorderHeight: 35,
      ...themeParams, // Allow override of specific params
    });

    return baseTheme;
  }, [themeParams]);

  // Default column definition
  const defaultColumnDef = useMemo<ColDef>(
    () => ({
      filter: true,
      resizable: true,
      sortable: true,
      ...defaultColDef, // Allow override
    }),
    [defaultColDef],
  );

  // Prevent column resizing from resetting when columnDefs updates by converting
  // explicitly set 'width' and 'flex' into 'initialWidth' and 'initialFlex'.
  const processedColumnDefs = useMemo(() => {
    if (!columnDefs) return columnDefs;
    return columnDefs.map((col) => {
      const newCol = { ...col } as any;
      if (newCol.width !== undefined && newCol.initialWidth === undefined) {
        newCol.initialWidth = newCol.width;
        delete newCol.width;
      }
      if (newCol.flex !== undefined && newCol.initialFlex === undefined) {
        newCol.initialFlex = newCol.flex;
        delete newCol.flex;
      }
      return newCol as ColDef<TData>;
    });
  }, [columnDefs]);

  // Row selection configuration: default selectAll to "all" so header checkbox selects all pages
  const processedRowSelection = useMemo(() => {
    if (!rowSelection) return undefined;

    if (rowSelection === "multiple") {
      return {
        mode: "multiRow",
        selectAll: "all",
      };
    }

    if (typeof rowSelection === "object" && rowSelection.mode === "multiRow") {
      return {
        selectAll: "all",
        ...rowSelection,
      };
    }

    return rowSelection;
  }, [rowSelection]);

  const defaultGetRowId = useMemo(() => {
    if (getRowId) return getRowId;
    return (params: any) => {
      const data = params.data;
      if (!data) return String(Math.random());
      if (data.id !== undefined && data.id !== null) return String(data.id);
      if (data._id !== undefined && data._id !== null) return String(data._id);
      if (data.uuid !== undefined && data.uuid !== null) return String(data.uuid);
      return String(Math.random());
    };
  }, [getRowId]);

  const overlayNoRowsTemplate = useMemo(() => {
    return `<div class="flex flex-col items-center justify-center p-6 text-gray-500">
      <svg class="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <span class="text-base font-medium text-gray-500">${emptyMessage}</span>
    </div>`;
  }, [emptyMessage]);

  // Loading state
  if (loading) {
    return (
      <div
        className={`flex flex-col justify-center items-center ${containerClassName}`}
        style={{ minHeight: `${minHeight}px`, ...containerStyle }}
      >
        <Spin size="large" />
        <div className="mt-4 text-primary">Loading...</div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 ${containerClassName}`} style={containerStyle}>
      <div className={`h-full w-full min-w-0 ${gridClassName}`} style={gridStyle}>
        <AgGridReact
          columnDefs={processedColumnDefs}
          rowData={rowData || []}
          overlayNoRowsTemplate={overlayNoRowsTemplate}
          defaultColDef={defaultColumnDef}
          rowSelection={processedRowSelection}
          getRowId={defaultGetRowId}
          suppressRowClickSelection={true}
          rowHeight={compact ? 48 : 32}
          theme={theme || defaultTheme}
          pagination={pagination}
          paginationPageSize={paginationPageSize}
          onRowClicked={onRowClicked}
          onSelectionChanged={onSelectionChanged}
          onGridReady={onGridReady}
          {...otherGridProps}
        />
      </div>
    </div>
  );
}
