"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, useInView } from "framer-motion";
import Link from "next/link";
import { Github, Linkedin, Twitter, Mail, ArrowUpRight, Heart, Sparkles, Code2, Cpu, Globe, Send, ChevronUp } from "lucide-react";
import Image from "next/image";

const footerLinks = {
  shop: [
    { label: "Shop", href: "/shop" },
    { label: "Track Order", href: "/track" },
    { label: "Services", href: "/services" },
  ],
  explore: [
    { label: "Projects", href: "/projects" },
    { label: "Open Source", href: "/open-source" },
    { label: "Blog", href: "/blog" },
    { label: "Docs", href: "/docs" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Careers", href: "/careers" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
  ],
  support: [
    { label: "FAQ", href: "/faq" },
    { label: "Shipping", href: "/shipping" },
    { label: "Returns", href: "/returns-policy" },
    { label: "Warranty", href: "/warranty" },
    { label: "Terms", href: "/terms" },
  ],
};

const socials = [
  { icon: Github, href: "https://github.com/Hemakotibonthada", label: "GitHub", color: "#ffffff", hoverBg: "rgba(255,255,255,0.1)" },
  { icon: Linkedin, href: "https://linkedin.com/company/circuvent", label: "LinkedIn", color: "#0a66c2", hoverBg: "rgba(10,102,194,0.1)" },
  { icon: Twitter, href: "https://twitter.com/circuvent", label: "Twitter", color: "#1da1f2", hoverBg: "rgba(29,161,242,0.1)" },
  { icon: Mail, href: "mailto:hemakotibonthada@gmail.com", label: "Email", color: "#06b6d4", hoverBg: "rgba(6,182,212,0.1)" },
];

const stats = [
  { label: "Projects", value: "53+", icon: Code2 },
  { label: "Tech Stacks", value: "15+", icon: Cpu },
  { label: "Countries", value: "12+", icon: Globe },
];

export default function Footer() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const footerRef = useRef<HTMLElement>(null);
  const isInView = useInView(footerRef, { once: true, amount: 0.1 });

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) return;
    setSubscribed(true);
    setEmail("");
    setTimeout(() => setSubscribed(false), 5000);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <footer
      ref={footerRef}
      className="relative overflow-hidden"
      style={{
        background: "var(--bg-glass-strong)",
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      }}
    >
      {/* Top gradient border */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />

      {/* Floating decorative elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-20 -right-20 w-96 h-96 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(6,182,212,0.03) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.1, 1], rotate: [0, 5, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.03) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.15, 1], rotate: [0, -5, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0" style={{
          backgroundImage: "radial-gradient(var(--border-primary) 0.5px, transparent 0.5px)",
          backgroundSize: "24px 24px",
          opacity: 0.3,
        }} />
      </div>

      {/* Newsletter CTA Section */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pt-16 lg:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl p-8 sm:p-10 mb-16"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-violet-500/5" />
          <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <motion.div
                className="p-3 rounded-xl"
                style={{ background: "var(--accent-cyan-muted)" }}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <Sparkles className="w-6 h-6" style={{ color: "var(--accent-cyan)" }} />
              </motion.div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                  Stay in the loop
                </h3>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Get updates on new projects, articles, and tech insights.
                </p>
              </div>
            </div>
            <form onSubmit={handleSubscribe} className="flex gap-2 w-full sm:w-auto">
              {subscribed ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-emerald-500"
                  style={{ background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.2)" }}
                >
                  <Heart className="w-4 h-4" /> Subscribed!
                </motion.div>
              ) : (
                <>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hello@circuvent.com"
                    aria-label="Email address for newsletter"
                    className="flex-1 sm:w-64 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                  />
                  <motion.button
                    type="submit"
                    aria-label="Subscribe to newsletter"
                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-white shrink-0"
                    style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                    whileHover={{ scale: 1.02, boxShadow: "0 4px 20px rgba(6,182,212,0.3)" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Send className="w-4 h-4" />
                  </motion.button>
                </>
              )}
            </form>
          </div>
        </motion.div>

        {/* Main footer content */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={isInView ? "visible" : "hidden"}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 sm:gap-8 lg:gap-10"
        >
          {/* Brand Column */}
          <motion.div variants={itemVariants} className="col-span-2 md:col-span-3 lg:col-span-2 space-y-6">
            <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="Circuvent home">
              <Image
                src="/logo-mark.png"
                alt="Circuvent Technologies logo"
                width={36}
                height={36}
                className="transition-transform duration-500 group-hover:rotate-12 group-hover:scale-110"
              />
              <span className="text-xl font-bold tracking-tight">
                <span style={{ color: "var(--text-primary)" }}>Circu</span>
                <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                  vent
                </span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--text-muted)" }}>
              Engineering intelligent systems that bypass limitations. AI, IoT,
              and full-stack — from concept to production.
            </p>

            {/* Quick stats */}
            <div className="flex gap-4">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-lg font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Socials */}
            <div className="flex gap-2">
              {socials.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.1, y: -3, backgroundColor: social.hoverBg }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 rounded-xl transition-all duration-300"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-primary)",
                    color: "var(--text-muted)",
                  }}
                  aria-label={social.label}
                >
                  <social.icon className="w-4 h-4" />
                </motion.a>
              ))}
            </div>
          </motion.div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <motion.div key={title} variants={itemVariants} className="space-y-4">
              <h4
                className="text-[10px] font-bold uppercase tracking-[0.15em] flex items-center gap-1.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" />
                {title}
              </h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group/link relative flex items-center gap-1 text-sm py-0.5 transition-all duration-300"
                      style={{ color: hoveredLink === link.label ? "var(--accent-cyan)" : "var(--text-muted)" }}
                      onMouseEnter={() => setHoveredLink(link.label)}
                      onMouseLeave={() => setHoveredLink(null)}
                    >
                      <span className="relative">
                        {link.label}
                        <span
                          className="absolute -bottom-0.5 left-0 h-px bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-300"
                          style={{ width: hoveredLink === link.label ? "100%" : "0%" }}
                        />
                      </span>
                      <ArrowUpRight
                        className="w-3 h-3 shrink-0 transition-all duration-300"
                        style={{
                          opacity: hoveredLink === link.label ? 1 : 0,
                          transform: hoveredLink === link.label ? "translate(0, 0)" : "translate(-4px, 4px)",
                        }}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </motion.div>

        {/* Bottom bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.6 }}
          className="mt-16 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
            &copy; {new Date().getFullYear()} Circuvent Technologies. All rights reserved.
          </p>

          <div className="flex items-center gap-4">
            <p className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              Crafted with <Heart className="w-3 h-3 text-red-400 fill-red-400" /> and{" "}
              <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                40K+ LoC
              </span>
            </p>

            {/* Back to top */}
            <motion.button
              onClick={scrollToTop}
              className="p-2 rounded-xl transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-muted)",
              }}
              whileHover={{ scale: 1.1, y: -2, color: "var(--accent-cyan)" }}
              whileTap={{ scale: 0.95 }}
              aria-label="Back to top"
            >
              <ChevronUp className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>

      {/* Bottom padding */}
      <div className="h-6" />
    </footer>
  );
}
