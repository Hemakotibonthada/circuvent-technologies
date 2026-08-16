/**
 * Categories are pages, not a query string.
 *
 * WHAT WENT WRONG
 *
 * /shop read searchParams so that ?cat=Safety came back server-rendered. That
 * is what made Next classify the route as fully dynamic, which makes it emit
 * `Cache-Control: no-store, private` from the route itself. No CDN could store
 * the storefront, so every visitor waited on a lambda and a database read:
 * measured in production at 900-1100ms warm and 9.6s on the first request
 * after an idle period, against ~200ms for the cached homepage.
 *
 * Three ways of overriding that header were tried against real deployments —
 * a headers() rule in next.config, a `revalidate` export, and setting it in
 * the proxy — and the route's own header won every time. The page could only
 * be cached by giving it nothing dynamic to read.
 *
 * These tests hold that shape in place, because the cheapest way to undo it is
 * to add `searchParams` back to either route without realising what it costs.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");

/*
 * Comments are stripped before matching. These files explain at length why
 * they must not read searchParams, and a test that greps the raw text would
 * fail on the explanation itself — then get "fixed" by deleting the reasoning.
 */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const shopPage = code(read("src", "app", "shop", "page.tsx"));
const categoryPage = code(read("src", "app", "shop", "c", "[category]", "page.tsx"));
const proxy = code(read("src", "proxy.ts"));
const sitemap = code(read("src", "app", "sitemap.ts"));

describe("the storefront stays prerenderable", () => {
  it("/shop reads no searchParams", () => {
    // The single line that decides whether this page can be cached at all.
    expect(shopPage).not.toMatch(/searchParams/);
  });

  it("the category page reads no searchParams either", () => {
    expect(categoryPage).not.toMatch(/searchParams/);
  });

  it("neither route forces dynamic rendering", () => {
    for (const src of [shopPage, categoryPage]) {
      expect(src).not.toMatch(/force-dynamic/);
    }
  });

  it("both declare a revalidate window so admin edits still land", () => {
    /*
     * Prerendered is not the same as frozen. The catalogue lives in the
     * database, so without this a price edited in the admin would need a
     * redeploy to reach the storefront.
     */
    expect(shopPage).toMatch(/export const revalidate = \d+/);
    expect(categoryPage).toMatch(/export const revalidate = \d+/);
  });
});

describe("category pages are real, indexable pages", () => {
  it("are prerendered from the catalogue", () => {
    expect(categoryPage).toMatch(/export async function generateStaticParams/);
  });

  it("still render categories added after the build", () => {
    // dynamicParams=false would 404 a category the store is actively selling,
    // and /shop links to every category the live catalogue reports.
    expect(categoryPage).toMatch(/export const dynamicParams = true/);
  });

  it("carry their own canonical rather than pointing back at /shop", () => {
    expect(categoryPage).toMatch(/canonical: `\$\{SITE_URL\}\/shop\/c\/\$\{categorySlug\(category\)\}`/);
  });

  it("refuse to render an unknown category as a copy of the listing", () => {
    expect(categoryPage).toMatch(/if \(!category\) notFound\(\)/);
  });

  it("mark an unknown category noindex", () => {
    /*
     * notFound() inside a route carrying `revalidate` is served with a 200 in
     * this app (the same is true of /shop/[slug] and /blog/[slug]). A soft 404
     * only matters if it can be indexed, so indexability is denied explicitly.
     */
    expect(categoryPage).toMatch(/robots: \{ index: false, follow: false \}/);
  });

  it("are listed in the sitemap", () => {
    expect(sitemap).toMatch(/categoryPages/);
    expect(sitemap).toMatch(/\.\.\.categoryPages/);
  });
});

describe("the old ?cat= URLs still resolve", () => {
  it("a lone category is redirected permanently to its page", () => {
    expect(proxy).toMatch(/NextResponse\.redirect\(url, 308\)/);
  });

  it("a combined filter is left alone", () => {
    /*
     * ?cat=A,B and ?cat=A&sort=price have no single destination. Redirecting
     * them to one category page would silently drop the rest of the shopper's
     * selection, so they stay on /shop and are applied client-side.
     */
    expect(proxy).toMatch(/!cat\.includes\(","\)/);
    expect(proxy).toMatch(/Array\.from\(searchParams\.keys\(\)\)\.length === 1/);
  });
});
