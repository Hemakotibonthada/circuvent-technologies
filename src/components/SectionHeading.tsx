"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";
import ScrollReveal from "./ScrollReveal";
import { ShimmerText } from "./AnimationEffects";

interface SectionHeadingProps {
  eyebrow: string;
  eyebrowColor?: string;
  title: string;
  titleHighlight?: string;
  titleGradient?: string;
  description?: string;
  align?: "left" | "center";
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
}

export default function SectionHeading({
  eyebrow,
  eyebrowColor = "var(--accent-cyan)",
  title,
  titleHighlight,
  titleGradient = "from-cyan-400 via-violet-400 to-pink-400",
  description,
  align = "center",
  children,
  size = "md",
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "text-center" : "text-left";
  const descAlign = align === "center" ? "mx-auto" : "";

  const titleSizes = {
    sm: "text-2xl sm:text-3xl md:text-4xl",
    md: "text-3xl sm:text-4xl md:text-5xl",
    lg: "text-3xl sm:text-4xl md:text-5xl lg:text-6xl",
  };

  return (
    <ScrollReveal>
      <div className={`${alignClass} mb-10 sm:mb-14 lg:mb-16`}>
        <motion.span
          className="inline-block text-xs font-semibold uppercase tracking-[0.2em] mb-3"
          style={{ color: eyebrowColor }}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          {eyebrow}
        </motion.span>

        <h2 className={`${titleSizes[size]} font-bold mt-2 leading-[1.05]`} style={{ color: "var(--text-primary)" }}>
          {title}{" "}
          {titleHighlight && (
            <ShimmerText gradient={titleGradient}>
              {titleHighlight}
            </ShimmerText>
          )}
        </h2>

        {description && (
          <motion.p
            className={`mt-4 text-sm sm:text-base leading-relaxed max-w-2xl ${descAlign}`}
            style={{ color: "var(--text-tertiary)" }}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            {description}
          </motion.p>
        )}

        {children}
      </div>
    </ScrollReveal>
  );
}
