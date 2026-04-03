"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, Clock, Sparkles, Play, Pause } from "lucide-react";
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
  autoAdvance?: boolean;
  autoAdvanceInterval?: number;
}

export default function ProcessTimeline({ steps, variant = "interactive", autoAdvance = false, autoAdvanceInterval = 5000 }: ProcessTimelineProps) {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: "-100px" });

  const goTo = useCallback((index: number) => {
    setDirection(index > active ? 1 : -1);
    setActive(index);
  }, [active]);

  const next = useCallback(() => {
    setDirection(1);
    setActive((prev) => (prev + 1) % steps.length);
  }, [steps.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setActive((prev) => (prev - 1 + steps.length) % steps.length);
  }, [steps.length]);

  // Auto-advance
  useEffect(() => {
    if (!autoAdvance || isPaused || !isInView) return;
    const timer = setInterval(next, autoAdvanceInterval);
    return () => clearInterval(timer);
  }, [autoAdvance, isPaused, isInView, next, autoAdvanceInterval]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prev();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev]);

  if (variant === "horizontal") {
    return (
      <div ref={containerRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative">
        {/* Connector lines (desktop only) */}
        <div className="hidden lg:block absolute top-[72px] left-[12.5%] right-[12.5%] h-px z-0">
          <div className="w-full h-full bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-pink-500/20" />
          {steps.map((_, i) => i < steps.length - 1 && (
            <motion.div
              key={i}
              className="absolute top-0 h-[3px] rounded-full"
              style={{
                left: `${(i / (steps.length - 1)) * 100}%`,
                width: `${100 / (steps.length - 1)}%`,
                background: `linear-gradient(90deg, var(--accent-cyan), var(--accent-violet))`,
              }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 + 0.5, duration: 0.6 }}
            />
          ))}
        </div>

        {steps.map((step, i) => (
          <motion.div
            key={step.step}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12, type: "spring", stiffness: 120 }}
            className="relative z-10"
          >
            <GlassCard variant="strong" hover="lift" padding="lg" className="text-center h-full">
              {/* Step number with ring */}
              <div className="relative inline-flex mb-4">
                <motion.div
                  className={`text-3xl sm:text-4xl font-bold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent`}
                  initial={{ opacity: 0, scale: 0.5 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 + 0.2, type: "spring" }}
                >
                  {step.step}
                </motion.div>
                {/* Animated ring around number */}
                <svg className="absolute -inset-2 w-[calc(100%+16px)] h-[calc(100%+16px)]" viewBox="0 0 60 60">
                  <motion.circle
                    cx="30" cy="30" r="26"
                    fill="none"
                    strokeWidth="1.5"
                    stroke="url(#ring-gradient)"
                    strokeDasharray="163"
                    initial={{ strokeDashoffset: 163 }}
                    whileInView={{ strokeDashoffset: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.3, duration: 1, ease: "easeOut" }}
                    className="opacity-30"
                  />
                  <defs>
                    <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="var(--accent-cyan)" />
                      <stop offset="100%" stopColor="var(--accent-violet)" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>

              <motion.div
                className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${step.gradient} mb-4 shadow-lg`}
                whileHover={{ rotate: 15, scale: 1.15 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <step.icon className="w-5 h-5 text-white" />
              </motion.div>
              <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>{step.title}</h3>
              <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>{step.description}</p>

              {/* Duration pill */}
              {step.duration && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono"
                  style={{ background: "var(--accent-cyan-muted)", color: "var(--text-muted)" }}>
                  <Clock className="w-3 h-3" />
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
      <div ref={containerRef} className="relative max-w-3xl mx-auto">
        {/* Animated gradient timeline line */}
        <div className="absolute left-5 sm:left-8 top-0 bottom-0 w-px overflow-hidden">
          <motion.div
            className="w-full h-full bg-gradient-to-b from-cyan-500/40 via-violet-500/40 to-pink-500/40"
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{ transformOrigin: "top" }}
          />
        </div>

        {steps.map((step, i) => (
          <motion.div
            key={step.step}
            className="relative flex items-start gap-4 sm:gap-6 mb-8 sm:mb-12"
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.12 }}
          >
            {/* Timeline dot with pulse ring */}
            <div className="relative shrink-0">
              <motion.div
                className={`relative z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-gradient-to-br ${step.gradient} shadow-lg`}
                whileHover={{ scale: 1.15 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <step.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </motion.div>
              {/* Pulse ring */}
              <motion.div
                className={`absolute inset-0 rounded-full bg-gradient-to-br ${step.gradient}`}
                initial={{ scale: 1, opacity: 0.3 }}
                whileInView={{ scale: [1, 1.6, 1], opacity: [0.3, 0, 0.3] }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 + 0.5, duration: 2, repeat: 1 }}
              />
            </div>

            {/* Content card */}
            <GlassCard variant="strong" hover="lift" padding="md" className="flex-1" animate={false}>
              <div className="flex items-center gap-3 mb-2">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-md bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent`}>
                  Step {step.step}
                </span>
                {step.duration && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                    <Clock className="w-3 h-3" /> {step.duration}
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{step.description}</p>
              {step.details && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {step.details.map((d, j) => (
                    <motion.div
                      key={d}
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 + j * 0.05 + 0.3 }}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{d}</span>
                    </motion.div>
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
    <div
      ref={containerRef}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-start"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Step progress indicators */}
      <div className="space-y-3">
        {/* Header with counter and controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              <span className="text-base font-bold gradient-text">{active + 1}</span>
              <span className="mx-1">/</span>
              {steps.length}
            </span>
            {autoAdvance && (
              <motion.button
                onClick={() => setIsPaused(!isPaused)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                aria-label={isPaused ? "Resume auto-advance" : "Pause auto-advance"}
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
              </motion.button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              onClick={prev}
              className="p-2 rounded-lg transition-colors"
              style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Previous step"
            >
              <ChevronLeft className="w-4 h-4" />
            </motion.button>
            <motion.button
              onClick={next}
              className="p-2 rounded-lg transition-colors"
              style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              aria-label="Next step"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Segmented progress bar */}
        <div className="flex items-center gap-1.5 mb-6">
          {steps.map((step, i) => (
            <motion.div
              key={i}
              className="relative h-1.5 flex-1 rounded-full cursor-pointer overflow-hidden"
              style={{ background: "var(--border-primary)" }}
              onClick={() => goTo(i)}
              whileHover={{ scaleY: 1.8 }}
            >
              <motion.div
                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${step.gradient}`}
                initial={false}
                animate={{ width: i < active ? "100%" : i === active ? "100%" : "0%" }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
              {/* Shimmer effect on active segment */}
              {i === active && autoAdvance && !isPaused && (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/20"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: autoAdvanceInterval / 1000, ease: "linear" }}
                  key={`timer-${active}-${Date.now()}`}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Step buttons */}
        {steps.map((step, i) => (
          <motion.button
            key={step.step}
            onClick={() => goTo(i)}
            className="w-full text-left flex items-center gap-4 p-4 sm:p-5 rounded-xl transition-all duration-300"
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
            {/* Icon with active indicator */}
            <div className="relative">
              <div className={`p-2.5 rounded-lg bg-gradient-to-br ${step.gradient} shrink-0 transition-all duration-300 ${active === i ? "scale-110 shadow-lg" : "opacity-50 scale-95"}`}>
                <step.icon className="w-4 h-4 text-white" />
              </div>
              {/* Active glow ring */}
              {active === i && (
                <motion.div
                  className={`absolute -inset-1 rounded-lg bg-gradient-to-br ${step.gradient} opacity-20`}
                  layoutId="step-glow"
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
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
              <AnimatePresence>
                {active === i && (
                  <motion.p
                    className="text-xs mt-1 line-clamp-1"
                    style={{ color: "var(--text-muted)" }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {step.description}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Active indicator */}
            <motion.div
              className="shrink-0"
              animate={{ opacity: active === i ? 1 : 0, x: active === i ? 0 : -5 }}
            >
              <ArrowRight className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
            </motion.div>
          </motion.button>
        ))}
      </div>

      {/* Detail panel */}
      <div className="lg:sticky lg:top-24">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={active}
            custom={direction}
            initial={{ opacity: 0, y: direction > 0 ? 20 : -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction > 0 ? -15 : 15, scale: 0.97 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <GlassCard variant="strong" padding="xl" hover="none" animate={false}>
              {/* Header with progress ring */}
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  {/* Progress ring SVG */}
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" strokeWidth="2" stroke="var(--border-primary)" />
                    <motion.circle
                      cx="32" cy="32" r="28"
                      fill="none" strokeWidth="2.5"
                      stroke="url(#progress-grad)"
                      strokeLinecap="round"
                      strokeDasharray={Math.PI * 56}
                      initial={{ strokeDashoffset: Math.PI * 56 }}
                      animate={{ strokeDashoffset: Math.PI * 56 * (1 - (active + 1) / steps.length) }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                    <defs>
                      <linearGradient id="progress-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="var(--accent-cyan)" />
                        <stop offset="100%" stopColor="var(--accent-violet)" />
                      </linearGradient>
                    </defs>
                  </svg>
                  {/* Icon centered in ring */}
                  <div className={`absolute inset-0 flex items-center justify-center`}>
                    <div className={`p-2.5 rounded-lg bg-gradient-to-br ${current.gradient}`}>
                      <current.icon className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-mono font-bold bg-gradient-to-r ${current.gradient} bg-clip-text text-transparent`}>
                      Step {current.step}
                    </span>
                    {current.duration && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full"
                        style={{ background: "var(--accent-cyan-muted)", color: "var(--text-muted)" }}>
                        <Clock className="w-3 h-3" />
                        {current.duration}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold" style={{ color: "var(--text-primary)" }}>{current.title}</h3>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
                {current.description}
              </p>

              {/* Detail items with staggered animation */}
              {current.details && (
                <div className="space-y-2">
                  {current.details.map((d, i) => (
                    <motion.div
                      key={d}
                      className="flex items-center gap-3 p-3 rounded-lg transition-colors"
                      style={{ background: "var(--bg-glass-subtle)", border: "1px solid var(--border-primary)" }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 + 0.1 }}
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{d}</span>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Footer with navigation hint */}
              <div className="mt-6 pt-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-primary)" }}>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" style={{ color: "var(--accent-cyan)" }} />
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Use arrow keys to navigate
                  </span>
                </div>
                <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                  {active + 1} of {steps.length}
                </span>
              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
