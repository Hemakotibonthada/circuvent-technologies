"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import TestimonialCard from "@/components/TestimonialCard";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TiltCard from "@/components/TiltCard";
import { ShimmerText } from "@/components/AnimationEffects";
import { services, testimonials, faqs } from "@/lib/services-data";
import Link from "next/link";
import {
  ArrowRight, Brain, Cpu, Globe, Layers, Shield, Building2,
  CheckCircle, Clock, Code2, Zap, Star, Users, Rocket,
  Target, Sparkles, Heart, Award, ChevronDown, ExternalLink,
  MessageSquare, Lightbulb, GitBranch, Database, Cloud,
  Monitor, Smartphone, Terminal, Lock, TrendingUp,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Cpu, Globe, Layers, Shield, Building2, Code2, Zap,
};

// Stats data
const serviceStats = [
  { value: "53+", label: "Projects Delivered", icon: Rocket, color: "#06b6d4", textColor: "#0e7490" },
  { value: "99.5%", label: "Client Satisfaction", icon: Heart, color: "#ec4899", textColor: "#be185d" },
  { value: "6", label: "Tech Domains", icon: Layers, color: "#8b5cf6", textColor: "#6d28d9" },
  { value: "<48hrs", label: "Response Time", icon: Clock, color: "#10b981", textColor: "#047857" },
];

// Process steps with more detail
const processSteps = [
  {
    step: "01",
    title: "Discovery",
    description: "Deep-dive into your goals, constraints, and technical requirements through structured workshops and stakeholder interviews.",
    icon: Lightbulb,
    details: ["Stakeholder interviews", "Requirement analysis", "Competitive research", "Feasibility assessment"],
    gradient: "from-cyan-500 to-blue-500",
    duration: "1-2 weeks",
  },
  {
    step: "02",
    title: "Architecture",
    description: "Design the optimal tech stack, database schema, system architecture, API contracts, and deployment strategy.",
    icon: Target,
    details: ["System design docs", "API specification", "Database schema", "Infrastructure plan"],
    gradient: "from-violet-500 to-purple-500",
    duration: "1 week",
  },
  {
    step: "03",
    title: "Build",
    description: "Iterative development in weekly sprints with continuous demos, code reviews, and feedback integration.",
    icon: Code2,
    details: ["Weekly sprint demos", "CI/CD pipeline", "Code reviews", "Test automation"],
    gradient: "from-pink-500 to-rose-500",
    duration: "4-12 weeks",
  },
  {
    step: "04",
    title: "Deploy",
    description: "Docker-composed deployment with monitoring, automated backups, zero-downtime rollouts, and full documentation.",
    icon: Rocket,
    details: ["Docker deployment", "Health monitoring", "Performance tuning", "Knowledge transfer"],
    gradient: "from-emerald-500 to-teal-500",
    duration: "1 week",
  },
];

// Why choose us differentiators
const differentiators = [
  {
    icon: Brain,
    title: "AI-First Thinking",
    description: "Every solution starts with the question: how can AI make this smarter, faster, and more adaptive?",
    gradient: "from-violet-500/10 to-purple-500/5",
  },
  {
    icon: GitBranch,
    title: "Open Source DNA",
    description: "All 53+ projects are MIT-licensed. Transparency builds trust and produces better code.",
    gradient: "from-emerald-500/10 to-teal-500/5",
  },
  {
    icon: Lock,
    title: "Privacy-First AI",
    description: "Our local-first approach means your data never leaves your device. Zero cloud dependency for AI.",
    gradient: "from-pink-500/10 to-rose-500/5",
  },
  {
    icon: Cloud,
    title: "Full Vertical",
    description: "From ESP32 firmware to cloud dashboards — we own the entire stack, no handoffs required.",
    gradient: "from-cyan-500/10 to-blue-500/5",
  },
  {
    icon: TrendingUp,
    title: "Production-Proven",
    description: "8 apps in production with 99.5% uptime. Not prototypes — real systems serving real users.",
    gradient: "from-amber-500/10 to-orange-500/5",
  },
  {
    icon: Users,
    title: "Lean & Fast",
    description: "Small team, zero overhead. Direct communication with the engineers building your product.",
    gradient: "from-blue-500/10 to-indigo-500/5",
  },
];

