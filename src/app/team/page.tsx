"use client";

import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import AnimatedBackground from "@/components/AnimatedBackground";
import TeamCard, { type TeamMember } from "@/components/TeamCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Users, MapPin, Mail, Briefcase } from "lucide-react";

const teamMembers: TeamMember[] = [
  {
    name: "Harsha Bonthada",
    role: "Founder & Lead Engineer",
    bio: "Full-stack architect with a passion for AI agents, IoT systems, and building products that bypass technological limits.",
    avatar: "🧑‍💻",
    gradient: "from-cyan-500 to-violet-500",
    socials: {
      linkedin: "#",
      github: "https://github.com",
      twitter: "#",
    },
  },
  {
    name: "Open Position",
    role: "AI / ML Engineer",
    bio: "We're looking for someone who lives and breathes machine learning — from training pipelines to edge deployment on NPUs.",
    avatar: "🤖",
    gradient: "from-violet-500 to-purple-500",
    socials: {},
  },
  {
    name: "Open Position",
    role: "IoT & Embedded Systems",
    bio: "ESP32 firmware, MQTT protocols, sensor networks — if you think in bits and bytes at the hardware level, we need you.",
    avatar: "🔧",
    gradient: "from-emerald-500 to-teal-500",
    socials: {},
  },
  {
    name: "Open Position",
    role: "Frontend / Design Engineer",
    bio: "Craft pixel-perfect interfaces with React, Next.js, and Framer Motion. We want someone who cares about every detail.",
    avatar: "🎨",
    gradient: "from-pink-500 to-rose-500",
    socials: {},
  },
  {
    name: "Open Position",
    role: "Mobile Developer",
    bio: "Flutter and React Native expert to extend our cross-platform reach. Production-quality apps across iOS and Android.",
    avatar: "📱",
    gradient: "from-amber-500 to-orange-500",
    socials: {},
  },
  {
    name: "Open Position",
    role: "DevOps & Platform",
    bio: "Docker, CI/CD, cloud infrastructure, and monitoring. Keep our 8+ production apps running smoothly at scale.",
    avatar: "☁️",
    gradient: "from-blue-500 to-indigo-500",
    socials: {},
  },
];

const openRoles = [
  {
    title: "Senior AI Engineer",
    type: "Full-time",
    location: "Remote / India",
    description:
      "Lead our AI agent architecture. Experience with LLMs, RAG, vector databases, and edge AI deployment required.",
  },
  {
    title: "IoT Platform Engineer",
    type: "Full-time",
    location: "Hyderabad, India",
    description:
      "Design and scale our ESP32 firmware and MQTT infrastructure. Strong C++ and embedded systems experience.",
  },
  {
    title: "Full-Stack Developer",
    type: "Full-time",
    location: "Remote / India",
    description:
      "React/Next.js frontend + Node.js/Python backend. Ship features across multiple products simultaneously.",
  },
  {
    title: "Flutter Mobile Engineer",
    type: "Contract",
    location: "Remote",
    description:
      "Build and maintain our cross-platform mobile applications. Experience with Firebase, Riverpod, and native integrations.",
  },
];

export default function TeamPage() {
  return (
    <>
      <AnimatedBackground />

      {/* Hero */}
      <section className="relative z-10 pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="max-w-3xl">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>
                Team
              </span>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                The Minds{" "}
                <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  Behind It
                </span>
              </h1>
              <p className="text-lg leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                A lean, high-impact team of engineers who believe great technology
                is built by people who care deeply about craft, correctness, and pushing boundaries.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Team Grid */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamMembers.map((member, i) => (
              <TeamCard key={member.name + member.role} member={member} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Culture Section */}
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
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-pink-500/5" />
              <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>
                    Culture
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                    How We Work
                  </h2>
                  <div className="space-y-4">
                    {[
                      { label: "Ship weekly", desc: "Continuous delivery over perfect planning." },
                      { label: "Own your stack", desc: "From firmware to frontend — full ownership, full pride." },
                      { label: "Build in public", desc: "Open source by default. Transparency breeds trust." },
                      { label: "AI-augmented", desc: "We use AI tools daily to amplify our output 10x." },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-3 group">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-2 group-hover:scale-150 transition-transform" />
                        <div>
                          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {item.label}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: "53+", label: "Projects Shipped" },
                    { value: "6", label: "Tech Domains" },
                    { value: "15+", label: "Tech Stacks" },
                    { value: "∞", label: "Curiosity" },
                  ].map((stat) => (
                    <motion.div
                      key={stat.label}
                      whileHover={{ scale: 1.05, y: -4 }}
                      className="p-5 rounded-2xl text-center"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-primary)",
                      }}
                    >
                      <div className="text-2xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                        {stat.value}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {stat.label}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Open Roles */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span className="text-xs font-semibold text-emerald-500 uppercase tracking-[0.2em]">
                Careers
              </span>
              <h2 className="text-4xl sm:text-5xl font-bold mt-3 mb-4" style={{ color: "var(--text-primary)" }}>
                Join the Mission
              </h2>
              <p className="max-w-lg mx-auto" style={{ color: "var(--text-tertiary)" }}>
                We&apos;re always looking for exceptional engineers who want to build
                at the intersection of AI, IoT, and full-stack.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-4">
            {openRoles.map((role, i) => (
              <ScrollReveal key={role.title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ x: 4 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 sm:p-8 cursor-pointer transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div className="absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b from-cyan-500 to-violet-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <h3
                        className="text-lg font-semibold group-hover:text-cyan-500 transition-colors"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {role.title}
                      </h3>
                      <p className="text-sm mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {role.description}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          <Briefcase className="w-3 h-3" />
                          {role.type}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          <MapPin className="w-3 h-3" />
                          {role.location}
                        </span>
                      </div>
                    </div>

                    <Button variant="outline" size="sm" className="shrink-0 group/btn">
                      Apply
                      <ArrowRight className="w-3 h-3 transition-transform group-hover/btn:translate-x-1" />
                    </Button>
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>

          {/* General Application */}
          <ScrollReveal delay={0.3}>
            <div className="mt-12 text-center">
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Don&apos;t see a perfect fit? We&apos;re always open to exceptional talent.
              </p>
              <Button variant="glass" className="group">
                <Mail className="w-4 h-4" />
                Send General Application
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
