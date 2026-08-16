import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ShopListing from "@/components/shop/ShopListing";
import { getMergedProducts } from "@/lib/shop-catalog";
import { formatINR, SHIPPING } from "@/lib/shop-data";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";
import {
  catalogueCategories,
  categoryFromSlug,
  categorySlug,
} from "@/lib/shop-categories";

/*
 * A category listing, one prerendered page per category.
 *
 * These used to be query strings on /shop (?cat=Safety). That is what forced
 * the listing to be a fully dynamic route, and it also meant every category
 * shared one URL's worth of ranking signals while canonicalising back to
 * /shop, so none of them could rank on their own. A path segment fixes both:
 * each category is a real page that can be prerendered, linked, and indexed.
 *
 * Same `revalidate` as /shop, for the same reason — the catalogue is in the
 * database, so an admin edit has to reach these pages without a redeploy.
 */
export const revalidate = 60;

/**
 * Unknown slugs are allowed through to the page, which 404s them.
 *
 * Left at the default (true) deliberately: a category added in the admin
 * exists in the database long before anything rebuilds, and `false` would
 * serve a 404 for a category the store is actively selling.
 */
export const dynamicParams = true;

export async function generateStaticParams() {
  const products = await getMergedProducts();
  return catalogueCategories(products).map((c) => ({ category: categorySlug(c) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const products = await getMergedProducts();
  const category = categoryFromSlug(products, slug);

  /*
   * An unknown slug renders the not-found page, and Next serves that with a
   * 200 rather than a 404 for any route carrying `revalidate` — the same
   * already happens on /shop/[slug] and /blog/[slug], so it is the app's
   * existing behaviour and not something this route introduced.
   *
   * A soft 404 is only an SEO problem if it can be indexed, so the one thing
   * that must not be inherited here is indexability: these are brand new
   * crawlable URLs, and an invented slug renders a full-looking page. noindex
   * is asserted explicitly rather than left to the page's own metadata, which
   * would otherwise fall through to the storefront's indexable defaults.
   */
  if (!category) {
    return {
      title: { absolute: "Category not found — Circuvent Store" },
      robots: { index: false, follow: false },
    };
  }

  const count = products.filter((p) => p.category === category).length;
  const base = generatePageMetadata("shop");

  return {
    ...base,
    title: { absolute: `${category} devices — Circuvent Store` },
    description: `Shop ${count} Circuvent ${category.toLowerCase()} ${count === 1 ? "device" : "devices"} — made in India, 6-month warranty, free shipping over ${formatINR(SHIPPING.freeOver)}.`,
    alternates: { canonical: `${SITE_URL}/shop/c/${categorySlug(category)}` },
    robots: { index: true, follow: true },
  };
}

export default async function ShopCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const products = await getMergedProducts();
  const category = categoryFromSlug(products, slug);

  /*
   * A slug that matches no category is a 404, not the full listing.
   *
   * Falling back would let any invented slug render a complete copy of /shop,
   * and every one of those URLs would compete with the real listing in the
   * index while looking, to a shopper, like a category that exists.
   */
  if (!category) notFound();

  return <ShopListing products={products} activeCategory={category} />;
}
