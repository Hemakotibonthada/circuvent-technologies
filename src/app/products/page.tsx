import type { Metadata } from "next";
import Link from "next/link";
import {
  Mail,
  Layers,
  Building2,
  Users,
  Shield,
  Cpu,
  BarChart3,
  ArrowRight,
  Check,
  Sparkles,
  Boxes,
} from "lucide-react";
import {
  getProductBySlug,
  SAAS_DOMAIN_GROUPS,
  SAAS_PRODUCTS,
} from "@/lib/saas-products";
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

const domainIcons: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
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
    <main className="relative z-10 overflow-hidden pb-24 pt-28">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div
          className="absolute left-1/2 top-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, var(--accent-cyan) 18%, transparent) 0%, transparent 72%)",
          }}
        />
        <div
          className="absolute right-[-120px] top-[420px] h-[320px] w-[320px] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in srgb, #8b5cf6 16%, transparent) 0%, transparent 72%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        {/* HERO */}
        <section className="relative">
          <ScrollReveal>
            <div className="mx-auto max-w-4xl text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3.5 py-1.5 backdrop-blur">
                <Sparkles
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--accent-cyan)" }}
                />
                <span
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "var(--accent-cyan-text)" }}
                >
                  Circuvent SaaS Suite
                </span>
              </div>

              <h1
                className="text-balance text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl"
                style={{ color: "var(--text-primary)" }}
              >
                One platform.
                <br />
                <span
                  style={{
                    background:
                      "linear-gradient(90deg, var(--accent-cyan), #7c3aed, #ec4899)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Every product your company needs.
                </span>
              </h1>

              <p
                className="mx-auto mt-6 max-w-2xl text-base leading-7 sm:text-lg"
                style={{ color: "var(--text-tertiary)" }}
              >
                Discover, compare, subscribe and launch the entire Circuvent
                suite from one customer portal — mail, workspace, CRM, people
                ops, admin, assets and insights.
              </p>

              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/pricing"
                  className="group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  Explore pricing
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>

                <Link
                  href="/contact"
                  className="inline-flex h-12 items-center rounded-full border border-border bg-card/70 px-6 text-sm font-semibold backdrop-blur transition-colors hover:bg-card"
                  style={{ color: "var(--text-primary)" }}
                >
                  Talk to sales
                </Link>
              </div>

              <div
                className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Unified billing
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Single customer portal
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" />
                  Modular subscriptions
                </span>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* DOMAIN OVERVIEW */}
        <section className="mt-16">
          <ScrollReveal>
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-[0.18em]"
                  style={{ color: "var(--accent-cyan-text)" }}
                >
                  Product families
                </p>
                <h2
                  className="mt-2 text-2xl font-semibold sm:text-3xl"
                  style={{ color: "var(--text-primary)" }}
                >
                  Built around how your company works
                </h2>
              </div>

              <div
                className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs sm:flex"
                style={{ color: "var(--text-muted)" }}
              >
                <Boxes className="h-3.5 w-3.5" />
                {SAAS_PRODUCTS.length} products
              </div>
            </div>
          </ScrollReveal>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {groups.map((g) => {
              const Icon = domainIcons[g.id] ?? Layers;

              return (
                <Link
                  key={g.id}
                  href={`/products#${g.id}`}
                  className="group relative overflow-hidden rounded-3xl border border-border bg-card/75 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl"
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, var(--accent-cyan), transparent)",
                    }}
                  />

                  <div className="flex items-start justify-between">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-2xl border"
                      style={{
                        color: "var(--accent-cyan)",
                        background:
                          "color-mix(in srgb, var(--accent-cyan) 8%, transparent)",
                        borderColor:
                          "color-mix(in srgb, var(--accent-cyan) 18%, transparent)",
                      }}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </div>

                    <ArrowRight
                      className="h-4 w-4 opacity-35 transition-all group-hover:translate-x-0.5 group-hover:opacity-80"
                      style={{ color: "var(--text-primary)" }}
                    />
                  </div>

                  <h3
                    className="mt-4 text-base font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {g.label}
                  </h3>

                  <p
                    className="mt-1.5 line-clamp-2 text-sm leading-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {g.description}
                  </p>

                  <div className="mt-4">
                    <span
                      className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-medium"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {g.productIds.length} product
                      {g.productIds.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* PRODUCT GROUPS */}
        <div className="mt-20 space-y-20">
          {groups.map((group) => (
            <section key={group.id} id={group.id} className="scroll-mt-28">
              <ScrollReveal>
                <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p
                      className="text-xs font-semibold uppercase tracking-[0.18em]"
                      style={{ color: "var(--accent-cyan-text)" }}
                    >
                      {group.label}
                    </p>

                    <h2
                      className="mt-2 text-2xl font-semibold sm:text-3xl"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {group.description}
                    </h2>
                  </div>

                  <p
                    className="text-sm"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {group.productIds.length} product
                    {group.productIds.length === 1 ? "" : "s"} in this suite
                  </p>
                </div>
              </ScrollReveal>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {group.productIds
                  .map((id) => getProductBySlug(id))
                  .filter(Boolean)
                  .map((product) => (
                    <Link
                      key={product!.slug}
                      href={`/products/${product!.slug}`}
                      className="group relative flex min-h-[320px] flex-col overflow-hidden rounded-3xl border border-border bg-card/80 p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl"
                    >
                      {/* product accent glow */}
                      <div
                        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl transition-opacity duration-300 group-hover:opacity-100"
                        style={{
                          background: `${product!.accent}22`,
                          opacity: 0.45,
                        }}
                      />

                      <div className="relative z-10">
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className="inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                            style={{
                              background: `${product!.accent}12`,
                              borderColor: `${product!.accent}30`,
                              color: product!.accent,
                            }}
                          >
                            {product!.domainLabel}
                          </span>

                          <ArrowRight
                            className="h-4 w-4 opacity-30 transition-all group-hover:translate-x-0.5 group-hover:opacity-80"
                            style={{ color: product!.accent }}
                          />
                        </div>

                        <h3
                          className="mt-5 text-xl font-semibold tracking-tight"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {product!.name}
                        </h3>

                        <p
                          className="mt-2 text-sm leading-6"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {product!.tagline}
                        </p>

                        <div
                          className="my-5 h-px"
                          style={{
                            background:
                              "linear-gradient(90deg, var(--border), transparent)",
                          }}
                        />

                        <ul
                          className="space-y-2.5 text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {product!.features.slice(0, 3).map((feature) => (
                            <li key={feature} className="flex items-start gap-2.5">
                              <span
                                className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                                style={{
                                  background: `${product!.accent}18`,
                                  color: product!.accent,
                                }}
                              >
                                <Check className="h-2.5 w-2.5" />
                              </span>
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="relative z-10 mt-auto pt-6">
                        <div
                          className="inline-flex items-center gap-2 text-sm font-semibold"
                          style={{ color: product!.accent }}
                        >
                          View product
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                        </div>
                      </div>
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>

        {/* ENTERPRISE CTA */}
        <section className="mt-20">
          <ScrollReveal>
            <div className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-8 sm:p-10 lg:p-12">
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{
                  background:
                    "radial-gradient(circle at 15% 20%, color-mix(in srgb, var(--accent-cyan) 16%, transparent), transparent 35%), radial-gradient(circle at 85% 80%, color-mix(in srgb, #8b5cf6 14%, transparent), transparent 35%)",
                }}
              />

              <div className="relative z-10 mx-auto max-w-3xl text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background/60">
                  <Building2
                    className="h-5 w-5"
                    style={{ color: "var(--accent-cyan)" }}
                  />
                </div>

                <h2
                  className="mt-5 text-2xl font-semibold sm:text-3xl"
                  style={{ color: "var(--text-primary)" }}
                >
                  Build your own Circuvent package
                </h2>

                <p
                  className="mx-auto mt-3 max-w-xl text-sm leading-6 sm:text-base"
                  style={{ color: "var(--text-muted)" }}
                >
                  Combine the products your organization needs and scale with
                  SAML, SCIM, dedicated support, custom onboarding and
                  enterprise controls.
                </p>

                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  <Link
                    href="/pricing"
                    className="group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    See pricing
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>

                  <Link
                    href="/contact"
                    className="inline-flex h-12 items-center rounded-full border border-border bg-background/50 px-6 text-sm font-semibold backdrop-blur transition-colors hover:bg-background"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Talk to sales
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </section>

        <p
          className="mt-8 text-center text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          {SAAS_PRODUCTS.length} products · browse freely · subscribe from
          pricing or individual product pages
        </p>
      </div>
    </main>
  );
}