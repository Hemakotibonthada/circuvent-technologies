"use client";

import { Heart, RotateCcw, Star, Tag } from "lucide-react";
import { formatINR } from "@/lib/shop-data";
import type { Facets, FilterState } from "@/lib/shop-filters";

interface ShopFiltersProps {
  state: FilterState;
  facets: Facets;
  bounds: { min: number; max: number };
  activeCount: number;
  onChange: (patch: Partial<FilterState>) => void;
  onClear: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-0 p-0">
      <legend
        className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em]"
        style={{ color: "var(--text-muted)" }}
      >
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="ml-auto text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
      {n}
    </span>
  );
}

/**
 * Faceted filter panel. Rendered as a sticky sidebar on large screens and
 * inside a bottom sheet on mobile — the same markup either way.
 */
export default function ShopFilters({
  state,
  facets,
  bounds,
  activeCount,
  onChange,
  onClear,
}: ShopFiltersProps) {
  const toggleCategory = (value: string) => {
    onChange({
      categories: state.categories.includes(value)
        ? state.categories.filter((c) => c !== value)
        : [...state.categories, value],
    });
  };

  const priceBucketActive = (min: number | null, max: number | null) =>
    state.minPrice === min && state.maxPrice === max;

  const toggleRow = (active: boolean) => ({
    background: active ? "var(--accent-cyan-muted)" : "transparent",
    color: active ? "var(--accent-cyan)" : "var(--text-secondary)",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Filters
          {activeCount > 0 && (
            <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
              {activeCount}
            </span>
          )}
        </h2>
        <button
          type="button"
          onClick={onClear}
          disabled={activeCount === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: "var(--text-tertiary)" }}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Clear all
        </button>
      </div>

      <Section title="Category">
        <ul className="space-y-0.5">
          {facets.categories.map((c) => {
            const checked = state.categories.includes(c.value);
            return (
              <li key={c.value}>
                <label
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors"
                  style={toggleRow(checked)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCategory(c.value)}
                    className="h-4 w-4 shrink-0 accent-cyan-600"
                  />
                  <span className="min-w-0 truncate">{c.value}</span>
                  <Count n={c.count} />
                </label>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Price">
        <ul className="space-y-0.5">
          {facets.prices.map((b) => {
            const active = priceBucketActive(b.min, b.max);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      active
                        ? { minPrice: null, maxPrice: null }
                        : { minPrice: b.min, maxPrice: b.max }
                    )
                  }
                  aria-pressed={active}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors"
                  style={toggleRow(active)}
                >
                  <span
                    aria-hidden="true"
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                    style={{ borderColor: active ? "var(--accent-cyan)" : "var(--border-hover)" }}
                  >
                    {active && <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent-cyan)" }} />}
                  </span>
                  <span className="min-w-0 truncate">{b.label}</span>
                  <Count n={b.count} />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex items-center gap-2">
          <label className="flex-1">
            <span className="sr-only">Minimum price in rupees</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={state.minPrice ?? ""}
              onChange={(e) =>
                onChange({ minPrice: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
              }
              placeholder={`Min ${bounds.min}`}
              className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
            />
          </label>
          <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
            –
          </span>
          <label className="flex-1">
            <span className="sr-only">Maximum price in rupees</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={state.maxPrice ?? ""}
              onChange={(e) =>
                onChange({ maxPrice: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })
              }
              placeholder={`Max ${bounds.max}`}
              className="w-full rounded-lg border px-2.5 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
            />
          </label>
        </div>
        <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Catalog ranges {formatINR(bounds.min)} – {formatINR(bounds.max)}
        </p>
      </Section>

      <Section title="Customer rating">
        <ul className="space-y-0.5">
          {facets.ratings.map((r) => {
            const active = state.minRating === r.value;
            return (
              <li key={r.value}>
                <button
                  type="button"
                  onClick={() => onChange({ minRating: active ? null : r.value })}
                  aria-pressed={active}
                  disabled={r.count === 0 && !active}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors disabled:opacity-40"
                  style={toggleRow(active)}
                >
                  <Star
                    className="h-4 w-4 shrink-0 fill-current"
                    aria-hidden="true"
                    style={{ color: "#f59e0b" }}
                  />
                  <span>{r.value} & up</span>
                  <Count n={r.count} />
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Availability & offers">
        <ul className="space-y-0.5">
          {(
            [
              { key: "inStock" as const, label: "In stock only", count: facets.inStock, Icon: Tag },
              { key: "onSale" as const, label: "On sale", count: facets.onSale, Icon: Tag },
              { key: "saved" as const, label: "Saved items", count: facets.saved, Icon: Heart },
            ]
          ).map(({ key, label, count, Icon }) => {
            const active = state[key];
            return (
              <li key={key}>
                <label
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors"
                  style={toggleRow(active)}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onChange({ [key]: !active } as Partial<FilterState>)}
                    className="h-4 w-4 shrink-0 accent-cyan-600"
                  />
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{label}</span>
                  <Count n={count} />
                </label>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}
