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
import { ShimmerText, FloatingParticles } from "@/components/AnimationEffects";
import { TextReveal } from "@/components/AnimationEffects";
import SkillRadar, { AnimatedBarChart } from "@/components/SkillRadar";
import ScrollTimeline from "@/components/ScrollTimeline";
import { RotatingWords, StaggerLetters, MultiLineTyper } from "@/components/TextEffects";
import { getFeaturedProjects } from "@/lib/projects-data";
import { testimonials } from "@/lib/services-data";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight, Brain, Cpu, Globe, Shield, Code2, Layers, Zap,
  Terminal, Rocket, Heart, Eye, Lock, Sparkles, TrendingUp,
  Box, Wifi, Database, Cloud, GitBranch, Star, Users, Award,
  Target, Lightbulb, Puzzle, Gem, Crown, Flame, Compass,
} from "lucide-react";

// New component imports
import { InteractiveParticleDemo } from "@/components/ParticleField";
import { WaveAnimation, GradientMesh, MorphingShapes } from "@/components/ParticleField";
import {
  AnimatedDonutChart,
  AnimatedAreaChart,
  GitHubContributionGraph,
  AnimatedProgressRings,
  AnimatedHeatMap,
  AnimatedTreeMap,
  LiveStatsDashboard,
  AnimatedGauge,
} from "@/components/DataVisualization";
import {
  InteractiveCodeEditor,
  InteractiveTerminal,
  AnimatedFeatureCard,
  AnimatedComparisonTable,
  AnimatedPricingCards,
  AnimatedAccordion,
  AnimatedTabs,
} from "@/components/InteractiveComponents";
import {
  AnimatedGlobe,
  CircuitBoard,
  NeuralNetworkViz,
  OrbitAnimation,
  TypingCodeDemo,
} from "@/components/AdvancedVisuals";
import {
  BentoGrid,
  InfiniteLogos,
  HorizontalTimeline,
  MetricsDashboard,
  TechStackGrid,
  TestimonialMasonry,
  AnimatedCounterSection,
} from "@/components/AdvancedSections";
import { GradientBuilder, AnimationPlayground, ColorPaletteGenerator, SpacingVisualizer } from "@/components/InteractivePlayground";
import { InteractiveSolarSystem, TechPeriodicTable, NetworkTopology } from "@/components/InteractiveMaps";
import { techPeriodicElements, topologyNodes, topologyLinks, techSolarPlanets } from "@/lib/interactive-tools-data";
import {
  codeEditorTabs,
  terminalCommands,
  fullTechStack,
  orbitItems,
  projectDistribution,
  growthData,
  comparisonHeaders,
  comparisonRows,
  faqItems,
  pricingTiers,
  timelineEvents,
  bentoItems,
  masonryTestimonials,
  generateHeatMapData,
  treeMapData,
} from "@/lib/showcase-landing-data";
import {
  ShowcaseCarousel,
  ArchitectureDiagram,
  SkillTree,
  FeatureShowcase,
  NotificationFeed,
  AnimatedMetricsGrid,
  AnimatedLogoWall,
} from "@/components/ShowcaseComponents";
import {
  architectureNodes,
  architectureConnections,
  skillTreeData,
  featureShowcaseTabs,
  showcaseSlides,
  notificationFeedData,
  metricsGridData,
  logoWallItems,
} from "@/lib/extended-showcase-data";

const domains = [
  { icon: Brain, title: "AI & Agents", description: "Multi-agent orchestration, LLM integration, computer vision, and natural language processing.", count: 8, gradient: "from-violet-500 to-purple-500", href: "/domains/ai" },
  { icon: Cpu, title: "IoT & Edge", description: "ESP32 ecosystems, MQTT protocols, sensor networks, and embedded firmware engineering.", count: 9, gradient: "from-cyan-500 to-teal-500", href: "/domains/iot" },
  { icon: Shield, title: "FinTech", description: "Algorithmic trading, financial analytics, subscription platforms, and NPU-accelerated inference.", count: 4, gradient: "from-green-500 to-emerald-500", href: "/domains/fintech" },
  { icon: Globe, title: "Full-Stack", description: "Cross-platform apps spanning React, Flutter, Electron, and React Native with Firebase & PostgreSQL.", count: 13, gradient: "from-blue-500 to-indigo-500", href: "/domains/education" },
  { icon: Code2, title: "Enterprise", description: "HRMS platforms, email infrastructure, CMS systems, and internal business tooling.", count: 5, gradient: "from-slate-400 to-zinc-500", href: "/domains/enterprise" },
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
  { icon: Wifi, label: "MQTT", value: "<100ms", desc: "Real-time IoT latency" },
  { icon: TrendingUp, label: "Uptime", value: "99.5%", desc: "Production reliability" },
];

