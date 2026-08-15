"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Nav3D() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { resolvedTheme, toggleTheme } = useTheme();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "py-3 backdrop-blur-xl border-b"
            : "py-5"
        }`}
        style={{
          background: scrolled ? "var(--bg-glass)" : "transparent",
          borderColor: scrolled ? "var(--border-primary)" : "transparent",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm"
                style={{ background: "var(--gradient-accent)" }}
              >
                CT
              </div>
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-lg"
                style={{ background: "var(--gradient-accent)" }}
              />
            </div>
            <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              Circu<span className="gradient-text">vent</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="relative px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-200 hover:bg-[var(--border-primary)]"
                style={{ color: "var(--text-secondary)" }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl transition-all duration-200 hover:scale-105"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-secondary)",
              }}
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            <Link
              href="/contact"
              className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:shadow-lg"
              style={{ background: "var(--gradient-accent)" }}
            >
              Let&apos;s Talk
            </Link>

            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2.5 rounded-xl transition-all duration-200"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-primary)",
              }}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 pt-20 md:hidden"
          style={{ background: "var(--bg-primary)" }}
        >
          <nav className="flex flex-col items-center gap-2 p-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center py-4 text-lg font-medium rounded-xl transition-colors duration-200"
                style={{ color: "var(--text-primary)" }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/contact"
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center py-4 rounded-xl text-lg font-medium text-white mt-4"
              style={{ background: "var(--gradient-accent)" }}
            >
              Let&apos;s Talk
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}
