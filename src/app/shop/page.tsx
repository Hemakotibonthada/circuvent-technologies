import { Suspense, cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import ShopGrid from "@/components/shop/ShopGrid";
import ShopStage from "@/components/shop/ShopStage";
import { ProductGridSkeleton } from "@/components/shop/ProductCardSkeleton";
import JsonLd from "@/components/JsonLd";
import { getMergedProducts } from "@/lib/shop-catalog";
import { formatINR, SHIPPING } from "@/lib/shop-data";
import { countActiveFilters, discountPct, parseFilters } from "@/lib/shop-filters";
import { SITE_URL } from "@/lib/config";
import {
  generatePageMetadata,
  getBreadcrumbJsonLd,
  getFAQJsonLd,
  getItemListJsonLd,
} from "@/lib/seo";

type SearchParams = Record<string, string | string[] | undefined>;

/** Reads the first value of a query param, ignoring repeats. */
function readParams(sp: SearchParams) {
  return {
    get(name: string): string | null {
      const v = sp[name];
      return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
    },
  };
}

// Deduped per request, so generateMetadata and the page body share one read.
const getCatalog = cache(getMergedProducts);

// Filters live in the URL, so the listing is rendered per request. That keeps
// deep links like /shop?cat=Safety server-rendered (and crawlable) instead of
// falling back to a client-only render behind the Suspense boundary.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const state = parseFilters(readParams(sp));
  const base = generatePageMetadata("shop");

  const products = await getCatalog();
  const known = new Set(products.map((p) => p.category));
  // Only a real, single category is a genuine landing page. Richer filter
  // combinations (and made-up categories) are an infinite URL space, so they
  // point back at the canonical listing and stay out of the index.
  const singleCategory =
    state.categories.length === 1 && known.has(state.categories[0]) ? state.categories[0] : null;
  const isBareListing = countActiveFilters(state) === 0;

  if (singleCategory && countActiveFilters(state) === 1) {
    const title = `${singleCategory} devices — Circuvent Store`;
    return {
      ...base,
      title: { absolute: title },
      description: `Shop Circuvent ${singleCategory.toLowerCase()} devices — made in India, 6-month warranty, free shipping over ${formatINR(SHIPPING.freeOver)}.`,
      alternates: { canonical: `${SITE_URL}/shop?cat=${encodeURIComponent(singleCategory)}` },
    };
  }

  return {
    ...base,
    alternates: { canonical: `${SITE_URL}/shop` },
    robots: isBareListing ? { index: true, follow: true } : { index: false, follow: true },
  };
}

