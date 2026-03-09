"use client";

import { motion } from "framer-motion";
import AnimatedBackground from "@/components/AnimatedBackground";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  Rocket,
  CheckCircle,
  Clock,
  Zap,
  Brain,
  Cpu,
  Globe,
  Shield,
  Layers,
  Code2,
  Star,
  TrendingUp,
  Calendar,
  ArrowRight,
  Target,
  Sparkles,
} from "lucide-react";

interface RoadmapItem {
  quarter: string;
  year: string;
  title: string;
  status: "completed" | "in-progress" | "planned" | "future";
  category: string;
  description: string;
  milestones: { text: string; done: boolean }[];
  progress: number;
  icon: React.ElementType;
  gradient: string;
}

const roadmapItems: RoadmapItem[] = [
  {
    quarter: "Q1",
    year: "2023",
    title: "Embedded Foundations",
    status: "completed",
    category: "IoT",
    description:
      "Started with ESP32 firmware development, Arduino IoT Cloud experiments, and first home automation projects. Established the embedded systems DNA of Circuvent.",
    milestones: [
      { text: "First ESP32 blink project", done: true },
      { text: "HomeAutomation v1 with Arduino IoT Cloud", done: true },
      { text: "MQTT protocol exploration", done: true },
      { text: "Basic relay control firmware", done: true },
      { text: "Temperature/humidity sensor integration", done: true },
    ],
    progress: 100,
    icon: Cpu,
    gradient: "from-cyan-500 to-teal-500",
  },
  {
    quarter: "Q2-Q3",
    year: "2023",
    title: "IoT Ecosystem Expansion",
    status: "completed",
    category: "IoT & Mobile",
    description:
      "Scaled from single devices to the SmartHome ecosystem with Flutter mobile app, Firebase backend, MQTT broker, and Alexa voice integration.",
    milestones: [
      { text: "SmartHome Flutter app v1.0", done: true },
      { text: "Firebase real-time database integration", done: true },
      { text: "Mosquitto MQTT broker deployment", done: true },
      { text: "Alexa Smart Home skill", done: true },
      { text: "Razorpay payment integration", done: true },
      { text: "OTA firmware update system", done: true },
    ],
    progress: 100,
    icon: Globe,
    gradient: "from-emerald-500 to-green-500",
  },
  {
    quarter: "Q4",
    year: "2023",
    title: "Full-Stack Expansion",
    status: "completed",
    category: "Web & Backend",
    description:
      "Expanded into full-stack web development with React, Express, MongoDB, and PostgreSQL. Built first enterprise tools and web applications.",
    milestones: [
      { text: "First React web applications", done: true },
      { text: "Express.js REST API patterns established", done: true },
      { text: "MongoDB + Mongoose integration", done: true },
      { text: "JWT authentication system", done: true },
      { text: "Docker deployment workflow", done: true },
      { text: "HT Research Lab website", done: true },
    ],
    progress: 100,
    icon: Layers,
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    quarter: "Q1-Q2",
    year: "2024",
    title: "AI & Healthcare",
    status: "completed",
    category: "AI & HealthTech",
    description:
      "Deep dive into AI/ML with CancerGuard AI ensemble learning, Health India analytics platform, and HT Connect enterprise HRMS. First production deployments.",
    milestones: [
      { text: "CancerGuard AI ensemble model (94.2% accuracy)", done: true },
      { text: "69 API endpoints across 3 portals", done: true },
      { text: "HT Connect HRMS replacing Keka + Jira", done: true },
      { text: "Health India vitals tracking", done: true },
      { text: "PostgreSQL + Prisma ORM adoption", done: true },
      { text: "First Docker Compose production deployment", done: true },
    ],
    progress: 100,
    icon: Brain,
    gradient: "from-rose-500 to-pink-500",
  },
  {
    quarter: "Q3-Q4",
    year: "2024",
    title: "AI Agents & Vision",
    status: "completed",
    category: "AI & Agents",
    description:
      "Built JARVIS AI assistant with holographic UI, Vision AI with YOLOv8 active learning, and expanded mobile capabilities with React Native.",
    milestones: [
      { text: "JARVIS AI with 15 skills + holographic Electron UI", done: true },
      { text: "Vision AI with YOLOv8 + ESP32-CAM", done: true },
      { text: "Active learning pipeline for model improvement", done: true },
      { text: "TravelMate React Native cross-platform app", done: true },
      { text: "ATS Resume Builder with scoring engine", done: true },
      { text: "30+ projects milestone", done: true },
    ],
    progress: 100,
    icon: Zap,
    gradient: "from-amber-500 to-orange-500",
  },
  {
    quarter: "Q1-Q2",
    year: "2025",
    title: "AI OS & FinTech",
    status: "completed",
    category: "AI & FinTech",
    description:
      "Built NEXUS AI OS with 13+ agents, entered FinTech with algorithmic trading engines, and began CITADEL multi-agent trading platform.",
    milestones: [
      { text: "NEXUS AI OS v1.0 with 13 agents", done: true },
      { text: "Ollama-based local LLM inference", done: true },
      { text: "StockMarket Agent with DuckDB", done: true },
      { text: "CITADEL architecture design", done: true },
      { text: "Neural Sentinel with OpenVINO NPU", done: true },
      { text: "Financial Analyzer subscription model", done: true },
    ],
    progress: 100,
    icon: Shield,
    gradient: "from-violet-500 to-purple-500",
  },
  {
    quarter: "Q3-Q4",
    year: "2025",
    title: "Scale & Polish",
    status: "completed",
    category: "All Domains",
    description:
      "Hit 50+ projects, expanded EduKanban LMS with AI, launched TimeCapsule, MicroHabit, and Mana Uru community platforms. Reached 200K+ lines of code.",
    milestones: [
      { text: "EduKanban AI-driven LMS launch", done: true },
      { text: "TimeCapsule memory preservation app", done: true },
      { text: "MicroHabit behavioral change engine", done: true },
      { text: "Mana Uru village community platform", done: true },
      { text: "200K+ lines of code milestone", done: true },
      { text: "8 applications in production", done: true },
    ],
    progress: 100,
    icon: Rocket,
    gradient: "from-pink-500 to-rose-500",
  },
  {
    quarter: "Q1",
    year: "2026",
    title: "Portfolio & Open Source",
    status: "in-progress",
    category: "Company",
    description:
      "Building this portfolio website, establishing open source presence, launching technical blog, and refining our service offerings.",
    milestones: [
      { text: "Circuvent Technologies portfolio website", done: true },
      { text: "Technical blog with 12+ articles", done: true },
      { text: "Service offerings defined (6 domains)", done: true },
      { text: "Case studies for top 3 projects", done: true },
      { text: "GitHub organization setup", done: false },
      { text: "Community Discord launch", done: false },
    ],
    progress: 70,
    icon: Globe,
    gradient: "from-cyan-500 to-violet-500",
  },
  {
    quarter: "Q2",
    year: "2026",
    title: "NPU & Edge AI",
    status: "planned",
    category: "AI & Edge",
    description:
      "Bringing AI to the edge with Intel Core Ultra NPU acceleration, expanding NEXUS AI OS with voice interfaces, and Thread/Matter IoT protocol support.",
    milestones: [
      { text: "OpenVINO NPU acceleration for NEXUS agents", done: false },
      { text: "Local Whisper speech-to-text integration", done: false },
      { text: "Thread/Matter protocol in SmartHome", done: false },
      { text: "ESP32-S3 with on-device ML inference", done: false },
      { text: "NEXUS mobile offline inference", done: false },
    ],
    progress: 15,
    icon: Cpu,
    gradient: "from-emerald-500 to-teal-500",
  },
  {
    quarter: "Q3-Q4",
    year: "2026",
    title: "Platform & Community",
    status: "future",
    category: "Ecosystem",
    description:
      "Building developer tools, plugin marketplace for NEXUS AI OS, expanding community contributions, and scaling production deployments.",
    milestones: [
      { text: "NEXUS agent plugin marketplace", done: false },
      { text: "Developer CLI tools for Circuvent projects", done: false },
      { text: "Contributor onboarding program", done: false },
      { text: "Production monitoring dashboard (Grafana)", done: false },
      { text: "Multi-language support (Hindi, Telugu)", done: false },
      { text: "100 projects milestone", done: false },
    ],
    progress: 0,
    icon: Sparkles,
    gradient: "from-sky-500 to-indigo-500",
  },
];

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  completed: { label: "Completed", color: "text-emerald-500", bgColor: "bg-emerald-500/10" },
  "in-progress": { label: "In Progress", color: "text-cyan-500", bgColor: "bg-cyan-500/10" },
  planned: { label: "Planned", color: "text-violet-500", bgColor: "bg-violet-500/10" },
  future: { label: "Future", color: "text-gray-500", bgColor: "bg-gray-500/10" },
};

