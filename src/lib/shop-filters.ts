// Storefront filtering, sorting and URL-state helpers.
//
// Kept pure and free of React/Next imports so the shop grid, the facet panel
// and the unit tests all share one implementation, and so filter state can be
// round-tripped through the URL (shareable, bookmarkable, back-button safe).

import type { Product } from "@/lib/shop-data";
import { cannotBuy, isLowStockNow, type AvailabilityInput } from "@/lib/product-availability";

export type SortId = "featured" | "price-asc" | "price-desc" | "rating" | "discount" | "name";
export type ViewMode = "grid" | "list";

export interface SortOption {
  id: SortId;
  label: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: Low to High" },
  { id: "price-desc", label: "Price: High to Low" },
  { id: "rating", label: "Customer rating" },
  { id: "discount", label: "Biggest discount" },
  { id: "name", label: "Name (A–Z)" },
];

const SORT_IDS = new Set<string>(SORT_OPTIONS.map((s) => s.id));

/** Number of products revealed per "Load more" step. */
export const PAGE_SIZE = 9;

export interface FilterState {
  q: string;
  categories: string[];
  minPrice: number | null;
  maxPrice: number | null;
  minRating: number | null;
  inStock: boolean;
  onSale: boolean;
  saved: boolean;
  sort: SortId;
  view: ViewMode;
}

export const DEFAULT_FILTERS: FilterState = {
  q: "",
  categories: [],
  minPrice: null,
  maxPrice: null,
  minRating: null,
  inStock: false,
  onSale: false,
  saved: false,
  sort: "featured",
  view: "grid",
};

/* ── Product predicates ─────────────────────────────────────────────────── */

/**
 * A product cannot be bought — sold out, not yet released, or withdrawn.
 *
 * The name is kept because a dozen call sites use it and every one of them
 * asks the same underlying question: should the buy button work? It now
 * delegates rather than re-deriving, so a product that has not launched stops
 * being described as "out of stock" everywhere at once. Surfaces that need to
 * tell the reasons apart should call productAvailability directly.
 */
export function isSoldOut(p: Product): boolean {
  return cannotBuy(p as AvailabilityInput);
}

/** In stock but nearly gone — drives the urgency label on the card. */
export function isLowStock(p: Product, threshold = 5): boolean {
  return isLowStockNow(p as AvailabilityInput, threshold);
}

/** Absolute rupee saving vs. the compare-at price (0 when not discounted). */
export function savingOf(p: Product): number {
  return p.compareAt && p.compareAt > p.price ? p.compareAt - p.price : 0;
}

/** Whole-percent discount vs. the compare-at price (0 when not discounted). */
export function discountPct(p: Product): number {
  const saving = savingOf(p);
  return saving > 0 && p.compareAt ? Math.round((saving / p.compareAt) * 100) : 0;
}

/** Free-text match across the fields a shopper would reasonably search by. */
export function matchesQuery(p: Product, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const terms = q.split(/\s+/);
  const haystack = [p.name, p.tagline, p.category, p.badge ?? "", p.description, ...(p.specs ?? [])]
    .join(" ")
    .toLowerCase();
  return terms.every((t) => haystack.includes(t));
}

/* ── Filtering & sorting ────────────────────────────────────────────────── */

export interface FilterOptions {
  /** Wishlist membership test, supplied by the client so this stays pure. */
  isSaved?: (id: string) => boolean;
}

export function applyFilters(
  products: Product[],
  state: FilterState,
  opts: FilterOptions = {}
): Product[] {
  const lo = state.minPrice ?? -Infinity;
  const hi = state.maxPrice ?? Infinity;
  const isSaved = opts.isSaved ?? (() => false);

  return products.filter((p) => {
    if (state.categories.length && !state.categories.includes(p.category)) return false;
    if (!matchesQuery(p, state.q)) return false;
    if (state.inStock && isSoldOut(p)) return false;
    if (state.onSale && discountPct(p) <= 0) return false;
    if (state.saved && !isSaved(p.id)) return false;
    if (state.minRating !== null && (p.rating ?? 0) < state.minRating) return false;
    if (p.price < lo || p.price > hi) return false;
    return true;
  });
}

