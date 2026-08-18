"use client";

import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import {
  HelpCircle, Truck, CreditCard, RotateCcw, ShieldCheck, Wrench, Wifi, Gift,
  MapPin, Clock, PackageCheck, IndianRupee, Bell, PackageOpen, Wallet, XCircle,
  CheckCircle2, AlertTriangle, LifeBuoy, FileText, ShoppingBag, Copyright, Scale,
  Building2,
  type LucideIcon,
} from "lucide-react";

// A name missing from this map renders the section with no icon and without the
// indent the others get, which reads as a layout bug rather than a missing
// import -- so anything referenced by a page needs an entry here.
const ICONS: Record<string, LucideIcon> = {
  HelpCircle, Truck, CreditCard, RotateCcw, ShieldCheck, Wrench, Wifi, Gift,
  MapPin, Clock, PackageCheck, IndianRupee, Bell, PackageOpen, Wallet, XCircle,
  CheckCircle2, AlertTriangle, LifeBuoy, FileText, ShoppingBag, Copyright, Scale,
  Building2,
};

export interface ContentSection {
  icon?: string;
  title: string;
  content: string[];
}

export default function ContentPage({
  eyebrow,
  title,
  titleHighlight,
  titleGradient = "from-cyan-500 via-blue-500 to-violet-500",
  description,
  sections,
  updated,
}: {
  eyebrow: string;
  title: string;
  titleHighlight: string;
  titleGradient?: string;
  description: string;
  sections: ContentSection[];
  updated?: string;
}) {
  return (
    <>

      <PageHeader
        eyebrow={eyebrow}
        title={title}
        titleHighlight={titleHighlight}
        titleGradient={titleGradient}
        description={description}
      >
        {updated && (
          <div
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}
          >
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Last updated: {updated}
            </span>
          </div>
        )}
      </PageHeader>

      <section className="relative z-10 py-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="space-y-14">
            {sections.map((section, i) => {
              const Icon = section.icon ? ICONS[section.icon] : null;
              return (
                <ScrollReveal key={section.title} delay={i * 0.05}>
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      {Icon && (
                        <div
                          className="p-2.5 rounded-xl"
                          style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}
                        >
                          <Icon className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                        </div>
                      )}
                      <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                        {section.title}
                      </h2>
                    </div>
                    <div className={`space-y-3 ${Icon ? "pl-12" : ""}`}>
                      {section.content.map((p, j) => (
                        <p key={j} className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                          {p}
                        </p>
                      ))}
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          <ScrollReveal>
            <div
              className="mt-16 rounded-2xl p-8"
              style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}
            >
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Questions? Email us at{" "}
                <a href="mailto:contact@circuvent.com" className="underline" style={{ color: "var(--accent-cyan-text)" }}>
                  contact@circuvent.com
                </a>{" "}
                or reach out from your account&rsquo;s Support section.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
