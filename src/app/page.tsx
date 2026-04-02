"use client";

import Hero from "@/components/Hero";
import AnimatedBackground from "@/components/AnimatedBackground";
import ProjectCard from "@/components/ProjectCard";
import ScrollReveal from "@/components/ScrollReveal";
import CodeShowcase from "@/components/CodeShowcase";
import AnimatedCounter from "@/components/AnimatedCounter";
import TestimonialCarousel from "@/components/TestimonialCarousel";
import TiltCard from "@/components/TiltCard";
import Marquee, { MarqueeTechItem } from "@/components/Marquee";
import { ShimmerText } from "@/components/AnimationEffects";
import { TextReveal } from "@/components/AnimationEffects";
import {
  AnimatedPricingCards,
  AnimatedAccordion,
} from "@/components/InteractiveComponents";
import { getFeaturedProjects } from "@/lib/projects-data";
import { testimonials } from "@/lib/services-data";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, Brain, Cpu, Globe, Shield, Code2, Layers,
  Terminal, Rocket, Lock, Sparkles, Eye, Box,
  Database, Cloud, GitBranch,
} from "lucide-react";
import {
  faqItems,
  pricingTiers,
} from "@/lib/showcase-landing-data";

const domains = [
  { icon: Brain, title: "AI & Agents", description: "Multi-agent orchestration, LLM integration, computer vision, and NLP.", count: 8, gradient: "from-violet-500 to-purple-500", href: "/domains/ai" },
  { icon: Cpu, title: "IoT & Edge", description: "ESP32 ecosystems, MQTT protocols, sensor networks, and embedded firmware.", count: 9, gradient: "from-cyan-500 to-teal-500", href: "/domains/iot" },
  { icon: Shield, title: "FinTech", description: "Algorithmic trading, financial analytics, and subscription platforms.", count: 4, gradient: "from-green-500 to-emerald-500", href: "/domains/fintech" },
  { icon: Globe, title: "Full-Stack", description: "Cross-platform apps with React, Flutter, Electron, and React Native.", count: 13, gradient: "from-blue-500 to-indigo-500", href: "/domains/education" },
  { icon: Code2, title: "Enterprise", description: "HRMS platforms, email infrastructure, CMS systems, and business tooling.", count: 5, gradient: "from-slate-400 to-zinc-500", href: "/domains/enterprise" },
  { icon: Layers, title: "Health & Ed", description: "Cancer detection AI, health analytics, LMS platforms, and micro-habit engines.", count: 6, gradient: "from-pink-500 to-rose-500", href: "/domains/healthtech" },
];

const techStack = [
  { name: "React", icon: "⚛️" }, { name: "Next.js", icon: "▲" }, { name: "TypeScript", icon: "🔷" },
  { name: "Python", icon: "🐍" }, { name: "Flutter", icon: "💙" }, { name: "FastAPI", icon: "⚡" },
  { name: "ESP32", icon: "🔌" }, { name: "MQTT", icon: "📡" }, { name: "Docker", icon: "🐳" },
  { name: "PostgreSQL", icon: "🐘" }, { name: "Firebase", icon: "🔥" }, { name: "Redis", icon: "🔴" },
  { name: "Ollama", icon: "🦙" }, { name: "YOLOv8", icon: "👁️" }, { name: "Electron", icon: "⚡" },
  { name: "Tailwind", icon: "🎨" }, { name: "Prisma", icon: "💎" }, { name: "MongoDB", icon: "🍃" },
  { name: "React Native", icon: "📱" }, { name: "ChromaDB", icon: "🧠" }, { name: "Socket.IO", icon: "🔌" },
  { name: "OpenAI", icon: "🤖" }, { name: "DuckDB", icon: "🦆" }, { name: "Arduino", icon: "🔧" },
  { name: "Dart", icon: "🎯" }, { name: "Node.js", icon: "💚" }, { name: "Framer Motion", icon: "🎬" },
  { name: "GraphQL", icon: "◈" },
];

const processSteps = [
  { step: "01", title: "Discover", description: "Deep-dive into your goals, constraints, and technical requirements.", icon: Eye, gradient: "from-cyan-500 to-blue-500" },
  { step: "02", title: "Architect", description: "Design the optimal tech stack, database schema, and system architecture.", icon: Box, gradient: "from-violet-500 to-purple-500" },
  { step: "03", title: "Build", description: "Iterative development in weekly sprints with continuous demos.", icon: Code2, gradient: "from-pink-500 to-rose-500" },
  { step: "04", title: "Deploy", description: "Docker-composed deployment with monitoring, backups, and zero downtime.", icon: Rocket, gradient: "from-emerald-500 to-teal-500" },
];

