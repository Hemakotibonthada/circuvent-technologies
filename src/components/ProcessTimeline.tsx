"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import GlassCard from "./GlassCard";

interface ProcessStep {
  step: string;
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  details?: string[];
  duration?: string;
}

interface ProcessTimelineProps {
  steps: ProcessStep[];
  variant?: "horizontal" | "vertical" | "interactive";
}

export default function ProcessTimeline({ steps, variant = "interactive" }: ProcessTimelineProps) {
  const [active, setActive] = useState(0);

  if (variant === "horizontal") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {steps.map((step, i) => (
          <motion.div
            key={step.step}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, type: "spring", stiffness: 120 }}
          >
            <GlassCard variant="strong" hover="lift" padding="lg" className="text-center h-full">
              <motion.div
                className={`text-3xl sm:text-4xl font-bold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent mb-3`}
                initial={{ opacity: 0, scale: 0.5 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 + 0.2, type: "spring" }}
              >
                {step.step}
              </motion.div>
              <motion.div
                className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${step.gradient} mb-4`}
                whileHover={{ rotate: 15, scale: 1.15 }}
              >
                <step.icon className="w-5 h-5 text-white" />
              </motion.div>
              <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>{step.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{step.description}</p>
              {step.duration && (
                <div className="mt-3 text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  {step.duration}
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}
      </div>
    );
  }

  if (variant === "vertical") {
    return (
      <div className="relative max-w-3xl mx-auto">
        <div className="absolute left-8 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 via-violet-500/30 to-pink-500/30" />
        {steps.map((step, i) => (
          <motion.div
            key={step.step}
            className="relative flex items-start gap-6 mb-10 sm:mb-12"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12 }}
          >
            <motion.div
              className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center bg-gradient-to-br ${step.gradient} shadow-lg shrink-0`}
              whileHover={{ scale: 1.2 }}
            >
              <step.icon className="w-4 h-4 text-white" />
            </motion.div>
            <GlassCard variant="strong" hover="lift" padding="md" className="flex-1" animate={false}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs font-bold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent`}>
                  Step {step.step}
                </span>
                {step.duration && (
                  <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>{step.duration}</span>
                )}
              </div>
              <h3 className="text-base font-bold mb-1" style={{ color: "var(--text-primary)" }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{step.description}</p>
              {step.details && (
                <div className="mt-3 space-y-1">
                  {step.details.map((d) => (
                    <div key={d} className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{d}</span>
                    </div>
                  ))}
                </div>
              )}
            </GlassCard>
          </motion.div>
        ))}
      </div>
    );
  }

  // Interactive variant (default)
  const current = steps[active];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start">
      {/* Step progress indicators */}
      <div className="space-y-3">
        {/* Progress bar */}
        <div className="flex items-center gap-1 mb-6">
          {steps.map((_, i) => (
            <motion.div
              key={i}
              className="h-1 flex-1 rounded-full cursor-pointer"
              style={{
                background: i <= active ? `var(--accent-cyan)` : "var(--border-primary)",
                opacity: i <= active ? 1 : 0.3,
              }}
              onClick={() => setActive(i)}
              whileHover={{ scaleY: 2 }}
            />
          ))}
        </div>

        {steps.map((step, i) => (
          <motion.button
            key={step.step}
            onClick={() => setActive(i)}
            className={`w-full text-left flex items-center gap-4 p-4 sm:p-5 rounded-xl transition-all duration-300`}
            style={{
              background: active === i ? "var(--bg-glass-strong)" : "transparent",
              border: `1px solid ${active === i ? "var(--border-accent)" : "transparent"}`,
            }}
            whileHover={{ x: 4 }}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
          >
            <div className={`p-2.5 rounded-lg bg-gradient-to-br ${step.gradient} shrink-0 transition-transform duration-300 ${active === i ? "scale-110 shadow-lg" : "opacity-60"}`}>
              <step.icon className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent`}>
                  {step.step}
                </span>
                <h3 className="text-sm font-bold" style={{ color: active === i ? "var(--text-primary)" : "var(--text-secondary)" }}>
                  {step.title}
                </h3>
              </div>
              {active === i && (
                <motion.p
                  className="text-xs mt-1 truncate"
                  style={{ color: "var(--text-muted)" }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {step.description}
                </motion.p>
              )}
            </div>
            {active === i && (
              <ArrowRight className="w-4 h-4 shrink-0" style={{ color: "var(--accent-cyan)" }} />
            )}
          </motion.button>
        ))}
      </div>

      {/* Detail panel */}
      <div>
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard variant="strong" padding="xl" hover="none" animate={false}>
              <div className="flex items-center gap-4 mb-6">
                <div className={`p-4 rounded-xl bg-gradient-to-br ${current.gradient} shadow-lg`}>
                  <current.icon className="w-7 h-7 text-white" />
                </div>
                <div>
                  <div className={`text-xs font-mono font-bold bg-gradient-to-r ${current.gradient} bg-clip-text text-transparent mb-1`}>
                    Step {current.step}
                  </div>
                  <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{current.title}</h3>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
                {current.description}
              </p>

              {current.details && (
                <div className="space-y-2">
                  {current.details.map((d, i) => (
                    <motion.div
                      key={d}
                      className="flex items-center gap-3 p-3 rounded-lg"
                      style={{ background: "var(--bg-glass-subtle)", border: "1px solid var(--border-primary)" }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{d}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {current.duration && (
                <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>Typical Duration:</span>
                    <span className={`text-sm font-bold bg-gradient-to-r ${current.gradient} bg-clip-text text-transparent`}>
                      {current.duration}
                    </span>
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
