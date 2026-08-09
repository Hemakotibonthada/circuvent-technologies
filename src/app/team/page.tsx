"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight, Users, MapPin, Mail, Briefcase, Linkedin,
  Instagram, Youtube, Twitter, Phone, ExternalLink, Star,
  Code2, Brain, Rocket, Heart, Globe, Sparkles, X,
} from "lucide-react";

// ============================================================================
// TEAM DATA - Real team members from HT Research & Development Labs
// ============================================================================

interface TeamMemberData {
  name: string;
  role: string;
  bio: string;
  image: string;
  gradient: string;
  skills: string[];
  socials: {
    linkedin?: string;
    email?: string;
    instagram?: string;
    whatsapp?: string;
    twitter?: string;
    youtube?: string;
  };
  profileUrl?: string;
  isFounder?: boolean;
  badgeLabel?: string;
  quote?: string;
}

const teamMembers: TeamMemberData[] = [
  {
    name: "Hema Koteswar Naidu",
    role: "Founder & CEO",
    bio: "A visionary leader with deep expertise in R&D and technological innovation. Hema drives the strategic direction of the lab, focusing on cutting-edge research in AI, distributed systems, IoT, and full-stack engineering. Built 53+ projects across 6 technology domains with 200K+ lines of production code.",
    image: "https://res.cloudinary.com/djucuoojo/image/upload/v1783642047/IMG_1188_slid82.jpg",
    gradient: "from-cyan-500 to-violet-500",
    skills: ["AI/ML", "Full-Stack", "IoT", "DevOps", "Python", "React", "Flutter"],
    socials: {
      linkedin: "https://linkedin.com/in/hemakoti",
      email: "mailto:hema@htresearchlab.com",
      instagram: "https://instagram.com/the.vema",
      whatsapp: "https://wa.me/919966123105",
      twitter: "https://twitter.com/hemakoti",
      youtube: "https://youtube.com/@hemakotibonthada",
    },
    profileUrl: "https://www.htresearchlab.com/hemakoti",
    isFounder: true,
    badgeLabel: "Founder",
    quote: "Engineering intelligent systems that bypass limitations.",
  },
  {
    name: "Chiru Kotcherla",
    role: "Co-Founder & Marketing Director",
    bio: "Marketing guru with a knack for storytelling and brand building. Chiru leads our marketing strategies, ensuring our innovations reach the right audience effectively. He crafts compelling narratives around complex technology products.",
    image: "https://res.cloudinary.com/djucuoojo/image/upload/v1758719410/Chiru_iw7icr.png",
    gradient: "from-amber-500 to-orange-500",
    skills: ["Marketing", "Branding", "Content Strategy", "Growth"],
    socials: {
      email: "mailto:chiru.kotcherla@htresearchlab.com",
    },
    isFounder: true,
    badgeLabel: "Co-Founder",
  },
  {
    name: "Sankar Nagarapu",
    role: "Co-Founder & Head of Software & AI",
    bio: "Sankar heads the software and artificial intelligence division at Circuvent Technologies. From full-stack application development to machine learning model deployment, he architects the digital backbone of every product.",
    image: "https://res.cloudinary.com/djucuoojo/image/upload/v1773323097/603c2e95-dc34-4cf1-b118-25720669083a.png",
    gradient: "from-blue-500 to-indigo-500",
    skills: ["Software Architecture", "AI/ML", "Cloud & DevOps", "Distributed Systems"],
    socials: {},
    isFounder: true,
    badgeLabel: "Co-Founder",
    quote: "Software and AI are the nervous system of modern technology — we build intelligence into everything.",
  },
  {
    name: "Vijay Pithani",
    role: "Co-Founder & Head of Electronics",
    bio: "Vijay leads the electronics and electrical engineering division at Circuvent Technologies. He specializes in embedded systems design, PCB layout, and electrical integration — ensuring every product transitions seamlessly from design to production.",
    image: "https://res.cloudinary.com/djucuoojo/image/upload/v1773323100/2bb31f9e-9540-40a5-82a0-237bd70ad040.png",
    gradient: "from-green-500 to-emerald-500",
    skills: ["Electronics Embedding", "PCB Design", "Electrical Systems", "Hardware Integration"],
    socials: {},
    isFounder: true,
    badgeLabel: "Co-Founder",
    quote: "Every great product starts with solid electronics — we make sure the hardware matches the vision.",
  },
  {
    name: "Kishore Mandapalli",
    role: "Co-Founder & Head of Wiring Design",
    bio: "Kishore leads wiring design and electrical routing at Circuvent Technologies. He ensures every product has a meticulously planned wiring architecture — from harness design to cable management and connector selection.",
    image: "https://res.cloudinary.com/djucuoojo/image/upload/v1773323089/6c835c05-5e92-42c3-bd1f-b4bce33cbb68.png",
    gradient: "from-yellow-500 to-amber-500",
    skills: ["Wiring Design", "Electrical Routing", "Cable Management", "Connector Systems"],
    socials: {},
    isFounder: true,
    badgeLabel: "Co-Founder",
    quote: "Clean wiring is the unsung hero of reliable hardware — we make sure every connection counts.",
  },
];

