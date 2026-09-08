import type { Metadata } from "next";
import Link from "next/link";
import { SAAS_PRODUCTS, compareRows } from "@/lib/saas-products";
import { SITE_URL } from "@/lib/config";
import { generatePageMetadata } from "@/lib/seo";
import ScrollReveal from "@/components/ScrollReveal";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Compare products",
    description:
      "Compare Circuvent SaaS products by domain: mail, workspace, CRM, ATS, devices and insights.",
    alternates: { canonical: `${SITE_URL}/compare` },
  };
}

export default function ComparePage() {
  const rows = compareRows();
  return (
    <div className="relative z-10 pt-28 pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>
            Compare
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Feature comparison
          </h1>
          <p className="mt-4 max-w-2xl text-base" style={{ color: "var(--text-tertiary)" }}>
            See which products cover mail, workspace, CRM, ATS, devices and insights
            — and which ones you need to buy.
          </p>
        </ScrollReveal>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr style={{ background: "var(--bg-muted)" }}>
                <th className="p-3 font-medium">Capability</th>
                {SAAS_PRODUCTS.map((p) => (
                  <th key={p.slug} className="p-3 font-medium" style={{ color: p.accent }}>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row} className="border-t border-border">
                  <td className="p-3 font-medium" style={{ color: "var(--text-primary)" }}>
                    {row}
                  </td>
                  {SAAS_PRODUCTS.map((p) => {
                    const val = p.capabilities[row] ?? "no";
                    return (
                      <td key={p.slug} className="p-3" style={{ color: "var(--text-muted)" }}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            val === "yes"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                              : val === "partial"
                                ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {val === "yes" ? "Yes" : val === "partial" ? "Partial" : "No"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/products"
            className="inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
          >
            Browse products
          </Link>
        </div>
      </div>
    </div>
  );
}
