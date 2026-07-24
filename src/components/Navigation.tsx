"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu, X, ArrowRight, ChevronDown, Sparkles,
  Brain, Cpu, Globe, Shield, Code2, Layers,
  Terminal, GitBranch, Users, Briefcase, Mail, Newspaper, Info,
  Command as CommandIcon,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";
import CommandPalette from "./CommandPalette";
import CartButton from "./shop/CartButton";
import NavProfile from "./NavProfile";

// ============================================================================
// NAV ITEMS WITH MEGA MENU DATA
// ============================================================================

interface NavSubItem {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
}

interface NavItem {
  label: string;
  href: string;
  newTab?: boolean;
  children?: NavSubItem[];
  featured?: { title: string; description: string; href: string; gradient: string; icon: string };
}

const navItems: NavItem[] = [
  { label: "Home", href: "/" },
  {
    label: "Projects",
    href: "/projects",
    children: [
      { label: "All Projects", href: "/projects", description: "Browse 53+ open-source projects", icon: <Layers className="w-4 h-4" /> },
      { label: "Case Studies", href: "/case-studies", description: "In-depth project breakdowns", icon: <Code2 className="w-4 h-4" /> },
      { label: "Open Source", href: "/open-source", description: "MIT-licensed GitHub repos", icon: <GitBranch className="w-4 h-4" />, badge: "53+" },
      { label: "Architecture", href: "/architecture", description: "System design & patterns", icon: <Terminal className="w-4 h-4" /> },
    ],
    featured: {
      title: "NEXUS AI OS",
      description: "13-agent local-first AI operating system",
      href: "/projects/nexus-ai-os",
      gradient: "from-violet-600 to-purple-700",
      icon: "🧠",
    },
  },
  {
    label: "Domains",
    href: "/domains",
    children: [
      { label: "AI & Agents", href: "/domains/ai", description: "Multi-agent LLM systems", icon: <Brain className="w-4 h-4" />, badge: "8" },
      { label: "IoT & Edge", href: "/domains/iot", description: "ESP32 sensor networks", icon: <Cpu className="w-4 h-4" />, badge: "9" },
      { label: "Full-Stack", href: "/domains/education", description: "React, Next.js, Flutter", icon: <Globe className="w-4 h-4" />, badge: "13" },
      { label: "FinTech", href: "/domains/fintech", description: "Trading & analytics", icon: <Shield className="w-4 h-4" />, badge: "4" },
    ],
    featured: {
      title: "SmartHome IoT",
      description: "9 ESP32 sensors, MQTT, Flutter dashboard",
      href: "/projects/smarthome-ecosystem",
      gradient: "from-cyan-600 to-teal-700",
      icon: "🏠",
    },
  },
  { label: "Shop", href: "/shop", newTab: true },
  { label: "Services", href: "/services" },
  {
    label: "We",
    href: "/about",
    children: [
      { label: "About", href: "/about", description: "Our story & mission", icon: <Info className="w-4 h-4" /> },
      { label: "Team", href: "/team", description: "Meet the people behind Circuvent", icon: <Users className="w-4 h-4" /> },
      { label: "Careers", href: "/careers", description: "Open roles — build with us", icon: <Briefcase className="w-4 h-4" /> },
      { label: "Blog", href: "/blog", description: "Engineering notes & updates", icon: <Newspaper className="w-4 h-4" /> },
      { label: "Contact", href: "/contact", description: "Talk to us", icon: <Mail className="w-4 h-4" /> },
    ],
    featured: {
      title: "Join our team",
      description: "We're hiring across AI, IoT & full-stack engineering.",
      href: "/careers",
      gradient: "from-emerald-600 to-teal-700",
      icon: "🚀",
    },
  },
];

