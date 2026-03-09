"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { useCountUp } from "@/hooks/useCountUp";

interface StatItem {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  decimals?: number;
}

interface StatsCounterProps {
  stats: StatItem[];
  className?: string;
}

function AnimatedStat({ stat, delay }: { stat: StatItem; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const { formattedValue } = useCountUp({
    end: isInView ? stat.value : 0,
    duration: 2000,
    delay: delay * 200,
    decimals: stat.decimals || 0,
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: delay * 0.1 }}
      className="group text-center p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
        backdropFilter: "blur(24px)",
      }}
    >
      <div className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
        {stat.prefix}
        {formattedValue}
        {stat.suffix}
      </div>
      <div
        className="text-xs uppercase tracking-wider mt-2"
        style={{ color: "var(--text-muted)" }}
      >
        {stat.label}
      </div>
    </motion.div>
  );
}

export default function StatsCounter({ stats, className }: StatsCounterProps) {
  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className || ""}`}
    >
      {stats.map((stat, i) => (
        <AnimatedStat key={stat.label} stat={stat} delay={i} />
      ))}
    </div>
  );
}
