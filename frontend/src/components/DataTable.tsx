import type { ReactNode } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type OnChangeFn,
} from "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    mobileHidden?: boolean;
    className?: string;
    /** Filter control rendered inline in the column header. */
    filter?: ReactNode;
  }
}

/**
 * Shared desktop table chrome used by the PyPI/npm packages view and the
 * Events ledger: bordered container, optional toolbar row (search / filters /
 * count), sortable headers, expandable rows, and the bottom pager.
 * Sorting and pagination are server-side; this only renders state.
 */
export function DataTable<T>({
  columns,
  data,
  loading,
  emptyText,
  sorting,
  onSortingChange,
  toolbar,
  rowKey,
  expandedKey,
  onRowClick,
  renderExpanded,
  rowTourTag,
  footer,
}: {
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[];
  loading: boolean;
  emptyText: string;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  /** Rendered inside the shaded header strip above the column headers. */
  toolbar?: ReactNode;
  rowKey: (row: T) => string;
  expandedKey?: string | null;
  onRowClick?: (row: T) => void;
  /** Returns a <tr> (or fragment of rows) to render under an expanded row. */
  renderExpanded?: (row: T, colSpan: number, index: number) => ReactNode;
  rowTourTag?: (index: number) => string | undefined;
  /** Rendered below the table (pagination, totals). */
  footer?: ReactNode;
}) {
  const table = useReactTable({
    data,
    columns,
    state: sorting ? { sorting } : undefined,
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    enableSorting: !!onSortingChange,
  });
  const expandable = !!renderExpanded;
  const colCount = columns.length + (expandable ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded border border-line-1">
        {toolbar && (
          <div className="flex items-center justify-between gap-3 border-b border-line-2 bg-surface-2/70 px-3">
            {toolbar}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-b border-line-1">
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={`px-3 py-2.5 text-left text-xs font-medium text-ink-3 whitespace-nowrap ${
                        header.column.getCanSort() ? "cursor-pointer select-none hover:text-ink-2" : ""
                      }`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="text-ink-4">
                            {{ asc: "↑", desc: "↓" }[header.column.getIsSorted() as string] ?? "↕"}
                          </span>
                        )}
                        {header.column.columnDef.meta?.filter}
                      </span>
                    </th>
                  ))}
                  {expandable && <th className="w-6 px-2 py-2.5" />}
                </tr>
              ))}
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="py-12 text-center text-ink-3">Loading…</td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="py-12 text-center text-ink-3">{emptyText}</td>
                </tr>
              ) : (
                table.getRowModel().rows.flatMap((row, i) => {
                  const key = rowKey(row.original);
                  const isExpanded = expandable && expandedKey === key;
                  const clickable = !!onRowClick;
                  return [
                    <tr
                      key={key}
                      data-tour={rowTourTag?.(i)}
                      onClick={clickable ? () => onRowClick(row.original) : undefined}
                      className={`border-b border-line-1/50 transition-colors ${
                        clickable ? "cursor-pointer hover:bg-surface-2/30" : ""
                      } ${isExpanded ? "bg-surface-2/20" : ""}`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                      {expandable && (
                        <td className="px-2 py-2 text-ink-4 text-xs select-none">
                          {isExpanded ? "▲" : "▼"}
                        </td>
                      )}
                    </tr>,
                    ...(isExpanded ? [renderExpanded(row.original, colCount, i)] : []),
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {footer}
    </div>
  );
}
