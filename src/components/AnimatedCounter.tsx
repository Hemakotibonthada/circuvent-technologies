"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  duration?: number;
  delay?: number;
  icon?: React.ReactNode;
  gradient?: string;
  description?: string;
}

export default function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  label,
  duration = 2,
  delay = 0,
  icon,
  gradient = "from-cyan-500 to-violet-500",
  description,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    const controls = animate(count, value, {
      duration,
      delay,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplayValue(Math.round(v)),
    });

    return controls.stop;
  }, [isInView, value, duration, delay, count]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay: delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, scale: 1.02 }}
      className="group relative overflow-hidden rounded-2xl p-6 sm:p-8 text-center transition-all duration-300"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
        backdropFilter: "blur(24px)",
      }}
    >
      {/* Background gradient on hover */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-[0.04] transition-opacity duration-500`}
      />

      {/* Animated ring */}
      <motion.div
        className={`absolute -top-12 -right-12 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 blur-2xl transition-all duration-700`}
        animate={isInView ? { rotate: 360 } : {}}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      />

      {icon && (
        <div className="flex justify-center mb-4">
          <motion.div
            className="p-3 rounded-xl"
            style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}
            whileHover={{ rotate: 10, scale: 1.1 }}
          >
            {icon}
          </motion.div>
        </div>
      )}

      <div className="relative z-10">
        <motion.div
          className={`text-4xl sm:text-5xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}
        >
          {prefix}
          {displayValue.toLocaleString()}
          {suffix}
        </motion.div>

        <p
          className="text-sm font-semibold mt-2 uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </p>

        {description && (
          <p
            className="text-xs mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ color: "var(--text-muted)" }}
          >
            {description}
          </p>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Animated progress ring
 */
export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 8,
  gradient = "from-cyan-500 to-violet-500",
  label,
  centerText,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  gradient?: string;
  label?: string;
  centerText?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div ref={ref} className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background ring */}
        <svg width={size} height={size} className="rotate-[-90deg]">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--border-primary)"
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={isInView ? { strokeDashoffset: offset } : {}}
            transition={{ duration: 1.5, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-lg font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {centerText || `${value}%`}
          </span>
        </div>
      </div>

      {label && (
        <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
    </div>
  );
}
