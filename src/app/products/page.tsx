import type { Metadata } from "next";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Mail, Layers, Building2, Users, Shield, Cpu, BarChart3,
} from "lucide-react";
import { getProductBySlug, SAAS_DOMAIN_GROUPS, SAAS_PRODUCTS } from "@/lib/saas-products";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";
import ScrollReveal from "@/components/ScrollReveal";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    ...generatePageMetadata("products"),
    title: "Products",
    description:
      "Discover Circuvent SaaS products — mail, workspace, CRM, HR, assets, insights — and subscribe in one place.",
    alternates: { canonical: `${SITE_URL}/products` },
  };
}

const domainIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  mail: Mail,
  workspace: Layers,
  business: Building2,
  people: Users,
  admin: Shield,
  assets: Cpu,
  insights: BarChart3,
};

export default function ProductsPage() {
  const groups = SAAS_DOMAIN_GROUPS;

  return (
    <div className="relative z-10 pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>
            Circuvent SaaS
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            One portal for every product you buy.
          </h1>
          <p className="mt-4 max-w-2xl text-base sm:text-lg" style={{ color: "var(--text-tertiary)" }}>
            Discover the Circuvent suite — mail, workspace, CRM, people ops, admin, assets and insights —
            compare plans, subscribe, and launch everything from one customer portal.
          </p>
        </ScrollReveal>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g) => {
            const Icon = domainIcons[g.id] ?? Layers;
            return (
              <Link
                key={g.id}
                href={`/products#${g.id}`}
                className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {g.label}
                  </span>
                </div>
                <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {g.description}
                </p>
                <p className="mt-3 text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
                  {g.productIds.length} product{g.productIds.length === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>

        <div className="mt-14 space-y-10">
          {groups.map((group) => (
            <section key={group.id} id={group.id}>
              <ScrollReveal>
                <h2 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                  {group.label}
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  {group.description}
                </p>
              </ScrollReveal>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.productIds
                  .map((id) => getProductBySlug(id))
                  .filter(Boolean)
                  .map((product, i) => (
                    <motion.div
                      key={product!.slug}
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.04 }}
                    >
                      <Link
                        href={`/products/${product!.slug}`}
                        className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                      >
                        <span
                          className="inline-flex w-fit rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                          style={{
                            background: `${product!.accent}22`,
                            color: product!.accent,
                          }}
                        >
                          {product!.domainLabel}
                        </span>
                        <h3 className="mt-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                          {product!.name}
                        </h3>
                        <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
                          {product!.tagline}
                        </p>
                        <ul className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                          {product!.features.slice(0, 3).map((f) => (
                            <li key={f} className="flex gap-1.5">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: product!.accent }} />
                              {f}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-auto pt-4">
                          <span className="text-sm font-medium" style={{ color: "var(--accent-cyan)" }}>
                            View details →
                          </span>
                        </div>
                      </Link>
                    </motion.div>
                  ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 rounded-2xl border border-border bg-card p-8 text-center">
          <h2 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Need a custom package?
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Enterprise plans cover SAML, SCIM, dedicated support and unlimited seats.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
            >
              See pricing
            </Link>
            <Link
              href="/contact"
              className="inline-flex h-11 items-center rounded-full border border-border bg-card px-5 text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              Talk to sales
            </Link>
          </div>
        </div>

        <p className="mt-8 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          {SAAS_PRODUCTS.length} products · free to browse · checkout is live on pricing & product pages
        </p>
      </div>
    </div>
  );
}
