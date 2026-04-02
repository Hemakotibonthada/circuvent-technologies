"use client";

import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import AnimatedBackground from "@/components/AnimatedBackground";
import AnimatedCounter from "@/components/AnimatedCounter";
import CTASection from "@/components/CTASection";
import TiltCard from "@/components/TiltCard";
import { ShimmerText } from "@/components/AnimationEffects";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ArrowRight,
  Target,
  Lightbulb,
  Rocket,
  Shield,
  Globe,
  Brain,
  Cpu,
  GitBranch,
  Layers,
  Code2,
  Terminal,
  Sparkles,
  Heart,
  Users,
  Zap,
} from "lucide-react";

const timeline = [
  {
    year: "2023",
    phase: "Genesis",
    title: "Embedded Beginnings",
    description:
      "Started with ESP32 firmware and Arduino IoT Cloud experiments — the first circuits that would define our path.",
    icon: Cpu,
    gradient: "from-cyan-500 to-teal-500",
    metric: "3 projects",
  },
  {
    year: "2023",
    phase: "Evolution",
    title: "IoT Ecosystems",
    description:
      "Scaled from single-device projects to full Smart Home platforms with Flutter, Firebase, MQTT, and Alexa integration.",
    icon: Globe,
    gradient: "from-emerald-500 to-green-500",
    metric: "9 IoT devices",
  },
  {
    year: "2024",
    phase: "Convergence",
    title: "AI-First Architecture",
    description:
      "Fused AI agents with IoT, birthing NEXUS AI OS — 13+ specialized agents running locally via Ollama.",
    icon: Brain,
    gradient: "from-violet-500 to-purple-500",
    metric: "13 AI agents",
  },
  {
    year: "2025–26",
    phase: "Now",
    title: "Multi-Domain Mastery",
    description:
      "53+ projects across 6 domains. From healthcare AI to algorithmic trading — shipping production code that matters.",
    icon: Rocket,
    gradient: "from-pink-500 to-rose-500",
    metric: "53+ projects",
  },
];

const values = [
  {
    icon: Lightbulb,
    title: "Local-First Philosophy",
    description:
      "Privacy isn't a feature — it's the architecture. Our AI systems run on-device, from Ollama agents to NPU-accelerated inference.",
    gradient: "from-amber-500 to-orange-500",
    number: "01",
  },
  {
    icon: Layers,
    title: "Full-Stack Verticality",
    description:
      "We don't outsource layers. From ESP32 firmware in C++ to React frontends to ML model training — every layer is ours.",
    gradient: "from-cyan-500 to-blue-500",
    number: "02",
  },
  {
    icon: GitBranch,
    title: "Open Source DNA",
    description:
      "Every project is a contribution. We build in public, iterate in the open, and believe great tools should be accessible.",
    gradient: "from-violet-500 to-purple-500",
    number: "03",
  },
  {
    icon: Shield,
    title: "Production or Nothing",
    description:
      "8 production applications with real users. Docker-composed, CI/CD pipelined, and monitored. No prototypes left behind.",
    gradient: "from-emerald-500 to-teal-500",
    number: "04",
  },
];

const techEcosystem = [
  { name: "React / Next.js", category: "Frontend", count: 15, color: "text-cyan-500" },
  { name: "Flutter / Dart", category: "Mobile", count: 4, color: "text-blue-500" },
  { name: "React Native", category: "Cross-Platform", count: 5, color: "text-blue-400" },
  { name: "Python / FastAPI", category: "Backend", count: 10, color: "text-emerald-500" },
  { name: "Node.js / Express", category: "Backend", count: 12, color: "text-emerald-500" },
  { name: "ESP32 / Arduino", category: "Embedded", count: 9, color: "text-amber-500" },
  { name: "Firebase", category: "BaaS", count: 14, color: "text-orange-500" },
  { name: "PostgreSQL / MongoDB", category: "Database", count: 7, color: "text-violet-500" },
  { name: "Docker", category: "DevOps", count: 6, color: "text-sky-500" },
  { name: "OpenAI / Ollama", category: "AI", count: 8, color: "text-pink-500" },
  { name: "MQTT", category: "Protocol", count: 9, color: "text-teal-500" },
  { name: "TypeScript", category: "Language", count: 8, color: "text-blue-600" },
];