// AI Agents as "team members"
const aiAgents: TeamMemberData[] = [
  {
    name: "NEXUS Personal Agent",
    role: "AI Personal Assistant",
    bio: "Local-first AI agent running on Ollama (Llama 3). Handles personal tasks, scheduling, note-taking, and conversational queries with full privacy — zero cloud dependency.",
    image: "",
    gradient: "from-violet-500 to-purple-500",
    skills: ["NLP", "Task Management", "Scheduling", "Conversation"],
    socials: {},
    quote: "Your thoughts, your device, your privacy.",
  },
  {
    name: "NEXUS Code Agent",
    role: "AI Code Assistant",
    bio: "Code-specialized agent running CodeStral. Assists with code generation, review, debugging, documentation, and refactoring across 10+ programming languages.",
    image: "",
    gradient: "from-blue-500 to-indigo-500",
    skills: ["Code Gen", "Review", "Debugging", "Documentation"],
    socials: {},
  },
  {
    name: "NEXUS Finance Agent",
    role: "AI Financial Analyst",
    bio: "Specialized agent for financial analysis, expense tracking, budgeting, and investment insights. Integrates with market data APIs for real-time analysis.",
    image: "",
    gradient: "from-emerald-500 to-teal-500",
    skills: ["Finance", "Analytics", "Budgeting", "Markets"],
    socials: {},
  },
  {
    name: "NEXUS Home Agent",
    role: "AI Home Controller",
    bio: "IoT integration agent managing smart home devices via MQTT. Controls lights, temperature, security systems, and energy usage across 9+ ESP32 devices.",
    image: "",
    gradient: "from-cyan-500 to-teal-500",
    skills: ["MQTT", "IoT", "Automation", "Energy"],
    socials: {},
  },
];

const openRoles = [
  {
    title: "Senior AI Engineer",
    type: "Full-time",
    location: "Remote / India",
    description: "Lead our AI agent architecture. Experience with LLMs, RAG, vector databases, and edge AI deployment required.",
    gradient: "from-violet-500 to-purple-500",
  },
  {
    title: "IoT Platform Engineer",
    type: "Full-time",
    location: "Hyderabad, India",
    description: "Design and scale our ESP32 firmware and MQTT infrastructure. Strong C++ and embedded systems experience.",
    gradient: "from-cyan-500 to-teal-500",
  },
  {
    title: "Full-Stack Developer",
    type: "Full-time",
    location: "Remote / India",
    description: "React/Next.js frontend + Node.js/Python backend. Ship features across multiple products simultaneously.",
    gradient: "from-blue-500 to-indigo-500",
  },
  {
    title: "Flutter Mobile Engineer",
    type: "Contract",
    location: "Remote",
    description: "Build and maintain our cross-platform mobile applications. Experience with Firebase, Riverpod, and native integrations.",
    gradient: "from-pink-500 to-rose-500",
  },
];

// Social icon mapping
const socialIcons: Record<string, { icon: React.ElementType; color: string; hoverColor: string }> = {
  linkedin: { icon: Linkedin, color: "#0a66c2", hoverColor: "rgba(10,102,194,0.15)" },
  email: { icon: Mail, color: "#ea4335", hoverColor: "rgba(234,67,53,0.15)" },
  instagram: { icon: Instagram, color: "#e1306c", hoverColor: "rgba(225,48,108,0.15)" },
  whatsapp: { icon: Phone, color: "#25d366", hoverColor: "rgba(37,211,102,0.15)" },
  twitter: { icon: Twitter, color: "#1da1f2", hoverColor: "rgba(29,161,242,0.15)" },
  youtube: { icon: Youtube, color: "#ff0000", hoverColor: "rgba(255,0,0,0.15)" },
};

// ============================================================================
// TEAM CARD COMPONENT - Enhanced with real photos
// ============================================================================

