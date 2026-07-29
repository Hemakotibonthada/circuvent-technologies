"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { ViewMode } from "@/lib/shop-filters";

/** Placeholder matching ProductCard's exact footprint, so nothing shifts. */
export function ProductCardSkeleton({ view = "grid" }: { view?: ViewMode }) {
  const isList = view === "list";
  return (
    <div
      aria-hidden="true"
      className={`flex overflow-hidden rounded-2xl border ${isList ? "flex-col sm:flex-row" : "h-full flex-col"}`}
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
    >
      <Skeleton
        variant="rectangular"
        className={isList ? "h-44 w-full sm:h-auto sm:w-56" : "h-48 w-full"}
      />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" height={12} className="w-24" />
          <Skeleton variant="text" height={12} className="w-16" />
        </div>
        <Skeleton variant="text" height={20} className="w-3/4" />
        <Skeleton variant="text" height={12} className="w-full" />
        <div className="space-y-1.5">
          <Skeleton variant="text" height={10} className="w-5/6" />
          <Skeleton variant="text" height={10} className="w-4/6" />
          <Skeleton variant="text" height={10} className="w-3/6" />
        </div>
        <div className="mt-auto space-y-3 pt-2">
          <Skeleton variant="text" height={26} className="w-1/3" />
          <div className="flex gap-2">
            <Skeleton variant="rounded" height={42} className="flex-1" />
            <Skeleton variant="rounded" height={42} width={48} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A full page of placeholders in the same layout as the live results. */
export function ProductGridSkeleton({
  count = 6,
  view = "grid",
}: {
  count?: number;
  view?: ViewMode;
}) {
  return (
    <div
      className={view === "list" ? "grid gap-4" : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"}
      role="status"
      aria-label="Loading products"
    >
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} view={view} />
      ))}
      <span className="sr-only">Loading products…</span>
    </div>
  );
}
