"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Tabs, TabContent } from "@/components/ui/tabs";
import {
  techComparisons,
  learningResources,
  architecturePatterns,
  projectMilestones,
  codeMetrics,
} from "@/lib/stack-data";
import {
  ArrowRight,
  ExternalLink,
  BookOpen,
  GitBranch,
  Code2,
  Layers,
  Star,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  BarChart3,
} from "lucide-react";

export default function ArchitecturePage() {
  const [activeTab, setActiveTab] = useState("patterns");
  const [expandedPattern, setExpandedPattern] = useState<string | null>(null);
  const [expandedComparison, setExpandedComparison] = useState<string | null>(null);

  const tabs = [
    { id: "patterns", label: "Architecture Patterns", count: architecturePatterns.length },
    { id: "comparisons", label: "Tech Comparisons", count: techComparisons.length },
    { id: "metrics", label: "Code Metrics" },
    { id: "resources", label: "Resources", count: learningResources.length },
  ];

  return (
    <>

      <PageHeader
        eyebrow="Architecture"
        eyebrowColor="var(--accent-violet)"
        title="Engineering"
        titleHighlight="Decisions"
        titleGradient="from-violet-500 via-purple-500 to-pink-500"
        description="The architectural patterns, technology comparisons, and engineering decisions behind our 53+ projects. Every choice documented, every trade-off considered."
      />

      {/* Tabs */}
      <section className="relative z-10 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex justify-center mb-12">
              <Tabs
                tabs={tabs}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                variant="pills"
              />
            </div>
          </ScrollReveal>

          {/* Architecture Patterns */}
          {activeTab === "patterns" && (
            <motion.div
              key="patterns"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {architecturePatterns.map((pattern, i) => {
                const isExpanded = expandedPattern === pattern.name;
                return (
                  <ScrollReveal key={pattern.name} delay={i * 0.08}>
                    <motion.div
                      layout
                      className="relative overflow-hidden rounded-2xl backdrop-blur-xl transition-all duration-300"
                      style={{
                        background: "var(--bg-glass)",
                        border: `1px solid ${isExpanded ? "var(--border-accent)" : "var(--border-primary)"}`,
                      }}
                    >
                      {/* Header */}
                      <div
                        className="p-6 sm:p-8 cursor-pointer"
                        onClick={() => setExpandedPattern(isExpanded ? null : pattern.name)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-3">
                              <div
                                className="p-2 rounded-lg"
                                style={{ background: "var(--accent-violet-muted)" }}
                              >
                                <Layers className="w-4 h-4" style={{ color: "var(--accent-violet)" }} />
                              </div>
                              <h3
                                className="text-lg font-bold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {pattern.name}
                              </h3>
                            </div>
                            <p
                              className="text-sm leading-relaxed mb-3"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {pattern.description}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {pattern.usedIn.map((project) => (
                                <Badge key={project} variant="primary">
                                  {project}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <motion.div
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            className="ml-4"
                          >
                            <ArrowRight
                              className="w-5 h-5 rotate-90"
                              style={{ color: "var(--text-muted)" }}
                            />
                          </motion.div>
                        </div>
                      </div>

                      {/* Expanded */}
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          className="px-6 sm:px-8 pb-8"
                        >
                          <div
                            className="pt-6 grid md:grid-cols-3 gap-8"
                            style={{ borderTop: "1px solid var(--border-primary)" }}
                          >
                            {/* Diagram */}
                            <div className="md:col-span-2">
                              <h4
                                className="text-sm font-semibold uppercase tracking-wider mb-3"
                                style={{ color: "var(--accent-cyan)" }}
                              >
                                Architecture Diagram
                              </h4>
                              <pre
                                className="p-4 rounded-xl overflow-x-auto text-xs font-mono leading-relaxed"
                                style={{
                                  background: "var(--bg-surface)",
                                  border: "1px solid var(--border-primary)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                {pattern.diagram.trim()}
                              </pre>
                            </div>

                            {/* Benefits + Tradeoffs */}
                            <div className="space-y-6">
                              <div>
                                <h4
                                  className="text-sm font-semibold uppercase tracking-wider mb-3 text-emerald-500"
                                >
                                  Benefits
                                </h4>
                                <ul className="space-y-2">
                                  {pattern.benefits.map((b) => (
                                    <li key={b} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                                      <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                                      {b}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <h4
                                  className="text-sm font-semibold uppercase tracking-wider mb-3 text-amber-500"
                                >
                                  Trade-offs
                                </h4>
                                <ul className="space-y-2">
                                  {pattern.tradeoffs.map((t) => (
                                    <li key={t} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
                                      {t}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  </ScrollReveal>
                );
              })}
            </motion.div>
          )}

          {/* Tech Comparisons */}
          {activeTab === "comparisons" && (
            <motion.div
              key="comparisons"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              {techComparisons.map((comparison, i) => {
                const isExpanded = expandedComparison === comparison.criteria;
                return (
                  <ScrollReveal key={comparison.criteria} delay={i * 0.06}>
                    <div
                      className="rounded-2xl backdrop-blur-xl overflow-hidden transition-all duration-300"
                      style={{
                        background: "var(--bg-glass)",
                        border: `1px solid ${isExpanded ? "var(--border-accent)" : "var(--border-primary)"}`,
                      }}
                    >
                      <div
                        className="p-6 cursor-pointer flex items-center justify-between"
                        onClick={() => setExpandedComparison(isExpanded ? null : comparison.criteria)}
                      >
                        <div className="flex items-center gap-3">
                          <BarChart3 className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                          <h3
                            className="text-base font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {comparison.criteria}
                          </h3>
                          <Badge variant="default">{comparison.options.length} options</Badge>
                        </div>
                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                          <ArrowRight className="w-4 h-4 rotate-90" style={{ color: "var(--text-muted)" }} />
                        </motion.div>
                      </div>

                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="px-6 pb-6"
                        >
                          <div className="space-y-4" style={{ borderTop: "1px solid var(--border-primary)", paddingTop: "1.5rem" }}>
                            {comparison.options
                              .sort((a, b) => b.rating - a.rating)
                              .map((option) => (
                                <div
                                  key={option.name}
                                  className="flex items-start gap-4 p-4 rounded-xl"
                                  style={{
                                    background: "var(--bg-surface)",
                                    border: "1px solid var(--border-primary)",
                                  }}
                                >
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <h4
                                        className="text-sm font-semibold"
                                        style={{ color: "var(--text-primary)" }}
                                      >
                                        {option.name}
                                      </h4>
                                      <div className="flex gap-0.5">
                                        {Array.from({ length: 5 }).map((_, j) => (
                                          <Star
                                            key={j}
                                            className={`w-3 h-3 ${
                                              j < option.rating
                                                ? "fill-amber-400 text-amber-400"
                                                : "text-gray-300"
                                            }`}
                                          />
                                        ))}
                                      </div>
                                    </div>
                                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                      {option.notes}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </ScrollReveal>
                );
              })}
            </motion.div>
          )}

          {/* Code Metrics */}
          {activeTab === "metrics" && (
            <motion.div
              key="metrics"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Overview Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { value: "200K+", label: "Total Lines" },
                  { value: "2,500+", label: "Source Files" },
                  { value: "4,200+", label: "Git Commits" },
                  { value: "28/wk", label: "Avg Commits" },
                ].map((stat, i) => (
                  <ScrollReveal key={stat.label} delay={i * 0.1}>
                    <motion.div
                      whileHover={{ scale: 1.05, y: -4 }}
                      className="p-5 rounded-2xl text-center"
                      style={{
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-primary)",
                        backdropFilter: "blur(24px)",
                      }}
                    >
                      <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                        {stat.value}
                      </div>
                      <div className="text-xs mt-1 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        {stat.label}
                      </div>
                    </motion.div>
                  </ScrollReveal>
                ))}
              </div>

              {/* Language Distribution */}
              <ScrollReveal>
                <div
                  className="rounded-2xl p-8"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h3 className="text-lg font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                    Language Distribution
                  </h3>
                  <div className="space-y-4">
                    {codeMetrics.languages.map((lang, i) => (
                      <div key={lang.name} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                            {lang.name}
                          </span>
                          <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                            {lang.percentage}% ({(lang.lines / 1000).toFixed(0)}K lines)
                          </span>
                        </div>
                        <ProgressBar
                          value={lang.percentage}
                          size="sm"
                          variant="gradient"
                          animate
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Project Growth Timeline */}
              <ScrollReveal>
                <div
                  className="rounded-2xl p-8"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h3 className="text-lg font-bold mb-6" style={{ color: "var(--text-primary)" }}>
                    Project Growth Timeline
                  </h3>
                  <div className="relative">
                    <div
                      className="absolute left-4 top-0 bottom-0 w-px"
                      style={{ background: "var(--border-primary)" }}
                    />
                    <div className="space-y-4">
                      {projectMilestones.map((milestone, i) => (
                        <motion.div
                          key={milestone.date}
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.04 }}
                          className="relative pl-10 flex items-start gap-4"
                        >
                          <div
                            className="absolute left-2 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{
                              background: "var(--bg-surface)",
                              border: "2px solid var(--border-accent)",
                            }}
                          >
                            <div className="w-2 h-2 rounded-full bg-cyan-500" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono" style={{ color: "var(--accent-cyan)" }}>
                                {milestone.date}
                              </span>
                              <Badge variant="default">{milestone.value} projects</Badge>
                            </div>
                            <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
                              {milestone.description}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </motion.div>
          )}

          {/* Learning Resources */}
          {activeTab === "resources" && (
            <motion.div
              key="resources"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {learningResources.map((resource, i) => (
                <ScrollReveal key={resource.title} delay={i * 0.06}>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group"
                  >
                    <motion.div
                      whileHover={{ y: -4 }}
                      className="rounded-2xl p-6 h-full flex flex-col transition-all duration-300"
                      style={{
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-primary)",
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} />
                          <Badge variant={
                            resource.difficulty === "beginner" ? "success" :
                            resource.difficulty === "intermediate" ? "primary" : "warning"
                          }>
                            {resource.difficulty}
                          </Badge>
                        </div>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-muted)" }} />
                      </div>

                      <h3
                        className="text-sm font-bold mb-2 group-hover:text-cyan-500 transition-colors"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {resource.title}
                      </h3>

                      <p
                        className="text-xs leading-relaxed flex-grow"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {resource.description}
                      </p>

                      <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--border-primary)" }}>
                        <Badge variant="outline" className="text-[9px]">
                          {resource.type}
                        </Badge>
                      </div>
                    </motion.div>
                  </a>
                </ScrollReveal>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      <CTASection
        title="Building your own"
        titleHighlight="Architecture?"
        description="We bring these patterns and trade-offs to every client project. Let's design the right architecture together."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Services", href: "/services" }}
      />
    </>
  );
}
