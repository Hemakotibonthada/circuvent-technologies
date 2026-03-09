"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "./CommandPalette";

const navItems = [
  { label: "Home", href: "/" },
  { label: "Projects", href: "/projects" },
  { label: "Services", href: "/services" },
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Contact", href: "/contact" },
];

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
          isScrolled
            ? "shadow-[var(--shadow-lg)]"
            : "bg-transparent"
        )}
        style={isScrolled ? {
          background: "var(--bg-overlay)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--border-primary)",
        } : undefined}
      >
        <nav className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3 group" aria-label="Circuvent Technologies home">
              <div className="relative">
                <CircleDot
                  className="w-8 h-8 transition-transform duration-500 group-hover:rotate-180"
                  style={{ color: "var(--accent-cyan)" }}
                />
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "var(--accent-cyan)", opacity: 0 }}
                />
              </div>
              <span className="text-xl font-bold tracking-tight">
                <span style={{ color: "var(--text-primary)" }}>Circu</span>
                <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                  vent
                </span>
              </span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative px-4 py-2 text-sm font-medium transition-colors duration-300 rounded-lg",
                      isActive
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: "var(--accent-cyan-muted)",
                          border: "1px solid var(--border-primary)",
                        }}
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30,
                        }}
                      />
                    )}
                    <span className="relative z-10">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Right side: Search + Theme Toggle + CTA */}
            <div className="hidden md:flex items-center gap-3">
              <CommandPalette />
              <ThemeToggle />
              <Link
                href="/projects"
                className="relative px-5 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 hover:shadow-[var(--shadow-glow-cyan)]"
                style={{
                  background: "var(--accent-cyan-muted)",
                  border: "1px solid var(--border-accent)",
                  color: "var(--text-primary)",
                }}
              >
                View Work
              </Link>
            </div>

            {/* Mobile: Theme Toggle + Menu */}
            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="p-2 rounded-lg transition-colors cursor-pointer"
                style={{ color: "var(--text-tertiary)" }}
                aria-label="Toggle menu"
              >
                {isMobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </nav>
      </motion.header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 pt-24 px-6 md:hidden"
            style={{
              background: "var(--bg-overlay)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
            }}
          >
            <div className="flex flex-col gap-2">
              {navItems.map((item, i) => (
                <motion.div
                  key={item.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={cn(
                      "block px-4 py-4 text-2xl font-semibold rounded-xl transition-all duration-300",
                      pathname === item.href
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    )}
                    style={
                      pathname === item.href
                        ? { background: "var(--accent-cyan-muted)" }
                        : undefined
                    }
                  >
                    {item.label}
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
