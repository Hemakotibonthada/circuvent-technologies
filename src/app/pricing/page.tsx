import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { SAAS_PLANS, SAAS_PRODUCTS, formatPlanPrice } from "@/lib/saas-products";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";
import ScrollReveal from "@/components/ScrollReveal";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Pricing",
    description:
      "Circuvent SaaS pricing for mail, workspace, CRM, people, admin, assets and insights.",
    alternates: { canonical: `${SITE_URL}/pricing` },
  };
}

export default function PricingPage() {
  return (
    <div className="relative z-10 pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>
            Pricing
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Simple plans. One checkout.
          </h1>
          <p className="mt-4 max-w-2xl text-base" style={{ color: "var(--text-tertiary)" }}>
            Choose a plan for the product family you need. After payment, open every
            purchased tool from the customer portal.
          </p>
        </ScrollReveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {SAAS_PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl border p-6 ${
                plan.highlight
                  ? "border-primary bg-card shadow-sm"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlight ? (
                <span
                  className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                  style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan-text)" }}
                >
                  Most popular
                </span>
              ) : null}
              <h2 className="mt-3 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                {plan.name}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {plan.blurb}
              </p>
              <p className="mt-4 text-3xl font-bold" style={{ color: "var(--text-primary)" }}>
                {formatPlanPrice(plan.price)}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {plan.price <= 0 ? "Contact sales" : `${plan.seats} seats included`}
              </p>
              <ul className="mt-4 space-y-2">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent-cyan)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.price <= 0 ? "/contact" : "/products"}
                className="mt-5 block rounded-full bg-primary text-center text-sm font-medium text-primary-foreground py-2.5"
              >
                {plan.price <= 0 ? "Talk to sales" : "Choose a product"}
              </Link>
            </div>
          ))}
        </div>

        <section className="mt-14">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Compare product packs
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Each product family has its own plan; you can mix them freely.
          </p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr style={{ background: "var(--bg-muted)" }}>
                  <th className="p-3 font-medium">Product</th>
                  <th className="p-3 font-medium">Domain</th>
                  <th className="p-3 font-medium">From</th>
                  <th className="p-3 font-medium">Launch</th>
                </tr>
              </thead>
              <tbody>
                {SAAS_PRODUCTS.map((p) => (
                  <tr key={p.slug} className="border-t border-border">
                    <td className="p-3 font-medium" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </td>
                    <td className="p-3" style={{ color: "var(--text-muted)" }}>
                      {p.domainLabel}
                    </td>
                    <td className="p-3" style={{ color: "var(--text-muted)" }}>
                      {formatPlanPrice(p.plans[0]?.price ?? 0)}
                    </td>
                    <td className="p-3">
                      <Link href={`/products/${p.slug}`} className="text-sm" style={{ color: "var(--accent-cyan)" }}>
                        Subscribe
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6">
            <Link
              href="/compare"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-5 text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Full comparison matrix
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
