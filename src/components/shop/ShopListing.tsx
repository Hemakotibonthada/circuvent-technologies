import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import ShopGrid from "@/components/shop/ShopGrid";
import ShopStage from "@/components/shop/ShopStage";
import { ProductGridSkeleton } from "@/components/shop/ProductCardSkeleton";
import JsonLd from "@/components/JsonLd";
import { formatINR, SHIPPING, type Product } from "@/lib/shop-data";
import { productAvailability } from "@/lib/product-availability";
import { WARRANTY_MONTHS } from "@/lib/shop-policy";
import { catalogueCategories, categoryPath } from "@/lib/shop-categories";
import { getBreadcrumbJsonLd, getFAQJsonLd, getItemListJsonLd } from "@/lib/seo";

export const FAQS = [
  {
    question: "How much is shipping and how long does delivery take?",
    answer: `Shipping is free on orders over ${formatINR(SHIPPING.freeOver)}, and a flat ${formatINR(SHIPPING.flat)} below that. Orders are dispatched from our lab within 24–48 hours and typically arrive in 3–6 working days across India.`,
  },
  {
    question: "What warranty do Circuvent devices come with?",
    answer:
      `Every device ships with a ${WARRANTY_MONTHS}-month warranty covering manufacturing defects and firmware faults. We repair or replace the unit — you only cover return shipping if the fault isn't ours.`,
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

/**
 * The storefront listing, shared by /shop and /shop/c/[category].
 *
 * Both routes render exactly the same page; the only difference is whether a
 * category is selected. Keeping that in one component is what makes the
 * category routes cheap to have — they are the same listing with a filter
 * applied, not a second implementation that can drift from the first.
 *
 * `products` is always the whole catalogue: the category nav, the breadcrumb
 * and the category count all describe the store rather than the current view,
 * so they must not be derived from the filtered set.
 */
export default function ShopListing({
  products,
  activeCategory,
}: {
  products: Product[];
  activeCategory: string | null;
}) {
  const categories = catalogueCategories(products);

  // What this page is actually showing. On /shop that is everything.
  const visible = activeCategory
    ? products.filter((p) => p.category === activeCategory)
    : products;

  const rated = visible.filter((p) => (p.rating ?? 0) > 0);
  const avgRating = rated.length
    ? rated.reduce((sum, p) => sum + p.rating, 0) / rated.length
    : 0;
  const cheapest = visible.length ? Math.min(...visible.map((p) => p.price)) : 0;

  /*
   * Counted, not assumed.
   *
   * This read `products.length` under the label "Devices in stock", which is
   * the catalogue size and has nothing to do with stock. With most of the
   * catalogue sold out it sat directly above a grid of "Out of stock" badges
   * announcing that twenty-two devices were available — the first thing a
   * shopper reads on the page, and provably false by the time their eye
   * reaches the second row.
   *
   * A number that looks authoritative and is wrong is worse than no number:
   * it is the page telling somebody it does not know what it is talking about,
   * before they have scrolled.
   */
  const buyable = visible.filter((p) => productAvailability(p).canBuy).length;

  const stats = [
    {
      value: `${buyable}`,
      // The label changes with the number rather than the number being bent to
      // fit the label. "0 in stock" is a fact somebody can act on; "22 devices
      // in stock" above sold-out cards is not.
      label: buyable === visible.length ? "Devices in stock" : `In stock of ${visible.length}`,
    },
    // Store-wide on purpose, on both routes: it answers "how much else is
    // there", and the nav directly below it is the way through to the rest.
    { value: `${categories.length}`, label: "Categories" },
    { value: avgRating > 0 ? avgRating.toFixed(1) : "New", label: "Average rating", star: avgRating > 0 },
    { value: `from ${formatINR(cheapest)}`, label: "Entry price" },
  ];

  return (
    <>
      <JsonLd
        data={[
          getItemListJsonLd(visible),
          getBreadcrumbJsonLd(
            activeCategory
              ? [
                  { name: "Home", url: "/" },
                  { name: "Store", url: "/shop" },
                  { name: activeCategory, url: categoryPath(activeCategory) },
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
            products={visible}
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
              ? `Every ${activeCategory.toLowerCase()} device we make - designed, flashed and shipped by our own R&D lab in India, with a ${WARRANTY_MONTHS}-month warranty and free shipping over ${formatINR(SHIPPING.freeOver)}.`
              : `Smart, made-in-India devices - designed, flashed and shipped by our own R&D lab. Free shipping over ${formatINR(SHIPPING.freeOver)}, cash on delivery or wallet, and a ${WARRANTY_MONTHS}-month warranty on every product.`}
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

          {/* Crawlable category entry points — each is a real, prerendered page. */}
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
                  href={categoryPath(c)}
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
          <ShopGrid initialProducts={visible} />
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
