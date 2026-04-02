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
  Mail, Users, FileText, Briefcase, CheckCircle2,
  BarChart3, Calendar, Search, Zap, Network,
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

const officeSuiteApps = [
  {
    icon: FileText,
    title: "CV-365",
    tagline: "Your Entire Workspace in One Platform",
    description: "30+ integrated productivity apps — Docs, Sheets, Slides, Chat, Meetings, Tasks, Calendar, Drive, Wiki, Whiteboard, and more — unified, real-time, and beautiful.",
    gradient: "from-blue-500 to-indigo-600",
    features: ["Real-time co-editing with TipTap", "30+ spreadsheet formulas & charts", "Video meetings with screen sharing", "Kanban, Gantt & timeline views"],
    stats: { value: "30+", label: "Integrated Apps" },
    href: "https://work.circuvent.com",
  },
  {
    icon: Users,
    title: "HRMS",
    tagline: "Modern HR Management Made Simple",
    description: "Streamline your entire HR workflow from hiring to retiring — manage employees, attendance, payroll, performance, and more in one lightning-fast platform.",
    gradient: "from-violet-500 to-purple-600",
    features: ["50+ HR modules in one platform", "Automated payroll & attendance", "Performance reviews & OKRs", "Multi-tenant SaaS architecture"],
    stats: { value: "50+", label: "HR Modules" },
    href: "https://hrms.circuvent.com",
  },
  {
    icon: Search,
    title: "ATS",
    tagline: "Smart Applicant Tracking for Modern Teams",
    description: "Automate your hiring pipeline from application to onboarding — auto-screen, smart-schedule interviews, and send intelligent notifications all in one place.",
    gradient: "from-cyan-500 to-teal-600",
    features: ["Auto-screening & candidate scoring", "Smart interview scheduling", "Multi-channel applications", "Ecosystem integration (HRMS, Mail, CV-365)"],
    stats: { value: "100%", label: "Automated Pipeline" },
    href: "https://ats.circuvent.com",
  },
  {
    icon: Mail,
    title: "Mail",
    tagline: "Professional Email for Modern Teams",
    description: "Enterprise-grade email with calendar, contacts, and admin dashboard — everything you need from Gmail, Outlook, and Apple Mail in one self-hosted platform.",
    gradient: "from-pink-500 to-rose-600",
    features: ["Full IMAP/SMTP with custom domains", "AI-powered smart inbox & categorization", "2FA, admin dashboard & 25+ analytics", "67% cheaper than Google Workspace"],
    stats: { value: "22", label: "API Endpoints" },
    href: "https://mail.circuvent.com",
  },
];