export function sortProducts(products: Product[], sort: SortId): Product[] {
  const out = [...products];
  switch (sort) {
    case "price-asc":
      out.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
      break;
    case "price-desc":
      out.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
      break;
    case "rating":
      out.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
      break;
    case "discount":
      out.sort((a, b) => discountPct(b) - discountPct(a) || savingOf(b) - savingOf(a));
      break;
    case "name":
      out.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      // Featured: in-stock first, then flagged featured, then best rated.
      out.sort(
        (a, b) =>
          Number(isSoldOut(a)) - Number(isSoldOut(b)) ||
          Number(!!b.featured) - Number(!!a.featured) ||
          (b.rating ?? 0) - (a.rating ?? 0)
      );
  }
  return out;
}

/** Filter then sort — the single entry point used by the grid. */
export function selectProducts(
  products: Product[],
  state: FilterState,
  opts: FilterOptions = {}
): Product[] {
  return sortProducts(applyFilters(products, state, opts), state.sort);
}

/* ── Facets ─────────────────────────────────────────────────────────────── */

export interface Facets {
  categories: { value: string; count: number }[];
  inStock: number;
  onSale: number;
  saved: number;
  ratings: { value: number; count: number }[];
  prices: { id: string; label: string; min: number | null; max: number | null; count: number }[];
}

/** Fixed price bands — buckets with no matching products are dropped. */
export const PRICE_BUCKETS: { id: string; label: string; min: number | null; max: number | null }[] = [
  { id: "under-1000", label: "Under ₹1,000", min: null, max: 999 },
  { id: "1000-1999", label: "₹1,000 – ₹1,999", min: 1000, max: 1999 },
  { id: "2000-2999", label: "₹2,000 – ₹2,999", min: 2000, max: 2999 },
  { id: "3000-plus", label: "₹3,000 & above", min: 3000, max: null },
];

/**
 * Counts shown next to each facet. Every facet is counted against the result
 * set with that facet's own constraint lifted, so options never read "0" just
 * because they are the option currently selected.
 */