export default function RoadmapPage() {
  const completedItems = roadmapItems.filter((i) => i.status === "completed").length;
  const totalMilestones = roadmapItems.reduce((sum, i) => sum + i.milestones.length, 0);
  const completedMilestones = roadmapItems.reduce(
    (sum, i) => sum + i.milestones.filter((m) => m.done).length,
    0
  );
  const overallProgress = Math.round((completedMilestones / totalMilestones) * 100);

  return (
    <>
      <AnimatedBackground />

      <PageHeader
        eyebrow="Roadmap"
        eyebrowColor="var(--accent-violet)"
        title="Where We're"
        titleHighlight="Going"
        titleGradient="from-cyan-500 via-violet-500 to-pink-500"
        description="Our journey from a single ESP32 to a 53+ project technology portfolio — and what's ahead. Every milestone documented, every quarter planned."
      />

      {/* Progress Overview */}
      <section className="relative z-10 py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { value: `${completedItems}/${roadmapItems.length}`, label: "Phases Complete" },
              { value: `${completedMilestones}`, label: "Milestones Done" },
              { value: `${overallProgress}%`, label: "Overall Progress" },
              { value: "38 months", label: "Journey Duration" },
            ].map((stat, i) => (
              <ScrollReveal key={stat.label} delay={i * 0.1}>
                <motion.div
                  whileHover={{ scale: 1.05, y: -4 }}
                  className="p-5 rounded-2xl text-center"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <div className="text-2xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-xs mt-1 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {stat.label}
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal>
            <ProgressBar
              value={overallProgress}
              label="Overall Roadmap Progress"
              showValue
              size="lg"
              variant="gradient"
            />
          </ScrollReveal>
        </div>
      </section>

      {/* Timeline */}
      <section className="relative z-10 py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="relative">
            {/* Timeline line */}
            <div
              className="absolute left-8 md:left-12 top-0 bottom-0 w-px"
              style={{ background: "linear-gradient(to bottom, var(--accent-cyan), var(--accent-violet), var(--accent-pink), transparent)" }}
            />

            <div className="space-y-8">
              {roadmapItems.map((item, i) => {
                const config = statusConfig[item.status];
                const Icon = item.icon;
                const milestoneDone = item.milestones.filter((m) => m.done).length;

                return (
                  <ScrollReveal key={`${item.quarter}-${item.year}`} delay={i * 0.05}>
                    <div className="relative pl-20 md:pl-28">
                      {/* Timeline dot */}
                      <div
                        className={`absolute left-4 md:left-8 w-9 h-9 rounded-full flex items-center justify-center bg-gradient-to-br ${item.gradient}`}
                        style={{ boxShadow: item.status === "in-progress" ? "0 0 20px rgba(6, 182, 212, 0.4)" : undefined }}
                      >
                        <Icon className="w-4 h-4 text-white" />
                      </div>

                      {/* Year label */}
                      <div
                        className="absolute left-0 md:left-0 -top-1 text-xs font-mono"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.year}
                      </div>

                      <motion.div
                        whileHover={{ x: 4 }}
                        className="group rounded-2xl overflow-hidden transition-all duration-300"
                        style={{
                          background: "var(--bg-glass)",
                          border: `1px solid ${item.status === "in-progress" ? "var(--border-accent)" : "var(--border-primary)"}`,
                          backdropFilter: "blur(24px)",
                        }}
                      >
                        {/* Header */}
                        <div className="p-6">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span
                                  className="text-xs font-mono"
                                  style={{ color: "var(--accent-cyan)" }}
                                >
                                  {item.quarter} {item.year}
                                </span>
                                <Badge variant="default">{item.category}</Badge>
                              </div>
                              <h3
                                className="text-lg font-bold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {item.title}
                              </h3>
                            </div>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color}`}
                            >
                              {config.label}
                            </span>
                          </div>

                          <p
                            className="text-sm leading-relaxed mb-4"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {item.description}
                          </p>

                          {/* Progress bar */}
                          <div className="mb-4">
                            <ProgressBar
                              value={item.progress}
                              showValue
                              size="sm"
                              variant={item.status === "completed" ? "default" : "gradient"}
                            />
                          </div>

                          {/* Milestones */}
                          <div className="space-y-2">
                            {item.milestones.map((milestone, j) => (
                              <motion.div
                                key={j}
                                initial={{ opacity: 0, x: -10 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: j * 0.03 }}
                                className="flex items-start gap-2"
                              >
                                <CheckCircle
                                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                                    milestone.done ? "text-emerald-500" : ""
                                  }`}
                                  style={!milestone.done ? { color: "var(--text-muted)", opacity: 0.3 } : undefined}
                                />
                                <span
                                  className={`text-xs ${milestone.done ? "" : "opacity-50"}`}
                                  style={{ color: milestone.done ? "var(--text-tertiary)" : "var(--text-muted)" }}
                                >
                                  {milestone.text}
                                </span>
                              </motion.div>
                            ))}
                          </div>

                          <div
                            className="mt-3 text-[10px] font-mono"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {milestoneDone}/{item.milestones.length} milestones
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Future Vision */}
      <section className="relative z-10 py-20">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
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

              <div className="relative z-10 text-center">
                <Target className="w-10 h-10 mx-auto mb-6" style={{ color: "var(--accent-cyan)" }} />
                <h2
                  className="text-3xl sm:text-4xl font-bold mb-6"
                  style={{ color: "var(--text-primary)" }}
                >
                  The{" "}
                  <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                    2026 Vision
                  </span>
                </h2>
                <p
                  className="text-base leading-relaxed max-w-2xl mx-auto mb-8"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  By end of 2026, Circuvent Technologies aims to be the leading
                  open-source engineering company for local-first AI and IoT —
                  with 100+ projects, NPU-accelerated AI agents, and a thriving
                  community of contributors.
                </p>

                <div className="grid sm:grid-cols-3 gap-4 mt-8">
                  {[
                    { value: "100+", label: "Projects Target", icon: Rocket },
                    { value: "500K+", label: "Lines of Code", icon: Code2 },
                    { value: "NPU", label: "AI Acceleration", icon: Brain },
                  ].map((goal) => (
                    <div
                      key={goal.label}
                      className="p-4 rounded-xl"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-primary)",
                      }}
                    >
                      <goal.icon className="w-5 h-5 mx-auto mb-2" style={{ color: "var(--accent-cyan)" }} />
                      <div className="text-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                        {goal.value}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {goal.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <CTASection
        title="Want to be part of"
        titleHighlight="This Journey?"
        description="We're always looking for engineers, contributors, and collaborators who share our vision."
        primaryCTA={{ label: "Join the Team", href: "/careers" }}
        secondaryCTA={{ label: "Contribute", href: "/open-source" }}
      />
    </>
  );
}