const ecosystemConnections = [
  { from: "ATS", to: "HRMS", label: "Hired candidates → Employee records" },
  { from: "ATS", to: "Mail", label: "Auto-notifications & email provisioning" },
  { from: "ATS", to: "CV-365", label: "Candidate profiles & work history sync" },
  { from: "HRMS", to: "Mail", label: "Payslips, announcements & alerts" },
  { from: "CV-365", to: "Mail", label: "Document sharing & notifications" },
  { from: "HRMS", to: "CV-365", label: "Team directories & org charts" },
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

      {/* CIRCUVENT OFFICE SUITE */}
      <section className="relative z-10 py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-6">
              <motion.div
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-[0.2em] mb-4"
                style={{ background: "var(--accent-violet-muted)", color: "var(--accent-violet)", border: "1px solid var(--border-accent)" }}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Enterprise Suite
              </motion.div>
              <h2 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mt-3 mb-5" style={{ color: "var(--text-primary)" }}>
                The Circuvent{" "}
                <ShimmerText gradient="from-cyan-400 via-violet-400 to-pink-400">Office Suite</ShimmerText>
              </h2>
              <p className="max-w-3xl mx-auto text-lg leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                Four powerful applications — one unified ecosystem. From productivity and HR to hiring and email,
                every app is interconnected through a shared Firebase backbone for seamless data flow.
              </p>
            </div>
          </ScrollReveal>

          {/* Suite Stats Bar */}
          <ScrollReveal delay={0.1}>
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 my-12">
              {[
                { icon: Zap, value: "4", label: "Integrated Apps" },
                { icon: Layers, value: "100+", label: "Features" },
                { icon: Users, value: "50K+", label: "Users Managed" },
                { icon: Network, value: "100%", label: "Cross-App Sync" },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                >
                  <div className="p-2 rounded-lg" style={{ background: "var(--accent-cyan-muted)" }}>
                    <stat.icon className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
                  </div>
                  <div>
                    <p className="text-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">{stat.value}</p>
                    <p className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </ScrollReveal>

          {/* App Cards Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {officeSuiteApps.map((app, i) => (
              <ScrollReveal key={app.title} delay={i * 0.12}>
                <TiltCard tiltAmount={6}>
                  <motion.div
                    className="group relative overflow-hidden rounded-2xl transition-all duration-500 h-full"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}
                    whileHover={{ y: -4 }}
                  >
                    {/* Top gradient bar */}
                    <div className={`h-1 bg-gradient-to-r ${app.gradient} opacity-60 group-hover:opacity-100 transition-opacity duration-500`} />

                    <div className="p-6 sm:p-8">
                      {/* Header */}
                      <div className="flex items-start gap-4 mb-5">
                        <motion.div
                          className={`p-3.5 rounded-xl bg-gradient-to-br ${app.gradient} shadow-lg shrink-0`}
                          whileHover={{ rotate: 10, scale: 1.1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <app.icon className="w-6 h-6 text-white" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                              Circuvent {app.title}
                            </h3>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                              Live
                            </span>
                          </div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>{app.tagline}</p>
                        </div>
                        {/* Stats badge */}
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className={`text-2xl font-bold bg-gradient-to-r ${app.gradient} bg-clip-text text-transparent`}>{app.stats.value}</p>
                          <p className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{app.stats.label}</p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className="text-sm leading-relaxed mb-5" style={{ color: "var(--text-tertiary)" }}>
                        {app.description}
                      </p>

                      {/* Features list */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                        {app.features.map((feature) => (
                          <div key={feature} className="flex items-start gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                            <span className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{feature}</span>
                          </div>
                        ))}
                      </div>

                      {/* Action */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {["Next.js", "Firebase", "Zustand"].map((tech) => (
                            <span key={tech} className="px-2 py-0.5 rounded-md text-[10px] font-mono" style={{ background: "var(--accent-cyan-muted)", color: "var(--text-muted)" }}>
                              {tech}
                            </span>
                          ))}
                        </div>
                        <a
                          href={app.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs font-semibold cursor-pointer transition-transform hover:translate-x-1"
                          style={{ color: "var(--accent-cyan)" }}
                        >
                          Explore <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  </motion.div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>

          {/* Ecosystem Integration Section */}
          <ScrollReveal delay={0.2}>
            <div className="relative overflow-hidden rounded-2xl p-8 sm:p-10" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
              <div className="relative z-10">
                <div className="text-center mb-8">
                  <div className="inline-flex p-3 rounded-xl mb-4" style={{ background: "var(--accent-cyan-muted)" }}>
                    <Network className="w-6 h-6" style={{ color: "var(--accent-cyan)" }} />
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                    Seamless <ShimmerText gradient="from-cyan-400 to-violet-400">Ecosystem Integration</ShimmerText>
                  </h3>
                  <p className="max-w-xl mx-auto text-sm" style={{ color: "var(--text-tertiary)" }}>
                    Every app talks to every other app. Hire in ATS, onboard in HRMS, notify via Mail, collaborate in CV-365 — zero manual data entry.
                  </p>
                </div>

                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {ecosystemConnections.map((conn, i) => (
                    <motion.div
                      key={`${conn.from}-${conn.to}`}
                      className="flex items-center gap-3 p-3 rounded-xl transition-all duration-300"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08, duration: 0.4 }}
                      whileHover={{ scale: 1.02, borderColor: "var(--border-accent)" }}
                    >
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-500/10 to-cyan-500/5" style={{ color: "var(--accent-cyan)" }}>{conn.from}</span>
                        <ArrowRight className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gradient-to-r from-violet-500/10 to-violet-500/5" style={{ color: "var(--accent-violet)" }}>{conn.to}</span>
                      </div>
                      <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{conn.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* Tech stack row */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-8 pt-6" style={{ borderTop: "1px solid var(--border-primary)" }}>
                  {[
                    { label: "Next.js 16", icon: "▲" },
                    { label: "React 19", icon: "⚛️" },
                    { label: "Firebase", icon: "🔥" },
                    { label: "TypeScript", icon: "🔷" },
                    { label: "Zustand", icon: "🐻" },
                    { label: "Tailwind CSS 4", icon: "🎨" },
                    { label: "Framer Motion", icon: "🎬" },
                  ].map((tech) => (
                    <span key={tech.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>
                      <span>{tech.icon}</span> {tech.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
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
            <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl backdrop-blur-xl p-8 sm:p-12 lg:p-16" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-lg)" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
              <div className="relative z-10">
                <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
                  <Sparkles className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-6" style={{ color: "var(--accent-cyan)" }} />
                </motion.div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                  Ready to <ShimmerText>Circuvent</ShimmerText> Limits?
                </h2>
                <p className="text-base sm:text-lg max-w-xl mx-auto mb-8 sm:mb-10" style={{ color: "var(--text-tertiary)" }}>
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
