"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ============================================================================
// KANBAN BOARD
// ============================================================================

interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  tags?: string[];
  dueDate?: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
}

interface KanbanBoardProps {
  columns: KanbanColumn[];
  className?: string;
  title?: string;
}

const priorityColors = {
  low: { bg: "rgba(16, 185, 129, 0.1)", text: "#10b981", label: "Low" },
  medium: { bg: "rgba(245, 158, 11, 0.1)", text: "#f59e0b", label: "Med" },
  high: { bg: "rgba(239, 68, 68, 0.1)", text: "#ef4444", label: "High" },
  critical: { bg: "rgba(168, 85, 247, 0.1)", text: "#a855f7", label: "Crit" },
};

export function KanbanBoard({
  columns,
  className = "",
  title = "Project Board",
}: KanbanBoardProps) {
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

  return (
    <div ref={ref} className={className}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <div className="flex items-center gap-2">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {columns.reduce((sum, col) => sum + col.cards.length, 0)} tasks
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {columns.map((column, ci) => (
          <motion.div
            key={column.id}
            initial={{ opacity: 0, y: 20 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: ci * 0.1 }}
            className="rounded-xl p-3"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
            }}
          >
            {/* Column header */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: column.color }} />
                <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-primary)" }}>
                  {column.title}
                </h4>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
              }}>
                {column.cards.length}
              </span>
            </div>

            {/* Cards */}
            <div className="space-y-2">
              {column.cards.map((card, cardIdx) => (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: ci * 0.1 + cardIdx * 0.05 + 0.2 }}
                  className="rounded-lg p-3 cursor-pointer group hover:shadow-md transition-all"
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-primary)",
                  }}
                  whileHover={{ y: -2 }}
                >
                  {/* Priority + Tags */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span
                      className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                      style={{
                        background: priorityColors[card.priority].bg,
                        color: priorityColors[card.priority].text,
                      }}
                    >
                      {priorityColors[card.priority].label}
                    </span>
                    {card.tags?.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[8px]"
                        style={{
                          background: "var(--accent-cyan-muted)",
                          color: "var(--accent-cyan)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Title */}
                  <h5 className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    {card.title}
                  </h5>

                  {/* Description */}
                  {card.description && (
                    <p className="text-[10px] line-clamp-2 mb-2" style={{ color: "var(--text-muted)" }}>
                      {card.description}
                    </p>
                  )}

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    {card.assignee && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {card.assignee}
                      </span>
                    )}
                    {card.dueDate && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded" style={{
                        background: "var(--bg-surface-hover)",
                        color: "var(--text-muted)",
                      }}>
                        {card.dueDate}
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED CHANGELOG
// ============================================================================

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  type: "feature" | "fix" | "improvement" | "breaking";
  description: string;
  changes: Array<{ text: string; type: "added" | "fixed" | "changed" | "removed" }>;
}

interface ChangelogProps {
  entries: ChangelogEntry[];
  className?: string;
}

const changeTypeColors = {
  feature: { bg: "rgba(16, 185, 129, 0.1)", text: "#10b981", icon: "✨" },
  fix: { bg: "rgba(239, 68, 68, 0.1)", text: "#ef4444", icon: "🔧" },
  improvement: { bg: "rgba(59, 130, 246, 0.1)", text: "#3b82f6", icon: "📈" },
  breaking: { bg: "rgba(168, 85, 247, 0.1)", text: "#a855f7", icon: "⚠️" },
};

const changeItemIcons = {
  added: { icon: "+", color: "#10b981" },
  fixed: { icon: "~", color: "#f59e0b" },
  changed: { icon: "→", color: "#3b82f6" },
  removed: { icon: "-", color: "#ef4444" },
};

export function AnimatedChangelog({
  entries,
  className = "",
}: ChangelogProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
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

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Vertical line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5" style={{ background: "var(--border-primary)" }} />

      <div className="space-y-6">
        {entries.map((entry, i) => {
          const typeConfig = changeTypeColors[entry.type];
          const isExpanded = expandedIndex === i;

          return (
            <motion.div
              key={entry.version}
              initial={{ opacity: 0, x: -20 }}
              animate={isVisible ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.1 }}
              className="relative pl-14"
            >
              {/* Timeline dot */}
              <motion.div
                className="absolute left-4 w-5 h-5 rounded-full flex items-center justify-center text-[10px]"
                style={{
                  background: typeConfig.bg,
                  border: `2px solid ${typeConfig.text}`,
                }}
                whileHover={{ scale: 1.2 }}
              >
                {typeConfig.icon}
              </motion.div>

              {/* Content */}
              <div
                className="rounded-xl overflow-hidden cursor-pointer"
                style={{
                  background: "var(--bg-glass)",
                  border: `1px solid ${isExpanded ? typeConfig.text + "30" : "var(--border-primary)"}`,
                }}
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
              >
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xs font-mono font-bold" style={{ color: typeConfig.text }}>
                      v{entry.version}
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase"
                      style={{ background: typeConfig.bg, color: typeConfig.text }}
                    >
                      {entry.type}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {entry.date}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {entry.title}
                  </h4>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    {entry.description}
                  </p>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-1.5" style={{ borderTop: "1px solid var(--border-primary)" }}>
                        <div className="pt-3" />
                        {entry.changes.map((change, ci) => {
                          const itemConfig = changeItemIcons[change.type];
                          return (
                            <motion.div
                              key={ci}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: ci * 0.05 }}
                              className="flex items-start gap-2 text-xs"
                            >
                              <span
                                className="w-4 h-4 rounded flex items-center justify-center text-[10px] font-mono font-bold shrink-0 mt-0.5"
                                style={{ background: `${itemConfig.color}15`, color: itemConfig.color }}
                              >
                                {itemConfig.icon}
                              </span>
                              <span style={{ color: "var(--text-secondary)" }}>{change.text}</span>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED ROADMAP
// ============================================================================

interface RoadmapItem {
  quarter: string;
  title: string;
  description: string;
  status: "completed" | "in-progress" | "planned" | "future";
  features: string[];
  icon: string;
  color: string;
}

interface AnimatedRoadmapProps {
  items: RoadmapItem[];
  className?: string;
}

const statusConfig = {
  completed: { label: "Completed", color: "#10b981", icon: "✅" },
  "in-progress": { label: "In Progress", color: "#f59e0b", icon: "🔄" },
  planned: { label: "Planned", color: "#3b82f6", icon: "📋" },
  future: { label: "Future", color: "#8b5cf6", icon: "🔮" },
};

export function AnimatedRoadmap({
  items,
  className = "",
}: AnimatedRoadmapProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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
      <div className="space-y-6">
        {items.map((item, i) => {
          const status = statusConfig[item.status];
          const isHovered = hoveredIndex === i;

          return (
            <motion.div
              key={item.quarter}
              initial={{ opacity: 0, y: 20 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1 }}
              className="relative group"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="flex gap-6">
                {/* Left: Quarter label */}
                <div className="w-24 shrink-0 pt-4">
                  <div className="text-sm font-bold" style={{ color: item.color }}>
                    {item.quarter}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <span className="text-xs">{status.icon}</span>
                    <span className="text-[10px]" style={{ color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Progress line */}
                <div className="relative flex flex-col items-center pt-5">
                  <div
                    className="w-4 h-4 rounded-full z-10"
                    style={{
                      background: isHovered ? item.color : `${item.color}40`,
                      border: `2px solid ${item.color}`,
                      boxShadow: isHovered ? `0 0 12px ${item.color}40` : "none",
                      transition: "all 0.3s",
                    }}
                  />
                  {i < items.length - 1 && (
                    <div
                      className="w-0.5 flex-1 -mt-0.5"
                      style={{
                        background: item.status === "completed" ? item.color : "var(--border-primary)",
                      }}
                    />
                  )}
                </div>

                {/* Right: Content */}
                <div className="flex-1 pb-8">
                  <motion.div
                    className="rounded-xl p-5 transition-all"
                    style={{
                      background: isHovered ? `${item.color}05` : "var(--bg-glass)",
                      border: `1px solid ${isHovered ? item.color + "30" : "var(--border-primary)"}`,
                    }}
                    whileHover={{ x: 4 }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{item.icon}</span>
                      <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                        {item.title}
                      </h3>
                    </div>
                    <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>
                      {item.description}
                    </p>

                    {/* Features */}
                    <div className="flex flex-wrap gap-1.5">
                      {item.features.map((feature) => (
                        <motion.span
                          key={feature}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{
                            background: `${item.color}10`,
                            color: item.color,
                          }}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={isVisible ? { opacity: 1, scale: 1 } : {}}
                          transition={{ delay: i * 0.1 + 0.3 }}
                        >
                          {feature}
                        </motion.span>
                      ))}
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// ANIMATED TEAM GRID
// ============================================================================

interface TeamMember {
  name: string;
  role: string;
  avatar: string;
  bio: string;
  skills: string[];
  social?: { github?: string; twitter?: string; linkedin?: string };
  color: string;
}

interface AnimatedTeamGridProps {
  members: TeamMember[];
  className?: string;
}

export function AnimatedTeamGrid({
  members,
  className = "",
}: AnimatedTeamGridProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {members.map((member, i) => (
          <motion.div
            key={member.name}
            initial={{ opacity: 0, y: 20 }}
            animate={isVisible ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: i * 0.08, type: "spring" }}
            className="group relative overflow-hidden rounded-2xl p-5 text-center cursor-pointer"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              backdropFilter: "blur(12px)",
            }}
            onClick={() => setSelectedMember(member)}
            whileHover={{ y: -4 }}
          >
            <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity`} style={{ background: member.color }} />

            <motion.div
              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center text-3xl"
              style={{ background: `${member.color}15`, border: `2px solid ${member.color}30` }}
              whileHover={{ scale: 1.1, rotate: 10 }}
            >
              {member.avatar}
            </motion.div>

            <h4 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              {member.name}
            </h4>
            <p className="text-[10px] mt-0.5" style={{ color: member.color }}>
              {member.role}
            </p>

            <div className="flex flex-wrap gap-1 mt-3 justify-center">
              {member.skills.slice(0, 3).map((skill) => (
                <span
                  key={skill}
                  className="px-1.5 py-0.5 rounded text-[8px]"
                  style={{ background: "var(--bg-surface-hover)", color: "var(--text-muted)" }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedMember && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setSelectedMember(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="max-w-md w-full rounded-2xl p-6"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-3xl shrink-0"
                  style={{ background: `${selectedMember.color}15`, border: `2px solid ${selectedMember.color}30` }}
                >
                  {selectedMember.avatar}
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                    {selectedMember.name}
                  </h3>
                  <p className="text-sm" style={{ color: selectedMember.color }}>
                    {selectedMember.role}
                  </p>
                </div>
              </div>

              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-tertiary)" }}>
                {selectedMember.bio}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {selectedMember.skills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                    style={{ background: `${selectedMember.color}10`, color: selectedMember.color }}
                  >
                    {skill}
                  </span>
                ))}
              </div>

              <button
                onClick={() => setSelectedMember(null)}
                className="w-full py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
                style={{ border: "1px solid var(--border-primary)", color: "var(--text-primary)" }}
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// ANIMATED STATS CARD ROW
// ============================================================================

interface StatsCardData {
  icon: string;
  value: string;
  label: string;
  description: string;
  change: number;
  color: string;
  gradient: string;
}

interface AnimatedStatsRowProps {
  stats: StatsCardData[];
  className?: string;
}

export function AnimatedStatsRow({
  stats,
  className = "",
}: AnimatedStatsRowProps) {
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

  return (
    <div ref={ref} className={`grid grid-cols-2 md:grid-cols-4 gap-4 ${className}`}>
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={isVisible ? { opacity: 1, y: 0, scale: 1 } : {}}
          transition={{ delay: i * 0.1, type: "spring" }}
          className="group relative overflow-hidden rounded-2xl p-5"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            backdropFilter: "blur(12px)",
          }}
          whileHover={{ y: -4 }}
        >
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${stat.gradient} opacity-60`} />
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{stat.icon}</span>
              <div className={`flex items-center gap-0.5 text-[10px] font-medium ${stat.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {stat.change >= 0 ? "↑" : "↓"} {Math.abs(stat.change)}%
              </div>
            </div>

            <div className="text-3xl font-bold mb-1" style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              {stat.label}
            </div>
            <p className="text-[10px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }}>
              {stat.description}
            </p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// CODE SNIPPETS GALLERY
// ============================================================================

interface CodeSnippet {
  title: string;
  language: string;
  code: string;
  description: string;
  category: string;
  icon: string;
}

interface CodeSnippetGalleryProps {
  snippets: CodeSnippet[];
  className?: string;
}

export function CodeSnippetGallery({
  snippets,
  className = "",
}: CodeSnippetGalleryProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [isVisible, setIsVisible] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => {
    const cats = new Set(snippets.map((s) => s.category));
    return ["all", ...Array.from(cats)];
  }, [snippets]);

  const filtered = useMemo(() => {
    if (activeCategory === "all") return snippets;
    return snippets.filter((s) => s.category === activeCategory);
  }, [snippets, activeCategory]);

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

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div ref={ref} className={className}>
      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6 justify-center">
        {categories.map((cat) => (
          <motion.button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all`}
            style={{
              background: activeCategory === cat ? "var(--accent-cyan)" : "var(--bg-surface)",
              color: activeCategory === cat ? "white" : "var(--text-muted)",
              border: `1px solid ${activeCategory === cat ? "var(--accent-cyan)" : "var(--border-primary)"}`,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {cat}
          </motion.button>
        ))}
      </div>

      {/* Snippets grid */}
      <div className="grid md:grid-cols-2 gap-4">
        <AnimatePresence>
          {filtered.map((snippet, i) => (
            <motion.div
              key={snippet.title}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={isVisible ? { opacity: 1, scale: 1 } : {}}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.05 }}
              className="overflow-hidden rounded-xl"
              style={{
                background: "#1e1e2e",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2.5" style={{
                background: "rgba(0,0,0,0.3)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <div className="flex items-center gap-2">
                  <span>{snippet.icon}</span>
                  <span className="text-xs font-mono text-white/80">{snippet.title}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                    {snippet.language}
                  </span>
                </div>
                <motion.button
                  onClick={() => handleCopy(snippet.code, i)}
                  className="text-[10px] px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  style={{ color: copiedIndex === i ? "#10b981" : "rgba(255,255,255,0.4)" }}
                  whileTap={{ scale: 0.9 }}
                >
                  {copiedIndex === i ? "Copied!" : "Copy"}
                </motion.button>
              </div>

              {/* Code */}
              <div className="p-4 max-h-48 overflow-auto">
                <pre className="text-[11px] text-[#a6adc8] font-mono" style={{ lineHeight: 1.6, margin: 0 }}>
                  {snippet.code}
                </pre>
              </div>

              {/* Description */}
              <div className="px-4 py-2" style={{
                borderTop: "1px solid rgba(255,255,255,0.04)",
                background: "rgba(0,0,0,0.1)",
              }}>
                <p className="text-[10px] text-[#6c7086]">{snippet.description}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default KanbanBoard;
