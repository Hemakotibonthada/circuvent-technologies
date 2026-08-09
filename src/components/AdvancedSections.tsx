"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, useScroll } from "framer-motion";
import {
  ArrowRight, Brain, Cpu, Globe, Shield, Code2, Layers, Zap,
  Terminal, Rocket, Heart, Eye, Lock, Sparkles, TrendingUp,
  Box, Wifi, Database, Cloud, GitBranch, Star, Users,
  Check, X, ChevronDown, MessageSquare, Mail, Calendar,
  Clock, Award, Target, Lightbulb, Puzzle, Gem, Crown,
  Flame, Compass, Map, Anchor, Feather, Wind, Sun, Moon,
} from "lucide-react";

// ============================================================================
// BENTO GRID - Advanced layout component
// ============================================================================

interface BentoItem {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  gradient?: string;
  span?: "1x1" | "1x2" | "2x1" | "2x2";
  content?: React.ReactNode;
  stats?: Array<{ label: string; value: string }>;
  className?: string;
  href?: string;
}

interface BentoGridProps {
  items: BentoItem[];
  className?: string;
  columns?: 2 | 3 | 4;
}

export function BentoGrid({
  items,
  className = "",
  columns = 4,
}: BentoGridProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const getSpanClass = (span: string = "1x1") => {
    switch (span) {
      case "1x2": return "md:col-span-1 md:row-span-2";
      case "2x1": return "md:col-span-2 md:row-span-1";
      case "2x2": return "md:col-span-2 md:row-span-2";
      default: return "col-span-1 row-span-1";
    }
  };

  const colClass = columns === 2 ? "md:grid-cols-2" : columns === 3 ? "md:grid-cols-3" : "md:grid-cols-4";

  return (
    <div
      ref={ref}
      className={`grid grid-cols-1 ${colClass} gap-4 auto-rows-[180px] ${className}`}
    >
      {items.map((item, i) => (
        <motion.div
          key={i}
          className={`group relative overflow-hidden rounded-2xl p-5 transition-all duration-500 ${getSpanClass(item.span)} ${item.className || ""}`}
          style={{
            background: "var(--bg-glass)",
            border: `1px solid ${hoveredIndex === i ? "var(--border-accent)" : "var(--border-primary)"}`,
            backdropFilter: "blur(12px)",
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: i * 0.08 }}
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
          whileHover={{ y: -2 }}
        >
          {/* Gradient overlay */}
          <div className={`absolute inset-0 bg-gradient-to-br ${item.gradient || "from-cyan-500/5 to-transparent"} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

          {/* Spotlight */}
          {hoveredIndex === i && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
            </div>
          )}

          <div className="relative z-10 h-full flex flex-col">
            {/* Icon */}
            {item.icon && (
              <motion.div
                className={`inline-flex p-2.5 rounded-xl mb-3 w-fit bg-gradient-to-br ${item.gradient || "from-cyan-500/10 to-violet-500/10"}`}
                whileHover={{ rotate: 10, scale: 1.1 }}
              >
                {item.icon}
              </motion.div>
            )}

            {/* Title */}
            <h3 className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {item.title}
            </h3>

            {/* Description */}
            {item.description && (
              <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--text-muted)" }}>
                {item.description}
              </p>
            )}

            {/* Stats */}
            {item.stats && (
              <div className="flex gap-4 mt-auto pt-3">
                {item.stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="text-lg font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                      {stat.value}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Custom content */}
            {item.content && (
              <div className="mt-auto">{item.content}</div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// SCROLLING LOGOS / CLIENT SHOWCASE
// ============================================================================

interface LogoItem {
  name: string;
  icon: string;
  color?: string;
}

interface InfiniteLogosProps {
  logos: LogoItem[];
  speed?: number;
  direction?: "left" | "right";
  className?: string;
  variant?: "default" | "bordered" | "glass";
}

export function InfiniteLogos({
  logos,
  speed = 30,
  direction = "left",
  className = "",
  variant = "default",
}: InfiniteLogosProps) {
  const doubled = [...logos, ...logos, ...logos];

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Fade edges */}
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10" style={{
        background: "linear-gradient(to right, var(--bg-primary), transparent)",
      }} />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10" style={{
        background: "linear-gradient(to left, var(--bg-primary), transparent)",
      }} />

      <motion.div
        className="flex gap-6 items-center"
        animate={{
          x: direction === "left" ? [0, -logos.length * 140] : [-logos.length * 140, 0],
        }}
        transition={{
          x: {
            duration: logos.length * (60 / speed),
            repeat: Infinity,
            ease: "linear",
          },
        }}
      >
        {doubled.map((logo, i) => (
          <motion.div
            key={`${logo.name}-${i}`}
            className="flex items-center gap-2 px-5 py-3 rounded-xl whitespace-nowrap shrink-0"
            style={{
              background: variant === "glass" ? "var(--bg-glass)" : variant === "bordered" ? "transparent" : "var(--bg-surface)",
              border: `1px solid ${variant === "bordered" ? "var(--border-primary)" : "transparent"}`,
              backdropFilter: variant === "glass" ? "blur(12px)" : "none",
            }}
            whileHover={{ scale: 1.05, y: -2 }}
          >
            <span className="text-xl">{logo.icon}</span>
            <span className="text-sm font-medium" style={{ color: logo.color || "var(--text-secondary)" }}>
              {logo.name}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ============================================================================
// PARALLAX HERO SECTION
// ============================================================================

interface ParallaxLayerData {
  content: React.ReactNode;
  speed: number;
  opacity?: number;
  zIndex?: number;
}

interface ParallaxHeroProps {
  layers: ParallaxLayerData[];
  height?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ParallaxHero({
  layers,
  height = "100vh",
  className = "",
  children,
}: ParallaxHeroProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={{ height }}>
      {layers.map((layer, i) => {
        const y = useTransform(scrollYProgress, [0, 1], [0, layer.speed * 100]);
        return (
          <motion.div
            key={i}
            className="absolute inset-0"
            style={{
              y,
              opacity: layer.opacity ?? 1,
              zIndex: layer.zIndex ?? i,
            }}
          >
            {layer.content}
          </motion.div>
        );
      })}
      {children && (
        <div className="relative z-20">{children}</div>
      )}
    </div>
  );
}

// ============================================================================
// ANIMATED TIMELINE - Horizontal version
// ============================================================================

interface TimelineEvent {
  date: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  tags?: string[];
  image?: string;
}

interface HorizontalTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

export function HorizontalTimeline({
  events,
  className = "",
}: HorizontalTimelineProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {/* Timeline bar */}
      <div className="relative mb-12">
        <div className="overflow-x-auto pb-4" ref={scrollRef}>
          <div className="flex items-center min-w-max px-8">
            {events.map((event, i) => (
              <div key={i} className="flex items-center">
                {/* Node */}
                <motion.button
                  onClick={() => setActiveIndex(i)}
                  className="relative flex flex-col items-center group"
                  initial={{ opacity: 0, y: 20 }}
                  animate={isVisible ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.1 }}
                >
                  {/* Dot */}
                  <motion.div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all ${
                      activeIndex === i ? "ring-4 ring-offset-2 scale-110" : ""
                    }`}
                    style={{
                      backgroundColor: activeIndex === i ? event.color : "var(--bg-surface)",
                      border: `2px solid ${event.color}`,
                    }}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {event.icon}
                  </motion.div>

                  {/* Date */}
                  <span className="text-[10px] font-mono mt-2 whitespace-nowrap" style={{
                    color: activeIndex === i ? event.color : "var(--text-muted)",
                  }}>
                    {event.date}
                  </span>
                </motion.button>

                {/* Connector */}
                {i < events.length - 1 && (
                  <div className="w-24 h-0.5 mx-2 relative">
                    <div className="absolute inset-0" style={{ background: "var(--border-primary)" }} />
                    <motion.div
                      className="absolute inset-y-0 left-0"
                      style={{ background: events[i].color }}
                      initial={{ width: 0 }}
                      animate={isVisible && i < activeIndex ? { width: "100%" } : { width: 0 }}
                      transition={{ delay: i * 0.15, duration: 0.5 }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active event content */}
      <AnimatePresence mode="wait">
        {events[activeIndex] && (
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="text-3xl p-3 rounded-xl shrink-0"
                style={{ background: `${events[activeIndex].color}15` }}
              >
                {events[activeIndex].icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {events[activeIndex].title}
                  </h3>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full" style={{
                    background: `${events[activeIndex].color}15`,
                    color: events[activeIndex].color,
                  }}>
                    {events[activeIndex].date}
                  </span>
                </div>
                <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
                  {events[activeIndex].description}
                </p>
                {events[activeIndex].tags && (
                  <div className="flex flex-wrap gap-2">
                    {events[activeIndex].tags?.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                        style={{
                          background: "var(--accent-cyan-muted)",
                          color: "var(--accent-cyan-text)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 mt-6">
        <motion.button
          onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          className="p-2 rounded-xl transition-colors disabled:opacity-30"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowRight className="w-4 h-4 rotate-180" style={{ color: "var(--text-primary)" }} />
        </motion.button>
        <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
          {activeIndex + 1} / {events.length}
        </span>
        <motion.button
          onClick={() => setActiveIndex(Math.min(events.length - 1, activeIndex + 1))}
          disabled={activeIndex === events.length - 1}
          className="p-2 rounded-xl transition-colors disabled:opacity-30"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-primary)" }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <ArrowRight className="w-4 h-4" style={{ color: "var(--text-primary)" }} />
        </motion.button>
      </div>
    </div>
  );
}

// ============================================================================
// METRICS DASHBOARD
// ============================================================================

interface MetricsDashboardProps {
  className?: string;
}

export function MetricsDashboard({ className = "" }: MetricsDashboardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const metrics = useMemo(() => [
    { label: "Total Projects", value: "53+", change: 12, icon: <Layers className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />, sparkline: [20, 25, 30, 28, 35, 42, 45, 48, 50, 52, 53] },
    { label: "Lines of Code", value: "200K+", change: 8, icon: <Code2 className="w-4 h-4" style={{ color: "var(--accent-violet)" }} />, sparkline: [50, 70, 90, 100, 120, 140, 160, 170, 185, 195, 200] },
    { label: "GitHub Stars", value: "1.2K", change: 15, icon: <Star className="w-4 h-4" style={{ color: "#fbbf24" }} />, sparkline: [100, 200, 350, 450, 600, 700, 800, 900, 1000, 1100, 1200] },
    { label: "Uptime", value: "99.5%", change: 0.2, icon: <TrendingUp className="w-4 h-4 text-emerald-500" />, sparkline: [99.1, 99.2, 99.3, 99.4, 99.5, 99.3, 99.5, 99.4, 99.5, 99.5, 99.5] },
    { label: "Active Users", value: "5K+", change: 25, icon: <Users className="w-4 h-4 text-pink-500" />, sparkline: [500, 800, 1200, 1800, 2200, 2800, 3200, 3800, 4200, 4700, 5000] },
    { label: "API Calls", value: "1.5M", change: 18, icon: <Globe className="w-4 h-4 text-blue-500" />, sparkline: [200, 400, 600, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500] },
    { label: "AI Agents", value: "13+", change: 3, icon: <Brain className="w-4 h-4" style={{ color: "var(--accent-violet)" }} />, sparkline: [3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13] },
    { label: "Tech Stacks", value: "15+", change: 5, icon: <Database className="w-4 h-4 text-amber-500" />, sparkline: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
  ], []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.08 }}
            className="group relative overflow-hidden rounded-xl p-4"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
                {metric.label}
              </span>
              <div className="p-1 rounded-md" style={{ background: "var(--accent-cyan-muted)" }}>
                {metric.icon}
              </div>
            </div>
            <div className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {metric.value}
            </div>
            <div className={`text-[10px] flex items-center gap-1 ${metric.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
              <TrendingUp className="w-3 h-3" />
              +{metric.change}%
            </div>

            {/* Mini sparkline */}
            <div className="mt-3 h-8 flex items-end gap-[2px]">
              {metric.sparkline.map((val, si) => {
                const max = Math.max(...metric.sparkline);
                const height = (val / max) * 100;
                return (
                  <motion.div
                    key={si}
                    className="flex-1 rounded-t-sm"
                    style={{
                      background: si === metric.sparkline.length - 1 ? "var(--accent-cyan)" : "var(--accent-cyan-muted)",
                    }}
                    initial={{ height: 0 }}
                    animate={isVisible ? { height: `${height}%` } : {}}
                    transition={{ delay: i * 0.08 + si * 0.02, duration: 0.3 }}
                  />
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED TECH STACK GRID
// ============================================================================

interface TechStackItem {
  name: string;
  icon: string;
  category: string;
  proficiency: number;
  color: string;
  description?: string;
}

interface TechStackGridProps {
  items: TechStackItem[];
  className?: string;
}

export function TechStackGrid({
  items,
  className = "",
}: TechStackGridProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [hoveredItem, setHoveredItem] = useState<TechStackItem | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const cats = new Set(items.map((i) => i.category));
    return ["all", ...Array.from(cats)];
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.category === filter);
  }, [items, filter]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        {categories.map((cat) => (
          <motion.button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all ${
              filter === cat
                ? "bg-gradient-to-r from-cyan-500 to-violet-500 text-white"
                : "text-current hover:bg-white/5"
            }`}
            style={filter !== cat ? { color: "var(--text-muted)", background: "var(--bg-surface)", border: "1px solid var(--border-primary)" } : {}}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Grid */}
      <motion.div layout className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
        <AnimatePresence>
          {filtered.map((item, i) => (
            <motion.div
              key={item.name}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={isVisible ? { opacity: 1, scale: 1 } : {}}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: i * 0.03, type: "spring" }}
              className="group relative flex flex-col items-center gap-2 p-3 rounded-xl cursor-pointer transition-all"
              style={{
                background: hoveredItem === item ? `${item.color}10` : "var(--bg-glass)",
                border: `1px solid ${hoveredItem === item ? item.color + "40" : "var(--border-primary)"}`,
              }}
              onMouseEnter={() => setHoveredItem(item)}
              onMouseLeave={() => setHoveredItem(null)}
              whileHover={{ y: -4, scale: 1.05 }}
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-[10px] font-medium text-center" style={{ color: hoveredItem === item ? item.color : "var(--text-secondary)" }}>
                {item.name}
              </span>

              {/* Proficiency bar */}
              <div className="w-full h-1 rounded-full mt-1" style={{ background: "var(--border-primary)" }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: item.color }}
                  initial={{ width: 0 }}
                  animate={isVisible ? { width: `${item.proficiency}%` } : {}}
                  transition={{ delay: i * 0.03 + 0.3, duration: 0.5 }}
                />
              </div>

              {/* Tooltip */}
              {hoveredItem === item && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -top-10 z-20 px-2 py-1 rounded-md text-[10px] font-medium whitespace-nowrap"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-primary)",
                    color: item.color,
                  }}
                >
                  {item.proficiency}% proficiency
                </motion.div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// ============================================================================
// TESTIMONIAL MASONRY
// ============================================================================

interface TestimonialItem {
  name: string;
  role: string;
  company: string;
  avatar: string;
  content: string;
  rating: number;
  featured?: boolean;
}

interface TestimonialMasonryProps {
  testimonials: TestimonialItem[];
  className?: string;
  columns?: 2 | 3;
}

export function TestimonialMasonry({
  testimonials,
  className = "",
  columns = 3,
}: TestimonialMasonryProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  // Distribute items into columns
  const columnData = useMemo(() => {
    const cols: TestimonialItem[][] = Array.from({ length: columns }, () => []);
    testimonials.forEach((item, i) => {
      cols[i % columns].push(item);
    });
    return cols;
  }, [testimonials, columns]);

  const colClass = columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";

  return (
    <div ref={ref} className={`grid ${colClass} gap-4 ${className}`}>
      {columnData.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-4">
          {col.map((item, ri) => (
            <motion.div
              key={`${item.name}-${ri}`}
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: (ci * col.length + ri) * 0.08 }}
              className={`group relative overflow-hidden rounded-2xl p-5 transition-all duration-300 ${
                item.featured ? "ring-1 ring-cyan-500/20" : ""
              }`}
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                backdropFilter: "blur(12px)",
              }}
              whileHover={{ y: -2 }}
            >
              {item.featured && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-500 to-violet-500" />
              )}

              {/* Stars */}
              <div className="flex gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, si) => (
                  <Star
                    key={si}
                    className={`w-3.5 h-3.5 ${si < item.rating ? "text-amber-400 fill-amber-400" : "text-gray-600"}`}
                  />
                ))}
              </div>

              {/* Content */}
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                &ldquo;{item.content}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                  style={{ background: "var(--accent-cyan-muted)" }}
                >
                  {item.avatar}
                </div>
                <div>
                  <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {item.name}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {item.role} at {item.company}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// ANIMATED COUNTER SECTION
// ============================================================================

interface CounterItem {
  value: number;
  suffix?: string;
  prefix?: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  gradient: string;
}

interface AnimatedCounterSectionProps {
  counters: CounterItem[];
  className?: string;
  variant?: "cards" | "inline" | "stacked";
}

export function AnimatedCounterSection({
  counters,
  className = "",
  variant = "cards",
}: AnimatedCounterSectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [displayValues, setDisplayValues] = useState<number[]>(counters.map(() => 0));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const duration = 2000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplayValues(counters.map((c) => Math.round(c.value * eased)));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isVisible, counters]);

  return (
    <div ref={ref} className={`grid grid-cols-2 md:grid-cols-4 gap-3 ${className}`}>
      {counters.map((counter, i) => (
        <motion.div
          key={counter.label}
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: i * 0.1 }}
          className="group relative overflow-hidden rounded-2xl p-5 text-center"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            backdropFilter: "blur(12px)",
          }}
        >
          <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${counter.gradient} opacity-50`} />

          <motion.div
            className="inline-flex p-2.5 rounded-xl mb-3"
            style={{ background: "var(--accent-cyan-muted)" }}
            whileHover={{ rotate: 360, scale: 1.1 }}
            transition={{ duration: 0.5 }}
          >
            {counter.icon}
          </motion.div>

          <div className={`text-3xl font-bold bg-gradient-to-r ${counter.gradient} bg-clip-text text-transparent`}>
            {counter.prefix || ""}{displayValues[i]}{counter.suffix || ""}
          </div>

          <p className="text-xs font-semibold mt-1" style={{ color: "var(--text-primary)" }}>
            {counter.label}
          </p>

          {counter.description && (
            <p className="text-[10px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
              {counter.description}
            </p>
          )}
        </motion.div>
      ))}
    </div>
  );
}

export default BentoGrid;