export default function Home() {
  const featured = getFeaturedProjects().slice(0, 6);
  const testimonialData = testimonials.map((t) => ({
    name: t.name, role: t.role, company: t.company,
    avatar: t.avatar, content: t.content, rating: t.rating,
  }));
  const heatMapData = generateHeatMapData();

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

      {/* ANIMATED STATS */}
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

      {/* DOMAINS with TiltCards */}
      <section className="relative z-10 py-32">
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
      <section className="relative z-10 py-32">
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

      {/* KEY CAPABILITIES */}
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
      <section className="relative z-10 py-32">
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
      <section className="relative z-10 py-32">
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

      {/* TESTIMONIALS CAROUSEL */}
      <section className="relative z-10 py-32">
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

      {/* SKILL RADAR SECTION */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal>
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Expertise</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                Our <ShimmerText>Skill Map</ShimmerText>
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: "var(--text-tertiary)" }}>
                Deep expertise spanning 8 core engineering disciplines — from embedded firmware to cloud AI.
              </p>
              <AnimatedBarChart
                bars={[
                  { label: "TypeScript / React", value: 95, gradient: "from-cyan-500 to-blue-500" },
                  { label: "Python / FastAPI", value: 92, gradient: "from-violet-500 to-purple-500" },
                  { label: "Flutter / Dart", value: 88, gradient: "from-pink-500 to-rose-500" },
                  { label: "ESP32 / C++", value: 90, gradient: "from-emerald-500 to-teal-500" },
                  { label: "Docker / DevOps", value: 85, gradient: "from-amber-500 to-orange-500" },
                  { label: "AI / ML Models", value: 87, gradient: "from-indigo-500 to-violet-500" },
                ]}
              />
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <SkillRadar
                skills={[
                  { label: "Frontend", value: 95 },
                  { label: "Backend", value: 92 },
                  { label: "AI / ML", value: 87 },
                  { label: "IoT", value: 90 },
                  { label: "Mobile", value: 85 },
                  { label: "DevOps", value: 82 },
                  { label: "Database", value: 88 },
                  { label: "UI / UX", value: 90 },
                ]}
                size={380}
              />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* JOURNEY TIMELINE */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Journey</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                The <ShimmerText gradient="from-violet-400 via-purple-400 to-pink-400">Evolution</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollTimeline
            milestones={[
              {
                date: "Jan 2023",
                title: "The First Circuit",
                description: "A single ESP32 blinking an LED — the project that started it all. From this moment, Circuvent's hardware-software journey began.",
                icon: "🔌",
                gradient: "from-cyan-500 to-teal-500",
                stats: [{ label: "Projects", value: "1" }],
              },
              {
                date: "Jun 2023",
                title: "IoT Ecosystem",
                description: "Expanded to 8 projects with SmartHome Flutter app, Firebase MQTT integration, and Alexa voice control.",
                icon: "🏠",
                gradient: "from-emerald-500 to-green-500",
                stats: [{ label: "Projects", value: "8" }, { label: "IoT Devices", value: "4" }],
              },
              {
                date: "Mar 2024",
                title: "AI & Enterprise",
                description: "Launched CancerGuard AI (94.2% accuracy) and HT Connect HRMS — replacing Keka + Jira with a single platform.",
                icon: "🧠",
                gradient: "from-violet-500 to-purple-500",
                stats: [{ label: "Projects", value: "24" }, { label: "In Production", value: "3" }],
              },
              {
                date: "Jan 2025",
                title: "NEXUS AI OS",
                description: "13-agent local-first AI operating system — personal, financial, health, and home agents running entirely on-device.",
                icon: "🚀",
                gradient: "from-pink-500 to-rose-500",
                stats: [{ label: "Projects", value: "45" }, { label: "AI Agents", value: "13+" }],
              },
              {
                date: "Mar 2026",
                title: "53+ Projects",
                description: "200K+ lines of code, 8 production apps, 15+ tech stacks mastered. The journey continues.",
                icon: "✨",
                gradient: "from-amber-500 to-orange-500",
                stats: [{ label: "Total Projects", value: "53+" }, { label: "Lines of Code", value: "200K+" }],
              },
            ]}
          />
        </div>
      </section>

      {/* TERMINAL / CLI SECTION */}
      <section className="relative z-10 py-32">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-500">Get Started</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Deploy in{" "}
                <RotatingWords
                  words={["Seconds", "One Command", "Docker", "Production"]}
                  interval={2500}
                />
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <InteractiveTerminal
              commands={terminalCommands}
              title="circuvent-deploy"
              prompt="~/circuvent $"
              autoPlay
              autoPlayDelay={600}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* INTERACTIVE CODE EDITOR */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Live Code</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Built With <ShimmerText gradient="from-violet-400 via-purple-400 to-pink-400">Precision</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                From TypeScript agents to ESP32 firmware to Python ML pipelines — explore real code from our projects.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <InteractiveCodeEditor
              tabs={codeEditorTabs}
              title="circuvent-projects"
              showLineNumbers
              showMinimap
            />
          </ScrollReveal>
        </div>
      </section>

      {/* GLOBAL REACH - GLOBE */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal>
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Global Impact</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                Connecting <ShimmerText>Worldwide</ShimmerText>
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: "var(--text-tertiary)" }}>
                Our solutions serve users across 12+ countries, with infrastructure spanning from Hyderabad to Silicon Valley.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Countries Served", value: "12+", icon: Globe },
                  { label: "Active Users", value: "5K+", icon: Users },
                  { label: "API Uptime", value: "99.5%", icon: Wifi },
                  { label: "Avg Response", value: "<200ms", icon: Zap },
                ].map((stat) => (
                  <motion.div key={stat.label} whileHover={{ y: -2 }} className="p-3 rounded-xl" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                    <stat.icon className="w-4 h-4 mb-1" style={{ color: "var(--accent-cyan)" }} />
                    <div className="text-lg font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">{stat.value}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
                  </motion.div>
                ))}
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <div className="flex justify-center">
                <AnimatedGlobe size={380} interactive />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* METRICS DASHBOARD */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Metrics</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                By The <ShimmerText>Numbers</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <MetricsDashboard />
          </ScrollReveal>
        </div>
      </section>

      {/* BENTO GRID */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Why Us</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                What Sets Us <ShimmerText gradient="from-violet-400 to-pink-400">Apart</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <BentoGrid
              items={bentoItems.map((item) => ({
                ...item,
                icon: item.gradient?.includes("violet") ? <Brain className="w-5 h-5 text-violet-400" /> :
                      item.gradient?.includes("cyan") ? <Wifi className="w-5 h-5 text-cyan-400" /> :
                      item.gradient?.includes("blue") ? <Globe className="w-5 h-5 text-blue-400" /> :
                      item.gradient?.includes("emerald") ? <GitBranch className="w-5 h-5 text-emerald-400" /> :
                      item.gradient?.includes("amber") ? <Cloud className="w-5 h-5 text-amber-400" /> :
                      <Lock className="w-5 h-5 text-pink-400" />,
              }))}
              columns={3}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* DATA VISUALIZATION - Charts */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Analytics</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Project <ShimmerText gradient="from-pink-400 via-rose-400 to-red-400">Analytics</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid lg:grid-cols-2 gap-8">
            <ScrollReveal>
              <div className="rounded-2xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}>
                <h3 className="text-sm font-semibold mb-6" style={{ color: "var(--text-primary)" }}>Project Distribution</h3>
                <div className="flex justify-center">
                  <AnimatedDonutChart
                    segments={projectDistribution}
                    size={220}
                    centerLabel="Total"
                    centerValue="53+"
                  />
                </div>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <div className="rounded-2xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}>
                <AnimatedAreaChart
                  data={growthData}
                  title="Project Growth Over Time"
                  subtitle="Number of projects shipped per quarter"
                  color="#06b6d4"
                  gradientFrom="#06b6d4"
                  height={260}
                  showDots
                  showGrid
                />
              </div>
            </ScrollReveal>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 mt-8">
            <ScrollReveal>
              <div className="rounded-2xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Codebase Composition</h3>
                <AnimatedTreeMap data={treeMapData} height={200} />
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <div className="rounded-2xl p-6 flex flex-col items-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}>
                <h3 className="text-sm font-semibold mb-4 self-start" style={{ color: "var(--text-primary)" }}>Skill Mastery</h3>
                <AnimatedProgressRings
                  rings={[
                    { label: "Frontend", value: 95, max: 100, color: "#06b6d4" },
                    { label: "Backend", value: 92, max: 100, color: "#8b5cf6" },
                    { label: "AI/ML", value: 87, max: 100, color: "#ec4899" },
                    { label: "IoT", value: 90, max: 100, color: "#10b981" },
                  ]}
                  size={180}
                />
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <div className="rounded-2xl p-6 flex flex-col items-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}>
                <h3 className="text-sm font-semibold mb-4 self-start" style={{ color: "var(--text-primary)" }}>Performance Score</h3>
                <AnimatedGauge
                  value={95}
                  max={100}
                  color="#06b6d4"
                  label="Lighthouse Score"
                  size={180}
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* GITHUB CONTRIBUTIONS */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="rounded-2xl p-6 sm:p-8" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}>
              <GitHubContributionGraph weeks={40} />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* PARTICLE PLAYGROUND */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Creativity</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Particle <ShimmerText>Playground</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Interactive canvas-based particle systems — explore different presets and see the creative possibilities.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <InteractiveParticleDemo className="min-h-[450px]" />
          </ScrollReveal>
        </div>
      </section>

      {/* NEURAL NETWORK + CIRCUIT BOARD */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Under the Hood</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                AI & IoT <ShimmerText gradient="from-violet-400 to-cyan-400">Visualized</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid lg:grid-cols-2 gap-8">
            <ScrollReveal>
              <div className="rounded-2xl p-6 overflow-hidden" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>🧠 Neural Network</h3>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Watch signals propagate through a multi-layer perceptron</p>
                <NeuralNetworkViz layers={[4, 6, 8, 6, 3]} width={500} height={300} />
              </div>
            </ScrollReveal>
            <ScrollReveal delay={0.15}>
              <div className="rounded-2xl p-6 overflow-hidden" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>⚡ Circuit Board</h3>
                <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Data packets flowing through an IoT sensor network</p>
                <CircuitBoard width={500} height={300} nodeCount={25} />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* TECH ECOSYSTEM ORBIT */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal>
              <div className="flex justify-center">
                <OrbitAnimation
                  items={orbitItems}
                  centerLabel="NEXUS"
                  size={380}
                  speed={0.6}
                />
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Ecosystem</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                Technology <ShimmerText gradient="from-violet-400 to-pink-400">Ecosystem</ShimmerText>
              </h2>
              <p className="text-lg leading-relaxed mb-8" style={{ color: "var(--text-tertiary)" }}>
                12+ technologies orbiting around NEXUS — our core AI operating system. Every tool carefully selected and deeply integrated.
              </p>
              <TechStackGrid items={fullTechStack} />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* HORIZONTAL TIMELINE */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Timeline</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Our <ShimmerText>Journey</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <HorizontalTimeline events={timelineEvents} />
          </ScrollReveal>
        </div>
      </section>

      {/* COMPARISON TABLE */}
      <section className="relative z-10 py-32">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Compare</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Why <ShimmerText gradient="from-pink-400 to-rose-400">Circuvent</ShimmerText>?
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <AnimatedComparisonTable
              headers={comparisonHeaders}
              rows={comparisonRows}
              highlightColumn={0}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* TESTIMONIAL MASONRY */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Reviews</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Loved By <ShimmerText gradient="from-pink-400 via-rose-400 to-red-400">Developers</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <TestimonialMasonry testimonials={masonryTestimonials} columns={3} />
          </ScrollReveal>
        </div>
      </section>

      {/* PRICING */}
      <section className="relative z-10 py-32">
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
      <section className="relative z-10 py-32">
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

      {/* FEATURE SHOWCASE TABS */}
      <section className="relative z-10 py-32">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Deep Dive</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Our <ShimmerText>Core Domains</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Explore our capabilities across AI, IoT, full-stack, and DevOps — each domain backed by production-proven systems.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <FeatureShowcase tabs={featureShowcaseTabs} />
          </ScrollReveal>
        </div>
      </section>

      {/* ARCHITECTURE DIAGRAM */}
      <section className="relative z-10 py-32">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Architecture</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                System <ShimmerText gradient="from-violet-400 to-cyan-400">Architecture</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Interactive diagram of our production stack — hover over nodes to explore connections.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <ArchitectureDiagram
              nodes={architectureNodes}
              connections={architectureConnections}
              title="NEXUS Production Stack"
              height={520}
            />
          </ScrollReveal>
        </div>
      </section>

      {/* SKILL TREE */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Skills</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Skill <ShimmerText gradient="from-pink-400 to-rose-400">Tree</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Our technology progression — from HTML fundamentals to NEXUS AI OS.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <div className="rounded-2xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
              <SkillTree skills={skillTreeData} />
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* PROJECT SHOWCASE CAROUSEL */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Showcase</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Flagship <ShimmerText>Projects</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <ShowcaseCarousel slides={showcaseSlides} autoPlay interval={6000} />
          </ScrollReveal>
        </div>
      </section>

      {/* METRICS DEEP DIVE */}
      <section className="relative z-10 py-32">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Engineering</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Quality <ShimmerText gradient="from-violet-400 to-purple-400">Metrics</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Real engineering metrics from our production systems — click any card for monthly breakdown.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <AnimatedMetricsGrid metrics={metricsGridData} />
          </ScrollReveal>
        </div>
      </section>

      {/* LIVE ACTIVITY FEED + LOGO WALL */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2">
              <ScrollReveal>
                <NotificationFeed notifications={notificationFeedData} maxVisible={6} autoScroll />
              </ScrollReveal>
            </div>
            <div className="lg:col-span-3">
              <ScrollReveal delay={0.1}>
                <h4 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Technology Wall</h4>
                <AnimatedLogoWall items={logoWallItems} rows={4} speed={20} />
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* WAVE DIVIDER */}
      <WaveAnimation
        waves={3}
        amplitude={30}
        speed={0.015}
        colors={["rgba(6, 182, 212, 0.08)", "rgba(139, 92, 246, 0.06)", "rgba(236, 72, 153, 0.04)"]}
        height={150}
      />

      {/* TECH PERIODIC TABLE */}
      <section className="relative z-10 py-32">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Elements</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Periodic Table of <ShimmerText>Technology</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Every technology we&apos;ve mastered, organized by domain. Hover to see proficiency levels.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <TechPeriodicTable elements={techPeriodicElements} />
          </ScrollReveal>
        </div>
      </section>

      {/* SOLAR SYSTEM */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <ScrollReveal>
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Orbit</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                Tech <ShimmerText gradient="from-violet-400 to-cyan-400">Solar System</ShimmerText>
              </h2>
              <p className="text-lg leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
                Our technology stack orbiting around NEXUS — from web fundamentals to advanced AI, each technology plays a crucial role in our ecosystem.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {techSolarPlanets.map((planet) => (
                  <motion.div key={planet.name} className="flex items-center gap-2 p-2.5 rounded-xl" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }} whileHover={{ y: -2 }}>
                    <span className="text-lg">{planet.icon}</span>
                    <div>
                      <div className="text-xs font-semibold" style={{ color: planet.color }}>{planet.name}</div>
                      <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{planet.description}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </ScrollReveal>
            <ScrollReveal direction="right" delay={0.2}>
              <div className="flex justify-center">
                <InteractiveSolarSystem planets={techSolarPlanets} size={420} centerLabel="NEXUS" />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* NETWORK TOPOLOGY */}
      <section className="relative z-10 py-32">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-pink)" }}>Infrastructure</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Network <ShimmerText gradient="from-pink-400 to-violet-400">Topology</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Live view of our production infrastructure — hover over nodes to see real-time metrics.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal>
            <NetworkTopology nodes={topologyNodes} links={topologyLinks} width={700} height={460} animated />
          </ScrollReveal>
        </div>
      </section>

      {/* INTERACTIVE PLAYGROUND */}
      <section className="relative z-10 py-32">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>Tools</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Interactive <ShimmerText>Playground</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Design tools built right into the page — create gradients, shadows, animations, and color palettes.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid lg:grid-cols-2 gap-6">
            <ScrollReveal>
              <GradientBuilder />
            </ScrollReveal>
            <ScrollReveal delay={0.1}>
              <ColorPaletteGenerator />
            </ScrollReveal>
            <ScrollReveal delay={0.2}>
              <AnimationPlayground />
            </ScrollReveal>
            <ScrollReveal delay={0.3}>
              <SpacingVisualizer />
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative z-10 py-32">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <ScrollReveal>
            <div className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-12 sm:p-16" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", boxShadow: "var(--shadow-lg)" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
              <FloatingParticles count={8} />
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
                    <Button variant="glass" size="lg">
                      <Heart className="w-4 h-4" /> Get in Touch
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
