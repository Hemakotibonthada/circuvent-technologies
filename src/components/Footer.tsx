"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Github, Linkedin, Twitter, Mail, ArrowUpRight } from "lucide-react";
import Image from "next/image";

const footerLinks = {
  product: [
    { label: "Projects", href: "/projects" },
    { label: "Services", href: "/services" },
    { label: "Tech Stack", href: "/stack" },
    { label: "Open Source", href: "/open-source" },
  ],
  domains: [
    { label: "AI & Agents", href: "/domains/ai" },
    { label: "IoT & Smart Home", href: "/domains/iot" },
    { label: "FinTech", href: "/domains/fintech" },
    { label: "HealthTech", href: "/domains/healthtech" },
  ],
  company: [
    { label: "About", href: "/about" },
    { label: "Team", href: "/team" },
    { label: "Careers", href: "/careers" },
    { label: "Blog", href: "/blog" },
    { label: "Contact", href: "/contact" },
    { label: "Privacy Policy", href: "/privacy" },
  ],
};

const socials = [
  { icon: Github, href: "https://github.com/circuvent-technologies", label: "GitHub" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Mail, href: "mailto:contact@circuvent.com", label: "Email" },
];

export default function Footer() {
  return (
    <footer
      className="relative"
      style={{
        borderTop: "1px solid var(--border-primary)",
        background: "var(--bg-secondary)",
      }}
    >
      {/* Gradient line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-16">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1 space-y-6">
            <Link href="/" className="inline-flex items-center gap-2.5 group" aria-label="Circuvent home">
              <Image
                src="/logo.svg"
                alt="Circuvent Technologies logo"
                width={32}
                height={32}
                className="transition-transform duration-500 group-hover:rotate-12"
              />
              <span className="text-lg font-bold tracking-tight">
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

            {/* Socials */}
            <div className="flex gap-2">
              {socials.map((social) => (
                <motion.a
                  key={social.label}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.1, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-2.5 rounded-xl transition-all duration-300 hover:shadow-[var(--shadow-sm)]"
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
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title} className="space-y-4">
              <h4
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: "var(--text-tertiary)" }}
              >
                {title}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group/link inline-flex items-center gap-1 text-sm transition-colors duration-300"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {link.label}
                      <ArrowUpRight className="w-3 h-3 opacity-0 -translate-y-1 translate-x-1 group-hover/link:opacity-100 group-hover/link:translate-y-0 group-hover/link:translate-x-0 transition-all duration-300" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="mt-16 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            &copy; {new Date().getFullYear()} Circuvent Technologies. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Crafted with precision. Deployed with confidence.
          </p>
        </div>
      </div>
    </footer>
  );
}