// Tech stack by category
const techStackCategories = [
  {
    label: "Frontend",
    icon: Monitor,
    techs: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Framer Motion"],
    color: "#06b6d4",
    textColor: "#0e7490",
  },
  {
    label: "Backend",
    icon: Database,
    techs: ["Python", "FastAPI", "Node.js", "GraphQL", "Prisma"],
    color: "#8b5cf6",
    textColor: "#6d28d9",
  },
  {
    label: "Mobile",
    icon: Smartphone,
    techs: ["Flutter", "React Native", "Dart", "Expo", "Capacitor"],
    color: "#ec4899",
    textColor: "#be185d",
  },
  {
    label: "AI / ML",
    icon: Brain,
    techs: ["Ollama", "OpenAI", "YOLOv8", "ChromaDB", "LangChain"],
    color: "#10b981",
    textColor: "#047857",
  },
  {
    label: "IoT",
    icon: Cpu,
    techs: ["ESP32", "MQTT", "Arduino", "PlatformIO", "C++"],
    color: "#f59e0b",
    textColor: "#b45309",
  },
  {
    label: "DevOps",
    icon: Terminal,
    techs: ["Docker", "GitHub Actions", "Vercel", "Nginx", "Redis"],
    color: "#3b82f6",
    textColor: "#1d4ed8",
  },
];

