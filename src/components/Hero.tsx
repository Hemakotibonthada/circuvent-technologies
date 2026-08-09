"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMousePosition, useReducedMotion } from "@/hooks/useMousePosition";
import { stats } from "@/lib/projects-data";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import ScrollReveal from "./ScrollReveal";
import HeroSystemsGraph from "./HeroSystemsGraph";

export default function Hero() {
  const mouse = useMousePosition();
  const reducedMotion = useReducedMotion();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Grid overlay */}
      <div
        className="absolute inset-0 z-[1]"
        style={{
          backgroundImage: `
            linear-gradient(var(--grid-line-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-line-color) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial spotlight following mouse */}
      <motion.div
        className="absolute inset-0 z-[2] pointer-events-none"
        animate={{
          background: `radial-gradient(800px circle at ${mouse.x}px ${mouse.y}px, var(--spotlight-color), transparent 50%)`,
        }}
        transition={{ type: "tween", duration: 0.3 }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pt-20">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* Left: Content */}
          <div className="lg:col-span-6 space-y-8">
            {/* Eyebrow */}
            <ScrollReveal>
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-sm"
                style={{
                  background: "var(--accent-cyan-muted)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-medium" style={{ color: "var(--text-tertiary)" }}>
                  Smart home · engineered in India
                </span>
              </motion.div>
            </ScrollReveal>

            {/* Headline — Kinetic Typography */}
            <ScrollReveal delay={0.1}>
              <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[0.9] tracking-tight">
                <motion.span
                  className="block"
                  style={{ color: "var(--text-primary)" }}
                  animate={{ x: reducedMotion ? 0 : mouse.normalizedX * 5 }}
                  transition={{ type: "spring", stiffness: 100, damping: 30 }}
                >
                  We Build
                </motion.span>
                <motion.span
                  className="block bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent mt-2"
                  animate={{ x: reducedMotion ? 0 : mouse.normalizedX * -8 }}
                  transition={{ type: "spring", stiffness: 80, damping: 30 }}
                >
                  What&apos;s Next.
                </motion.span>
              </h1>
            </ScrollReveal>

            {/* Subtitle */}
            <ScrollReveal delay={0.2}>
              <p className="text-base sm:text-lg md:text-xl max-w-xl leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                Circuvent Technologies crafts intelligent systems at the intersection
                of{" "}
                <span style={{ color: "var(--accent-cyan-text)" }}>Artificial Intelligence</span>,{" "}
                <span style={{ color: "var(--accent-violet)" }}>IoT</span>, and{" "}
                <span style={{ color: "var(--accent-pink-text)" }}>Full-Stack Engineering</span>.
                We circuvent limitations to ship products that matter.
              </p>
            </ScrollReveal>

            {/* CTAs */}
            <ScrollReveal delay={0.3}>
              <div className="flex flex-wrap gap-4">
                <Link href="/shop">
                  <Button size="lg" className="group">
                    Shop devices
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/smart-home">
                  <Button variant="outline" size="lg">
                    Explore the app
                  </Button>
                </Link>
              </div>
            </ScrollReveal>

            {/* Trust chips */}
            <ScrollReveal delay={0.35}>
              <div className="flex flex-wrap gap-2">
                {["Works with Alexa & Google", "iOS & Android", "Made in India", "Real-time control"].map((t) => (
                  <span
                    key={t}
                    className="text-xs font-medium px-3 py-1.5 rounded-full"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </ScrollReveal>

            {/* Stats Bar */}
            <ScrollReveal delay={0.4}>
              <div className="flex flex-wrap gap-4 sm:gap-8 pt-4">
                {[
                  { value: `${stats.totalProjects}+`, label: "Projects" },
                  { value: stats.linesOfCode, label: "Lines of Code" },
                  { value: `${stats.aiModels}+`, label: "AI Models" },
                  { value: `${stats.iotDevices}+`, label: "IoT Devices" },
                ].map((stat) => (
                  <div key={stat.label} className="group cursor-default">
                    <div
                      className="text-2xl sm:text-3xl font-bold transition-all duration-500 group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-violet-500 group-hover:bg-clip-text group-hover:text-transparent"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {stat.value}
                    </div>
                    <div className="text-xs uppercase tracking-widest mt-1" style={{ color: "var(--text-muted)" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>

          {/* Right: Interactive systems graph */}
          <div className="lg:col-span-6 flex justify-center">
            <ScrollReveal direction="right" delay={0.2}>
              <HeroSystemsGraph />
            </ScrollReveal>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <div className="w-6 h-10 rounded-full flex justify-center pt-2" style={{ border: "2px solid var(--border-hover)" }}>
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-cyan-500"
            animate={{ y: [0, 16, 0], opacity: [1, 0, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
      </motion.div>
    </section>
  );
}
