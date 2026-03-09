"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  ArrowRight,
  FileText,
  Code2,
  Briefcase,
  Brain,
  Home,
  HeartPulse,
  Eye,
  Zap,
  Building2,
  Globe,
  TrendingUp,
  GraduationCap,
  BarChart3,
  Shield,
  Layers,
  Mail,
  Activity,
  Clock,
  Users,
  Share2,
  Rocket,
  Landmark,
  Map,
  Cpu,
  BookOpen,
  Hash,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  Command,
} from "lucide-react";
import { projects } from "@/lib/projects-data";
import { blogPosts } from "@/lib/blog-data";
import { domains } from "@/lib/domains-data";
import { careerRoles } from "@/lib/services-data";

// ============================================================
// TYPES
// ============================================================

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: "page" | "project" | "blog" | "domain" | "career";
  href: string;
  icon: React.ElementType;
  tags?: string[];
  gradient?: string;
}

// ============================================================
// SEARCH INDEX
// ============================================================

const staticPages: SearchResult[] = [
  { id: "home", title: "Home", description: "Engineering What's Next — AI, IoT, Full-Stack", category: "page", href: "/", icon: Home },
  { id: "projects", title: "Projects", description: "53+ projects across AI, IoT, FinTech, HealthTech, Enterprise", category: "page", href: "/projects", icon: Layers },
  { id: "services", title: "Services", description: "AI solutions, IoT, web, mobile, enterprise platforms, DevOps", category: "page", href: "/services", icon: Briefcase },
  { id: "blog", title: "Blog", description: "Engineering insights, architecture decisions, and tutorials", category: "page", href: "/blog", icon: BookOpen },
  { id: "about", title: "About", description: "Our story — from an ESP32 to 53+ projects", category: "page", href: "/about", icon: Users },
  { id: "team", title: "Team", description: "Meet the engineers behind Circuvent Technologies", category: "page", href: "/team", icon: Users },
  { id: "contact", title: "Contact", description: "Get in touch — project inquiries, partnerships, careers", category: "page", href: "/contact", icon: Mail },
  { id: "careers", title: "Careers", description: "Join the mission — open engineering positions", category: "page", href: "/careers", icon: Briefcase },
  { id: "open-source", title: "Open Source", description: "53+ open source repositories on GitHub", category: "page", href: "/open-source", icon: Globe },
  { id: "stack", title: "Tech Stack", description: "40+ technologies mastered across 6 domains", category: "page", href: "/stack", icon: Code2 },
  { id: "architecture", title: "Architecture", description: "Patterns, comparisons, and engineering decisions", category: "page", href: "/architecture", icon: Layers },
  { id: "case-studies", title: "Case Studies", description: "Deep dive into NEXUS AI OS, SmartHome, CancerGuard", category: "page", href: "/case-studies", icon: FileText },
  { id: "roadmap", title: "Roadmap", description: "Our journey from 2023 to 2026 and beyond", category: "page", href: "/roadmap", icon: Rocket },
  { id: "docs", title: "Docs", description: "Developer documentation, API reference, deployment guide", category: "page", href: "/docs", icon: BookOpen },
  { id: "domains", title: "Domains", description: "6 technology domains — AI, IoT, FinTech, HealthTech, Enterprise, Education", category: "page", href: "/domains", icon: Globe },
  { id: "privacy", title: "Privacy Policy", description: "How we collect, use, and protect your information", category: "page", href: "/privacy", icon: Shield },
];

const projectIconMap: Record<string, React.ElementType> = {
  Brain, Home, HeartPulse, Eye, Zap, Building2, Globe,
  TrendingUp, GraduationCap, BarChart3, Shield, Layers,
  Mail, Activity, Clock, FileText, Users, Share2, Rocket,
  Landmark, Map, Cpu,
};

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [...staticPages];

  // Add projects
  for (const project of projects) {
    results.push({
      id: `project-${project.id}`,
      title: project.name,
      description: project.tagline,
      category: "project",
      href: `/projects/${project.id}`,
      icon: projectIconMap[project.icon] || Brain,
      tags: project.techStack,
      gradient: project.gradient,
    });
  }

  // Add blog posts
  for (const post of blogPosts) {
    results.push({
      id: `blog-${post.slug}`,
      title: post.title,
      description: post.excerpt.slice(0, 120) + "...",
      category: "blog",
      href: `/blog/${post.slug}`,
      icon: BookOpen,
      tags: post.tags,
    });
  }

  // Add domains
  for (const domain of domains) {
    results.push({
      id: `domain-${domain.slug}`,
      title: domain.name,
      description: domain.tagline,
      category: "domain",
      href: `/domains/${domain.slug}`,
      icon: Globe,
    });
  }

  // Add careers
  for (const role of careerRoles) {
    results.push({
      id: `career-${role.id}`,
      title: role.title,
      description: `${role.department} — ${role.location}`,
      category: "career",
      href: `/careers/${role.id}`,
      icon: Briefcase,
    });
  }

  return results;
}

