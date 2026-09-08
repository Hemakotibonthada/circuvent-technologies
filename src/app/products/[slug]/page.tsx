import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ArrowRight } from "lucide-react";
import { getProductBySlug, formatPlanPrice, SAAS_PRODUCTS } from "@/lib/saas-products";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";
import ScrollReveal from "@/components/ScrollReveal";
import ProductSubscribe from "@/components/saas/ProductSubscribe";

export function generateStaticParams() {
  return SAAS_PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return {};
  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `${SITE_URL}/products/${product.slug}` },
  };
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  return (
    <div className="relative z-10 pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <Link
            href="/products"
            className="text-sm"
            style={{ color: "var(--accent-cyan)" }}
          >
            ← All products
          </Link>
          <div
            className="mt-4 rounded-2xl p-6 sm:p-8"
            style={{
              background: `linear-gradient(135deg, ${product.accent}22, transparent)`,
              border: `1px solid ${product.accent}44`,
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: product.accent }}>
              {product.domainLabel}
            </p>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {product.name}
            </h1>
            <p className="mt-2 max-w-2xl text-base" style={{ color: "var(--text-tertiary)" }}>
              {product.tagline}
            </p>
            <p className="mt-4 max-w-2xl text-sm" style={{ color: "var(--text-muted)" }}>
              {product.description}
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <section>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                What you get
              </h2>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {product.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: product.accent }} />
                    {f}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Live host
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                After purchase, the customer portal launches every product you own.
              </p>
              <a
                href={product.href}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium"
                style={{ color: "var(--accent-cyan)" }}
              >
                Open product URL <ArrowRight className="h-4 w-4" />
              </a>
            </section>
          </div>

          <div className="lg:col-span-1">
            <ProductSubscribe product={product} />
          </div>
        </div>
      </div>
    </div>
  );
}