export default function ServicesPage() {
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [activeProcess, setActiveProcess] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  const faqItems = faqs.map((f, i) => ({
    id: `faq-${i}`,
    question: f.question,
    answer: f.answer,
    category: f.category,
  }));

  return (
    <>

      <PageHeader
        eyebrow="Services"
        eyebrowColor="var(--accent-violet)"
        title="What We"
        titleHighlight="Build"
        titleGradient="from-violet-500 via-purple-500 to-pink-500"
        description="From AI systems to IoT ecosystems to enterprise platforms — we deliver production-grade solutions across 6 technology domains."
      />

      {/* ============ STATS BAR ============ */}
      <section className="relative z-10 py-12" ref={statsRef}>
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {serviceStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: i * 0.1 }}
                className="relative overflow-hidden rounded-2xl p-5 text-center group"
                style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}
              >
                <div className={`absolute top-0 left-0 right-0 h-[2px] opacity-60`} style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }} />
                <motion.div
                  className="inline-flex p-2.5 rounded-xl mb-3"
                  style={{ background: `${stat.color}10` }}
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </motion.div>
                <div className="text-2xl font-bold" style={{ color: stat.textColor }}>{stat.value}</div>
                <div className="text-[10px] mt-1 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PROCESS - INTERACTIVE TIMELINE ============ */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>Process</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                How We <ShimmerText gradient="from-cyan-400 via-blue-400 to-violet-400">Deliver</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8 items-start">
            {/* Step selector */}
            <div className="lg:col-span-2 space-y-3">
              {processSteps.map((step, i) => (
                <ScrollReveal key={step.step} delay={i * 0.1}>
                  <motion.button
                    onClick={() => setActiveProcess(i)}
                    className="w-full text-left flex items-start gap-4 p-5 rounded-2xl transition-all duration-300"
                    style={{
                      background: activeProcess === i ? "var(--bg-glass)" : "transparent",
                      border: `1px solid ${activeProcess === i ? "var(--border-accent)" : "transparent"}`,
                      backdropFilter: activeProcess === i ? "blur(12px)" : "none",
                    }}
                    whileHover={{ x: 4 }}
                  >
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${step.gradient} shrink-0 transition-transform duration-300 ${activeProcess === i ? "scale-110" : ""}`}>
                      <step.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono" style={{ color: "var(--accent-cyan-text)" }}>Step {step.step}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--bg-surface-hover)", color: "var(--text-muted)" }}>{step.duration}</span>
                      </div>
                      <h3 className="text-base font-bold" style={{ color: activeProcess === i ? "var(--text-primary)" : "var(--text-secondary)" }}>{step.title}</h3>
                      <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>{step.description}</p>
                    </div>
                  </motion.button>
                </ScrollReveal>
              ))}
            </div>

            {/* Active step detail */}
            <div className="lg:col-span-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeProcess}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="rounded-3xl overflow-hidden"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}
                >
                  <div className={`h-2 bg-gradient-to-r ${processSteps[activeProcess].gradient}`} />
                  <div className="p-8">
                    <div className="flex items-center gap-3 mb-6">
                      <div className={`p-4 rounded-2xl bg-gradient-to-br ${processSteps[activeProcess].gradient}`}>
                        {(() => { const StepIcon = processSteps[activeProcess].icon; return <StepIcon className="w-8 h-8 text-white" />; })()}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{processSteps[activeProcess].title}</h3>
                        <p className="text-sm" style={{ color: "var(--accent-cyan-text)" }}>{processSteps[activeProcess].duration}</p>
                      </div>
                    </div>

                    <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
                      {processSteps[activeProcess].description}
                    </p>

                    <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>Key Deliverables</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {processSteps[activeProcess].details.map((detail, di) => (
                        <motion.div
                          key={detail}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: di * 0.1 }}
                          className="flex items-center gap-2 p-3 rounded-xl"
                          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
                        >
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{detail}</span>
                        </motion.div>
                      ))}
                    </div>

                    {/* Progress indicator */}
                    <div className="flex items-center gap-2 mt-8">
                      {processSteps.map((_, si) => (
                        <motion.div
                          key={si}
                          className="h-1.5 flex-1 rounded-full cursor-pointer"
                          style={{ background: si <= activeProcess ? "var(--accent-cyan)" : "var(--border-primary)" }}
                          onClick={() => setActiveProcess(si)}
                          whileHover={{ scaleY: 2 }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SERVICES GRID ============ */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Offerings</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Our <ShimmerText gradient="from-violet-400 via-purple-400 to-pink-400">Services</ShimmerText>
              </h2>
              <p className="max-w-2xl mx-auto mt-4" style={{ color: "var(--text-tertiary)" }}>
                Click any service to explore the full details — features, tech stack, deliverables, and timeline.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-5">
            {services.map((service, i) => {
              const ServiceIcon = iconMap[service.icon] || Zap;
              const isExpanded = expandedService === service.id;

              return (
                <ScrollReveal key={service.id} delay={i * 0.08}>
                  <motion.div
                    layout
                    className="group relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-500"
                    style={{
                      background: "var(--bg-glass)",
                      border: `1px solid ${isExpanded ? "var(--border-accent)" : "var(--border-primary)"}`,
                      boxShadow: isExpanded ? "var(--shadow-lg)" : "var(--shadow-sm)",
                    }}
                  >
                    {/* Top gradient accent */}
                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${service.gradient} ${isExpanded ? "opacity-100" : "opacity-0 group-hover:opacity-60"} transition-opacity duration-300`} />

                    {/* Header */}
                    <div className="p-6 sm:p-8 cursor-pointer" onClick={() => setExpandedService(isExpanded ? null : service.id)}>
                      <div className="flex items-start gap-5">
                        <motion.div
                          className={`p-4 rounded-2xl bg-gradient-to-br ${service.gradient} shrink-0`}
                          whileHover={{ rotate: 10, scale: 1.1 }}
                          transition={{ type: "spring", stiffness: 300 }}
                        >
                          <ServiceIcon className="w-6 h-6 text-white" />
                        </motion.div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-4 mb-2">
                            <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{service.title}</h3>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="hidden sm:flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--bg-surface-hover)", color: "var(--text-muted)" }}>
                                <Clock className="w-3 h-3" />
                                {service.timeline}
                              </span>
                              <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.3 }}>
                                <ChevronDown className="w-5 h-5" style={{ color: "var(--text-muted)" }} />
                              </motion.div>
                            </div>
                          </div>
                          <p className={`text-sm font-medium mb-2 bg-gradient-to-r ${service.gradient} bg-clip-text text-transparent`}>{service.tagline}</p>
                          <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>{service.description}</p>

                          {/* Tech preview badges */}
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {service.technologies.slice(0, 5).map((tech) => (
                              <span key={tech} className="px-2 py-0.5 rounded-full text-[9px] font-medium" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan-text)" }}>
                                {tech}
                              </span>
                            ))}
                            {service.technologies.length > 5 && (
                              <span className="px-2 py-0.5 rounded-full text-[9px]" style={{ background: "var(--bg-surface-hover)", color: "var(--text-muted)" }}>
                                +{service.technologies.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="px-6 sm:px-8 pb-8"
                        >
                          <div className="pt-6 grid md:grid-cols-3 gap-8" style={{ borderTop: "1px solid var(--border-primary)" }}>
                            {/* Features */}
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--accent-cyan)" }}>
                                <CheckCircle className="w-3.5 h-3.5" /> What&apos;s Included
                              </h4>
                              <ul className="space-y-2.5">
                                {service.features.map((feature, fi) => (
                                  <motion.li
                                    key={feature}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: fi * 0.05 }}
                                    className="flex items-start gap-2 text-xs"
                                    style={{ color: "var(--text-tertiary)" }}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                                    {feature}
                                  </motion.li>
                                ))}
                              </ul>
                            </div>

                            {/* Deliverables */}
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--accent-violet)" }}>
                                <Award className="w-3.5 h-3.5" /> Deliverables
                              </h4>
                              <ul className="space-y-2.5">
                                {service.deliverables.map((deliverable, di) => (
                                  <motion.li
                                    key={deliverable}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: di * 0.05 }}
                                    className="flex items-start gap-2 text-xs"
                                    style={{ color: "var(--text-tertiary)" }}
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
                                    {deliverable}
                                  </motion.li>
                                ))}
                              </ul>
                            </div>

                            {/* Tech + CTA */}
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2" style={{ color: "var(--accent-pink)" }}>
                                <Code2 className="w-3.5 h-3.5" /> Technologies
                              </h4>
                              <div className="flex flex-wrap gap-1.5 mb-6">
                                {service.technologies.map((tech) => (
                                  <Badge key={tech} variant="default" className="text-[10px]">{tech}</Badge>
                                ))}
                              </div>

                              <div className="p-4 rounded-xl mb-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Timeline</span>
                                  <Clock className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                                </div>
                                <p className="text-lg font-bold" style={{ color: "var(--accent-cyan-text)" }}>{service.timeline}</p>
                              </div>

                              <p className="text-xs mb-4 p-3 rounded-lg" style={{ color: "var(--text-muted)", background: "var(--bg-surface-hover)" }}>
                                <strong>Ideal for:</strong> {service.ideal}
                              </p>

                              <Link href="/contact">
                                <Button size="sm" className="w-full group">
                                  Get Started <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ WHY CHOOSE US ============ */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>Why Us</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                What Sets Us <ShimmerText>Apart</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {differentiators.map((diff, i) => (
              <ScrollReveal key={diff.title} delay={i * 0.08}>
                <TiltCard tiltAmount={6}>
                  <motion.div
                    className="group relative overflow-hidden rounded-2xl p-6 transition-all duration-300 h-full"
                    style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}
                    whileHover={{ y: -2 }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${diff.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                    <div className="relative z-10">
                      <motion.div
                        className="inline-flex p-3 rounded-xl mb-4"
                        style={{ background: "var(--accent-cyan-muted)" }}
                        whileHover={{ rotate: 360 }}
                        transition={{ duration: 0.5 }}
                      >
                        <diff.icon className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                      </motion.div>
                      <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>{diff.title}</h3>
                      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{diff.description}</p>
                    </div>
                  </motion.div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TECH STACK OVERVIEW ============ */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>Stack</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Technology <ShimmerText gradient="from-violet-400 to-pink-400">Arsenal</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {techStackCategories.map((category, i) => (
              <ScrollReveal key={category.label} delay={i * 0.08}>
                <motion.div
                  className="rounded-2xl p-5 transition-all duration-300"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}
                  whileHover={{ y: -3 }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl" style={{ background: `${category.color}10` }}>
                      <category.icon className="w-5 h-5" style={{ color: category.color }} />
                    </div>
                    <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{category.label}</h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {category.techs.map((tech) => (
                      <span key={tech} className="px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: `${category.color}10`, color: category.textColor }}>
                        {tech}
                      </span>
                    ))}
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-[0.2em]">Testimonials</span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                What Clients <ShimmerText gradient="from-emerald-400 to-cyan-400">Say</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <TestimonialCard key={testimonial.id} testimonial={testimonial} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>FAQ</span>
              <h2 className="text-4xl font-bold mt-3" style={{ color: "var(--text-primary)" }}>
                Common <ShimmerText gradient="from-violet-400 to-purple-400">Questions</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>
          <Accordion items={faqItems} />
        </div>
      </section>

      <CTASection
        title="Ready to"
        titleHighlight="Get Started?"
        description="Tell us about your project. We'll respond within 24-48 hours with a free consultation."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Projects", href: "/projects" }}
      />
    </>
  );
}