const keyCapabilities = [
  { icon: Brain, label: "AI Agents", value: "13+", desc: "Specialized AI agents running locally" },
  { icon: Cpu, label: "IoT Devices", value: "9+", desc: "Production IoT devices deployed" },
  { icon: Lock, label: "Local-First", value: "100%", desc: "AI on-device, zero cloud dependency" },
  { icon: Database, label: "Databases", value: "6", desc: "PostgreSQL, MongoDB, Firebase, DuckDB, Redis, ChromaDB" },
  { icon: Cloud, label: "Docker", value: "8", desc: "Production apps containerized" },
  { icon: GitBranch, label: "Open Source", value: "53+", desc: "All MIT licensed on GitHub" },
];

export default function Home() {
  const featured = getFeaturedProjects().slice(0, 6);
  const testimonialData = testimonials.map((t) => ({
    name: t.name, role: t.role, company: t.company,
    avatar: t.avatar, content: t.content, rating: t.rating,
  }));

  return (
    <>
      <AnimatedBackground />
      <Hero />

      {/* TECH MARQUEE */}
      <section className="relative z-10 py-12 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 mb-6">
          <ScrollReveal>
            <p className="text-center text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: "var(--text-muted)" }}>
              Powered by 28+ technologies
            </p>
          </ScrollReveal>
        </div>
        <Marquee speed={25} direction="left" gap={16}>
          {techStack.slice(0, 14).map((tech) => (
            <MarqueeTechItem key={tech.name} name={tech.name} icon={tech.icon} />
          ))}
        </Marquee>
        <div className="mt-3">
          <Marquee speed={20} direction="right" gap={16}>
            {techStack.slice(14).map((tech) => (
              <MarqueeTechItem key={tech.name} name={tech.name} icon={tech.icon} />
            ))}
          </Marquee>
        </div>
      </section>

      {/* STATS */}
      <section className="relative z-10 py-20">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            <AnimatedCounter value={53} suffix="+" label="Projects" delay={0} gradient="from-cyan-500 to-blue-500" icon={<Layers className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />} description="Across 6 technology domains" />
            <AnimatedCounter value={200} suffix="K+" label="Lines of Code" delay={0.15} gradient="from-violet-500 to-purple-500" icon={<Code2 className="w-5 h-5" style={{ color: "var(--accent-violet)" }} />} description="Production-quality codebase" />
            <AnimatedCounter value={15} suffix="+" label="Tech Stacks" delay={0.3} gradient="from-pink-500 to-rose-500" icon={<Terminal className="w-5 h-5 text-pink-500" />} description="Mastered across all domains" />
            <AnimatedCounter value={8} label="In Production" delay={0.45} gradient="from-emerald-500 to-teal-500" icon={<Rocket className="w-5 h-5 text-emerald-500" />} description="Live apps with real users" />
          </div>
        </div>
      </section>

      {/* DOMAINS */}
      <section className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Domains</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-4" style={{ color: "var(--text-primary)" }}>
                Where We <ShimmerText gradient="from-cyan-400 via-violet-400 to-pink-400">Operate</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto" style={{ color: "var(--text-tertiary)" }}>
                From silicon to cloud, we engineer solutions across six core technology domains.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {domains.map((domain, i) => (
              <ScrollReveal key={domain.title} delay={i * 0.1}>
                <Link href={domain.href}>
                  <TiltCard tiltAmount={8} gradient={domain.gradient}>
                    <div className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 cursor-pointer transition-all duration-300" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                      <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${domain.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                      <div className="flex items-start gap-4 relative z-10">
                        <motion.div className={`p-3 rounded-xl bg-gradient-to-br ${domain.gradient} opacity-80 group-hover:opacity-100 transition-opacity shrink-0`} whileHover={{ rotate: 10, scale: 1.1 }}>
                          <domain.icon className="w-5 h-5 text-white" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>{domain.title}</h3>
                            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{domain.count} projects</span>
                          </div>
                          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{domain.description}</p>
                        </div>
                      </div>
                    </div>
                  </TiltCard>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* CODE SHOWCASE */}
      <section className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal>
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Our Code</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                <TextReveal text="Real Code." className="block" />
                <TextReveal text="Real Systems." className="block bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent" delay={0.3} />
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: "var(--text-tertiary)" }}>
                From Python AI orchestrators to Flutter mobile apps to ESP32 firmware — we write every line. No templates. No shortcuts.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-8">
                {[
                  { icon: Brain, label: "AI / ML", count: "35K+ lines" },
                  { icon: Cpu, label: "Embedded C++", count: "16K+ lines" },
                  { icon: Globe, label: "Web / Mobile", count: "90K+ lines" },
                  { icon: Terminal, label: "DevOps", count: "10K+ lines" },
                ].map((item) => (
                  <motion.div key={item.label} whileHover={{ y: -3, scale: 1.02 }} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                    <item.icon className="w-4 h-4 shrink-0" style={{ color: "var(--accent-cyan)" }} />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</p>
                      <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{item.count}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <Link href="/architecture">
                <Button variant="outline" className="group">
                  View Architecture <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <CodeShowcase />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* CAPABILITIES */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Capabilities</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Engineering <ShimmerText>Excellence</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {keyCapabilities.map((cap, i) => (
              <ScrollReveal key={cap.label} delay={i * 0.06}>
                <TiltCard tiltAmount={6}>
                  <motion.div className="group relative overflow-hidden rounded-2xl p-5 text-center transition-all duration-300" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}>
                    <motion.div className="inline-flex p-2.5 rounded-xl mb-3" style={{ background: "var(--accent-cyan-muted)" }} whileHover={{ rotate: 360 }} transition={{ duration: 0.5 }}>
                      <cap.icon className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                    </motion.div>
                    <div className="text-2xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">{cap.value}</div>
                    <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-primary)" }}>{cap.label}</p>
                    <p className="text-[10px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>{cap.desc}</p>
                  </motion.div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURED PROJECTS */}
      <section className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-16 gap-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Showcase</span>
                <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                  Featured <span className="bg-gradient-to-r from-violet-500 to-pink-500 bg-clip-text text-transparent">Projects</span>
                </h2>
              </div>
              <Link href="/projects">
                <Button variant="outline" className="group">View All Projects <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></Button>
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

      {/* PROCESS */}
      <section className="relative z-10 py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Process</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                How We <ShimmerText gradient="from-emerald-400 via-teal-400 to-cyan-400">Deliver</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {processSteps.map((step, i) => (
              <ScrollReveal key={step.step} delay={i * 0.15}>
                <TiltCard tiltAmount={10}>
                  <motion.div className="group relative overflow-hidden rounded-2xl p-6 text-center transition-all duration-500 h-full" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}>
                    <motion.div className={`text-4xl font-bold bg-gradient-to-r ${step.gradient} bg-clip-text text-transparent mb-4`} initial={{ opacity: 0, scale: 0.5 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1 + 0.2, type: "spring" }}>
                      {step.step}
                    </motion.div>
                    <motion.div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${step.gradient} mb-4`} whileHover={{ rotate: 15, scale: 1.15 }}>
                      <step.icon className="w-6 h-6 text-white" />
                    </motion.div>
                    <h3 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>{step.title}</h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{step.description}</p>
                  </motion.div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="relative z-10 py-24">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Testimonials</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                What People <ShimmerText gradient="from-pink-400 via-rose-400 to-red-400">Say</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <TestimonialCarousel testimonials={testimonialData} />
          </ScrollReveal>
        </div>
      </section>

      {/* PRICING */}
      <section className="relative z-10 py-24">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Pricing</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Simple, <ShimmerText>Transparent</ShimmerText> Pricing
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Choose the plan that matches your project scope. Every plan includes a GitHub repo, documentation, and Docker deployment.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <AnimatedPricingCards tiers={pricingTiers} />
          </ScrollReveal>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 py-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>FAQ</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Frequently <ShimmerText gradient="from-violet-400 to-purple-400">Asked</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <AnimatedAccordion
              items={faqItems.map((item) => ({
                ...item,
                icon: <Sparkles className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />,
              }))}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-10 py-24">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <ScrollReveal>
            <div className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-12 sm:p-16" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-lg)" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
              <div className="relative z-10">
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                  <Sparkles className="w-10 h-10 mx-auto mb-6" style={{ color: "var(--accent-cyan)" }} />
                </motion.div>
                <h2 className="text-3xl sm:text-5xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                  Ready to <ShimmerText>Circuvent</ShimmerText> Limits?
                </h2>
                <p className="text-lg max-w-xl mx-auto mb-10" style={{ color: "var(--text-tertiary)" }}>
                  Whether you&apos;re exploring our open source work or looking to collaborate, we&apos;d love to connect.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link href="/projects">
                    <Button size="lg" className="group">
                      Explore the Portfolio <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button variant="outline" size="lg">
                      Get in Touch
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
