/**
 * Category URLs for the storefront.
 *
 * Categories used to be a query parameter (/shop?cat=Safety), which forced the
 * listing to read searchParams and therefore made Next render it as a fully
 * dynamic route. That emitted `Cache-Control: no-store` from the route itself
 * and no CDN could ever store the page, so every visitor waited on a lambda
 * and a database read. Giving categories a real path segment is what lets both
 * the listing and each category be prerendered.
 *
 * The slug is derived rather than stored: categories are free text on the
 * product record and admins can add new ones, so there is no id to key off.
 * Nothing is ever un-slugified — a slug is resolved by matching it against the
 * catalogue's own category names, so a category can be renamed without leaving
 * a broken mapping behind.
 */

/** URL segment for a category name: "Smart Lighting" -> "smart-lighting". */
export function categorySlug(category: string): string {
  return category
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The distinct category names present in a catalogue, sorted for stable output. */
export function catalogueCategories(products: { category: string }[]): string[] {
  return [...new Set(products.map((p) => p.category).filter(Boolean))].sort();
}

/**
 * Resolves a URL slug back to the category name it came from.
 *
 * Returns null when nothing matches, which the route turns into a 404. That
 * matters: quietly falling back to the full listing would let any invented
 * slug render a page, and every one of them would be a duplicate of /shop
 * competing with it in the index.
 *
 * Two categories can in principle slugify to the same segment ("E-Bikes" and
 * "E Bikes"). The first in sorted order wins so the choice is deterministic
 * rather than dependent on catalogue order.
 */
export function categoryFromSlug(
  products: { category: string }[],
  slug: string,
): string | null {
  const wanted = categorySlug(decodeURIComponent(slug));
  if (!wanted) return null;
  return catalogueCategories(products).find((c) => categorySlug(c) === wanted) ?? null;
}

/** Canonical path for a category listing. */
export function categoryPath(category: string): string {
  return `/shop/c/${categorySlug(category)}`;
}