function EnhancedTeamCard({ member, index, isAgent = false }: { member: TeamMemberData; index: number; isAgent?: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const activeSocials = Object.entries(member.socials).filter(([, url]) => url && url !== "#");
  const emojiMap: Record<string, string> = {
    "AI Personal Assistant": "🤖",
    "AI Code Assistant": "💻",
    "AI Financial Analyst": "💰",
    "AI Home Controller": "🏠",
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: index * 0.12, ease: [0.22, 1, 0.36, 1] }}
        className="group relative cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => setShowDetails(true)}
      >
        {/* Glow border on hover */}
        <motion.div
          className={`absolute -inset-[1px] rounded-3xl bg-gradient-to-r ${member.gradient} blur-sm`}
          animate={{ opacity: isHovered ? 0.25 : 0 }}
          transition={{ duration: 0.3 }}
        />

        <div
          className="relative overflow-hidden rounded-3xl transition-all duration-500"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            boxShadow: isHovered ? "var(--shadow-lg)" : "var(--shadow-sm)",
          }}
        >
          {/* Founder badge */}
          {member.isFounder && (
            <div className={`absolute top-4 right-4 z-20 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider text-white bg-gradient-to-r ${member.gradient}`}>
              {member.badgeLabel || "Founder"}
            </div>
          )}

          {/* Image area */}
          <div className="relative w-full overflow-hidden" style={{ height: isAgent ? 200 : 320 }}>
            {member.image ? (
              <>
                <Image
                  src={member.image}
                  alt={member.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </>
            ) : (
              <div className={`w-full h-full bg-gradient-to-br ${member.gradient} flex items-center justify-center`}>
                <span className="text-6xl opacity-50">
                  {emojiMap[member.role] || "🧠"}
                </span>
              </div>
            )}

            {/* Name overlay on image */}
            {member.image && (
              <div className="absolute bottom-4 left-5 right-5 z-10">
                <h3 className="text-xl font-bold text-white drop-shadow-lg">
                  {member.name}
                </h3>
                <p className={`text-sm font-medium mt-0.5 bg-gradient-to-r ${member.gradient} bg-clip-text text-transparent`}>
                  {member.role}
                </p>
              </div>
            )}
          </div>

          {/* Info section */}
          <div className="p-5">
            {/* Name (for agents without image) */}
            {!member.image && (
              <div className="mb-3">
                <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  {member.name}
                </h3>
                <p className={`text-sm font-medium bg-gradient-to-r ${member.gradient} bg-clip-text text-transparent`}>
                  {member.role}
                </p>
              </div>
            )}

            {/* Quote or bio */}
            {member.quote && (
              <p className="text-xs italic mb-3 px-3 py-2 rounded-xl" style={{
                color: "var(--text-tertiary)",
                background: "var(--bg-surface-hover)",
                borderLeft: "3px solid var(--accent-cyan)",
              }}>
                &ldquo;{member.quote}&rdquo;
              </p>
            )}

            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--text-muted)" }}>
              {member.bio}
            </p>

            {/* Skills */}
            <div className="flex flex-wrap gap-1.5 mt-4">
              {member.skills.slice(0, 5).map((skill) => (
                <span
                  key={skill}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{
                    background: "var(--accent-cyan-muted)",
                    color: "var(--accent-cyan-text)",
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>

            {/* Social icons */}
            {activeSocials.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
                {activeSocials.map(([platform, url]) => {
                  const social = socialIcons[platform];
                  if (!social) return null;
                  const Icon = social.icon;
                  return (
                    <motion.a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl transition-all duration-200"
                      style={{
                        background: "var(--bg-surface)",
                        border: "1px solid var(--border-primary)",
                        color: "var(--text-muted)",
                      }}
                      whileHover={{
                        scale: 1.1,
                        y: -2,
                        backgroundColor: social.hoverColor,
                        color: social.color,
                      }}
                      whileTap={{ scale: 0.95 }}
                      aria-label={`${member.name} ${platform}`}
                    >
                      <Icon className="w-4 h-4" />
                    </motion.a>
                  );
                })}

                {member.profileUrl && (
                  <motion.a
                    href={member.profileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[44px] ml-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium"
                    style={{
                      background: "var(--accent-cyan-muted)",
                      color: "var(--accent-cyan)",
                      border: "1px solid var(--border-accent)",
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Profile <ExternalLink className="w-3 h-3" />
                  </motion.a>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Detail modal */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            onClick={() => setShowDetails(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative max-w-lg w-full rounded-3xl overflow-hidden"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-primary)",
                boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={() => setShowDetails(false)}
                className="absolute top-4 right-4 z-20 p-2 rounded-full transition-colors"
                style={{ background: "rgba(0,0,0,0.4)", color: "white" }}
              >
                <X className="w-4 h-4" />
              </button>

              {/* Image */}
              {member.image ? (
                <div className="relative w-full" style={{ height: 280 }}>
                  <Image src={member.image} alt={member.name} fill className="object-cover" sizes="500px" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-5 left-6">
                    {member.isFounder && (
                      <span className={`inline-block px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider text-white bg-gradient-to-r ${member.gradient} mb-2`}>
                        {member.badgeLabel || "Founder"}
                      </span>
                    )}
                    <h2 className="text-2xl font-bold text-white">{member.name}</h2>
                    <p className={`text-sm font-medium bg-gradient-to-r ${member.gradient} bg-clip-text text-transparent`}>
                      {member.role}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={`w-full h-48 bg-gradient-to-br ${member.gradient} flex items-center justify-center`}>
                  <span className="text-7xl opacity-30">{emojiMap[member.role] || "🧠"}</span>
                  <div className="absolute bottom-5 left-6">
                    <h2 className="text-2xl font-bold text-white">{member.name}</h2>
                    <p className="text-sm font-medium text-white/70">{member.role}</p>
                  </div>
                </div>
              )}

              <div className="p-6 space-y-4">
                {member.quote && (
                  <p className="text-sm italic px-4 py-3 rounded-xl" style={{
                    color: "var(--text-tertiary)",
                    background: "var(--bg-surface-hover)",
                    borderLeft: "3px solid var(--accent-cyan)",
                  }}>
                    &ldquo;{member.quote}&rdquo;
                  </p>
                )}

                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {member.bio}
                </p>

                {/* Skills */}
                <div className="flex flex-wrap gap-1.5">
                  {member.skills.map((skill) => (
                    <span key={skill} className="px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                      {skill}
                    </span>
                  ))}
                </div>

                {/* Socials */}
                {activeSocials.length > 0 && (
                  <div className="flex items-center gap-2 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                    {activeSocials.map(([platform, url]) => {
                      const social = socialIcons[platform];
                      if (!social) return null;
                      const Icon = social.icon;
                      return (
                        <motion.a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2.5 rounded-xl transition-all"
                          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: social.color }}
                          whileHover={{ scale: 1.1, y: -2 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Icon className="w-4 h-4" />
                        </motion.a>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function TeamPage() {
  return (
    <>

      {/* Hero */}
      <section className="relative z-10 pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="max-w-3xl">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>
                Team
              </span>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                The Minds{" "}
                <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  Behind It
                </span>
              </h1>
              <p className="text-lg leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                A lean, high-impact team of engineers and innovators building intelligent systems that bypass technological limitations — from AI agents to IoT ecosystems.
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Founding Team */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="mb-10">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-violet)" }}>
                Leadership
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                Founding Team
              </h2>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamMembers.map((member, i) => (
              <EnhancedTeamCard key={member.name} member={member} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents Team */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="mb-10">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>
                AI Workforce
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                NEXUS AI Agents
              </h2>
              <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--text-muted)" }}>
                13 specialized AI agents running locally on-device — our digital team members that never sleep.
              </p>
            </div>
          </ScrollReveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {aiAgents.map((agent, i) => (
              <EnhancedTeamCard key={agent.name} member={agent} index={i} isAgent />
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
                      { icon: Rocket, label: "Ship weekly", desc: "Continuous delivery over perfect planning." },
                      { icon: Code2, label: "Own your stack", desc: "From firmware to frontend — full ownership, full pride." },
                      { icon: Globe, label: "Build in public", desc: "Open source by default. Transparency breeds trust." },
                      { icon: Brain, label: "AI-augmented", desc: "We use AI tools daily to amplify our output 10x." },
                      { icon: Heart, label: "Care deeply", desc: "Every pixel, every bit, every line matters." },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-3 group">
                        <div className="p-1.5 rounded-lg shrink-0" style={{ background: "var(--accent-cyan-muted)" }}>
                          <item.icon className="w-3.5 h-3.5" style={{ color: "var(--accent-cyan)" }} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            {item.label}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { value: "53+", label: "Projects Shipped", icon: "🚀" },
                    { value: "6", label: "Tech Domains", icon: "🧠" },
                    { value: "15+", label: "Tech Stacks", icon: "⚡" },
                    { value: "13+", label: "AI Agents", icon: "🤖" },
                    { value: "40K+", label: "Lines of Code", icon: "📝" },
                    { value: "∞", label: "Curiosity", icon: "✨" },
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
                      <div className="text-xl mb-1">{stat.icon}</div>
                      <div className="text-2xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                        {stat.value}
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
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
              <span className="text-xs font-semibold text-emerald-700 uppercase tracking-[0.2em]">
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
                  <div className={`absolute top-0 left-0 bottom-0 w-[2px] bg-gradient-to-b ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

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

          <ScrollReveal delay={0.3}>
            <div className="mt-12 text-center">
              <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
                Don&apos;t see a perfect fit? We&apos;re always open to exceptional talent.
              </p>
              <Link href="/contact">
                <Button variant="glass" className="group">
                  <Mail className="w-4 h-4" />
                  Send General Application
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
