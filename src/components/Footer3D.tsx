"use client";

import Link from "next/link";
import { Github, Linkedin, Twitter, Mail, ArrowUp } from "lucide-react";

const footerLinks = {
  Product: [
    { label: "Projects", href: "/projects" },
    { label: "Services", href: "/services" },
    { label: "Open Source", href: "/open-source" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Team", href: "/team" },
    { label: "Contact", href: "/contact" },
  ],
  Resources: [
    { label: "Blog", href: "/blog" },
    { label: "Docs", href: "/docs" },
    { label: "Roadmap", href: "/roadmap" },
  ],
};

const socials = [
  { icon: Github, href: "https://github.com/AnjaliRupworWorking", label: "GitHub" },
  { icon: Linkedin, href: "#", label: "LinkedIn" },
  { icon: Twitter, href: "#", label: "Twitter" },
  { icon: Mail, href: "mailto:hello@circuvent.tech", label: "Email" },
];

export default function Footer3D() {
  return (
    <footer className="relative" style={{ background: "var(--bg-secondary)" }}>
      {/* Top gradient border */}
      <div
        className="h-px w-full"
        style={{ background: "var(--gradient-accent)" }}
      />

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="md:col-span-2 space-y-4">
            <Link href="/" className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                style={{ background: "var(--gradient-accent)" }}
              >
                CT
              </div>
              <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Circu<span className="gradient-text">vent</span>
              </span>
            </Link>
            <p className="text-sm leading-relaxed max-w-xs" style={{ color: "var(--text-tertiary)" }}>
              Engineering what&apos;s next — at the intersection of AI, IoT, and
              full-stack innovation.
            </p>

            {/* Social Icons */}
            <div className="flex gap-3 pt-2">
              {socials.map(({ icon: Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl transition-all duration-200 hover:scale-110"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    color: "var(--text-tertiary)",
                  }}
                  aria-label={label}
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Link Columns */}
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4
                className="text-xs font-semibold uppercase tracking-wider mb-4"
                style={{ color: "var(--text-muted)" }}
              >
                {title}
              </h4>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm transition-colors duration-200"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div
          className="mt-16 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            &copy; {new Date().getFullYear()} Circuvent Technologies. All rights reserved.
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="p-2 rounded-xl transition-all duration-200 hover:scale-110"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-tertiary)",
            }}
            aria-label="Scroll to top"
          >
            <ArrowUp size={14} />
          </button>
        </div>
      </div>
    </footer>
  );
}
