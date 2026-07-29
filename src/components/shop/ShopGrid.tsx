"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MapPin, PackageX, RotateCcw, ShieldCheck, Truck, Wallet } from "lucide-react";
import { products as STATIC, formatINR, SHIPPING, type Product } from "@/lib/shop-data";
import {
  clearFilters,
  computeFacets,
  countActiveFilters,
  parseFilters,
  priceBounds,
  removeChip,
  selectProducts,
  serializeFilters,
  PAGE_SIZE,
  type FilterChipKey,
  type FilterState,
} from "@/lib/shop-filters";
import { useWishlist } from "./WishlistProvider";
import ProductCard from "./ProductCard";
import { ProductGridSkeleton } from "./ProductCardSkeleton";
import ShopFilters from "./ShopFilters";
import ShopToolbar from "./ShopToolbar";
import ShopDialog from "./ShopDialog";
import QuickViewModal from "./QuickViewModal";
import CompareBar from "./CompareBar";
import RecentlyViewed from "./RecentlyViewed";

const BENEFITS = [
  { icon: Truck, title: "Free shipping", sub: `On orders over ${formatINR(SHIPPING.freeOver)}` },
  { icon: ShieldCheck, title: "6-month warranty", sub: "On every device we ship" },
  { icon: Wallet, title: "COD & wallet", sub: "Pay the way you prefer" },
  { icon: MapPin, title: "Made in India", sub: "Built by our own R&D lab" },
];

export default function ShopGrid({ initialProducts }: { initialProducts?: Product[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { has: isSaved } = useWishlist();

  const [list, setList] = useState<Product[]>(initialProducts?.length ? initialProducts : STATIC);
  const [loading, setLoading] = useState(!initialProducts?.length);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickView, setQuickView] = useState<Product | null>(null);
  const [quickViewOpen, setQuickViewOpen] = useState(false);

  const state = useMemo(() => parseFilters(searchParams), [searchParams]);

  /* The page is rendered per request, so server-supplied products are already
     current. Only fetch when we were mounted without them (e.g. a client-side
     navigation that skipped the server payload). */
  const hasServerCatalog = !!initialProducts?.length;
  useEffect(() => {
    if (hasServerCatalog) return;
    let alive = true;
    fetch("/api/shop/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.success && Array.isArray(d.products) && d.products.length) {
          setList(d.products as Product[]);
        }
      })
      .catch(() => {
        /* keep whatever catalog we already have */
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hasServerCatalog]);

  /* URL is the single source of truth, so filters are shareable and the
     browser back button steps through them. */
  const update = useCallback(
    (patch: Partial<FilterState>) => {
      const next = { ...state, ...patch };
      const qs = serializeFilters(next);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [state, router, pathname]
  );

  const handleRemoveChip = useCallback(
    (key: FilterChipKey) => update(removeChip(state, key)),
    [update, state]
  );

  const handleClear = useCallback(() => update(clearFilters(state)), [update, state]);

  const filterOpts = useMemo(() => ({ isSaved }), [isSaved]);
  const results = useMemo(() => selectProducts(list, state, filterOpts), [list, state, filterOpts]);
  const facets = useMemo(() => computeFacets(list, state, filterOpts), [list, state, filterOpts]);
  const bounds = useMemo(() => priceBounds(list), [list]);
  const activeCount = countActiveFilters(state);

  /* Reset pagination whenever the result set itself changes (but not when the
     shopper merely switches between grid and list). Adjusting during render
     avoids briefly painting a long list before the effect trims it. */
  const resultsKey = serializeFilters({ ...state, view: "grid" });
  const [paginatedKey, setPaginatedKey] = useState(resultsKey);
  if (resultsKey !== paginatedKey) {
    setPaginatedKey(resultsKey);
    setVisible(PAGE_SIZE);
  }

  const openQuickView = useCallback((p: Product) => {
    setQuickView(p);
    setQuickViewOpen(true);
  }, []);

  const shown = results.slice(0, visible);
  const hasMore = results.length > visible;
  const isList = state.view === "list";

  return (
    <div>
      {/* Trust strip */}
      <ul className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BENEFITS.map((b) => (
          <li
            key={b.title}
            className="flex items-center gap-3 rounded-xl border p-4"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
              style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
            >
              <b.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {b.title}
              </p>
              <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>
                {b.sub}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:gap-8">
        {/* Desktop facets */}
        <aside className="hidden lg:block">
          <div
            className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border p-5"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
          >
            <ShopFilters
              state={state}
              facets={facets}
              bounds={bounds}
              activeCount={activeCount}
              onChange={update}
              onClear={handleClear}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <ShopToolbar
            state={state}
            total={results.length}
            shown={shown.length}
            loading={loading}
            activeCount={activeCount}
            onChange={update}
            onRemoveChip={handleRemoveChip}
            onClear={handleClear}
            onOpenFilters={() => setFiltersOpen(true)}
          />

          <div className="mt-5">
            {loading ? (
              <ProductGridSkeleton count={6} view={state.view} />
            ) : results.length > 0 ? (
              <>
                <div className={isList ? "grid gap-4" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"}>
                  {shown.map((p, i) => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      index={i}
                      view={state.view}
                      onQuickView={openQuickView}
                      priority={i < 3}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-8 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisible((v) => v + PAGE_SIZE)}
                      className="rounded-xl border px-6 py-3 text-sm font-semibold transition-colors"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border-accent)",
                        color: "var(--accent-cyan)",
                      }}
                    >
                      Load {Math.min(PAGE_SIZE, results.length - visible)} more products
                    </button>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {shown.length} of {results.length} shown
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div
                className="flex flex-col items-center gap-3 rounded-2xl border p-12 text-center"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
              >
                <PackageX className="h-8 w-8" aria-hidden="true" style={{ color: "var(--text-muted)" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {state.saved ? "Nothing saved yet" : "No products match your filters"}
                </p>
                <p className="max-w-sm text-sm" style={{ color: "var(--text-tertiary)" }}>
                  {state.saved
                    ? "Tap the heart on any product to save it here for later."
                    : "Try removing a filter or searching for something broader."}
                </p>
                {activeCount > 0 && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="mt-1 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" /> Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          <RecentlyViewed limit={4} catalog={list} />
        </div>
      </div>

      {/* Mobile filter sheet */}
      <ShopDialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description={`${results.length} product${results.length === 1 ? "" : "s"} match`}
        maxWidthClass="max-w-lg"
      >
        <div className="p-5">
          <ShopFilters
            state={state}
            facets={facets}
            bounds={bounds}
            activeCount={activeCount}
            onChange={update}
            onClear={handleClear}
          />
        </div>
        <div
          className="sticky bottom-0 p-4"
          style={{ background: "var(--bg-elevated)", borderTop: "1px solid var(--border-primary)" }}
        >
          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-semibold text-white"
          >
            Show {results.length} product{results.length === 1 ? "" : "s"}
          </button>
        </div>
      </ShopDialog>

      <QuickViewModal product={quickView} open={quickViewOpen} onClose={() => setQuickViewOpen(false)} />
      <CompareBar products={list} />
    </div>
  );
}
