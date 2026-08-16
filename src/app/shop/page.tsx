import type { Metadata } from "next";
import ShopListing from "@/components/shop/ShopListing";
import { getMergedProducts } from "@/lib/shop-catalog";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";

/*
 * The storefront listing, prerendered and revalidated.
 *
 * This page used to read searchParams so that /shop?cat=Safety came back
 * server-rendered. That worked, and it cost the whole page its cache: reading
 * searchParams makes Next classify the route as fully dynamic and emit
 * `Cache-Control: no-store, private` from the route itself, which no CDN may
 * store and which overrides anything set in next.config, in a `revalidate`
 * export, or in the proxy — all three were tried against a real deployment.
 * Every visitor therefore waited on a lambda and a Neon read: measured in
 * production at 900-1100ms warm and 9.6s on the first request after an idle
 * period, against ~200ms for the cached homepage.
 *
 * Categories are now real pages under /shop/c/[category], so this route has no
 * dynamic input left and can be prerendered. `revalidate` is what keeps that
 * honest: the catalogue still comes from the database, so a product or price
 * edited in the admin appears within the minute without a redeploy, and the
 * edge serves the stale copy instantly while the refresh happens behind it.
 */
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...generatePageMetadata("shop"),
    alternates: { canonical: `${SITE_URL}/shop` },
    robots: { index: true, follow: true },
  };
}

export default async function ShopPage() {
  const products = await getMergedProducts();
  return <ShopListing products={products} activeCategory={null} />;
}
