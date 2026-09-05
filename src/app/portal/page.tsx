import type { Metadata } from "next";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";
import ScrollReveal from "@/components/ScrollReveal";
import PortalClient from "@/components/saas/PortalClient";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Customer portal",
    description:
      "Manage Circuvent SaaS subscriptions, invoices and launch every product you purchased.",
    alternates: { canonical: `${SITE_URL}/portal` },
  };
}

export default function PortalPage() {
  return (
    <div className="relative z-10 pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>
            Customer portal
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Manage what you own.
          </h1>
          <p className="mt-4 max-w-2xl text-base" style={{ color: "var(--text-tertiary)" }}>
            View active subscriptions, invoices and launch every Circuvent product
            you have purchased — mail, workspace, CRM, people, admin, assets, insights.
          </p>
        </ScrollReveal>

        <PortalClient domainIcons={{}} />

        <div className="mt-12 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Have a new product?
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Discover products or compare plans before you buy.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/products" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Products <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Pricing
            </Link>
            <Link href="/compare" className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Compare
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
