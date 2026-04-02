"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMousePosition, useReducedMotion } from "@/hooks/useMousePosition";
import { stats } from "@/lib/projects-data";
import { Button } from "@/components/ui/button";
import { ArrowRight, Github } from "lucide-react";
import ScrollReveal from "./ScrollReveal";

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
          <div className="lg:col-span-7 space-y-8">
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
                  Engineering the Future
                </span>
              </motion.div>
            </ScrollReveal>

            {/* Headline — Kinetic Typography */}
            <ScrollReveal delay={0.1}>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl xl:text-8xl font-bold leading-[0.9] tracking-tight">
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
              <p className="text-lg sm:text-xl max-w-xl leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                Circuvent Technologies crafts intelligent systems at the intersection
                of{" "}
                <span style={{ color: "var(--accent-cyan)" }}>Artificial Intelligence</span>,{" "}
                <span style={{ color: "var(--accent-violet)" }}>IoT</span>, and{" "}
                <span style={{ color: "var(--accent-pink)" }}>Full-Stack Engineering</span>.
                We circuvent limitations to ship products that matter.
              </p>
            </ScrollReveal>

            {/* CTAs */}
            <ScrollReveal delay={0.3}>
              <div className="flex flex-wrap gap-4">
                <Link href="/projects">
                  <Button size="lg" className="group">
                    Explore Projects
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
                <Link href="/about">
                  <Button variant="outline" size="lg">
                    <Github className="w-4 h-4" />
                    Our Story
                  </Button>
                </Link>
              </div>
            </ScrollReveal>

            {/* Stats Bar */}
            <ScrollReveal delay={0.4}>
              <div className="flex flex-wrap gap-8 pt-4">
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

          {/* Right: Orbital Graphic */}
          <div className="lg:col-span-5 flex justify-center">
            <ScrollReveal direction="right" delay={0.2}>
              <motion.div
                className="relative w-80 h-80 sm:w-96 sm:h-96"
                animate={{
                  rotateX: mouse.normalizedY * 10,
                  rotateY: mouse.normalizedX * 10,
                }}
                transition={{ type: "spring", stiffness: 50, damping: 30 }}
                style={{ perspective: 1000 }}
              >
                {/* Orbital rings */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full"
                    style={{
                      transform: `rotateX(${60 + i * 15}deg) rotateZ(${i * 30}deg)`,
                      border: "1px solid var(--border-primary)",
                    }}
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 20 + i * 5,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <div
                      className={`absolute w-3 h-3 rounded-full shadow-lg ${
                        i === 0
                          ? "bg-cyan-500 shadow-cyan-500/50 top-0 left-1/2 -translate-x-1/2"
                          : i === 1
                          ? "bg-violet-500 shadow-violet-500/50 bottom-0 left-1/2 -translate-x-1/2"
                          : "bg-pink-500 shadow-pink-500/50 top-1/2 right-0 -translate-y-1/2"
                      }`}
                    />
                  </motion.div>
                ))}

                {/* Center glow */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div
                      className="w-24 h-24 rounded-full backdrop-blur-xl flex items-center justify-center"
                      style={{
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-hover)",
                        boxShadow: "var(--shadow-glow-cyan)",
                      }}
                    >
                      <span className="text-3xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                        CT
                      </span>
                    </div>
                    <div className="absolute inset-0 rounded-full blur-3xl animate-pulse" style={{ background: "var(--accent-cyan)", opacity: 0.15 }} />
                  </div>
                </div>

                {/* Tech labels floating */}
                {[
                  { label: "AI", x: "10%", y: "15%" },
                  { label: "IoT", x: "75%", y: "20%" },
                  { label: "ML", x: "5%", y: "70%" },
                  { label: "Edge", x: "80%", y: "75%" },
                ].map((item, i) => (
                  <motion.span
                    key={item.label}
                    className="absolute text-xs font-mono"
                    style={{
                      left: item.x,
                      top: item.y,
                      color: "var(--text-muted)",
                    }}
                    animate={{
                      y: [0, -8, 0],
                      opacity: [0.3, 0.6, 0.3],
                    }}
                    transition={{
                      duration: 3,
                      delay: i * 0.7,
                      repeat: Infinity,
                    }}
                  >
                    {item.label}
                  </motion.span>
                ))}
              </motion.div>
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
