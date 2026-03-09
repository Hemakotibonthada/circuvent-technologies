"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import AnimatedBackground from "@/components/AnimatedBackground";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Tabs, TabContent } from "@/components/ui/tabs";

const stackCategories = [
  {
    id: "frontend",
    label: "Frontend",
    technologies: [
      { name: "React", experience: "Expert", projects: 15, years: 3, proficiency: 95, description: "Our primary UI library. Used in NEXUS AI OS, CancerGuard AI, HT Connect, and 12+ other projects. SSR via Next.js." },
      { name: "Next.js", experience: "Expert", projects: 8, years: 2, proficiency: 92, description: "Full-stack React framework. Server-side rendering, API routes, ISR, and App Router architecture." },
      { name: "TypeScript", experience: "Expert", projects: 18, years: 3, proficiency: 94, description: "Type-safe JavaScript in every frontend project. Reduces runtime errors by 40%+." },
      { name: "Tailwind CSS", experience: "Expert", projects: 12, years: 2, proficiency: 93, description: "Utility-first CSS framework. Custom design systems with CSS variables for theming." },
      { name: "Framer Motion", experience: "Advanced", projects: 8, years: 2, proficiency: 88, description: "Animation library for React. Used for page transitions, scroll reveals, and micro-interactions." },
      { name: "Electron", experience: "Advanced", projects: 3, years: 2, proficiency: 82, description: "Desktop applications. JARVIS AI and Financial Analyzer desktop builds." },
    ],
  },
  {
    id: "mobile",
    label: "Mobile",
    technologies: [
      { name: "Flutter", experience: "Expert", projects: 4, years: 2, proficiency: 90, description: "Cross-platform mobile framework. SmartHome, Ai-Home, Loan Manager, Financial Analyzer." },
      { name: "React Native", experience: "Advanced", projects: 5, years: 2, proficiency: 85, description: "Cross-platform mobile with Expo. TravelMate, Mana Uru, Startup Connect, NEXUS mobile." },
      { name: "Dart", experience: "Expert", projects: 4, years: 2, proficiency: 88, description: "Flutter's language. Strong typing, null safety, and async/await patterns." },
      { name: "Riverpod", experience: "Advanced", projects: 3, years: 1, proficiency: 82, description: "Reactive state management for Flutter. Replaced Provider in all new projects." },
      { name: "Expo", experience: "Advanced", projects: 4, years: 2, proficiency: 83, description: "React Native toolchain. OTA updates, push notifications, and native module access." },
      { name: "Ionic / Capacitor", experience: "Intermediate", projects: 2, years: 1, proficiency: 72, description: "Web-to-native bridge. TimeCapsule and Guide Me cross-platform builds." },
    ],
  },
  {
    id: "backend",
    label: "Backend",
    technologies: [
      { name: "Python", experience: "Expert", projects: 10, years: 3, proficiency: 94, description: "Primary backend language. FastAPI, ML pipelines, trading engines, and automation scripts." },
      { name: "FastAPI", experience: "Expert", projects: 7, years: 2, proficiency: 92, description: "Async Python web framework. 69+ endpoints in CancerGuard AI alone. Auto-generated OpenAPI docs." },
      { name: "Node.js", experience: "Expert", projects: 12, years: 3, proficiency: 91, description: "JavaScript runtime. Express backends, real-time WebSocket servers, and CLI tools." },
      { name: "Express.js", experience: "Expert", projects: 10, years: 3, proficiency: 90, description: "Node.js web framework. REST APIs, middleware chains, and authentication systems." },
      { name: "Socket.IO", experience: "Advanced", projects: 4, years: 2, proficiency: 85, description: "Real-time bidirectional communication. Chat systems, live notifications, and collaborative features." },
      { name: "Flask", experience: "Advanced", projects: 2, years: 2, proficiency: 78, description: "Lightweight Python web framework. NetShare Pro file sharing tool backend." },
    ],
  },
  {
    id: "data",
    label: "Data & AI",
    technologies: [
      { name: "PostgreSQL", experience: "Expert", projects: 7, years: 2, proficiency: 88, description: "Relational database. HT Connect HRMS with 35+ Prisma models, complex joins, and transactions." },
      { name: "MongoDB", experience: "Advanced", projects: 5, years: 2, proficiency: 85, description: "Document database. EduKanban LMS, Health India analytics, flexible schema design." },
      { name: "Firebase", experience: "Expert", projects: 14, years: 3, proficiency: 93, description: "Backend-as-a-Service. Auth, Firestore, Realtime DB, Cloud Functions, FCM across 14 projects." },
      { name: "DuckDB", experience: "Advanced", projects: 2, years: 1, proficiency: 80, description: "Embedded analytics database. StockMarket Agent and CITADEL time-series data." },
      { name: "ChromaDB", experience: "Advanced", projects: 3, years: 1, proficiency: 78, description: "Vector database for RAG. NEXUS AI OS agent memory and document retrieval." },
      { name: "Redis", experience: "Advanced", projects: 6, years: 2, proficiency: 84, description: "In-memory cache and pub/sub. Session management, IPC bus, and rate limiting." },
      { name: "Ollama", experience: "Expert", projects: 5, years: 1, proficiency: 88, description: "Local LLM inference. Llama 3.1, CodeLlama, Mistral running on-device." },
      { name: "OpenAI GPT-4", experience: "Expert", projects: 8, years: 2, proficiency: 90, description: "Cloud AI API. RAG, code generation, content creation, and conversational AI." },
      { name: "YOLOv8", experience: "Advanced", projects: 2, years: 1, proficiency: 80, description: "Object detection. Vision AI active learning pipeline with ESP32-CAM." },
      { name: "XGBoost / LightGBM", experience: "Advanced", projects: 2, years: 1, proficiency: 78, description: "Gradient boosting. CancerGuard AI ensemble prediction models." },
    ],
  },
  {
    id: "embedded",
    label: "Embedded",
    technologies: [
      { name: "ESP32", experience: "Expert", projects: 9, years: 3, proficiency: 92, description: "Primary microcontroller. WiFi, BLE, GPIO, ADC, SPIFFS, OTA — mastered across 9 projects." },
      { name: "C++ (Arduino)", experience: "Expert", projects: 9, years: 3, proficiency: 90, description: "Firmware language. Production-grade embedded code with watchdog timers and fail-safes." },
      { name: "MQTT", experience: "Expert", projects: 9, years: 3, proficiency: 93, description: "IoT protocol. Hierarchical topic design, QoS management, and Mosquitto broker ops." },
      { name: "PlatformIO", experience: "Advanced", projects: 6, years: 2, proficiency: 85, description: "Embedded development platform. Multi-board support, library management, and unit testing." },
      { name: "ESP-NOW", experience: "Intermediate", projects: 2, years: 1, proficiency: 70, description: "Peer-to-peer WiFi protocol. Mesh networking for range extension between ESP32 nodes." },
      { name: "Alexa Skills Kit", experience: "Advanced", projects: 2, years: 1, proficiency: 76, description: "Voice assistant integration. SmartHome Alexa skill for hands-free home control." },
    ],
  },
  {
    id: "devops",
    label: "DevOps",
    technologies: [
      { name: "Docker", experience: "Expert", projects: 8, years: 2, proficiency: 90, description: "Containerization. Multi-stage builds, docker-compose orchestration for 8 production apps." },
      { name: "Docker Compose", experience: "Expert", projects: 8, years: 2, proficiency: 92, description: "Multi-container deployment. Health checks, resource limits, logging, and networks." },
      { name: "GitHub Actions", experience: "Advanced", projects: 6, years: 2, proficiency: 84, description: "CI/CD automation. Lint, test, build, deploy pipelines for all major projects." },
      { name: "Nginx", experience: "Advanced", projects: 5, years: 2, proficiency: 82, description: "Reverse proxy and load balancer. SSL termination, rate limiting, and static file serving." },
      { name: "Prisma", experience: "Expert", projects: 5, years: 2, proficiency: 88, description: "Type-safe ORM. Schema design, migrations, and query optimization for PostgreSQL/SQLite." },
      { name: "Git", experience: "Expert", projects: 53, years: 4, proficiency: 95, description: "Version control. 53+ repositories, branching strategies, PR workflows, and monorepo management." },
    ],
  },
];