export function computeFacets(
  products: Product[],
  state: FilterState,
  opts: FilterOptions = {}
): Facets {
  const without = (patch: Partial<FilterState>) => applyFilters(products, { ...state, ...patch }, opts);

  const categoryPool = without({ categories: [] });
  const categoryCounts = new Map<string, number>();
  for (const p of categoryPool) {
    categoryCounts.set(p.category, (categoryCounts.get(p.category) ?? 0) + 1);
  }

  const stockPool = without({ inStock: false });
  const salePool = without({ onSale: false });
  const savedPool = without({ saved: false });
  const ratingPool = without({ minRating: null });
  const pricePool = without({ minPrice: null, maxPrice: null });

  return {
    categories: [...categoryCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    inStock: stockPool.filter((p) => !isSoldOut(p)).length,
    onSale: salePool.filter((p) => discountPct(p) > 0).length,
    saved: savedPool.filter((p) => (opts.isSaved ?? (() => false))(p.id)).length,
    ratings: [4.5, 4, 3.5].map((value) => ({
      value,
      count: ratingPool.filter((p) => (p.rating ?? 0) >= value).length,
    })),
    prices: PRICE_BUCKETS.map((b) => ({
      ...b,
      count: pricePool.filter(
        (p) => p.price >= (b.min ?? -Infinity) && p.price <= (b.max ?? Infinity)
      ).length,
    })).filter((b) => b.count > 0),
  };
}

/** Min/max price across a catalog — seeds the price inputs' placeholders. */
export function priceBounds(products: Product[]): { min: number; max: number } {
  if (!products.length) return { min: 0, max: 0 };
  const prices = products.map((p) => p.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/* ── Active-filter summary ──────────────────────────────────────────────── */

export type FilterChipKey =
  | { kind: "q" }
  | { kind: "category"; value: string }
  | { kind: "price" }
  | { kind: "rating" }
  | { kind: "inStock" }
  | { kind: "onSale" }
  | { kind: "saved" };

export interface FilterChip {
  id: string;
  label: string;
  key: FilterChipKey;
}

/** Human-readable pills for everything currently narrowing the results. */
export function activeChips(state: FilterState, formatPrice: (n: number) => string): FilterChip[] {
  const chips: FilterChip[] = [];
  if (state.q.trim()) chips.push({ id: "q", label: `“${state.q.trim()}”`, key: { kind: "q" } });
  for (const c of state.categories) {
    chips.push({ id: `cat:${c}`, label: c, key: { kind: "category", value: c } });
  }
  if (state.minPrice !== null || state.maxPrice !== null) {
    const lo = state.minPrice !== null ? formatPrice(state.minPrice) : "Any";
    const hi = state.maxPrice !== null ? formatPrice(state.maxPrice) : "Any";
    chips.push({ id: "price", label: `${lo} – ${hi}`, key: { kind: "price" } });
  }
  if (state.minRating !== null) {
    chips.push({ id: "rating", label: `${state.minRating}★ & up`, key: { kind: "rating" } });
  }
  if (state.inStock) chips.push({ id: "stock", label: "In stock", key: { kind: "inStock" } });
  if (state.onSale) chips.push({ id: "sale", label: "On sale", key: { kind: "onSale" } });
  if (state.saved) chips.push({ id: "saved", label: "Saved items", key: { kind: "saved" } });
  return chips;
}

/** Removing a single pill, leaving every other constraint intact. */
export function removeChip(state: FilterState, key: FilterChipKey): FilterState {
  switch (key.kind) {
    case "q":
      return { ...state, q: "" };
    case "category":
      return { ...state, categories: state.categories.filter((c) => c !== key.value) };
    case "price":
      return { ...state, minPrice: null, maxPrice: null };
    case "rating":
      return { ...state, minRating: null };
    case "inStock":
      return { ...state, inStock: false };
    case "onSale":
      return { ...state, onSale: false };
    case "saved":
      return { ...state, saved: false };
    default:
      return state;
  }
}

/** How many constraints are applied — drives the mobile "Filters (n)" badge. */
export function countActiveFilters(state: FilterState): number {
  let n = 0;
  if (state.q.trim()) n += 1;
  n += state.categories.length;
  if (state.minPrice !== null || state.maxPrice !== null) n += 1;
  if (state.minRating !== null) n += 1;
  if (state.inStock) n += 1;
  if (state.onSale) n += 1;
  if (state.saved) n += 1;
  return n;
}

/** Reset everything except presentation preferences (sort / view). */
export function clearFilters(state: FilterState): FilterState {
  return { ...DEFAULT_FILTERS, sort: state.sort, view: state.view };
}

/* ── URL round-tripping ─────────────────────────────────────────────────── */

interface ReadableParams {
  get(name: string): string | null;
}

function parsePositiveNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseFilters(params: ReadableParams): FilterState {
  const sortRaw = params.get("sort");
  const viewRaw = params.get("view");
  let minPrice = parsePositiveNumber(params.get("min"));
  let maxPrice = parsePositiveNumber(params.get("max"));
  // Tolerate a reversed range from hand-edited URLs rather than showing zero results.
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const ratingRaw = parsePositiveNumber(params.get("rating"));

  return {
    q: params.get("q") ?? "",
    categories: (params.get("cat") ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    minPrice,
    maxPrice,
    minRating: ratingRaw !== null && ratingRaw > 0 && ratingRaw <= 5 ? ratingRaw : null,
    inStock: params.get("stock") === "1",
    onSale: params.get("sale") === "1",
    saved: params.get("saved") === "1",
    sort: sortRaw && SORT_IDS.has(sortRaw) ? (sortRaw as SortId) : DEFAULT_FILTERS.sort,
    view: viewRaw === "list" ? "list" : "grid",
  };
}

/** Serialize to a query string, omitting defaults so clean URLs stay clean. */
export function serializeFilters(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.categories.length) params.set("cat", state.categories.join(","));
  if (state.minPrice !== null) params.set("min", String(state.minPrice));
  if (state.maxPrice !== null) params.set("max", String(state.maxPrice));
  if (state.minRating !== null) params.set("rating", String(state.minRating));
  if (state.inStock) params.set("stock", "1");
  if (state.onSale) params.set("sale", "1");
  if (state.saved) params.set("saved", "1");
  if (state.sort !== DEFAULT_FILTERS.sort) params.set("sort", state.sort);
  if (state.view !== DEFAULT_FILTERS.view) params.set("view", state.view);
  return params.toString();
}