// ============================================================
// SEARCH FUNCTION
// ============================================================

function searchItems(query: string, items: SearchResult[]): SearchResult[] {
  if (!query.trim()) return [];

  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);

  const scored = items.map((item) => {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const descLower = item.description.toLowerCase();
    const tagsLower = (item.tags || []).map((t) => t.toLowerCase());

    // Exact title match
    if (titleLower === q) score += 100;
    // Title starts with query
    else if (titleLower.startsWith(q)) score += 80;
    // Title contains query
    else if (titleLower.includes(q)) score += 60;

    // Each word match
    for (const word of words) {
      if (titleLower.includes(word)) score += 20;
      if (descLower.includes(word)) score += 10;
      if (tagsLower.some((t) => t.includes(word))) score += 15;
    }

    // Category boost
    if (item.category === "page") score += 5;
    if (item.category === "project") score += 3;

    return { item, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((s) => s.item);
}

// ============================================================
// CATEGORY LABELS
// ============================================================

const categoryLabels: Record<string, string> = {
  page: "Pages",
  project: "Projects",
  blog: "Blog",
  domain: "Domains",
  career: "Careers",
};

const categoryColors: Record<string, string> = {
  page: "var(--accent-cyan)",
  project: "var(--accent-violet)",
  blog: "var(--accent-pink)",
  domain: "var(--text-tertiary)",
  career: "rgb(16, 185, 129)",
};

// ============================================================
// COMPONENT
// ============================================================

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const searchIndex = useMemo(() => buildSearchIndex(), []);
  const results = useMemo(() => searchItems(query, searchIndex), [query, searchIndex]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    for (const result of results) {
      if (!groups[result.category]) groups[result.category] = [];
      groups[result.category].push(result);
    }
    return groups;
  }, [results]);

  // Flat list for keyboard navigation
  const flatResults = useMemo(() => {
    const flat: SearchResult[] = [];
    for (const category of ["page", "project", "blog", "domain", "career"]) {
      if (grouped[category]) flat.push(...grouped[category]);
    }
    return flat;
  }, [grouped]);

  // Show recent/popular when query is empty
  const showDefault = query.trim() === "" && isOpen;
  const defaultItems = useMemo(
    () => staticPages.slice(0, 6),
    []
  );

  const displayItems = showDefault ? defaultItems : flatResults;

  // ============================================================
  // KEYBOARD SHORTCUTS
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        return;
      }

      // Forward slash to open (when not in input)
      if (e.key === "/" && !isOpen && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setIsOpen(true);
        return;
      }

      // Escape to close
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation within results
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
      scrollToSelected();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      scrollToSelected();
    } else if (e.key === "Enter" && displayItems[selectedIndex]) {
      e.preventDefault();
      navigateTo(displayItems[selectedIndex].href);
    }
  };

  const scrollToSelected = () => {
    setTimeout(() => {
      const selected = listRef.current?.querySelector("[data-selected='true']");
      selected?.scrollIntoView({ block: "nearest" });
    }, 0);
  };

  const navigateTo = useCallback(
    (href: string) => {
      setIsOpen(false);
      router.push(href);
    },
    [router]
  );

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <>
      {/* Search Trigger Button (in nav) */}
      <button
        onClick={() => setIsOpen(true)}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all cursor-pointer hover:bg-[var(--accent-cyan-muted)]"
        style={{
          border: "1px solid var(--border-primary)",
          color: "var(--text-muted)",
        }}
        aria-label="Search (Cmd+K)"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="text-xs">Search</span>
        <kbd
          className="hidden lg:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono rounded"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-primary)",
            color: "var(--text-muted)",
          }}
        >
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      {/* Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[200]">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0"
              style={{
                background: "var(--bg-overlay)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
              onClick={() => setIsOpen(false)}
            />

            {/* Search Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-full max-w-2xl mx-auto mt-[15vh]"
            >
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-hover)",
                  boxShadow: "0 25px 50px rgba(0, 0, 0, 0.3)",
                }}
              >
                {/* Search Input */}
                <div
                  className="flex items-center gap-3 px-5 py-4"
                  style={{ borderBottom: "1px solid var(--border-primary)" }}
                >
                  <Search className="w-5 h-5 shrink-0" style={{ color: "var(--text-muted)" }} />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Search projects, blog posts, pages..."
                    className="flex-1 bg-transparent text-base outline-none placeholder:text-[var(--text-muted)]"
                    style={{ color: "var(--text-primary)" }}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  {query && (
                    <button
                      onClick={() => setQuery("")}
                      className="p-1 rounded-md cursor-pointer hover:bg-[var(--accent-cyan-muted)]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <kbd
                    className="hidden sm:flex items-center px-2 py-1 text-[10px] font-mono rounded"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-muted)",
                    }}
                  >
                    ESC
                  </kbd>
                </div>

                {/* Results */}
                <div
                  ref={listRef}
                  className="max-h-[50vh] overflow-y-auto py-2"
                  style={{ scrollbarWidth: "thin" }}
                >
                  {showDefault && (
                    <>
                      <div
                        className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Quick Links
                      </div>
                      {defaultItems.map((item, i) => (
                        <ResultItem
                          key={item.id}
                          item={item}
                          isSelected={selectedIndex === i}
                          onSelect={() => navigateTo(item.href)}
                          onHover={() => setSelectedIndex(i)}
                        />
                      ))}
                    </>
                  )}

                  {!showDefault && displayItems.length > 0 && (
                    <>
                      {Object.entries(grouped).map(([category, items]) => (
                        <div key={category}>
                          <div
                            className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: categoryColors[category] || "var(--text-muted)" }}
                          >
                            {categoryLabels[category] || category}
                          </div>
                          {items.map((item) => {
                            const flatIndex = flatResults.indexOf(item);
                            return (
                              <ResultItem
                                key={item.id}
                                item={item}
                                isSelected={selectedIndex === flatIndex}
                                onSelect={() => navigateTo(item.href)}
                                onHover={() => setSelectedIndex(flatIndex)}
                                query={query}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </>
                  )}

                  {!showDefault && query.trim() !== "" && displayItems.length === 0 && (
                    <div className="py-12 text-center">
                      <Search
                        className="w-8 h-8 mx-auto mb-3 opacity-20"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        No results for &ldquo;{query}&rdquo;
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Try searching for a project name, technology, or page
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderTop: "1px solid var(--border-primary)" }}
                >
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <ArrowUp className="w-3 h-3" />
                      <ArrowDown className="w-3 h-3" />
                      Navigate
                    </span>
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      <CornerDownLeft className="w-3 h-3" />
                      Open
                    </span>
                    <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      ESC Close
                    </span>
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {displayItems.length} results
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================
// RESULT ITEM COMPONENT
// ============================================================

function ResultItem({
  item,
  isSelected,
  onSelect,
  onHover,
  query,
}: {
  item: SearchResult;
  isSelected: boolean;
  onSelect: () => void;
  onHover: () => void;
  query?: string;
}) {
  const Icon = item.icon;

  // Highlight matching text
  const highlightMatch = (text: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span key={i} className="text-[var(--accent-cyan)] font-semibold">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <button
      data-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={onHover}
      className="flex items-center gap-3 w-full px-4 py-3 text-left cursor-pointer transition-colors"
      style={{
        background: isSelected ? "var(--accent-cyan-muted)" : "transparent",
      }}
    >
      <div
        className="p-2 rounded-lg shrink-0"
        style={{
          background: isSelected ? "var(--bg-surface)" : "var(--accent-cyan-muted)",
          border: "1px solid var(--border-primary)",
        }}
      >
        <Icon
          className="w-4 h-4"
          style={{ color: isSelected ? "var(--accent-cyan)" : "var(--text-muted)" }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--text-primary)" }}
        >
          {highlightMatch(item.title)}
        </p>
        <p
          className="text-xs truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {item.description}
        </p>
      </div>

      {/* Tags preview */}
      {item.tags && item.tags.length > 0 && (
        <div className="hidden sm:flex items-center gap-1 shrink-0">
          {item.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[9px] rounded"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border-primary)",
                color: "var(--text-muted)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <ArrowRight
        className="w-3.5 h-3.5 shrink-0 opacity-0 transition-opacity"
        style={{
          color: "var(--text-muted)",
          opacity: isSelected ? 1 : 0,
        }}
      />
    </button>
  );
}