export default function StackPage() {
  const [activeTab, setActiveTab] = useState("frontend");

  const tabs = stackCategories.map((cat) => ({
    id: cat.id,
    label: cat.label,
    count: cat.technologies.length,
  }));

  const activeCategory = stackCategories.find((c) => c.id === activeTab);

  // Calculate total stats
  const allTechs = stackCategories.flatMap((c) => c.technologies);
  const totalTechs = allTechs.length;
  const avgProficiency = Math.round(
    allTechs.reduce((sum, t) => sum + t.proficiency, 0) / totalTechs
  );

  return (
    <>
      <AnimatedBackground />

      <PageHeader
        eyebrow="Tech Stack"
        eyebrowColor="var(--accent-cyan)"
        title="Our Technology"
        titleHighlight="Arsenal"
        description={`${totalTechs} technologies mastered across ${stackCategories.length} domains. Average proficiency: ${avgProficiency}%. Every tool chosen with purpose, every stack battle-tested in production.`}
      />

      {/* Stack Overview Stats */}
      <section className="relative z-10 py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: `${totalTechs}`, label: "Technologies" },
              { value: `${avgProficiency}%`, label: "Avg Proficiency" },
              { value: "53+", label: "Projects Built" },
              { value: "200K+", label: "Lines of Code" },
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
                  <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div
                    className="text-xs mt-1 uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {stat.label}
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex justify-center mb-12">
              <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                variant="pills"
              />
            </div>
          </ScrollReveal>

          {/* Technology Grid */}
          {activeCategory && (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {activeCategory.technologies.map((tech, i) => (
                <ScrollReveal key={tech.name} delay={i * 0.06}>
                  <motion.div
                    whileHover={{ y: -4, scale: 1.01 }}
                    className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 transition-all duration-300"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3
                          className="text-base font-bold group-hover:text-cyan-500 transition-colors"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {tech.name}
                        </h3>
                        <Badge
                          variant={
                            tech.experience === "Expert"
                              ? "success"
                              : tech.experience === "Advanced"
                              ? "primary"
                              : "default"
                          }
                          className="mt-1"
                        >
                          {tech.experience}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div
                          className="text-xl font-bold"
                          style={{
                            color:
                              tech.proficiency >= 90
                                ? "var(--accent-cyan)"
                                : tech.proficiency >= 80
                                ? "var(--accent-violet)"
                                : "var(--text-secondary)",
                          }}
                        >
                          {tech.proficiency}%
                        </div>
                        <div
                          className="text-[10px] uppercase tracking-wider"
                          style={{ color: "var(--text-muted)" }}
                        >
                          proficiency
                        </div>
                      </div>
                    </div>

                    <p
                      className="text-xs leading-relaxed mb-4"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {tech.description}
                    </p>

                    <ProgressBar
                      value={tech.proficiency}
                      size="sm"
                      variant="gradient"
                      className="mb-3"
                    />

                    <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <span>{tech.projects} projects</span>
                      <span>{tech.years} year{tech.years !== 1 ? "s" : ""}</span>
                    </div>
                  </motion.div>
                </ScrollReveal>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* Full Stack Visualization */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span
                className="text-xs font-semibold text-pink-500 uppercase tracking-[0.2em]"
              >
                Architecture
              </span>
              <h2
                className="text-3xl sm:text-4xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                Full Stack Visualization
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 sm:p-12"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="space-y-4">
                {[
                  { layer: "Frontend", techs: ["React", "Next.js", "TypeScript", "Tailwind CSS", "Framer Motion"], color: "from-cyan-500 to-blue-500" },
                  { layer: "Mobile", techs: ["Flutter", "React Native", "Dart", "Expo", "Riverpod"], color: "from-violet-500 to-purple-500" },
                  { layer: "Backend", techs: ["FastAPI", "Express", "Node.js", "Python", "Socket.IO"], color: "from-emerald-500 to-teal-500" },
                  { layer: "AI / ML", techs: ["Ollama", "GPT-4", "YOLOv8", "ChromaDB", "XGBoost"], color: "from-pink-500 to-rose-500" },
                  { layer: "Data", techs: ["PostgreSQL", "MongoDB", "Firebase", "DuckDB", "Redis"], color: "from-amber-500 to-orange-500" },
                  { layer: "IoT", techs: ["ESP32", "MQTT", "C++", "PlatformIO", "Alexa"], color: "from-sky-500 to-indigo-500" },
                  { layer: "DevOps", techs: ["Docker", "GitHub Actions", "Nginx", "Prisma", "Git"], color: "from-slate-400 to-zinc-500" },
                ].map((layer, i) => (
                  <motion.div
                    key={layer.layer}
                    initial={{ opacity: 0, x: -30 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center gap-4"
                  >
                    <div
                      className={`w-24 sm:w-32 text-right text-xs sm:text-sm font-semibold bg-gradient-to-r ${layer.color} bg-clip-text text-transparent shrink-0`}
                    >
                      {layer.layer}
                    </div>
                    <div
                      className={`flex-1 h-10 rounded-xl bg-gradient-to-r ${layer.color} opacity-20 relative overflow-hidden`}
                    >
                      <div className="absolute inset-0 flex items-center justify-center gap-2 sm:gap-4">
                        {layer.techs.map((tech) => (
                          <span
                            key={tech}
                            className="text-[10px] sm:text-xs font-medium whitespace-nowrap"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <CTASection
        title="Need this stack for"
        titleHighlight="Your Project?"
        description="We bring 15+ technology stacks to your project. Let's discuss the best architecture for your needs."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Services", href: "/services" }}
      />
    </>
  );
}
