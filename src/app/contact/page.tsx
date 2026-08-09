"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";
import ScrollReveal from "@/components/ScrollReveal";
import TiltCard from "@/components/TiltCard";
import { ShimmerText } from "@/components/AnimationEffects";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Mail, MapPin, Clock, Github, Linkedin, Twitter,
  MessageSquare, Phone, Globe, Zap, ArrowRight,
  Sparkles, CheckCircle, Send, Calendar, Users,
  Building2, Code2, Heart, Star, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const contactInfo = [
  {
    icon: Mail,
    label: "Email",
    value: "contact@circuvent.com",
    href: "mailto:contact@circuvent.com",
    description: "For project inquiries and collaborations.",
    color: "#ea4335",
    textColor: "#b3261e",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+91 765 999 333 1",
    href: "tel:+917659993331",
    description: "Available during IST business hours.",
    color: "#10b981",
    textColor: "#047857",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Hyderabad, India",
    href: "https://maps.google.com/?q=Hyderabad,India",
    description: "Operating across India with remote-first culture.",
    color: "#f59e0b",
    textColor: "#b45309",
  },
  {
    icon: Clock,
    label: "Response Time",
    value: "24-48 hours",
    href: null,
    description: "We respond to all inquiries promptly.",
    color: "#8b5cf6",
    textColor: "#6d28d9",
  },
  {
    icon: Globe,
    label: "Timezone",
    value: "IST (UTC+5:30)",
    href: null,
    description: "Flexible for meetings across timezones.",
    color: "#06b6d4",
    textColor: "#0e7490",
  },
];

const socialLinks = [
  {
    icon: Github,
    label: "GitHub",
    href: "https://github.com/Hemakotibonthada",
    description: "53+ open source repositories",
    gradient: "from-gray-500 to-gray-700",
    color: "#ffffff",
  },
  {
    icon: Linkedin,
    label: "LinkedIn",
    href: "https://linkedin.com/in/hemakoti",
    description: "Connect with our team",
    gradient: "from-blue-500 to-blue-700",
    color: "#0a66c2",
  },
  {
    icon: Twitter,
    label: "Twitter / X",
    href: "https://twitter.com/hemakoti",
    description: "Engineering insights and updates",
    gradient: "from-sky-500 to-sky-700",
    color: "#1da1f2",
  },
  {
    icon: MessageSquare,
    label: "WhatsApp",
    href: "https://wa.me/919966123105",
    description: "Quick project discussions",
    gradient: "from-green-500 to-green-700",
    color: "#25d366",
  },
];

const engagementTypes = [
  {
    title: "Project Inquiry",
    description: "Have a project idea? Tell us about your requirements, timeline, and budget.",
    icon: Zap,
    gradient: "from-cyan-500 to-teal-500",
    stats: "53+ projects delivered",
  },
  {
    title: "Partnership",
    description: "Technology partnerships, integrations, white-label solutions, or joint ventures.",
    icon: Users,
    gradient: "from-violet-500 to-purple-500",
    stats: "6 tech domains",
  },
  {
    title: "Careers",
    description: "Join our team of innovators. Check open roles or send a general application.",
    icon: Building2,
    gradient: "from-pink-500 to-rose-500",
    stats: "4 open positions",
    href: "/careers",
  },
  {
    title: "Open Source",
    description: "Questions about our repos, contributions, licensing, or community involvement.",
    icon: Code2,
    gradient: "from-emerald-500 to-teal-500",
    stats: "All MIT licensed",
    href: "/open-source",
  },
];

// Quick stats
const quickStats = [
  { value: "53+", label: "Projects", icon: "🚀" },
  { value: "15+", label: "Tech Stacks", icon: "⚡" },
  { value: "8", label: "In Production", icon: "🟢" },
  { value: "24-48h", label: "Response", icon: "⏱️" },
];

