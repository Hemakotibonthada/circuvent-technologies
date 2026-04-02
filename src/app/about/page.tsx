"use client";

import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import AnimatedBackground from "@/components/AnimatedBackground";
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
} from "lucide-react";

const timeline = [
  {
    phase: "Genesis",
    title: "Embedded Beginnings",
    description:
      "Started with ESP32 firmware and Arduino IoT Cloud experiments — the first circuits that would define our path.",
    icon: Cpu,
  },
  {
    phase: "Evolution",
    title: "IoT Ecosystems",
    description:
      "Scaled from single-device projects to full Smart Home platforms with Flutter, Firebase, MQTT, and Alexa integration.",
    icon: Globe,
  },
  {
    phase: "Convergence",
    title: "AI-First Architecture",
    description:
      "Fused AI agents with IoT, birthing NEXUS AI OS — 13+ specialized agents running locally via Ollama.",
    icon: Brain,
  },
  {
    phase: "Now",
    title: "Multi-Domain Mastery",
    description:
      "53+ projects across 6 domains. From healthcare AI to algorithmic trading — shipping production code that matters.",
    icon: Rocket,
  },
];

const values = [
  {
    icon: Lightbulb,
    title: "Local-First Philosophy",
    description:
      "Privacy isn't a feature — it's the architecture. Our AI systems run on-device, from Ollama agents to NPU-accelerated inference.",
    gradient: "from-amber-500 to-orange-500",
  },
  {
    icon: Layers,
    title: "Full-Stack Verticality",
    description:
      "We don't outsource layers. From ESP32 firmware in C++ to React frontends to ML model training — every layer is ours.",
    gradient: "from-cyan-500 to-blue-500",
  },
  {
    icon: GitBranch,
    title: "Open Source DNA",
    description:
      "Every project is a contribution. We build in public, iterate in the open, and believe great tools should be accessible.",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    icon: Shield,
    title: "Production or Nothing",
    description:
      "8 production applications with real users. Docker-composed, CI/CD pipelined, and monitored. No prototypes left behind.",
    gradient: "from-emerald-500 to-teal-500",
  },
];

const techEcosystem = [
  { name: "React / Next.js", category: "Frontend", count: 15 },
  { name: "Flutter / Dart", category: "Mobile", count: 4 },
  { name: "React Native", category: "Cross-Platform", count: 5 },
  { name: "Python / FastAPI", category: "Backend", count: 10 },
  { name: "Node.js / Express", category: "Backend", count: 12 },
  { name: "ESP32 / Arduino", category: "Embedded", count: 9 },
  { name: "Firebase", category: "BaaS", count: 14 },
  { name: "PostgreSQL / MongoDB", category: "Database", count: 7 },
  { name: "Docker", category: "DevOps", count: 6 },
  { name: "OpenAI / Ollama", category: "AI", count: 8 },
  { name: "MQTT", category: "Protocol", count: 9 },
  { name: "TypeScript", category: "Language", count: 8 },
];

export default function AboutPage() {
  return (
    <>
      <AnimatedBackground />

      {/* Hero */}
      <section className="relative z-10 pt-32 pb-20 overflow-hidden">
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
                className="text-xl leading-relaxed max-w-2xl"
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

      {/* Mission Statement */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-10 sm:p-16"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
              <div className="relative z-10 max-w-3xl mx-auto text-center">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Target className="w-10 h-10 mx-auto mb-8" style={{ color: "var(--accent-cyan)" }} />
                </motion.div>
                <blockquote className="text-2xl sm:text-3xl font-semibold leading-relaxed mb-6" style={{ color: "var(--text-primary)" }}>
                  &ldquo;We don&apos;t build software. We engineer intelligent systems that
                  sense, think, and act — bridging the physical and digital worlds
                  through AI, IoT, and relentless full-stack craftsmanship.&rdquo;
                </blockquote>
                <p style={{ color: "var(--text-muted)" }}>
                  — The Circuvent Manifesto
                </p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Journey Timeline */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>
                Journey
              </span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                The Evolution
              </h2>
            </div>
          </ScrollReveal>

          <div className="relative">
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 via-violet-500/30 to-pink-500/30" />

            {timeline.map((item, i) => (
              <ScrollReveal key={item.phase} delay={i * 0.15}>
                <div
                  className={`relative flex flex-col md:flex-row items-start gap-8 mb-16 ${
                    i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  <div className={`flex-1 pl-20 md:pl-0 ${i % 2 === 0 ? "md:pr-16 md:text-right" : "md:pl-16"}`}>
                    <Badge variant="primary" className="mb-3">
                      {item.phase}
                    </Badge>
                    <h3 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                      {item.title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                      {item.description}
                    </p>
                  </div>

                  <div
                    className="absolute left-4 md:left-1/2 md:-translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center"
                    style={{
                      background: "var(--bg-surface)",
                      border: "2px solid var(--border-accent)",
                    }}
                  >
                    <item.icon className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
                  </div>

                  <div className="hidden md:block flex-1" />
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>
                Philosophy
              </span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                What Drives Us
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 gap-6">
            {values.map((value, i) => (
              <ScrollReveal key={value.title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-8 transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${value.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />
                  <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${value.gradient} mb-5`}>
                    <value.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                    {value.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                    {value.description}
                  </p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Tech Ecosystem */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold text-emerald-500 uppercase tracking-[0.2em]">
                Ecosystem
              </span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-4" style={{ color: "var(--text-primary)" }}>
                Our Tech Stack
              </h2>
              <p className="max-w-xl mx-auto" style={{ color: "var(--text-tertiary)" }}>
                15+ technology stacks mastered across {techEcosystem.length} core platforms.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {techEcosystem.map((tech, i) => (
              <ScrollReveal key={tech.name} delay={i * 0.05}>
                <motion.div
                  whileHover={{ scale: 1.02, y: -2 }}
                  className="group relative overflow-hidden rounded-xl backdrop-blur-xl p-4 cursor-pointer transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium transition-colors group-hover:text-cyan-500" style={{ color: "var(--text-primary)" }}>
                        {tech.name}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {tech.category}
                      </p>
                    </div>
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {tech.count}x
                    </span>
                  </div>
                  <div className="mt-3 h-1 rounded-full overflow-hidden" style={{ background: "var(--border-primary)" }}>
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500/60 to-violet-500/60"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${(tech.count / 15) * 100}%` }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 + 0.3, duration: 0.8 }}
                    />
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <ScrollReveal>
            <h2 className="text-3xl sm:text-4xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
              Meet the people behind the code
            </h2>
            <p className="mb-8 max-w-lg mx-auto" style={{ color: "var(--text-tertiary)" }}>
              Our small but mighty team combines deep technical expertise with
              creative vision.
            </p>
            <Link href="/team">
              <Button size="lg" className="group">
                Meet the Team
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
