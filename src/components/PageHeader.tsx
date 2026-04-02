"use client";

import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";

interface PageHeaderProps {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  titleHighlight: string;
  titleGradient?: string;
  description?: string;
  children?: React.ReactNode;
  stats?: { value: string; label: string }[];
}

export default function PageHeader({
  eyebrow,
  eyebrowColor = "var(--accent-cyan)",
  title,
  titleHighlight,
  titleGradient = "from-cyan-500 via-violet-500 to-pink-500",
  description,
  children,
  stats,
}: PageHeaderProps) {
  return (
    <section className="relative z-10 pt-32 pb-20 overflow-hidden">
      {/* Subtle radial gradient accent behind header */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.07] blur-[120px] pointer-events-none"
        style={{ background: "var(--gradient-primary)" }}
      />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <ScrollReveal>
          <div className="max-w-4xl">
            <motion.span
              className="inline-block text-xs font-semibold uppercase tracking-[0.2em] mb-4"
              style={{ color: eyebrowColor }}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              {eyebrow}
            </motion.span>

            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold mt-1 mb-6 leading-[0.95]"
              style={{ color: "var(--text-primary)" }}
            >
              {title}{" "}
              <span
                className={`bg-gradient-to-r ${titleGradient} bg-clip-text text-transparent`}
              >
                {titleHighlight}
              </span>
            </h1>

            {description && (
              <motion.p
                className="text-lg sm:text-xl leading-relaxed max-w-2xl"
                style={{ color: "var(--text-tertiary)" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25 }}
              >
                {description}
              </motion.p>
            )}

            {/* Optional inline stats row */}
            {stats && stats.length > 0 && (
              <motion.div
                className="flex flex-wrap gap-6 mt-8"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.35 }}
              >
                {stats.map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-2xl font-bold gradient-text">{s.value}</span>
                    <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{s.label}</span>
                  </div>
                ))}
              </motion.div>
            )}

            {children}
          </div>
        </ScrollReveal>

        {/* Animated gradient line divider */}
        <motion.div
          className="mt-12 h-px w-full max-w-2xl"
          style={{ background: "linear-gradient(90deg, transparent, var(--accent-cyan), var(--accent-violet), transparent)" }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 0.4 }}
          transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
        />
      </div>
    </section>
  );
}
