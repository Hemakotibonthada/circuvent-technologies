"use client";

import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface CTASectionProps {
  title: string;
  titleHighlight: string;
  description: string;
  primaryCTA: {
    label: string;
    href: string;
  };
  secondaryCTA?: {
    label: string;
    href: string;
  };
}

export default function CTASection({
  title,
  titleHighlight,
  description,
  primaryCTA,
  secondaryCTA,
}: CTASectionProps) {
  return (
    <section className="relative z-10 py-32">
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
        <ScrollReveal>
          <div
            className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-12 sm:p-16"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />

            <div className="relative z-10">
              <h2
                className="text-3xl sm:text-5xl font-bold mb-6"
                style={{ color: "var(--text-primary)" }}
              >
                {title}{" "}
                <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                  {titleHighlight}
                </span>
              </h2>
              <p
                className="text-lg max-w-xl mx-auto mb-10"
                style={{ color: "var(--text-tertiary)" }}
              >
                {description}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href={primaryCTA.href}>
                  <Button size="lg" className="group">
                    {primaryCTA.label}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                {secondaryCTA && (
                  <Link href={secondaryCTA.href}>
                    <Button variant="glass" size="lg">
                      {secondaryCTA.label}
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
