// Server-only merged shop catalog.
//
// The static catalog (`shop-data.ts`) is the design source of truth, but live
// pricing / stock / offers and any admin-added products live in the durable
// store (`store.ts`, Neon-backed). This module merges the two so the storefront
// API, the shop grid, AND the product detail page all resolve the exact same
// set of products — including devices added from the admin inventory.
//
// Import this only from server components / route handlers (it pulls in the
// store, which must never reach the client bundle).
import { products as CATALOG, type Product } from "@/lib/shop-data";
import { listProducts, reviewSummaries, revalidate } from "@/lib/store";

/**
 * Returns every purchasable product with durable fields merged over the static
 * catalog, plus admin-added products that aren't in the catalog at all.
 * Always performs a durable read first so edits made on other serverless
 * instances are reflected.
 */
export async function getMergedProducts(): Promise<Product[]> {
  await revalidate(["products"]);
  const stored = listProducts();
  const byId = new Map(stored.map((p) => [p.id, p]));
  const summaries = reviewSummaries();

  const merged: Product[] = CATALOG.map((c) => {
    const s = byId.get(c.id);
    const rv = summaries[c.id];
    return {
      ...c,
      price: s?.price ?? c.price,
      compareAt: s?.compareAt ?? c.compareAt,
      stock: s?.stock ?? c.stock,
      available: s?.available ?? true,
      image: s?.image || c.image,
      images: s?.images && s.images.length ? s.images : c.images,
      description: s?.description || c.description,
      tagline: s?.tagline || c.tagline,
      specs: s?.specs && s.specs.length ? s.specs : c.specs,
      badge: s?.badge ?? c.badge,
      featured: s?.featured ?? c.featured,
      accent: s?.accent || c.accent,
      rating: rv && rv.count ? rv.average : c.rating,
      reviewCount: rv?.count ?? 0,
    };
  });

  for (const s of stored) {
    if (!CATALOG.find((c) => c.id === s.id)) {
      const rv = summaries[s.id];
      merged.push({
        id: s.id,
        slug: s.slug,
        name: s.name,
        tagline: s.tagline || "Circuvent device",
        description: s.description || "",
        price: s.price,
        compareAt: s.compareAt,
        category: s.category,
        accent: s.accent || "#06b6d4",
        icon: "📦",
        image: s.image,
        images: s.images,
        badge: s.badge,
        specs: s.specs || [],
        stock: s.stock,
        featured: s.featured,
        rating: rv && rv.count ? rv.average : 0,
        reviewCount: rv?.count ?? 0,
        available: s.available,
      });
    }
  }

  return merged;
}

/** Resolve a single product by slug from the merged catalog. */
export async function getMergedProduct(slug: string): Promise<Product | undefined> {
  const all = await getMergedProducts();
  return all.find((p) => p.slug === slug);
}
