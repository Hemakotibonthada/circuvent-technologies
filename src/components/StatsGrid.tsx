"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState, useEffect } from "react";

interface Stat {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  gradient?: string;
}

interface StatsGridProps {
  stats: Stat[];
  columns?: 2 | 3 | 4 | 5;
  variant?: "counter" | "card" | "inline" | "glass-strip";
  className?: string;
}

function AnimatedNumber({ value, suffix = "", prefix = "", duration = 2 }: { value: number; suffix?: string; prefix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const end = value;
    const increment = end / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [inView, value, duration]);

  return (
    <span ref={ref}>
      {prefix}{count.toLocaleString()}{suffix}
    </span>
  );
}

export default function StatsGrid({ stats, columns = 4, variant = "counter", className = "" }: StatsGridProps) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
  };

  if (variant === "glass-strip") {
    return (
      <motion.div
        className={`relative overflow-hidden rounded-2xl p-6 sm:p-8 ${className}`}
        style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)" }}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/3 via-violet-500/3 to-pink-500/3" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />
        <div className={`relative z-10 flex flex-wrap items-center justify-center gap-6 sm:gap-10 md:gap-14`}>
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              className="flex flex-col items-center text-center"
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              {stat.icon && <div className="mb-1.5">{stat.icon}</div>}
              <span className={`text-xl sm:text-2xl font-bold bg-gradient-to-r ${stat.gradient || "from-cyan-500 to-violet-500"} bg-clip-text text-transparent`}>
                <AnimatedNumber value={stat.value} suffix={stat.suffix} prefix={stat.prefix} />
              </span>
              <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (variant === "inline") {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-6 sm:gap-10 ${className}`}>
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="flex items-center gap-3"
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
          >
            {stat.icon && (
              <div className="p-2 rounded-lg" style={{ background: "var(--accent-cyan-muted)" }}>
                {stat.icon}
              </div>
            )}
            <div>
              <p className={`text-xl font-bold bg-gradient-to-r ${stat.gradient || "from-cyan-500 to-violet-500"} bg-clip-text text-transparent`}>
                <AnimatedNumber value={stat.value} suffix={stat.suffix} prefix={stat.prefix} />
              </p>
              <p className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`grid ${gridCols[columns]} gap-3 sm:gap-4 ${className}`}>
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="group relative overflow-hidden rounded-2xl p-5 text-center transition-all duration-300"
            style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)" }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            whileHover={{ y: -3, scale: 1.01 }}
          >
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/0 to-transparent group-hover:via-cyan-400/30 transition-all duration-500" />
            {stat.icon && (
              <div className="inline-flex p-2.5 rounded-xl mb-3" style={{ background: "var(--accent-cyan-muted)" }}>
                {stat.icon}
              </div>
            )}
            <div className={`text-2xl font-bold bg-gradient-to-r ${stat.gradient || "from-cyan-500 to-violet-500"} bg-clip-text text-transparent`}>
              <AnimatedNumber value={stat.value} suffix={stat.suffix} prefix={stat.prefix} />
            </div>
            <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{stat.label}</p>
            {stat.description && (
              <p className="text-[10px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
                {stat.description}
              </p>
            )}
          </motion.div>
        ))}
      </div>
    );
  }

  // Default counter variant
  return (
    <div className={`grid ${gridCols[columns]} gap-3 sm:gap-6 ${className}`}>
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          className="text-center p-4"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.1 }}
        >
          {stat.icon && <div className="mb-2 flex justify-center">{stat.icon}</div>}
          <div className={`text-3xl sm:text-4xl font-bold bg-gradient-to-r ${stat.gradient || "from-cyan-500 to-violet-500"} bg-clip-text text-transparent`}>
            <AnimatedNumber value={stat.value} suffix={stat.suffix} prefix={stat.prefix} />
          </div>
          <p className="text-sm font-medium mt-1" style={{ color: "var(--text-primary)" }}>{stat.label}</p>
          {stat.description && (
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{stat.description}</p>
          )}
        </motion.div>
      ))}
    </div>
  );
}