const FAQS = [
  {
    question: "How much is shipping and how long does delivery take?",
    answer: `Shipping is free on orders over ${formatINR(SHIPPING.freeOver)}, and a flat ${formatINR(SHIPPING.flat)} below that. Orders are dispatched from our lab within 24–48 hours and typically arrive in 3–6 working days across India.`,
  },
  {
    question: "What warranty do Circuvent devices come with?",
    answer:
      "Every device ships with a 6-month warranty covering manufacturing defects and firmware faults. We repair or replace the unit — you only cover return shipping if the fault isn't ours.",
  },
  {
    question: "Can I pay cash on delivery?",
    answer:
      "Yes. You can pay by UPI, card or netbanking at checkout, use your Circuvent wallet balance, or choose cash on delivery on eligible pin codes.",
  },
  {
    question: "Do these devices work with Alexa and Google Home?",
    answer:
      "Most of our Wi-Fi devices — smart plugs, switches, lights, fans, locks and curtains — work with both Alexa and Google Home. The compatibility is listed in each product's specifications.",
  },
  {
    question: "What if I want to return a product?",
    answer:
      "Unused products in their original packaging can be returned within 7 days of delivery. Start the return from My orders and we'll arrange a pickup where the courier supports it.",
  },
];

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const state = parseFilters(readParams(sp));
  const products = await getCatalog();

  const categories = [...new Set(products.map((p) => p.category))].sort();
  const activeCategory =
    state.categories.length === 1 && categories.includes(state.categories[0])
      ? state.categories[0]
      : null;
  const rated = products.filter((p) => (p.rating ?? 0) > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, p) => sum + p.rating, 0) / rated.length
    : 0;
  const cheapest = products.length ? Math.min(...products.map((p) => p.price)) : 0;
  const bestDiscount = products.reduce((max, p) => Math.max(max, discountPct(p)), 0);

  const stats = [
    { value: `${products.length}`, label: "Devices in stock" },
    { value: `${categories.length}`, label: "Categories" },
    { value: avgRating > 0 ? avgRating.toFixed(1) : "New", label: "Average rating", star: avgRating > 0 },
    { value: `from ${formatINR(cheapest)}`, label: "Entry price" },
  ];

  return (
    <>
      <JsonLd
        data={[
          getItemListJsonLd(products),
          getBreadcrumbJsonLd(
            activeCategory
              ? [
                  { name: "Home", url: "/" },
                  { name: "Store", url: "/shop" },
                  { name: activeCategory, url: `/shop?cat=${encodeURIComponent(activeCategory)}` },
                ]
              : [
                  { name: "Home", url: "/" },
                  { name: "Store", url: "/shop" },
                ]
          ),
          getFAQJsonLd(FAQS),
        ]}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-24 pt-8 lg:px-8">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6">
          <ol className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            <li>
              <Link href="/" className="transition-opacity hover:opacity-70">
                Home
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="h-3 w-3" />
            </li>
            {activeCategory ? (
              <>
                <li>
                  <Link href="/shop" className="transition-opacity hover:opacity-70">
                    Store
                  </Link>
                </li>
                <li aria-hidden="true">
                  <ChevronRight className="h-3 w-3" />
                </li>
                <li aria-current="page" style={{ color: "var(--text-tertiary)" }}>
                  {activeCategory}
                </li>
              </>
            ) : (
              <li aria-current="page" style={{ color: "var(--text-tertiary)" }}>
                Store
              </li>
            )}
          </ol>
        </nav>
        {/*
          * Hero.
          *
          * A full-bleed product stage: one product at a time, an oversized
          * extruded headline behind it, and the product staged in a lit
          * alcove. Light mode is the airy reference, dark mode is the
          * showroom one -- same geometry, different lighting, driven from CSS
          * variables in globals.css.
          *
          * The stage replaced a Bento grid. Bento scored better on the design
          * database's performance axis and was the safer choice; the stage is
          * what was actually asked for, and it earns its place by staying a
          * showcase rather than becoming the navigation -- the grid, the
          * filters and every category link below are untouched and still
          * server-rendered.
          *
          * ShopStage is a Client Component and therefore a leaf: the page
          * stays a Server Component and the category links stay real anchors.
          */}
        <header className="mb-8">
          <ShopStage
            products={products}
            eyebrow="Circuvent Store"
            headline={activeCategory ?? "Smart home"}
          />

          {/*
            * The h1 is visually hidden because the stage carries the visual
            * headline, but it must still exist and stay first: it is what a
            * crawler and a screen reader read as the page's title, and the
            * oversized type behind the stage is aria-hidden precisely so it
            * does not compete for that role.
            */}
          <h1 id="shop-hero-title" className="sr-only">
            {activeCategory ? `${activeCategory} devices` : "Bring home Circuvent"}
          </h1>
          <p className="mt-6 max-w-2xl text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
            {activeCategory
              ? `Every ${activeCategory.toLowerCase()} device we make - designed, flashed and shipped by our own R&D lab in India, with a 6-month warranty and free shipping over ${formatINR(SHIPPING.freeOver)}.`
              : `Smart, made-in-India devices - designed, flashed and shipped by our own R&D lab. Free shipping over ${formatINR(SHIPPING.freeOver)}, cash on delivery or wallet, and a 6-month warranty on every product.`}
          </p>

          {/*
            * Stats stay, below the stage rather than inside it. They are the
            * kind of proof a buyer scans on the way to the grid, and putting
            * them in the glass panel would have pushed the price and the buy
            * button below the fold on a phone.
            */}
          <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label}>
                <dt className="sr-only">{s.label}</dt>
                <dd>
                  <span className="block text-xl font-extrabold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {s.value}
                  </span>
                  {/* --text-tertiary, not --text-muted: the latter measures
                      2.36:1 on the dark surface, well under the 4.5:1 floor. */}
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {s.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {/* Crawlable category entry points — each is a real, shareable filter URL. */}
          <nav aria-label="Shop by category" className="mt-6 flex flex-wrap gap-2">
            <Link
              href="/shop"
              aria-current={activeCategory ? undefined : "page"}
              className="inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
              style={{
                background: activeCategory ? "var(--bg-surface)" : "var(--accent-cyan-muted)",
                borderColor: activeCategory ? "var(--border-primary)" : "var(--border-accent)",
                color: activeCategory ? "var(--text-secondary)" : "var(--accent-cyan)",
              }}
            >
              All devices
            </Link>
            {categories.map((c) => {
              const isActive = activeCategory === c;
              return (
                <Link
                  key={c}
                  href={`/shop?cat=${encodeURIComponent(c)}`}
                  aria-current={isActive ? "page" : undefined}
                  className="inline-flex min-h-[44px] items-center rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    background: isActive ? "var(--accent-cyan-muted)" : "var(--bg-surface)",
                    borderColor: isActive ? "var(--border-accent)" : "var(--border-primary)",
                    color: isActive ? "var(--accent-cyan)" : "var(--text-secondary)",
                  }}
                >
                  {c}
                </Link>
              );
            })}
          </nav>
        </header>

        <Suspense fallback={<ProductGridSkeleton count={6} />}>
          <ShopGrid initialProducts={products} />
        </Suspense>

        {/* Buying FAQs — also emitted as FAQPage structured data above. */}
        <section className="mt-20" aria-labelledby="shop-faq-heading">
          <h2
            id="shop-faq-heading"
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            Before you buy
          </h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {FAQS.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border p-4"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)" }}
              >
                <summary
                  className="cursor-pointer list-none text-sm font-semibold marker:hidden"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span className="flex items-center justify-between gap-3">
                    {faq.question}
                    <ChevronRight
                      className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90"
                      aria-hidden="true"
                      style={{ color: "var(--accent-cyan)" }}
                    />
                  </span>
                </summary>
                <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
          <p className="mt-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
            Still deciding?{" "}
            <Link href="/contact" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-cyan-text)" }}>
              Talk to our team
            </Link>{" "}
            or read the{" "}
            <Link href="/warranty" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-cyan-text)" }}>
              warranty terms
            </Link>
            .
          </p>
        </section>
      </section>
    </>
  );
}