// ============================================================================
// NAVIGATION COMPONENT
// ============================================================================

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up");
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const pathname = usePathname();
  const lastScrollY = useRef(0);
  const navRef = useRef<HTMLElement>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Scroll handling with direction detection
  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;
      setIsScrolled(currentY > 20);
      setScrollDirection(currentY > lastScrollY.current && currentY > 100 ? "down" : "up");
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileOpen(false);
    setActiveDropdown(null);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lock body scroll when mobile menu open
  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isMobileOpen]);

  const handleDropdownEnter = useCallback((label: string) => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    setActiveDropdown(label);
  }, []);

  const handleDropdownLeave = useCallback(() => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 150);
  }, []);

  // Check if current path matches nav item or its children
  const isActive = (item: NavItem): boolean => {
    if (pathname === item.href) return true;
    if (item.children?.some((child) => pathname === child.href)) return true;
    return false;
  };

  return (
    <>
      {/* Navigation bar */}
      <motion.header
        ref={navRef}
        initial={{ y: -100, opacity: 0 }}
        animate={{
          y: scrollDirection === "down" && isScrolled ? -100 : 0,
          opacity: scrollDirection === "down" && isScrolled ? 0 : 1,
        }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="fixed top-0 left-0 right-0 z-50"
      >
        {/* Glassmorphism background */}
        <motion.div
          className="absolute inset-0 transition-all duration-500"
          animate={{
            opacity: isScrolled ? 1 : 0,
          }}
          style={{
            background: "var(--bg-overlay)",
            backdropFilter: "blur(24px) saturate(1.6)",
            WebkitBackdropFilter: "blur(24px) saturate(1.6)",
            borderBottom: "1px solid var(--border-primary)",
            boxShadow: isScrolled ? "var(--nav-shadow), inset 0 -1px 0 0 rgba(255,255,255,0.03)" : "none",
          }}
        />

        {/* Animated gradient border at bottom */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 h-[1px]"
          animate={{ opacity: isScrolled ? 1 : 0.3 }}
        >
          <div className="h-full bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
        </motion.div>

        <nav className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px]">
            {/* ============ LOGO ============ */}
            <Link href="/" className="flex items-center gap-2.5 group relative" aria-label="Circuvent Technologies home">
              <motion.div
                className="relative"
                whileHover={{ rotate: 12, scale: 1.05 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <Image
                  src="/logo-mark.png"
                  alt="Circuvent Technologies logo"
                  width={34}
                  height={34}
                  priority
                />
                {/* Logo glow on hover */}
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--accent-cyan)", filter: "blur(12px)" }}
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileHover={{ opacity: 0.3, scale: 1.5 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.div>
              <motion.span
                className="text-lg font-bold tracking-tight"
                whileHover={{ x: 2 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <span style={{ color: "var(--text-primary)" }}>Circu</span>
                <span className="bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                  vent
                </span>
              </motion.span>

              {/* Animated status dot */}
              <motion.div
                className="absolute -top-0.5 -right-3 w-2 h-2 rounded-full bg-emerald-400"
                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </Link>

            {/* ============ DESKTOP NAV ============ */}
            <div className="hidden lg:flex items-center gap-0.5">
              {navItems.map((item) => {
                const active = isActive(item);
                const hasChildren = item.children && item.children.length > 0;
                const isOpen = activeDropdown === item.label;

                return (
                  <div
                    key={item.href}
                    className="relative"
                    onMouseEnter={() => hasChildren && handleDropdownEnter(item.label)}
                    onMouseLeave={() => hasChildren && handleDropdownLeave()}
                  >
                    <Link
                      href={item.href}
                      target={item.newTab ? "_blank" : undefined}
                      rel={item.newTab ? "noopener noreferrer" : undefined}
                      className={cn(
                        "relative flex items-center gap-1 px-4 py-2 text-[13px] font-medium transition-all duration-300 rounded-xl group",
                        active
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      )}
                      onMouseEnter={() => setHoveredItem(item.label)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      {/* Active indicator - animated pill */}
                      {active && (
                        <motion.div
                          layoutId="activeNavPill"
                          className="absolute inset-0 rounded-xl"
                          style={{
                            background: "var(--accent-cyan-muted)",
                            border: "1px solid var(--border-accent)",
                          }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}

                      {/* Hover glow */}
                      {hoveredItem === item.label && !active && (
                        <motion.div
                          layoutId="hoverNavGlow"
                          className="absolute inset-0 rounded-xl"
                          style={{
                            background: "var(--bg-surface-hover)",
                            border: "1px solid var(--border-primary)",
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}

                      <span className="relative z-10">{item.label}</span>

                      {/* Dropdown chevron */}
                      {hasChildren && (
                        <motion.span
                          className="relative z-10"
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                        </motion.span>
                      )}

                      {/* Active dot indicator */}
                      {active && (
                        <motion.div
                          className="absolute -bottom-1 left-1/2 w-1 h-1 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400"
                          style={{ translateX: "-50%" }}
                          layoutId="activeDot"
                        />
                      )}
                    </Link>

                    {/* ============ MEGA DROPDOWN ============ */}
                    <AnimatePresence>
                      {hasChildren && isOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 8, scale: 0.96 }}
                          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          className="absolute top-full left-1/2 pt-3"
                          style={{ transform: "translateX(-50%)" }}
                          onMouseEnter={() => handleDropdownEnter(item.label)}
                          onMouseLeave={handleDropdownLeave}
                        >
                          <div
                            className="relative rounded-2xl overflow-hidden min-w-[480px]"
                            style={{
                              background: "var(--bg-elevated)",
                              border: "1px solid var(--border-primary)",
                              boxShadow: "0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px var(--border-primary)",
                              backdropFilter: "blur(24px)",
                            }}
                          >
                            {/* Top gradient accent */}
                            <div className="h-[2px] bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500" />

                            <div className="flex">
                              {/* Links area */}
                              <div className="flex-1 p-3">
                                <div className="grid gap-0.5">
                                  {item.children?.map((child, ci) => (
                                    <motion.div
                                      key={child.href}
                                      initial={{ opacity: 0, x: -10 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: ci * 0.05 }}
                                    >
                                      <Link
                                        href={child.href}
                                        className="group/item flex items-start gap-3 p-3 rounded-xl transition-all duration-200"
                                        style={{ background: "transparent" }}
                                        onMouseEnter={(e) => {
                                          (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hover)";
                                        }}
                                        onMouseLeave={(e) => {
                                          (e.currentTarget as HTMLElement).style.background = "transparent";
                                        }}
                                        onClick={() => setActiveDropdown(null)}
                                      >
                                        <div
                                          className="p-2 rounded-lg shrink-0 transition-all duration-200 group-hover/item:scale-110"
                                          style={{
                                            background: "var(--accent-cyan-muted)",
                                            color: "var(--accent-cyan)",
                                          }}
                                        >
                                          {child.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                                              {child.label}
                                            </span>
                                            {child.badge && (
                                              <span
                                                className="px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                                                style={{
                                                  background: "var(--accent-cyan-muted)",
                                                  color: "var(--accent-cyan)",
                                                }}
                                              >
                                                {child.badge}
                                              </span>
                                            )}
                                            <ArrowRight
                                              className="w-3 h-3 opacity-0 -translate-x-2 group-hover/item:opacity-100 group-hover/item:translate-x-0 transition-all duration-200 ml-auto shrink-0"
                                              style={{ color: "var(--accent-cyan)" }}
                                            />
                                          </div>
                                          <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: "var(--text-muted)" }}>
                                            {child.description}
                                          </p>
                                        </div>
                                      </Link>
                                    </motion.div>
                                  ))}
                                </div>
                              </div>

                              {/* Featured card */}
                              {item.featured && (
                                <div className="w-48 p-3 pl-0">
                                  <Link
                                    href={item.featured.href}
                                    onClick={() => setActiveDropdown(null)}
                                    className="block h-full"
                                  >
                                    <motion.div
                                      className={`relative h-full rounded-xl overflow-hidden p-4 bg-gradient-to-br ${item.featured.gradient}`}
                                      whileHover={{ scale: 1.02 }}
                                      transition={{ type: "spring", stiffness: 300 }}
                                    >
                                      <span className="text-3xl opacity-40 absolute bottom-2 right-2">
                                        {item.featured.icon}
                                      </span>
                                      <div className="relative z-10">
                                        <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">
                                          Featured
                                        </span>
                                        <h4 className="text-sm font-bold text-white mt-1">
                                          {item.featured.title}
                                        </h4>
                                        <p className="text-[10px] text-white/60 mt-1 leading-relaxed">
                                          {item.featured.description}
                                        </p>
                                        <div className="flex items-center gap-1 mt-3 text-[10px] font-medium text-white/80">
                                          Explore <ArrowRight className="w-3 h-3" />
                                        </div>
                                      </div>
                                    </motion.div>
                                  </Link>
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {/* ============ RIGHT SIDE ============ */}
            <div className="hidden lg:flex items-center gap-2">
              {/* Keyboard shortcut hint */}
              <CommandPalette />
              <ThemeToggle />
              <CartButton />

              {/* Profile menu when signed in, else the View Work CTA */}
              <NavProfile />
            </div>

            {/* ============ MOBILE BUTTONS ============ */}
            <div className="flex lg:hidden items-center gap-2">
              <CartButton />
              <ThemeToggle />
              <motion.button
                onClick={() => setIsMobileOpen(!isMobileOpen)}
                className="relative p-2.5 rounded-xl"
                style={{
                  background: isMobileOpen ? "var(--accent-cyan-muted)" : "transparent",
                  border: `1px solid ${isMobileOpen ? "var(--border-accent)" : "transparent"}`,
                  color: "var(--text-primary)",
                }}
                whileTap={{ scale: 0.9 }}
                aria-label="Toggle menu"
              >
                <AnimatePresence mode="wait">
                  {isMobileOpen ? (
                    <motion.div
                      key="close"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <X className="w-5 h-5" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="menu"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Menu className="w-5 h-5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </nav>
      </motion.header>

      {/* ============ MOBILE FULLSCREEN MENU ============ */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-40 lg:hidden"
          >
            {/* Backdrop */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: "var(--bg-primary)",
                opacity: 0.98,
              }}
              onClick={() => setIsMobileOpen(false)}
            />

            {/* Content */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto"
              style={{
                background: "var(--bg-primary)",
                borderLeft: "1px solid var(--border-primary)",
              }}
            >
              <div className="pt-20 pb-8 px-6">
                {/* Nav items */}
                <div className="space-y-1">
                  {navItems.map((item, i) => (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, x: 30 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06, type: "spring", stiffness: 300, damping: 25 }}
                    >
                      <Link
                        href={item.href}
                        target={item.newTab ? "_blank" : undefined}
                        rel={item.newTab ? "noopener noreferrer" : undefined}
                        onClick={() => setIsMobileOpen(false)}
                        className={cn(
                          "flex items-center justify-between px-4 py-4 rounded-xl text-lg font-semibold transition-all duration-300",
                          pathname === item.href
                            ? "text-[var(--text-primary)]"
                            : "text-[var(--text-muted)]"
                        )}
                        style={pathname === item.href ? {
                          background: "var(--accent-cyan-muted)",
                          border: "1px solid var(--border-accent)",
                        } : undefined}
                      >
                        <span>{item.label}</span>
                        {pathname === item.href && (
                          <div className="w-2 h-2 rounded-full bg-gradient-to-r from-cyan-400 to-violet-400" />
                        )}
                      </Link>

                      {/* Mobile sub-items */}
                      {item.children && pathname?.startsWith(item.href) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          className="pl-4 space-y-0.5 overflow-hidden"
                        >
                          {item.children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setIsMobileOpen(false)}
                              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm"
                              style={{ color: pathname === child.href ? "var(--accent-cyan)" : "var(--text-muted)" }}
                            >
                              <div className="p-1.5 rounded-md" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                                {child.icon}
                              </div>
                              {child.label}
                              {child.badge && (
                                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-md font-bold" style={{ background: "var(--accent-cyan-muted)", color: "var(--accent-cyan)" }}>
                                  {child.badge}
                                </span>
                              )}
                            </Link>
                          ))}
                        </motion.div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Mobile CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-8 space-y-3"
                >
                  <Link
                    href="/projects"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                  >
                    <Sparkles className="w-4 h-4" />
                    Explore Portfolio
                    <ArrowRight className="w-4 h-4" />
                  </Link>

                  <Link
                    href="/contact"
                    onClick={() => setIsMobileOpen(false)}
                    className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-sm font-semibold"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
                  >
                    Get in Touch
                  </Link>
                </motion.div>

                {/* Mobile quick stats */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-8 flex justify-center gap-6"
                >
                  {[
                    { value: "53+", label: "Projects" },
                    { value: "15+", label: "Tech" },
                    { value: "40K+", label: "LoC" },
                  ].map((stat) => (
                    <div key={stat.label} className="text-center">
                      <div className="text-lg font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                        {stat.value}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </motion.div>

                {/* Keyboard shortcut */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-8 flex items-center justify-center gap-2 text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <CommandIcon className="w-3 h-3" />
                  <span>Press <kbd className="px-1.5 py-0.5 rounded" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}>⌘ K</kbd> for quick search</span>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
