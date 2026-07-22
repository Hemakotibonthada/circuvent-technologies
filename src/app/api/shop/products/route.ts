import { NextResponse } from "next/server";
import { products as CATALOG } from "@/lib/shop-data";
import { listProducts, reviewSummaries } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/products
 * Public catalog with live stock / availability / price merged from the store,
 * plus real average rating + review count from customer reviews.
 */
export async function GET() {
  const stored = listProducts();
  const byId = new Map(stored.map((p) => [p.id, p]));
  const summaries = reviewSummaries();

  const merged = CATALOG.map((c) => {
    const s = byId.get(c.id);
    const rv = summaries[c.id];
    return {
      ...c,
      price: s?.price ?? c.price,
      stock: s?.stock ?? c.stock,
      available: s?.available ?? true,
      rating: rv && rv.count ? rv.average : c.rating,
      reviewCount: rv?.count ?? 0,
    };
  });

  // Admin-added products that aren't in the static catalog.
  for (const s of stored) {
    if (!CATALOG.find((c) => c.id === s.id)) {
      const rv = summaries[s.id];
      merged.push({
        id: s.id,
        slug: s.slug,
        name: s.name,
        tagline: "Circuvent device",
        description: "",
        price: s.price,
        category: s.category,
        accent: "#06b6d4",
        icon: "📦",
        specs: [],
        stock: s.stock,
        rating: rv && rv.count ? rv.average : 0,
        reviewCount: rv?.count ?? 0,
        available: s.available,
      });
    }
  }

  return NextResponse.json({ success: true, products: merged });
}
