"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { formatINR } from "@/lib/shop-data";
import {
  activeChips,
  SORT_OPTIONS,
  type FilterChipKey,
  type FilterState,
  type SortId,
  type ViewMode,
} from "@/lib/shop-filters";

interface ShopToolbarProps {
  state: FilterState;
  total: number;
  shown: number;
  loading: boolean;
  activeCount: number;
  onChange: (patch: Partial<FilterState>) => void;
  onRemoveChip: (key: FilterChipKey) => void;
  onClear: () => void;
  onOpenFilters: () => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export default function ShopToolbar({
  state,
  total,
  shown,
  loading,
  activeCount,
  onChange,
  onRemoveChip,
  onClear,
  onOpenFilters,
}: ShopToolbarProps) {
  const [draft, setDraft] = useState(state.q);
  const [lastPushed, setLastPushed] = useState(state.q);
  const onChangeRef = useRef(onChange);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // The query changed from outside (a pill was removed, or "Clear all") — adopt
  // it. Adjusting state during render is React's documented pattern for this,
  // and the lastPushed guard keeps in-flight keystrokes from being clobbered.
  if (state.q !== lastPushed) {
    setLastPushed(state.q);
    setDraft(state.q);
  }

  // Debounce keystrokes so the URL and result set update once the user pauses.
  useEffect(() => {
    if (draft === lastPushed) return;
    const timer = setTimeout(() => {
      setLastPushed(draft);
      onChangeRef.current({ q: draft });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, lastPushed]);

  const clearSearch = useCallback(() => {
    setLastPushed("");
    setDraft("");
    onChangeRef.current({ q: "" });
    inputRef.current?.focus();
  }, []);

  const chips = activeChips(state, formatINR);

  const viewButton = (mode: ViewMode, Icon: typeof LayoutGrid, label: string) => {
    const active = state.view === mode;
    return (
      <button
        type="button"
        onClick={() => onChange({ view: mode })}
        aria-pressed={active}
        aria-label={label}
        title={label}
        className="grid h-[44px] w-[44px] place-items-center rounded-lg transition-colors"
        style={{
          background: active ? "var(--accent-cyan-muted)" : "transparent",
          color: active ? "var(--accent-cyan)" : "var(--text-tertiary)",
        }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            ref={inputRef}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Search smart plug, water controller, safety…"
            aria-label="Search products"
            className="w-full rounded-xl border py-3 pl-11 pr-10 text-base outline-none transition-all sm:text-sm"
            style={{
              background: "var(--bg-surface)",
              borderColor: "var(--border-primary)",
              color: "var(--text-primary)",
            }}
          />
          {draft && (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full transition-opacity hover:opacity-70"
              style={{ background: "var(--bg-surface-hover)", color: "var(--text-tertiary)" }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          className="flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold lg:hidden"
          style={{
            background: "var(--bg-surface)",
            borderColor: activeCount ? "var(--border-accent)" : "var(--border-primary)",
            color: activeCount ? "var(--accent-cyan)" : "var(--text-secondary)",
          }}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span
              className="rounded-full px-1.5 text-[11px] font-bold"
              style={{ background: "var(--accent-cyan)", color: "#fff" }}
            >
              {activeCount}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="sr-only">Sort products by</span>
            <select
              value={state.sort}
              onChange={(e) => onChange({ sort: e.target.value as SortId })}
              className="min-h-[44px] rounded-xl border px-3 py-3 text-sm outline-none sm:py-2.5"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
              }}
            >
              {SORT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  Sort: {s.label}
                </option>
              ))}
            </select>
          </label>

          <div
            className="hidden items-center rounded-xl border p-1 sm:flex"
            role="group"
            aria-label="Result layout"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            {viewButton("grid", LayoutGrid, "Grid view")}
            {viewButton("list", List, "List view")}
          </div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Active:
          </span>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => onRemoveChip(chip.key)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
              style={{
                borderColor: "var(--border-accent)",
                background: "var(--accent-cyan-muted)",
                color: "var(--accent-cyan)",
              }}
            >
              {chip.label}
              <X className="h-3 w-3" aria-hidden="true" />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold underline underline-offset-2 transition-opacity hover:opacity-70"
            style={{ color: "var(--text-tertiary)" }}
          >
            Clear all
          </button>
        </div>
      )}

      <p aria-live="polite" aria-atomic="true" className="text-xs" style={{ color: "var(--text-muted)" }}>
        {loading
          ? "Loading products…"
          : total === 0
            ? "No products match your filters"
            : `Showing ${shown} of ${total} product${total === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
