"use client";

/**
 * Circuvent Console — data grid.
 *
 * One table implementation for every list surface in the console (devices,
 * events, users, automations, OTA jobs…). It handles sort, text filter,
 * multi-select with bulk actions, column visibility, pagination, CSV export and
 * a responsive card fallback below `sm`, so individual pages contribute only
 * their column definitions.
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download } from "lucide-react";
import {
  Button,
  EmptyState,
  IconButton,
  Pager,
  SearchField,
  Skeleton,
  downloadCsv,
  toCsv,
  usePersistentState,
} from "./primitives";

export interface Column<T> {
  key: string;
  header: string;
  /** Rendered cell. Keep it cheap — it runs for every visible row. */
  render: (row: T) => ReactNode;
  /** Sort/export value. Omit to make the column unsortable and blank in CSV. */
  value?: (row: T) => string | number | null;
  width?: string;
  align?: "left" | "right" | "center";
  /** Hidden by default but available from the column picker. */
  optional?: boolean;
  /** Never shown on narrow screens in the card fallback. */
  hideOnCard?: boolean;
}

export interface BulkAction<T> {
  id: string;
  label: string;
  icon?: typeof Download;
  danger?: boolean;
  run: (rows: T[]) => void;
}

type SortDir = "asc" | "desc";

