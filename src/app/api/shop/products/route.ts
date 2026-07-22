import { NextResponse } from "next/server";
import { products as CATALOG } from "@/lib/shop-data";
import { listProducts } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/products
 * Public catalog with live stock / availability / price merged from the store.
 * Rich display fields (image, specs, ratings) come from the static catalog;
 * admin-managed fields (stock, availability, price) come from the store.
 */
export async function GET() {
  const stored = listProducts();
  const byId = new Map(stored.map((p) => [p.id, p]));

  const merged = CATALOG.map((c) => {
    const s = byId.get(c.id);
    return {
      ...c,
      price: s?.price ?? c.price,
      stock: s?.stock ?? c.stock,
      available: s?.available ?? true,
    };
  });

  // Admin-added products that aren't in the static catalog.
  for (const s of stored) {
    if (!CATALOG.find((c) => c.id === s.id)) {
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
        rating: 0,
        available: s.available,
      });
    }
  }

  return NextResponse.json({ success: true, products: merged });
}
