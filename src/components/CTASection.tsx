"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

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
    <section className="relative z-10 py-16 sm:py-24 lg:py-32">
      <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
        <ScrollReveal>
          <div
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl backdrop-blur-xl p-8 sm:p-12 lg:p-16"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />

            {/* Floating sparkle */}
            <motion.div
              className="absolute top-6 right-8 pointer-events-none"
              animate={{ y: [0, -8, 0], rotate: [0, 15, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="w-5 h-5 opacity-20" style={{ color: "var(--accent-cyan)" }} />
            </motion.div>
            <motion.div
              className="absolute bottom-8 left-10 pointer-events-none"
              animate={{ y: [0, 6, 0], rotate: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            >
              <Sparkles className="w-4 h-4 opacity-15" style={{ color: "var(--accent-violet)" }} />
            </motion.div>

            <div className="relative z-10">
              <h2
                className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6"
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
