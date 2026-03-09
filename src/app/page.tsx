"use client";

import Hero from "@/components/Hero";
import AnimatedBackground from "@/components/AnimatedBackground";
import ProjectCard from "@/components/ProjectCard";
import ScrollReveal from "@/components/ScrollReveal";
import { getFeaturedProjects } from "@/lib/projects-data";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Cpu,
  Globe,
  Shield,
  Code2,
  Layers,
} from "lucide-react";

const domains = [
  {
    icon: Brain,
    title: "AI & Agents",
    description:
      "Multi-agent orchestration, LLM integration, computer vision, and natural language processing.",
    count: 8,
    gradient: "from-violet-500 to-purple-500",
  },
  {
    icon: Cpu,
    title: "IoT & Edge",
    description:
      "ESP32 ecosystems, MQTT protocols, sensor networks, and embedded firmware engineering.",
    count: 9,
    gradient: "from-cyan-500 to-teal-500",
  },
  {
    icon: Shield,
    title: "FinTech",
    description:
      "Algorithmic trading, financial analytics, subscription platforms, and NPU-accelerated inference.",
    count: 4,
    gradient: "from-green-500 to-emerald-500",
  },
  {
    icon: Globe,
    title: "Full-Stack",
    description:
      "Cross-platform apps spanning React, Flutter, Electron, and React Native with Firebase & PostgreSQL.",
    count: 13,
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    icon: Code2,
    title: "Enterprise",
    description:
      "HRMS platforms, email infrastructure, CMS systems, and internal business tooling.",
    count: 5,
    gradient: "from-slate-400 to-zinc-500",
  },
  {
    icon: Layers,
    title: "Health & Ed",
    description:
      "Cancer detection AI, health analytics, LMS platforms, and micro-habit engines.",
    count: 6,
    gradient: "from-pink-500 to-rose-500",
  },
];

export default function Home() {
  const featured = getFeaturedProjects().slice(0, 6);

  return (
    <>
      <AnimatedBackground />

      <Hero />

      {/* Domains section */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>
                Domains
              </span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-4" style={{ color: "var(--text-primary)" }}>
                Where We{" "}
                <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                  Operate
                </span>
              </h2>
              <p className="max-w-2xl mx-auto" style={{ color: "var(--text-tertiary)" }}>
                From silicon to cloud, we engineer solutions across six core
                technology domains.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {domains.map((domain, i) => (
              <ScrollReveal key={domain.title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 cursor-pointer transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${domain.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />
                  <div className="flex items-start gap-4">
                    <div
                      className={`p-3 rounded-xl bg-gradient-to-br ${domain.gradient} opacity-80 group-hover:opacity-100 transition-opacity shrink-0`}
                    >
                      <domain.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                          {domain.title}
                        </h3>
                        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                          {domain.count} projects
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {domain.description}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Projects */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-16 gap-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>
                  Showcase
                </span>
                <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                  Featured{" "}
                  <span className="bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent">
                    Projects
                  </span>
                </h2>
              </div>
              <Link href="/projects">
                <Button variant="outline" className="group">
                  View All Projects
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featured.map((project, i) => (
              <ProjectCard key={project.id} project={project} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative z-10 py-32">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-12 sm:p-16"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />

              <div className="relative z-10">
                <h2 className="text-3xl sm:text-5xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                  Ready to{" "}
                  <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                    Circuvent
                  </span>{" "}
                  Limits?
                </h2>
                <p className="text-lg max-w-xl mx-auto mb-10" style={{ color: "var(--text-tertiary)" }}>
                  Whether you&apos;re exploring our open source work or looking
                  to collaborate, we&apos;d love to connect.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link href="/projects">
                    <Button size="lg" className="group">
                      Explore the Portfolio
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                  <Link href="/about">
                    <Button variant="glass" size="lg">
                      Learn Our Story
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
