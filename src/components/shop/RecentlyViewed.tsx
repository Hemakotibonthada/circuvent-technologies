"use client";

import { useEffect, useState } from "react";
import { History, X } from "lucide-react";
import { products as STATIC, type Product } from "@/lib/shop-data";
import { getRecentlyViewedIds, clearRecentlyViewed } from "@/lib/recently-viewed";
import ProductCard from "./ProductCard";

/**
 * A rail of the products the visitor has recently viewed (from localStorage).
 * Renders nothing when there's nothing to show. `excludeId` hides the product
 * currently being viewed.
 */
export default function RecentlyViewed({
  excludeId,
  title = "Recently viewed",
  limit = 4,
  catalog: providedCatalog,
}: {
  excludeId?: string;
  title?: string;
  limit?: number;
  /** Supply the already-loaded catalog to avoid a duplicate network round-trip. */
  catalog?: Product[];
}) {
  const [fetched, setFetched] = useState<Product[] | null>(null);
  const [ids, setIds] = useState<string[]>([]);

  // Prefer the catalog handed down by the grid; only fall back to fetching.
  const catalog = providedCatalog?.length ? providedCatalog : (fetched ?? STATIC);

  useEffect(() => {
    const read = () => setIds(getRecentlyViewedIds());
    read();
    window.addEventListener("recently-viewed-changed", read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("recently-viewed-changed", read);
      window.removeEventListener("storage", read);
    };
  }, []);

  useEffect(() => {
    if (providedCatalog?.length) return;
    let alive = true;
    fetch("/api/shop/products")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.success && Array.isArray(d.products) && d.products.length) {
          setFetched(d.products as Product[]);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [providedCatalog]);

  const items = ids
    .filter((id) => id !== excludeId)
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is Product => !!p)
    .slice(0, limit);

  if (items.length === 0) return null;

  return (
    <div className="mt-16">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold" style={{ color: "var(--text-primary)" }}>
          <History className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> {title}
        </h2>
        <button
          onClick={clearRecentlyViewed}
          className="inline-flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </div>
  );
}
