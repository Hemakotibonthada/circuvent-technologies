"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring, useInView } from "framer-motion";
import { CheckCircle } from "lucide-react";

/**
 * Scroll-driven animated timeline with parallax effects.
 * Each milestone animates in as the user scrolls past it.
 */

interface TimelineMilestone {
  date: string;
  title: string;
  description: string;
  stats?: { label: string; value: string }[];
  icon?: string;
  gradient: string;
}

interface ScrollTimelineProps {
  milestones: TimelineMilestone[];
  className?: string;
}

export default function ScrollTimeline({ milestones, className }: ScrollTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const lineHeight = useSpring(
    useTransform(scrollYProgress, [0, 1], ["0%", "100%"]),
    { stiffness: 100, damping: 30 }
  );

  return (
    <div ref={containerRef} className={`relative ${className || ""}`}>
      {/* Animated line */}
      <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px" style={{ background: "var(--border-primary)" }}>
        <motion.div
          className="absolute top-0 left-0 w-full bg-gradient-to-b from-cyan-500 via-violet-500 to-pink-500"
          style={{ height: lineHeight }}
        />
      </div>

      <div className="space-y-24">
        {milestones.map((milestone, i) => (
          <TimelineItem
            key={milestone.date}
            milestone={milestone}
            index={i}
            isEven={i % 2 === 0}
          />
        ))}
      </div>
    </div>
  );
}

function TimelineItem({
  milestone,
  index,
  isEven,
}: {
  milestone: TimelineMilestone;
  index: number;
  isEven: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div
      ref={ref}
      className={`relative flex flex-col md:flex-row items-start gap-8 ${
        isEven ? "md:flex-row" : "md:flex-row-reverse"
      }`}
    >
      {/* Content */}
      <motion.div
        className={`flex-1 pl-20 md:pl-0 ${isEven ? "md:pr-16 md:text-right" : "md:pl-16"}`}
        initial={{ opacity: 0, x: isEven ? -50 : 50, y: 20 }}
        animate={isInView ? { opacity: 1, x: 0, y: 0 } : {}}
        transition={{
          duration: 0.6,
          delay: 0.2,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {/* Date badge */}
        <motion.div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono mb-3`}
          style={{
            background: "var(--accent-cyan-muted)",
            border: "1px solid var(--border-accent)",
            color: "var(--accent-cyan)",
          }}
          whileHover={{ scale: 1.05 }}
        >
          {milestone.icon && <span>{milestone.icon}</span>}
          {milestone.date}
        </motion.div>

        {/* Card */}
        <motion.div
          className="rounded-2xl p-6 transition-all duration-300"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            backdropFilter: "blur(24px)",
          }}
          whileHover={{ y: -4, boxShadow: "var(--shadow-lg)" }}
        >
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {milestone.title}
          </h3>
          <p
            className="text-sm leading-relaxed mb-4"
            style={{ color: "var(--text-tertiary)" }}
          >
            {milestone.description}
          </p>

          {/* Stats */}
          {milestone.stats && (
            <div className={`flex gap-4 ${isEven ? "md:justify-end" : ""}`}>
              {milestone.stats.map((stat) => (
                <div key={stat.label}>
                  <div
                    className={`text-lg font-bold bg-gradient-to-r ${milestone.gradient} bg-clip-text text-transparent`}
                  >
                    {stat.value}
                  </div>
                  <div
                    className="text-[10px] uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Timeline dot */}
      <motion.div
        className={`absolute left-4 md:left-1/2 md:-translate-x-1/2 z-10`}
        initial={{ scale: 0, opacity: 0 }}
        animate={isInView ? { scale: 1, opacity: 1 } : {}}
        transition={{ duration: 0.4, delay: 0.1, type: "spring", stiffness: 300 }}
      >
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br ${milestone.gradient}`}
          style={{ boxShadow: `0 0 20px rgba(6, 182, 212, 0.3)` }}
        >
          <span className="text-white text-sm font-bold">{index + 1}</span>
        </div>
        {/* Pulse */}
        <motion.div
          className={`absolute inset-0 rounded-full bg-gradient-to-br ${milestone.gradient}`}
          animate={{ scale: [1, 1.5], opacity: [0.4, 0] }}
          transition={{ duration: 2, repeat: Infinity, delay: index * 0.3 }}
        />
      </motion.div>

      {/* Spacer for opposite side */}
      <div className="hidden md:block flex-1" />
    </div>
  );
}

/**
 * Horizontal scroll-driven feature showcase
 */
interface FeatureShowcaseItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: string;
  features: string[];
}

export function HorizontalFeatureShowcase({
  items,
  className,
}: {
  items: FeatureShowcaseItem[];
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const x = useTransform(scrollYProgress, [0, 1], ["0%", `-${(items.length - 1) * 100}%`]);

  return (
    <div ref={containerRef} className={`relative ${className || ""}`} style={{ height: `${items.length * 100}vh` }}>
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <motion.div
          className="flex"
          style={{
            x,
            width: `${items.length * 100}vw`,
          }}
        >
          {items.map((item, i) => (
            <div
              key={item.title}
              className="flex items-center justify-center px-6 lg:px-12"
              style={{ width: "100vw" }}
            >
              <div className="max-w-4xl w-full grid md:grid-cols-2 gap-12 items-center">
                {/* Visual */}
                <motion.div
                  className={`relative rounded-3xl p-12 bg-gradient-to-br ${item.gradient} opacity-20`}
                  style={{ minHeight: 300 }}
                  whileHover={{ scale: 1.02 }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-white opacity-80">{item.icon}</div>
                  </div>
                </motion.div>

                {/* Content */}
                <div>
                  <div
                    className="text-xs font-mono mb-2"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    {String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
                  </div>
                  <h3
                    className="text-3xl font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="text-base leading-relaxed mb-6"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {item.description}
                  </p>
                  <ul className="space-y-2">
                    {item.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                        <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