export default function ContactPage() {
  const [selectedEngagement, setSelectedEngagement] = useState<string | null>(null);

  return (
    <>

      <PageHeader
        eyebrow="Contact"
        title="Let's Build"
        titleHighlight="Together"
        description="Whether you have a project in mind, want to explore a partnership, or just want to say hello — we'd love to hear from you."
      />

      {/* Quick Stats */}
      <section className="relative z-10 py-8">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {quickStats.map((stat, i) => (
              <ScrollReveal key={stat.label} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -3, scale: 1.02 }}
                  className="text-center p-4 rounded-2xl"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(12px)" }}
                >
                  <div className="text-xl mb-1">{stat.icon}</div>
                  <div className="text-lg font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">{stat.value}</div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{stat.label}</div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Engagement Types */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-10">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan-text)" }}>How Can We Help?</span>
              <h2 className="text-3xl sm:text-4xl font-bold mt-2" style={{ color: "var(--text-primary)" }}>
                Choose Your <ShimmerText>Path</ShimmerText>
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {engagementTypes.map((type, i) => (
              <ScrollReveal key={type.title} delay={i * 0.1}>
                <TiltCard tiltAmount={6}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    onClick={() => setSelectedEngagement(type.title === selectedEngagement ? null : type.title)}
                    className={`group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 cursor-pointer transition-all duration-300 h-full ${
                      selectedEngagement === type.title ? "ring-2 ring-cyan-500/30" : ""
                    }`}
                    style={{
                      background: selectedEngagement === type.title ? "var(--bg-elevated)" : "var(--bg-glass)",
                      border: `1px solid ${selectedEngagement === type.title ? "var(--border-accent)" : "var(--border-primary)"}`,
                    }}
                  >
                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${type.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                    <motion.div
                      className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${type.gradient} mb-4`}
                      whileHover={{ rotate: 10, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 300 }}
                    >
                      <type.icon className="w-5 h-5 text-white" />
                    </motion.div>
                    <h3 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>{type.title}</h3>
                    <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>{type.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium" style={{ color: "var(--accent-cyan-text)" }}>{type.stats}</span>
                      {type.href && (
                        <Link
                          href={type.href}
                          aria-label={`${type.title}: ${type.stats}`}
                          /* The arrow only appears on hover, which a phone
                             never does, and it was a 14px target. Sized to be
                             reachable and named so it is not an anonymous
                             link when the icon is invisible. */
                          className="inline-flex h-[44px] w-[44px] items-center justify-center"
                        >
                          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--accent-cyan)" }} />
                        </Link>
                      )}
                    </div>
                  </motion.div>
                </TiltCard>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content: Form + Sidebar */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-10">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <ScrollReveal>
                <div className="flex items-center gap-3 mb-6">
                  <motion.div
                    className="p-2.5 rounded-xl"
                    style={{ background: "var(--accent-cyan-muted)" }}
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity }}
                  >
                    <Send className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                  </motion.div>
                  <div>
                    <h2 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Send Us a Message</h2>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>We&apos;ll respond within 24-48 hours</p>
                  </div>
                </div>
                <ContactForm />
              </ScrollReveal>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Contact Info */}
              <ScrollReveal delay={0.1}>
                <div className="rounded-2xl backdrop-blur-xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <h3 className="text-base font-bold mb-5 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" />
                    Get in Touch
                  </h3>
                  <div className="space-y-4">
                    {contactInfo.map((info) => (
                      <motion.div
                        key={info.label}
                        className="flex items-start gap-3 group"
                        whileHover={{ x: 3 }}
                      >
                        <div className="p-2 rounded-lg shrink-0 transition-colors" style={{ background: `${info.color}10` }}>
                          <info.icon className="w-4 h-4" style={{ color: info.color }} />
                        </div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>{info.label}</p>
                          {info.href ? (
                            <a
                              href={info.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium hover:underline transition-colors"
                              style={{ color: info.textColor }}
                            >
                              {info.value}
                            </a>
                          ) : (
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{info.value}</p>
                          )}
                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>{info.description}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Social Links */}
              <ScrollReveal delay={0.2}>
                <div className="rounded-2xl backdrop-blur-xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                  <h3 className="text-base font-bold mb-5 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-500 to-pink-500" />
                    Connect With Us
                  </h3>
                  <div className="space-y-2">
                    {socialLinks.map((social) => (
                      <motion.a
                        key={social.label}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 p-3 rounded-xl transition-all duration-300"
                        style={{ border: "1px solid var(--border-primary)" }}
                        whileHover={{ x: 3, backgroundColor: `${social.color}08` }}
                      >
                        <div className={`p-2 rounded-lg bg-gradient-to-br ${social.gradient} group-hover:scale-110 transition-transform`}>
                          <social.icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium transition-colors" style={{ color: "var(--text-primary)" }}>{social.label}</p>
                          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>{social.description}</p>
                        </div>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: social.color }} />
                      </motion.a>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Availability */}
              <ScrollReveal delay={0.3}>
                <motion.div
                  className="rounded-2xl p-6 relative overflow-hidden"
                  style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.15)" }}
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent" />
                  <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-3">
                      <motion.div
                        className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                        animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                      <span className="text-sm font-bold text-emerald-700">Currently Available</span>
                    </div>
                    <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
                      We&apos;re accepting new projects. Typical start time is 1-2 weeks from initial discussion.
                    </p>
                    <div className="flex items-center gap-4 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Quick start: 1-2 weeks</span>
                      <span className="flex items-center gap-1"><Star className="w-3 h-3" /> Free consultation</span>
                    </div>
                  </div>
                </motion.div>
              </ScrollReveal>

              {/* Quick Actions */}
              <ScrollReveal delay={0.4}>
                <div className="space-y-2">
                  <Link href="/projects">
                    <motion.div
                      className="flex items-center justify-between p-4 rounded-xl transition-all group"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
                      whileHover={{ x: 3 }}
                    >
                      <div className="flex items-center gap-3">
                        <Sparkles className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>View Our Work</span>
                      </div>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: "var(--accent-cyan)" }} />
                    </motion.div>
                  </Link>
                  <Link href="/services">
                    <motion.div
                      className="flex items-center justify-between p-4 rounded-xl transition-all group"
                      style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
                      whileHover={{ x: 3 }}
                    >
                      <div className="flex items-center gap-3">
                        <Code2 className="w-4 h-4" style={{ color: "var(--accent-violet)" }} />
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Explore Services</span>
                      </div>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" style={{ color: "var(--accent-violet)" }} />
                    </motion.div>
                  </Link>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section className="relative z-10 py-16">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)", backdropFilter: "blur(24px)" }}>
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/3 via-transparent to-violet-500/3" />
              <div className="relative z-10">
                <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity }}>
                  <Heart className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--accent-cyan)" }} />
                </motion.div>
                <h3 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                  Built With <ShimmerText>Passion</ShimmerText>
                </h3>
                <p className="text-sm max-w-lg mx-auto mb-6" style={{ color: "var(--text-tertiary)" }}>
                  Every project gets the same obsessive attention to detail — whether it&apos;s a landing page or a 13-agent AI operating system.
                </p>
                <div className="flex items-center justify-center gap-6">
                  {[
                    { icon: CheckCircle, label: "Free Consultation", color: "#10b981" },
                    { icon: CheckCircle, label: "NDA on Request", color: "#10b981" },
                    { icon: CheckCircle, label: "Post-Launch Support", color: "#10b981" },
                  ].map((item) => (
                    <span key={item.label} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                      <item.icon className="w-3.5 h-3.5" style={{ color: item.color }} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
