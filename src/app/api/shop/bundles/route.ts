import { NextResponse } from "next/server";
import { listBundles } from "@/lib/admin-bundles";
import { listProducts } from "@/lib/store";
import { products as staticProducts } from "@/lib/shop-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/shop/bundles — active bundles, priced from the live catalogue.
 *
 * Public counterpart to the admin bundles API. Bundles were admin-only, so one
 * the owner configured was invisible to every shopper; this is what makes them
 * discoverable.
 *
 * Savings are computed here rather than sent by the client, for the same reason
 * the discount itself is applied server-side: the figure shown on the product
 * page has to be the figure the checkout will actually apply.
 *
 * Only bundles that genuinely save money are returned. One priced at or above
 * the sum of its parts is never applied by the pricing rule, so advertising it
 * would promise a discount that never arrives.
 */
export async function GET() {
  const live = listProducts();

  const bundles = listBundles()
    .filter((b) => b.active && b.productIds.length > 0)
    .map((b) => {
      const items = b.productIds.map((id) => {
        const lp = live.find((p) => p.id === id);
        const sp = staticProducts.find((p) => p.id === id);
        if (!lp && !sp) return null;
        return {
          id,
          name: lp?.name ?? sp?.name ?? "",
          slug: lp?.slug ?? sp?.slug ?? "",
          price: lp?.price ?? sp?.price ?? 0,
          image: sp?.image ?? "",
        };
      });

      // A bundle naming a product that no longer exists cannot be priced
      // honestly, so it is withheld rather than shown with a partial total.
      if (items.some((i) => i === null)) return null;
      const resolved = items as NonNullable<(typeof items)[number]>[];

      const catalogTotal = resolved.reduce((s, i) => s + i.price, 0);
      const savings = catalogTotal - b.bundlePrice;
      if (savings <= 0) return null;

      return {
        id: b.id,
        name: b.name,
        productIds: b.productIds,
        bundlePrice: b.bundlePrice,
        catalogTotal,
        savings,
        savingsPct: Math.round((savings / catalogTotal) * 100),
        items: resolved,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  return NextResponse.json({ success: true, bundles });
}
