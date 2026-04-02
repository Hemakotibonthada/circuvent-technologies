"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "strong" | "subtle" | "glow" | "gradient";
  hover?: "lift" | "scale" | "glow" | "border" | "none";
  gradient?: string;
  padding?: "none" | "sm" | "md" | "lg" | "xl";
  rounded?: "lg" | "xl" | "2xl" | "3xl";
  animate?: boolean;
  delay?: number;
}

const variantStyles = {
  default: {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-primary)",
  },
  strong: {
    background: "var(--bg-glass-strong)",
    border: "1px solid var(--border-primary)",
  },
  subtle: {
    background: "var(--bg-glass-subtle)",
    border: "1px solid var(--border-primary)",
  },
  glow: {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-accent)",
    boxShadow: "var(--shadow-glow-cyan)",
  },
  gradient: {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-primary)",
  },
};

const paddingMap = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
  xl: "p-10 sm:p-12",
};

const roundedMap = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  "3xl": "rounded-3xl",
};

const hoverVariants = {
  lift: { y: -4, transition: { type: "spring", stiffness: 300, damping: 25 } },
  scale: { scale: 1.02, transition: { type: "spring", stiffness: 300, damping: 25 } },
  glow: { boxShadow: "0 0 30px rgba(6, 182, 212, 0.15), 0 8px 32px rgba(0,0,0,0.1)" },
  border: {},
  none: {},
};

export default function GlassCard({
  children,
  className = "",
  variant = "default",
  hover = "lift",
  gradient,
  padding = "md",
  rounded = "2xl",
  animate = true,
  delay = 0,
}: GlassCardProps) {
  const style = variantStyles[variant];

  return (
    <motion.div
      className={`group relative overflow-hidden ${roundedMap[rounded]} ${paddingMap[padding]} transition-all duration-300 ${className}`}
      style={style}
      initial={animate ? { opacity: 0, y: 20 } : undefined}
      whileInView={animate ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={hover !== "none" ? hoverVariants[hover] : undefined}
    >
      {/* Top highlight line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

      {/* Gradient accent — appears on hover */}
      {gradient && (
        <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      )}

      {/* Hover border glow */}
      {hover === "border" && (
        <div className="absolute inset-0 rounded-[inherit] border border-transparent group-hover:border-[var(--border-accent)] transition-colors duration-300 pointer-events-none" />
      )}

      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

/* ============================================================
   GLASS SECTION — Full-width glass section wrapper
   ============================================================ */

interface GlassSectionProps {
  children: ReactNode;
  className?: string;
  id?: string;
  withOrbs?: boolean;
  gradient?: "cyan" | "violet" | "pink" | "mixed";
}

const orbGradients = {
  cyan: "var(--accent-cyan)",
  violet: "var(--accent-violet)",
  pink: "var(--accent-pink)",
  mixed: "var(--gradient-primary)",
};

export function GlassSection({
  children,
  className = "",
  id,
  withOrbs = false,
  gradient,
}: GlassSectionProps) {
  return (
    <section id={id} className={`relative z-10 overflow-hidden ${className}`}>
      {/* Optional floating orbs */}
      {withOrbs && (
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute w-[400px] h-[400px] rounded-full opacity-[0.04] blur-[100px]"
            style={{ background: orbGradients[gradient || "cyan"], top: "10%", right: "-10%" }}
            animate={{ y: [0, -30, 0], x: [0, 15, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-[300px] h-[300px] rounded-full opacity-[0.03] blur-[80px]"
            style={{ background: orbGradients[gradient || "violet"], bottom: "20%", left: "-5%" }}
            animate={{ y: [0, 20, 0], x: [0, -10, 0] }}
            transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          />
        </div>
      )}

      {/* Gradient accent at section top */}
      {gradient && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-[0.04] blur-[100px] pointer-events-none"
          style={{ background: orbGradients[gradient] }}
        />
      )}

      <div className="relative z-10">{children}</div>
    </section>
  );
}

/* ============================================================
   GLASS BADGE — Small pill badge with glass effect
   ============================================================ */

interface GlassBadgeProps {
  children: ReactNode;
  icon?: ReactNode;
  color?: "cyan" | "violet" | "pink" | "emerald";
  className?: string;
  pulse?: boolean;
}

const badgeColors = {
  cyan: { bg: "var(--accent-cyan-muted)", color: "var(--accent-cyan)", border: "var(--border-accent)" },
  violet: { bg: "var(--accent-violet-muted)", color: "var(--accent-violet)", border: "rgba(139, 92, 246, 0.3)" },
  pink: { bg: "rgba(236, 72, 153, 0.08)", color: "var(--accent-pink)", border: "rgba(236, 72, 153, 0.3)" },
  emerald: { bg: "rgba(16, 185, 129, 0.08)", color: "#10b981", border: "rgba(16, 185, 129, 0.3)" },
};

export function GlassBadge({
  children,
  icon,
  color = "cyan",
  className = "",
  pulse = false,
}: GlassBadgeProps) {
  const c = badgeColors[color];
  return (
    <motion.div
      className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-[0.15em] ${className}`}
      style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}` }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
      {icon}
      {children}
    </motion.div>
  );
}

/* ============================================================
   GLASS DIVIDER — Animated gradient line divider
   ============================================================ */

interface GlassDividerProps {
  className?: string;
  gradient?: string;
  maxWidth?: string;
  animated?: boolean;
}

export function GlassDivider({
  className = "",
  gradient = "from-transparent via-cyan-500/30 to-transparent",
  maxWidth = "max-w-2xl",
  animated = true,
}: GlassDividerProps) {
  return (
    <motion.div
      className={`h-px w-full ${maxWidth} bg-gradient-to-r ${gradient} ${className}`}
      initial={animated ? { scaleX: 0, opacity: 0 } : undefined}
      whileInView={animated ? { scaleX: 1, opacity: 1 } : undefined}
      viewport={{ once: true }}
      transition={{ duration: 1, ease: "easeOut" }}
    />
  );
}

/* ============================================================
   GLASS ICON BOX — Icon wrapper with glass background
   ============================================================ */

interface GlassIconBoxProps {
  icon: ReactNode;
  gradient?: string;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
}

const sizeMap = {
  sm: "p-2 rounded-lg",
  md: "p-3 rounded-xl",
  lg: "p-4 rounded-2xl",
};

export function GlassIconBox({ icon, gradient, size = "md", animate = true }: GlassIconBoxProps) {
  if (gradient) {
    return (
      <motion.div
        className={`inline-flex ${sizeMap[size]} bg-gradient-to-br ${gradient} shadow-lg shrink-0`}
        whileHover={animate ? { rotate: 10, scale: 1.1 } : undefined}
        transition={{ type: "spring", stiffness: 300 }}
      >
        {icon}
      </motion.div>
    );
  }
  return (
    <motion.div
      className={`inline-flex ${sizeMap[size]} shrink-0`}
      style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}
      whileHover={animate ? { rotate: 10, scale: 1.1 } : undefined}
      transition={{ type: "spring", stiffness: 300 }}
    >
      {icon}
    </motion.div>
  );
}

/* ============================================================
   GLASS METRIC — Number with label
   ============================================================ */

interface GlassMetricProps {
  value: string;
  label: string;
  icon?: ReactNode;
  gradient?: string;
}

export function GlassMetric({ value, label, icon, gradient = "from-cyan-500 to-violet-500" }: GlassMetricProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {icon && <div className="mb-1.5">{icon}</div>}
      <span className={`text-xl sm:text-2xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
    </div>
  );
}
