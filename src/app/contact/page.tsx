"use client";

import AnimatedBackground from "@/components/AnimatedBackground";
import PageHeader from "@/components/PageHeader";
import ContactForm from "@/components/ContactForm";
import ScrollReveal from "@/components/ScrollReveal";
import { motion } from "framer-motion";
import {
  Mail,
  MapPin,
  Clock,
  Github,
  Linkedin,
  Twitter,
  MessageSquare,
  Phone,
  Globe,
  Zap,
} from "lucide-react";

const contactInfo = [
  {
    icon: Mail,
    label: "Email",
    value: "contact@circuvent.com",
    href: "mailto:contact@circuvent.com",
    description: "For general inquiries and project discussions.",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+91 765 999 333 1",
    href: "tel:+917659993331",
    description: "Available during IST business hours.",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Hyderabad, India",
    href: "https://maps.google.com/?q=Hyderabad,India",
    description: "Operating across India with remote-first culture.",
  },
  {
    icon: Clock,
    label: "Response Time",
    value: "24-48 hours",
    href: null,
    description: "We respond to all inquiries within two business days.",
  },
  {
    icon: Globe,
    label: "Timezone",
    value: "IST (UTC+5:30)",
    href: null,
    description: "Available for meetings across Asia, Europe, and Americas.",
  },
];

const socialLinks = [
  {
    icon: Github,
    label: "GitHub",
    href: "https://github.com/circuvent-technologies",
    description: "53+ open source repositories",
    gradient: "from-gray-500 to-gray-700",
  },
  {
    icon: Linkedin,
    label: "LinkedIn",
    href: "#",
    description: "Connect with our team",
    gradient: "from-blue-500 to-blue-700",
  },
  {
    icon: Twitter,
    label: "Twitter / X",
    href: "#",
    description: "Engineering insights and updates",
    gradient: "from-sky-500 to-sky-700",
  },
  {
    icon: MessageSquare,
    label: "Discord",
    href: "#",
    description: "Join our developer community",
    gradient: "from-indigo-500 to-indigo-700",
  },
];

const engagementTypes = [
  {
    title: "Project Inquiry",
    description: "Have a project idea? Tell us about your requirements, timeline, and goals.",
    icon: Zap,
    gradient: "from-cyan-500 to-teal-500",
  },
  {
    title: "Partnership",
    description: "Interested in technology partnerships, integrations, or joint ventures.",
    icon: Globe,
    gradient: "from-violet-500 to-purple-500",
  },
  {
    title: "Career",
    description: "Want to join our team? Check our open roles or send a general application.",
    icon: MessageSquare,
    gradient: "from-pink-500 to-rose-500",
  },
  {
    title: "Open Source",
    description: "Questions about our open source projects, contributions, or licensing.",
    icon: Github,
    gradient: "from-emerald-500 to-teal-500",
  },
];

export default function ContactPage() {
  return (
    <>
      <AnimatedBackground />

      <PageHeader
        eyebrow="Contact"
        title="Let's Build"
        titleHighlight="Together"
        description="Whether you have a project in mind, want to explore a partnership, or just want to say hello — we'd love to hear from you."
      />

      {/* Engagement Types */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {engagementTypes.map((type, i) => (
              <ScrollReveal key={type.title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 cursor-pointer transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${type.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />
                  <div
                    className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${type.gradient} mb-4`}
                  >
                    <type.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {type.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {type.description}
                  </p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content: Form + Sidebar */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Contact Form */}
            <div className="lg:col-span-2">
              <ScrollReveal>
                <h2
                  className="text-2xl font-bold mb-6"
                  style={{ color: "var(--text-primary)" }}
                >
                  Send Us a Message
                </h2>
                <ContactForm />
              </ScrollReveal>
            </div>

            {/* Sidebar */}
            <div className="space-y-8">
              {/* Contact Info */}
              <ScrollReveal delay={0.1}>
                <div
                  className="rounded-2xl backdrop-blur-xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <h3
                    className="text-lg font-bold mb-6"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Get in Touch
                  </h3>
                  <div className="space-y-5">
                    {contactInfo.map((info) => (
                      <div key={info.label} className="flex items-start gap-3">
                        <div
                          className="p-2 rounded-lg shrink-0"
                          style={{
                            background: "var(--accent-cyan-muted)",
                          }}
                        >
                          <info.icon
                            className="w-4 h-4"
                            style={{ color: "var(--accent-cyan)" }}
                          />
                        </div>
                        <div>
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {info.label}
                          </p>
                          {info.href ? (
                            <a
                              href={info.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm hover:text-[var(--accent-cyan)] transition-colors"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {info.value}
                            </a>
                          ) : (
                            <p
                              className="text-sm"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {info.value}
                            </p>
                          )}
                          <p
                            className="text-xs mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {info.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Social Links */}
              <ScrollReveal delay={0.2}>
                <div
                  className="rounded-2xl backdrop-blur-xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <h3
                    className="text-lg font-bold mb-6"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Follow Us
                  </h3>
                  <div className="space-y-3">
                    {socialLinks.map((social) => (
                      <a
                        key={social.label}
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 p-3 rounded-xl transition-all duration-300"
                        style={{
                          background: "transparent",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        <div
                          className={`p-2 rounded-lg bg-gradient-to-br ${social.gradient} group-hover:scale-110 transition-transform`}
                        >
                          <social.icon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p
                            className="text-sm font-medium group-hover:text-[var(--accent-cyan)] transition-colors"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {social.label}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {social.description}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Availability */}
              <ScrollReveal delay={0.3}>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "rgba(16, 185, 129, 0.05)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span
                      className="text-sm font-semibold text-emerald-500"
                    >
                      Currently Available
                    </span>
                  </div>
                  <p
                    className="text-sm"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    We&apos;re accepting new projects. Typical start time is 1-2 weeks
                    from initial discussion.
                  </p>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