export default function AboutPage() {
  return (
    <>
      <AnimatedBackground />

      {/* Hero */}
      <section className="relative z-10 pt-32 pb-12 sm:pb-20 overflow-hidden">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.07] blur-[120px] pointer-events-none"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="max-w-4xl">
              <motion.span
                className="inline-block text-xs font-semibold uppercase tracking-[0.2em] mb-4"
                style={{ color: "var(--accent-cyan)" }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                About Circuvent
              </motion.span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mt-1 mb-8 leading-[0.95]" style={{ color: "var(--text-primary)" }}>
                Circuventing the
                <br />
                <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  Status Quo
                </span>
              </h1>
              <motion.p
                className="text-base sm:text-lg md:text-xl leading-relaxed max-w-2xl"
                style={{ color: "var(--text-tertiary)" }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25 }}
              >
                We are a technology company that refuses to accept &ldquo;impossible.&rdquo;
                From intelligent IoT ecosystems to AI agents that run without the
                cloud — we build what others haven&apos;t imagined yet.
              </motion.p>
            </div>
          </ScrollReveal>

          <motion.div
            className="mt-12 h-px w-full max-w-2xl"
            style={{ background: "linear-gradient(90deg, transparent, var(--accent-cyan), var(--accent-violet), transparent)" }}
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 0.4 }}
            transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
          />
        </div>
      </section>

      {/* Stats Counter */}
      <section className="relative z-10 py-8 sm:py-12">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            <AnimatedCounter value={53} suffix="+" label="Projects" delay={0} gradient="from-cyan-500 to-blue-500" icon={<Layers className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />} description="Across 6 technology domains" />
            <AnimatedCounter value={200} suffix="K+" label="Lines of Code" delay={0.15} gradient="from-violet-500 to-purple-500" icon={<Code2 className="w-5 h-5" style={{ color: "var(--accent-violet)" }} />} description="Production-quality codebase" />
            <AnimatedCounter value={15} suffix="+" label="Tech Stacks" delay={0.3} gradient="from-pink-500 to-rose-500" icon={<Terminal className="w-5 h-5 text-pink-500" />} description="Mastered across all domains" />
            <AnimatedCounter value={8} label="In Production" delay={0.45} gradient="from-emerald-500 to-teal-500" icon={<Rocket className="w-5 h-5 text-emerald-500" />} description="Live apps with real users" />
          </div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="relative z-10 py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-8 sm:p-12 md:p-16"
              style={{
                background: "var(--bg-glass-strong)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
              <div className="relative z-10 max-w-3xl mx-auto text-center">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Target className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-6 sm:mb-8" style={{ color: "var(--accent-cyan)" }} />
                </motion.div>
                <blockquote className="text-lg sm:text-2xl md:text-3xl font-semibold leading-relaxed mb-6" style={{ color: "var(--text-primary)" }}>
                  &ldquo;We don&apos;t build software. We engineer intelligent systems that
                  sense, think, and act — bridging the physical and digital worlds
                  through AI, IoT, and relentless full-stack craftsmanship.&rdquo;
                </blockquote>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  — The Circuvent Manifesto
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Journey Timeline */}
      <section className="relative z-10 py-12 sm:py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12 sm:mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>
                Journey
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                The <ShimmerText gradient="from-violet-400 via-purple-400 to-pink-400">Evolution</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 via-violet-500/30 to-pink-500/30" />

            {timeline.map((item, i) => (
              <ScrollReveal key={item.phase} delay={i * 0.15}>
                <div
                  className={`relative flex flex-col md:flex-row items-start gap-6 sm:gap-8 mb-12 sm:mb-16 ${
                    i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Content card */}
                  <div className={`flex-1 pl-20 md:pl-0 ${i % 2 === 0 ? "md:pr-16 md:text-right" : "md:pl-16"}`}>
                    <motion.div
                      whileHover={{ y: -3 }}
                      className="group relative overflow-hidden rounded-xl p-5 sm:p-6 transition-all duration-300"
                      style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)" }}
                    >
                      <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${item.gradient} opacity-0 group-hover:opacity-60 transition-opacity duration-500`} />
                      <div className="flex items-center gap-2 mb-3" style={{ justifyContent: i % 2 === 0 ? "flex-end" : "flex-start" }}>
                        <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{item.year}</span>
                        <Badge variant="primary">{item.phase}</Badge>
                      </div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                        {item.title}
                      </h3>
                      <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--text-tertiary)" }}>
                        {item.description}
                      </p>
                      <span className={`text-xs font-semibold bg-gradient-to-r ${item.gradient} bg-clip-text text-transparent`}>
                        {item.metric}
                      </span>
                    </motion.div>
                  </div>

                  {/* Timeline dot */}
                  <motion.div
                    className={`absolute left-4 md:left-1/2 md:-translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center`}
                    style={{
                      background: "var(--bg-surface)",
                      border: "2px solid var(--border-accent)",
                      boxShadow: "var(--shadow-glow-cyan)",
                    }}
                    whileHover={{ scale: 1.2 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <item.icon className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
                  </motion.div>

                  <div className="hidden md:block flex-1" />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* What We've Built — metrics strip */}
      <section className="relative z-10 py-8 sm:py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
              style={{ background: "var(--bg-glass-strong)", border: "1px solid var(--border-primary)" }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/3 via-violet-500/3 to-pink-500/3" />
              <div className="relative z-10 flex flex-wrap items-center justify-center gap-6 sm:gap-10 md:gap-14">
                {[
                  { icon: Brain, value: "13+", label: "AI Agents" },
                  { icon: Cpu, value: "9+", label: "IoT Devices" },
                  { icon: Globe, value: "6", label: "Domains" },
                  { icon: Users, value: "500+", label: "Users Served" },
                  { icon: Heart, value: "100%", label: "Open Source" },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    className="flex flex-col items-center text-center"
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                  >
                    <item.icon className="w-4 h-4 mb-1.5" style={{ color: "var(--accent-cyan)" }} />
                    <span className="text-xl sm:text-2xl font-bold gradient-text">{item.value}</span>
                    <span className="text-[10px] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-muted)" }}>{item.label}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Values */}
      <section className="relative z-10 py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12 sm:mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>
                Philosophy
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                What <ShimmerText gradient="from-pink-400 via-rose-400 to-red-400">Drives</ShimmerText> Us
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            {values.map((value, i) => (
              <ScrollReveal key={value.title} delay={i * 0.1}>
                <TiltCard tiltAmount={5}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    className="group relative overflow-hidden rounded-2xl p-6 sm:p-8 transition-all duration-300 h-full"
                    style={{
                      background: "var(--bg-glass-strong)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    {/* Top gradient accent */}
                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${value.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                    {/* Number watermark */}
                    <div className={`absolute top-4 right-5 text-5xl sm:text-6xl font-bold opacity-[0.04] bg-gradient-to-br ${value.gradient} bg-clip-text text-transparent select-none pointer-events-none`}>
                      {value.number}
                    </div>

                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-5">
                        <motion.div
                          className={`p-3 rounded-xl bg-gradient-to-br ${value.gradient} shrink-0`}
                          whileHover={{ rotate: 10, scale: 1.1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <value.icon className="w-5 h-5 text-white" />
                        </motion.div>
                        <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                          {value.number}
                        </span>
                      </div>
                      <h3 className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                        {value.title}
                      </h3>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                        {value.description}
                      </p>
                    </div>
                  </motion.div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Ecosystem */}
      <section className="relative z-10 py-12 sm:py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12 sm:mb-16">
              <span className="text-xs font-semibold text-emerald-500 uppercase tracking-[0.2em]">
                Ecosystem
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-3 mb-4" style={{ color: "var(--text-primary)" }}>
                Our <ShimmerText gradient="from-emerald-400 via-teal-400 to-cyan-400">Tech Stack</ShimmerText>
              </h2>
              <p className="max-w-xl mx-auto text-sm sm:text-base" style={{ color: "var(--text-tertiary)" }}>
                15+ technology stacks mastered across {techEcosystem.length} core platforms.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {techEcosystem.map((tech, i) => (
              <ScrollReveal key={tech.name} delay={i * 0.04}>
                <motion.div
                  whileHover={{ scale: 1.03, y: -3 }}
                  className="group relative overflow-hidden rounded-xl p-4 cursor-pointer transition-all duration-300"
                  style={{
                    background: "var(--bg-glass-strong)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-400/0 to-transparent group-hover:via-cyan-400/30 transition-all duration-500" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-sm font-medium transition-colors group-hover:${tech.color}`} style={{ color: "var(--text-primary)" }}>
                        {tech.name}
                      </p>
                      <p className="text-[10px] mt-0.5 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        {tech.category}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold" style={{ color: "var(--text-muted)" }}>
                      {tech.count}×
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border-primary)" }}>
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(tech.count / 15) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.04 + 0.3, duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <CTASection
        title="Meet the people behind"
        titleHighlight="the code"
        description="Our small but mighty team combines deep technical expertise with creative vision. Get to know from engineers."
        primaryCTA={{ label: "Meet the Team", href: "/team" }}
        secondaryCTA={{ label: "View Projects", href: "/projects" }}
      />
    </>
  );
}