export function DataGrid<T>({
  rows,
  columns,
  rowKey,
  loading,
  searchable = true,
  searchPlaceholder = "Filter rows",
  searchOn,
  onRowClick,
  bulkActions,
  pageSize = 25,
  exportName,
  toolbar,
  emptyTitle = "Nothing to show",
  emptyBody,
  storageKey,
  dense,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Extra text to match against beyond the column values. */
  searchOn?: (row: T) => string;
  onRowClick?: (row: T) => void;
  bulkActions?: BulkAction<T>[];
  pageSize?: number;
  /** Enables CSV export; used as the download filename stem. */
  exportName?: string;
  toolbar?: ReactNode;
  emptyTitle?: string;
  emptyBody?: string;
  /** Persists column visibility per surface. */
  storageKey?: string;
  dense?: boolean;
}) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);
  const [hidden, setHidden] = usePersistentState<string[]>(
    storageKey ? `cv.grid.${storageKey}.hidden` : "cv.grid.hidden",
    columns.filter((c) => c.optional).map((c) => c.key)
  );

  const visibleCols = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [columns, hidden]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const extra = searchOn ? searchOn(r) : "";
      const cells = columns.map((c) => (c.value ? String(c.value(r) ?? "") : "")).join(" ");
      return `${extra} ${cells}`.toLowerCase().includes(needle);
    });
  }, [rows, q, columns, searchOn]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.value) return filtered;
    const mult = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.value!(a);
      const bv = col.value!(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * mult;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  // A filter change can strand the viewport past the last page.
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [pageCount, page]);

  const paged = useMemo(() => sorted.slice(page * pageSize, page * pageSize + pageSize), [sorted, page, pageSize]);

  const toggleSort = (key: string) => {
    const col = columns.find((c) => c.key === key);
    if (!col?.value) return;
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const allOnPageSelected = paged.length > 0 && paged.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) paged.forEach((r) => next.delete(rowKey(r)));
      else paged.forEach((r) => next.add(rowKey(r)));
      return next;
    });
  };

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(rowKey(r))), [rows, selected, rowKey]);

  const exportCsv = () => {
    const cols = visibleCols.filter((c) => c.value);
    const csv = toCsv(
      cols.map((c) => c.header),
      sorted.map((r) => cols.map((c) => c.value!(r)))
    );
    downloadCsv(`${exportName ?? "export"}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const pad = dense ? "px-3 py-2" : "px-3.5 py-3";

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {(searchable || toolbar || exportName || columns.some((c) => c.optional)) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchable && <SearchField value={q} onChange={setQ} placeholder={searchPlaceholder} />}
          {toolbar}
          {columns.some((c) => c.optional) && (
            <div className="relative">
              <IconButton icon={Columns3} label="Choose columns" onClick={() => setShowCols((v) => !v)} active={showCols} />
              {showCols && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowCols(false)} />
                  <div
                    className="cv-card absolute right-0 top-12 z-30 w-56 rounded-xl p-2 shadow-2xl"
                    role="menu"
                  >
                    {columns.map((c) => {
                      const on = !hidden.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          onClick={() => setHidden((h) => (on ? [...h, c.key] : h.filter((k) => k !== c.key)))}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition hover:brightness-125"
                          style={{ color: "var(--cv-text)" }}
                        >
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded"
                            style={{ background: on ? "var(--cv-accent)" : "var(--cv-input-bg)", border: "1px solid var(--cv-border)" }}
                          >
                            {on && <span className="text-[9px] font-black text-white">✓</span>}
                          </span>
                          {c.header}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
          {exportName && <IconButton icon={Download} label="Export CSV" onClick={exportCsv} />}
        </div>
      )}

      {bulkActions && selected.size > 0 && (
        <div
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{ background: "color-mix(in srgb, var(--cv-accent) 12%, transparent)", border: "1px solid var(--cv-border)" }}
        >
          <span className="text-xs font-bold" style={{ color: "var(--cv-accent-hi)" }}>
            {selected.size} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {bulkActions.map((a) => (
              <Button key={a.id} icon={a.icon} variant={a.danger ? "danger" : "secondary"} onClick={() => a.run(selectedRows)}>
                {a.label}
              </Button>
            ))}
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyState title={q ? `No rows match “${q}”` : emptyTitle} body={q ? undefined : emptyBody} />
      ) : (
        <>
          {/* Table — sm and up */}
          <div className="cv-card hidden overflow-hidden rounded-2xl sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--cv-border)" }}>
                    {bulkActions && (
                      <th className={`${pad} w-10`}>
                        <input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} aria-label="Select all rows on page" className="h-4 w-4 accent-current" />
                      </th>
                    )}
                    {visibleCols.map((c) => {
                      const sortable = Boolean(c.value);
                      const isSorted = sortKey === c.key;
                      return (
                        <th
                          key={c.key}
                          style={{ width: c.width, textAlign: c.align ?? "left", color: "var(--cv-muted)" }}
                          className={`${pad} text-[13px] font-semibold`}
                        >
                          <button
                            onClick={() => toggleSort(c.key)}
                            disabled={!sortable}
                            className={`inline-flex items-center gap-1 ${sortable ? "cursor-pointer hover:brightness-150" : "cursor-default"}`}
                            style={{ color: isSorted ? "var(--cv-accent-hi)" : "inherit" }}
                          >
                            {c.header}
                            {sortable &&
                              (isSorted ? (
                                sortDir === "asc" ? (
                                  <ArrowUp className="h-3 w-3" />
                                ) : (
                                  <ArrowDown className="h-3 w-3" />
                                )
                              ) : (
                                <ChevronsUpDown className="h-3 w-3 opacity-40" />
                              ))}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row) => {
                    const id = rowKey(row);
                    const isSel = selected.has(id);
                    return (
                      <tr
                        key={id}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={`transition ${onRowClick ? "cursor-pointer hover:brightness-110" : ""}`}
                        style={{
                          borderBottom: "1px solid var(--cv-border)",
                          background: isSel ? "color-mix(in srgb, var(--cv-accent) 10%, transparent)" : undefined,
                        }}
                      >
                        {bulkActions && (
                          <td className={pad} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSel}
                              aria-label={`Select ${id}`}
                              onChange={() =>
                                setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(id)) next.delete(id);
                                  else next.add(id);
                                  return next;
                                })
                              }
                              className="h-4 w-4"
                            />
                          </td>
                        )}
                        {visibleCols.map((c) => (
                          <td key={c.key} className={pad} style={{ textAlign: c.align ?? "left", color: "var(--cv-text)" }}>
                            {c.render(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card fallback — below sm a 6-column table is unusable */}
          <div className="space-y-2 sm:hidden">
            {paged.map((row) => {
              const id = rowKey(row);
              const [head, ...rest] = visibleCols.filter((c) => !c.hideOnCard);
              return (
                <div
                  key={id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className="cv-card rounded-xl p-3.5"
                  role={onRowClick ? "button" : undefined}
                >
                  {head && <div className="mb-2 text-sm font-bold">{head.render(row)}</div>}
                  <div className="space-y-1.5">
                    {rest.map((c) => (
                      <div key={c.key} className="flex items-center justify-between gap-3 text-xs">
                        <span style={{ color: "var(--cv-muted)" }}>{c.header}</span>
                        <span className="min-w-0 truncate text-right" style={{ color: "var(--cv-text)" }}>
                          {c.render(row)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <Pager page={page} pageCount={pageCount} onPage={setPage} total={sorted.length} />
        </>
      )}
    </div>
  );
}
