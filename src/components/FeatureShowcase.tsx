"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import GlassCard from "./GlassCard";

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  gradient: string;
  highlights?: string[];
  metric?: { value: string; label: string };
}

interface FeatureShowcaseProps {
  features: Feature[];
  columns?: 2 | 3 | 4;
  variant?: "card" | "minimal" | "detailed";
}

export default function FeatureShowcase({ features, columns = 3, variant = "card" }: FeatureShowcaseProps) {
  const [activeFeature, setActiveFeature] = useState<number | null>(null);

  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  if (variant === "detailed") {
    return <DetailedFeatureShowcase features={features} />;
  }

  if (variant === "minimal") {
    return (
      <div className={`grid ${gridCols[columns]} gap-4`}>
        {features.map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
            whileHover={{ y: -3 }}
            className="group flex items-start gap-4 p-5 rounded-xl transition-all duration-300"
            style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)" }}
          >
            <motion.div
              className={`p-2.5 rounded-lg bg-gradient-to-br ${feature.gradient} shrink-0`}
              whileHover={{ rotate: 10, scale: 1.05 }}
            >
              <feature.icon className="w-4 h-4 text-white" />
            </motion.div>
            <div>
              <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{feature.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{feature.description}</p>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid ${gridCols[columns]} gap-4 sm:gap-6`}>
      {features.map((feature, i) => (
        <GlassCard
          key={feature.title}
          variant="strong"
          hover="lift"
          gradient={feature.gradient}
          padding="lg"
          delay={i * 0.08}
          className="h-full"
        >
          <div className="flex items-start justify-between mb-5">
            <motion.div
              className={`p-3 rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg shrink-0`}
              whileHover={{ rotate: 10, scale: 1.1 }}
              transition={{ type: "spring", stiffness: 300 }}
            >
              <feature.icon className="w-5 h-5 text-white" />
            </motion.div>

            {feature.metric && (
              <div className="text-right">
                <div className={`text-lg font-bold bg-gradient-to-r ${feature.gradient} bg-clip-text text-transparent`}>
                  {feature.metric.value}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{feature.metric.label}</div>
              </div>
            )}
          </div>

          <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>{feature.title}</h3>
          <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>{feature.description}</p>

          {feature.highlights && (
            <div className="space-y-1.5 mt-auto">
              {feature.highlights.map((h) => (
                <div key={h} className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{h}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  );
}

/* ============================================================
   DETAILED VARIANT — Left/Right interactive layout
   ============================================================ */

function DetailedFeatureShowcase({ features }: { features: Feature[] }) {
  const [active, setActive] = useState(0);
  const current = features[active];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-start">
      {/* Feature selector - left */}
      <div className="lg:col-span-2 space-y-2">
        {features.map((feature, i) => (
          <motion.button
            key={feature.title}
            onClick={() => setActive(i)}
            className={`w-full text-left flex items-center gap-4 p-4 rounded-xl transition-all duration-300 ${
              active === i ? "scale-[1.01]" : ""
            }`}
            style={{
              background: active === i ? "var(--bg-glass-strong)" : "transparent",
              border: `1px solid ${active === i ? "var(--border-accent)" : "transparent"}`,
            }}
            whileHover={{ x: 4 }}
            initial={{ opacity: 0, x: -15 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
          >
            <div className={`p-2.5 rounded-lg bg-gradient-to-br ${feature.gradient} shrink-0 transition-transform duration-300 ${active === i ? "scale-110" : ""}`}>
              <feature.icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold" style={{ color: active === i ? "var(--text-primary)" : "var(--text-secondary)" }}>
                {feature.title}
              </h3>
              <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{feature.description}</p>
            </div>
            {active === i && (
              <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "var(--accent-cyan)" }} />
            )}
          </motion.button>
        ))}
      </div>

      {/* Feature detail - right */}
      <div className="lg:col-span-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
          >
            <GlassCard variant="strong" padding="xl" hover="none" animate={false}>
              <div className="flex items-center gap-4 mb-6">
                <div className={`p-4 rounded-xl bg-gradient-to-br ${current.gradient} shadow-lg`}>
                  <current.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{current.title}</h3>
                  {current.metric && (
                    <div className={`text-sm font-semibold bg-gradient-to-r ${current.gradient} bg-clip-text text-transparent`}>
                      {current.metric.value} {current.metric.label}
                    </div>
                  )}
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
                {current.description}
              </p>

              {current.highlights && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {current.highlights.map((h, i) => (
                    <motion.div
                      key={h}
                      className="flex items-center gap-2 p-3 rounded-lg"
                      style={{ background: "var(--bg-glass-subtle)", border: "1px solid var(--border-primary)" }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{h}</span>
                    </motion.div>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
