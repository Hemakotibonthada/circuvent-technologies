"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// ANIMATED LOGO WALL - Matrix-style logo display
// ============================================================================

interface LogoWallItem {
  name: string;
  icon: string;
  color: string;
  category: string;
}

interface AnimatedLogoWallProps {
  items: LogoWallItem[];
  className?: string;
  rows?: number;
  speed?: number;
}

export function AnimatedLogoWall({
  items,
  className = "",
  rows = 4,
  speed = 30,
}: AnimatedLogoWallProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<LogoWallItem | null>(null);
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

  const rowItems = useMemo(() => {
    const result: LogoWallItem[][] = [];
    const itemsPerRow = Math.ceil(items.length / rows);
    for (let i = 0; i < rows; i++) {
      const rowData = [...items.slice(i * itemsPerRow, (i + 1) * itemsPerRow)];
      while (rowData.length < itemsPerRow) {
        rowData.push(...items.slice(0, itemsPerRow - rowData.length));
      }
      result.push([...rowData, ...rowData, ...rowData]);
    }
    return result;
  }, [items, rows]);

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`}>
      <div className="absolute left-0 top-0 bottom-0 w-32 z-10" style={{ background: "linear-gradient(to right, var(--bg-primary), transparent)" }} />
      <div className="absolute right-0 top-0 bottom-0 w-32 z-10" style={{ background: "linear-gradient(to left, var(--bg-primary), transparent)" }} />

      <div className="space-y-3">
        {rowItems.map((row, ri) => (
          <motion.div
            key={ri}
            className="flex gap-3"
            animate={{
              x: ri % 2 === 0 ? [0, -items.length * 120] : [-items.length * 120, 0],
            }}
            transition={{
              x: {
                duration: items.length * (80 / speed) + ri * 5,
                repeat: Infinity,
                ease: "linear",
              },
            }}
          >
            {row.map((item, ii) => (
              <motion.div
                key={`${item.name}-${ri}-${ii}`}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                style={{
                  background: hoveredItem === item ? `${item.color}15` : "var(--bg-glass)",
                  border: `1px solid ${hoveredItem === item ? item.color + "30" : "var(--border-primary)"}`,
                  transition: "all 0.2s",
                }}
                onMouseEnter={() => setHoveredItem(item)}
                onMouseLeave={() => setHoveredItem(null)}
                whileHover={{ scale: 1.08, y: -3 }}
                initial={{ opacity: 0 }}
                animate={isVisible ? { opacity: 1 } : {}}
                transition={{ delay: ii * 0.02 }}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-xs font-medium" style={{ color: hoveredItem === item ? item.color : "var(--text-secondary)" }}>
                  {item.name}
                </span>
              </motion.div>
            ))}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED METRICS GRID - Detailed metrics with animated bars
// ============================================================================

interface MetricItemData {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  icon: string;
  description: string;
  trend: "up" | "down" | "stable";
  trendValue: string;
}

interface AnimatedMetricsGridProps {
  metrics: MetricItemData[];
  className?: string;
}

export function AnimatedMetricsGrid({
  metrics,
  className = "",
}: AnimatedMetricsGridProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
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

  return (
    <div ref={ref} className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {metrics.map((metric, i) => {
        const percent = (metric.value / metric.max) * 100;
        const isExpanded = expandedIndex === i;

        return (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.08 }}
            className="group relative overflow-hidden rounded-2xl p-5 cursor-pointer"
            style={{
              background: "var(--bg-glass)",
              border: `1px solid ${isExpanded ? metric.color + "40" : "var(--border-primary)"}`,
              backdropFilter: "blur(12px)",
            }}
            onClick={() => setExpandedIndex(isExpanded ? null : i)}
            whileHover={{ y: -2 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">{metric.icon}</span>
                <div>
                  <h4 className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                    {metric.label}
                  </h4>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {metric.description}
                  </p>
                </div>
              </div>
              <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                metric.trend === "up" ? "bg-emerald-500/10 text-emerald-500" :
                metric.trend === "down" ? "bg-red-500/10 text-red-500" :
                "bg-gray-500/10 text-gray-500"
              }`}>
                {metric.trend === "up" ? "↑" : metric.trend === "down" ? "↓" : "—"} {metric.trendValue}
              </div>
            </div>

            <div className="flex items-baseline gap-1 mb-3">
              <span className="text-2xl font-bold" style={{ color: metric.color }}>
                {metric.value}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                / {metric.max} {metric.unit}
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--border-primary)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${metric.color}, ${metric.color}aa)` }}
                initial={{ width: 0 }}
                animate={isVisible ? { width: `${percent}%` } : {}}
                transition={{ duration: 1.2, delay: i * 0.1, ease: "easeOut" }}
              />
            </div>

            {/* Percentage */}
            <div className="flex justify-between mt-2">
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Progress</span>
              <span className="text-[10px] font-mono" style={{ color: metric.color }}>
                {percent.toFixed(1)}%
              </span>
            </div>

            {/* Expanded details */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="pt-3 mt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                    <div className="grid grid-cols-3 gap-2">
                      {Array.from({ length: 12 }).map((_, mi) => {
                        const barVal = Math.random() * 100;
                        return (
                          <div key={mi} className="flex flex-col items-center gap-1">
                            <div className="w-full h-12 rounded-sm relative overflow-hidden" style={{ background: "var(--border-primary)" }}>
                              <motion.div
                                className="absolute bottom-0 left-0 right-0 rounded-sm"
                                style={{ background: metric.color }}
                                initial={{ height: 0 }}
                                animate={{ height: `${barVal}%` }}
                                transition={{ delay: mi * 0.05 }}
                              />
                            </div>
                            <span className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                              {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mi]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// ============================================================================
// INTERACTIVE SHOWCASE CAROUSEL
// ============================================================================

interface ShowcaseSlide {
  title: string;
  description: string;
  image?: string;
  gradient: string;
  icon: string;
  stats: Array<{ label: string; value: string }>;
  tags: string[];
  link?: string;
}

interface ShowcaseCarouselProps {
  slides: ShowcaseSlide[];
  className?: string;
  autoPlay?: boolean;
  interval?: number;
}

export function ShowcaseCarousel({
  slides,
  className = "",
  autoPlay = true,
  interval = 5000,
}: ShowcaseCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (!autoPlay || isPaused) return;
    const timer = setInterval(() => {
      setDirection(1);
      setCurrent((prev) => (prev + 1) % slides.length);
    }, interval);
    return () => clearInterval(timer);
  }, [autoPlay, interval, isPaused, slides.length]);

  const goTo = (index: number) => {
    setDirection(index > current ? 1 : -1);
    setCurrent(index);
  };

  const next = () => {
    setDirection(1);
    setCurrent((prev) => (prev + 1) % slides.length);
  };

  const prev = () => {
    setDirection(-1);
    setCurrent((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const slide = slides[current];

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl ${className}`}
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
        backdropFilter: "blur(24px)",
      }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={current}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="p-8 sm:p-12"
        >
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{slide.icon}</span>
                <div className="flex gap-2">
                  {slide.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{
                        background: "var(--accent-cyan-muted)",
                        color: "var(--accent-cyan)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <h3 className="text-3xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                {slide.title}
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
                {slide.description}
              </p>

              <div className="grid grid-cols-3 gap-4 mb-6">
                {slide.stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="text-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                      {stat.value}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`relative h-64 rounded-2xl bg-gradient-to-br ${slide.gradient} overflow-hidden`}>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-8xl opacity-20">{slide.icon}</span>
              </div>
              {/* Floating elements animation */}
              {Array.from({ length: 8 }).map((_, fi) => (
                <motion.div
                  key={fi}
                  className="absolute w-2 h-2 rounded-full bg-white/20"
                  animate={{
                    x: [0, Math.random() * 100 - 50],
                    y: [0, Math.random() * 100 - 50],
                    opacity: [0.2, 0.5, 0.2],
                  }}
                  transition={{
                    duration: 3 + Math.random() * 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: fi * 0.3,
                  }}
                  style={{
                    left: `${Math.random() * 80 + 10}%`,
                    top: `${Math.random() * 80 + 10}%`,
                  }}
                />
              ))}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-2 pb-6">
        {slides.map((_, i) => (
          <motion.button
            key={i}
            onClick={() => goTo(i)}
            aria-label={`Show slide ${i + 1} of ${slides.length}`}
            aria-current={current === i}
            className="rounded-full transition-all"
            style={{
              width: current === i ? 24 : 8,
              height: 8,
              background: current === i ? "var(--accent-cyan)" : "var(--border-primary)",
            }}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            layout
          />
        ))}
      </div>

      {/* Arrows */}
      <motion.button
        onClick={prev}
        className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <span style={{ color: "var(--text-primary)" }}>←</span>
      </motion.button>
      <motion.button
        onClick={next}
        className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
        style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <span style={{ color: "var(--text-primary)" }}>→</span>
      </motion.button>
    </div>
  );
}

// ============================================================================
// ANIMATED ARCHITECTURE DIAGRAM
// ============================================================================

interface ArchNode {
  id: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  group?: string;
  description?: string;
}

interface ArchConnection {
  from: string;
  to: string;
  label?: string;
  color?: string;
  animated?: boolean;
  dashed?: boolean;
}

interface ArchitectureDiagramProps {
  nodes: ArchNode[];
  connections: ArchConnection[];
  width?: number;
  height?: number;
  className?: string;
  title?: string;
}

export function ArchitectureDiagram({
  nodes,
  connections,
  width = 800,
  height = 500,
  className = "",
  title,
}: ArchitectureDiagramProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<ArchNode | null>(null);
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);
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

  const getNodeCenter = (id: string): { x: number; y: number } | null => {
    const node = nodes.find((n) => n.id === id);
    if (!node) return null;
    return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  };

  const isConnectedToHovered = (nodeId: string): boolean => {
    if (!hoveredNode) return false;
    return connections.some(
      (c) =>
        (c.from === hoveredNode.id && c.to === nodeId) ||
        (c.to === hoveredNode.id && c.from === nodeId)
    );
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      {title && (
        <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
      )}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
          backdropFilter: "blur(12px)",
        }}
      >
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ minHeight: 400 }}>
          <defs>
            {/* Animated dash pattern */}
            <pattern id="flow-pattern" patternUnits="userSpaceOnUse" width="20" height="1">
              <rect width="10" height="1" fill="currentColor" opacity="0.5">
                <animate attributeName="x" from="0" to="20" dur="1s" repeatCount="indefinite" />
              </rect>
            </pattern>
            {/* Glow filter */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Connections */}
          {connections.map((conn, i) => {
            const from = getNodeCenter(conn.from);
            const to = getNodeCenter(conn.to);
            if (!from || !to) return null;

            const isHighlighted =
              hoveredNode && (conn.from === hoveredNode.id || conn.to === hoveredNode.id);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2 - 30;

            return (
              <g key={`conn-${i}`}>
                <motion.path
                  d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={conn.color || "var(--border-primary)"}
                  strokeWidth={isHighlighted ? 2.5 : 1.5}
                  strokeDasharray={conn.dashed ? "6 4" : "none"}
                  opacity={hoveredNode ? (isHighlighted ? 0.8 : 0.15) : 0.3}
                  initial={{ pathLength: 0 }}
                  animate={isVisible ? { pathLength: 1 } : {}}
                  transition={{ duration: 1, delay: i * 0.1 }}
                />

                {/* Animated flow dot */}
                {conn.animated && isVisible && (
                  <circle r="3" fill={conn.color || "#06b6d4"} opacity="0.6">
                    <animateMotion
                      dur={`${2 + i * 0.3}s`}
                      repeatCount="indefinite"
                      path={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`}
                    />
                  </circle>
                )}

                {/* Connection label */}
                {conn.label && (
                  <text
                    x={midX}
                    y={midY - 5}
                    textAnchor="middle"
                    fontSize="9"
                    fill="var(--text-muted)"
                    opacity={isHighlighted ? 1 : 0.4}
                  >
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const isHovered = hoveredNode?.id === node.id;
            const isConnected = isConnectedToHovered(node.id);
            const dimmed = hoveredNode && !isHovered && !isConnected;

            return (
              <motion.g
                key={node.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={isVisible ? { opacity: dimmed ? 0.3 : 1, scale: 1 } : {}}
                transition={{ delay: i * 0.08, type: "spring" }}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setSelectedNode(node)}
                className="cursor-pointer"
              >
                {/* Shadow/glow */}
                {isHovered && (
                  <rect
                    x={node.x - 4}
                    y={node.y - 4}
                    width={node.width + 8}
                    height={node.height + 8}
                    rx="14"
                    fill={`${node.color}15`}
                    filter="url(#glow)"
                  />
                )}

                {/* Node background */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx="10"
                  fill="var(--bg-surface)"
                  stroke={isHovered ? node.color : "var(--border-primary)"}
                  strokeWidth={isHovered ? 2 : 1}
                />

                {/* Top gradient bar */}
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height="3"
                  rx="10"
                  fill={node.color}
                  opacity={isHovered ? 1 : 0.5}
                />

                {/* Icon */}
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 - 6}
                  textAnchor="middle"
                  fontSize="18"
                >
                  {node.icon}
                </text>

                {/* Label */}
                <text
                  x={node.x + node.width / 2}
                  y={node.y + node.height / 2 + 14}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={isHovered ? node.color : "var(--text-primary)"}
                >
                  {node.label}
                </text>
              </motion.g>
            );
          })}
        </svg>

        {/* Selected node detail */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-4 left-4 right-4 p-4 rounded-xl"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedNode.icon}</span>
                  <div>
                    <h4 className="text-sm font-bold" style={{ color: selectedNode.color }}>
                      {selectedNode.label}
                    </h4>
                    {selectedNode.description && (
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        {selectedNode.description}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedNode(null); }}
                  className="text-xs p-1 rounded hover:bg-white/5"
                  style={{ color: "var(--text-muted)" }}
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// SKILL TREE - RPG-style skill progression
// ============================================================================

interface SkillNode {
  id: string;
  name: string;
  icon: string;
  level: number;
  maxLevel: number;
  color: string;
  x: number;
  y: number;
  prerequisites: string[];
  description: string;
  unlocked: boolean;
}

interface SkillTreeProps {
  skills: SkillNode[];
  className?: string;
  title?: string;
}

export function SkillTree({
  skills,
  className = "",
  title,
}: SkillTreeProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillNode | null>(null);
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

  return (
    <div ref={ref} className={className}>
      {title && (
        <h3 className="text-lg font-bold mb-6" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
      )}
      <div className="relative" style={{ minHeight: 500 }}>
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
          {/* Draw prerequisite connections */}
          {skills.map((skill) =>
            skill.prerequisites.map((prereqId) => {
              const prereq = skills.find((s) => s.id === prereqId);
              if (!prereq) return null;
              return (
                <motion.line
                  key={`${prereqId}-${skill.id}`}
                  x1={`${prereq.x}%`}
                  y1={`${prereq.y}%`}
                  x2={`${skill.x}%`}
                  y2={`${skill.y}%`}
                  stroke={skill.unlocked ? skill.color : "var(--border-primary)"}
                  strokeWidth="2"
                  strokeDasharray={skill.unlocked ? "none" : "4 4"}
                  opacity={skill.unlocked ? 0.4 : 0.15}
                  initial={{ pathLength: 0 }}
                  animate={isVisible ? { pathLength: 1 } : {}}
                  transition={{ duration: 0.8 }}
                />
              );
            })
          )}
        </svg>

        {/* Skill nodes */}
        {skills.map((skill, i) => (
          <motion.div
            key={skill.id}
            className="absolute cursor-pointer"
            style={{
              left: `${skill.x}%`,
              top: `${skill.y}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 1,
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={isVisible ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: i * 0.08, type: "spring" }}
            onClick={() => setSelectedSkill(skill)}
            whileHover={{ scale: 1.15 }}
          >
            <div
              className={`relative w-16 h-16 rounded-xl flex items-center justify-center ${
                skill.unlocked ? "" : "opacity-40 grayscale"
              }`}
              style={{
                background: skill.unlocked ? `${skill.color}15` : "var(--bg-surface)",
                border: `2px solid ${skill.unlocked ? skill.color : "var(--border-primary)"}`,
                boxShadow: skill.unlocked ? `0 0 15px ${skill.color}20` : "none",
              }}
            >
              <span className="text-2xl">{skill.icon}</span>

              {/* Level indicator */}
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full text-[8px] font-bold"
                style={{
                  background: skill.unlocked ? skill.color : "var(--bg-surface)",
                  color: skill.unlocked ? "white" : "var(--text-muted)",
                  border: "1px solid var(--border-primary)",
                }}
              >
                Lv.{skill.level}
              </div>
            </div>

            <p className="text-[9px] font-medium text-center mt-2 whitespace-nowrap" style={{
              color: skill.unlocked ? skill.color : "var(--text-muted)",
            }}>
              {skill.name}
            </p>
          </motion.div>
        ))}

        {/* Selected skill detail */}
        <AnimatePresence>
          {selectedSkill && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-80 p-4 rounded-xl z-10"
              style={{
                background: "var(--bg-elevated)",
                border: `1px solid ${selectedSkill.color}40`,
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{selectedSkill.icon}</span>
                <div>
                  <h4 className="text-sm font-bold" style={{ color: selectedSkill.color }}>
                    {selectedSkill.name}
                  </h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                      Level {selectedSkill.level}/{selectedSkill.maxLevel}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full" style={{ background: "var(--border-primary)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: selectedSkill.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(selectedSkill.level / selectedSkill.maxLevel) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {selectedSkill.description}
              </p>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedSkill(null); }}
                className="absolute top-2 right-2 text-xs p-1 rounded hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED FEATURE SHOWCASE WITH TABS
// ============================================================================

interface FeatureShowcaseTab {
  id: string;
  title: string;
  icon: string;
  description: string;
  features: Array<{
    title: string;
    description: string;
    icon: string;
  }>;
  codeSnippet?: string;
  stats?: Array<{ label: string; value: string }>;
  color: string;
}

interface FeatureShowcaseProps {
  tabs: FeatureShowcaseTab[];
  className?: string;
}

export function FeatureShowcase({
  tabs,
  className = "",
}: FeatureShowcaseProps) {
  const [activeTab, setActiveTab] = useState(0);
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

  const currentTab = tabs[activeTab];

  return (
    <div ref={ref} className={className}>
      {/* Tab navigation */}
      <div className="flex overflow-x-auto gap-2 mb-8 pb-2">
        {tabs.map((tab, i) => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(i)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap text-sm font-medium transition-all ${
              activeTab === i ? "shadow-lg" : ""
            }`}
            style={{
              background: activeTab === i ? `${tab.color}15` : "var(--bg-surface)",
              border: `1px solid ${activeTab === i ? tab.color + "40" : "var(--border-primary)"}`,
              color: activeTab === i ? tab.color : "var(--text-muted)",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.05 }}
          >
            <span>{tab.icon}</span>
            {tab.title}
          </motion.button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="grid lg:grid-cols-2 gap-8"
        >
          {/* Left - info */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{currentTab.icon}</span>
              <h3 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {currentTab.title}
              </h3>
            </div>

            <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-tertiary)" }}>
              {currentTab.description}
            </p>

            {/* Feature list */}
            <div className="space-y-3">
              {currentTab.features.map((feature, fi) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: fi * 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <span className="text-lg shrink-0">{feature.icon}</span>
                  <div>
                    <h4 className="text-xs font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
                      {feature.title}
                    </h4>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Stats */}
            {currentTab.stats && (
              <div className="flex gap-6 mt-6">
                {currentTab.stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="text-2xl font-bold" style={{ color: currentTab.color }}>
                      {stat.value}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right - visual */}
          <div className="rounded-2xl overflow-hidden" style={{
            background: "#1e1e2e",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div className="flex items-center gap-2 px-4 py-2.5" style={{
              background: "rgba(0,0,0,0.3)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
              </div>
              <span className="text-[10px] font-mono text-[#6c7086]">{currentTab.id}.ts</span>
            </div>
            <div className="p-4">
              {currentTab.codeSnippet ? (
                <pre className="text-xs text-[#a6adc8] font-mono overflow-auto" style={{ lineHeight: 1.6 }}>
                  {currentTab.codeSnippet}
                </pre>
              ) : (
                <div className="h-64 flex items-center justify-center">
                  <div className={`relative w-48 h-48 rounded-full`} style={{ background: `${currentTab.color}10` }}>
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ border: `2px solid ${currentTab.color}30` }}
                      animate={{ rotate: 360 }}
                      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    />
                    <motion.div
                      className="absolute inset-4 rounded-full"
                      style={{ border: `2px dashed ${currentTab.color}20` }}
                      animate={{ rotate: -360 }}
                      transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-5xl">{currentTab.icon}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED NOTIFICATION FEED
// ============================================================================

interface NotificationItem {
  id: string;
  type: "deploy" | "commit" | "alert" | "success" | "review" | "build";
  title: string;
  message: string;
  time: string;
  avatar?: string;
  color: string;
}

interface NotificationFeedProps {
  notifications: NotificationItem[];
  className?: string;
  maxVisible?: number;
  autoScroll?: boolean;
}

export function NotificationFeed({
  notifications,
  className = "",
  maxVisible = 6,
  autoScroll = true,
}: NotificationFeedProps) {
  const [visibleNotifs, setVisibleNotifs] = useState<NotificationItem[]>([]);
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

  useEffect(() => {
    if (!isVisible) return;

    // Gradually add notifications
    let index = 0;
    const interval = setInterval(() => {
      if (index < notifications.length) {
        setVisibleNotifs((prev) => {
          const next = [notifications[index], ...prev];
          return next.slice(0, maxVisible);
        });
        index++;
      } else if (autoScroll) {
        index = 0;
      } else {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isVisible, notifications, maxVisible, autoScroll]);

  const typeIcons: Record<string, string> = {
    deploy: "🚀",
    commit: "📝",
    alert: "⚠️",
    success: "✅",
    review: "👀",
    build: "🔨",
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Live Activity Feed
        </h4>
      </div>

      <div className="space-y-2 overflow-hidden" style={{ maxHeight: maxVisible * 64 }}>
        <AnimatePresence>
          {visibleNotifs.map((notif) => (
            <motion.div
              key={notif.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: "auto" }}
              exit={{ opacity: 0, x: 20, height: 0 }}
              className="flex items-start gap-3 p-3 rounded-xl"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div className="shrink-0 text-lg">
                {typeIcons[notif.type] || "📌"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h5 className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {notif.title}
                  </h5>
                  <span className="text-[9px] shrink-0" style={{ color: "var(--text-muted)" }}>
                    {notif.time}
                  </span>
                </div>
                <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                  {notif.message}
                </p>
              </div>
              <div className="w-1 h-8 rounded-full shrink-0" style={{ background: notif.color }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default AnimatedLogoWall;
