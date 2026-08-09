"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import StatsCounter from "@/components/StatsCounter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { projectCaseStudies } from "@/lib/case-studies-data";
import { projects } from "@/lib/projects-data";
import {
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  CheckCircle,
  Code2,
  Layers,
  TrendingUp,
  Target,
  Lightbulb,
  Rocket,
  Clock,
  BarChart3,
  Brain,
  Home,
  HeartPulse,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  "nexus-ai-os": Brain,
  "smarthome-ecosystem": Home,
  "cancerguard-ai": HeartPulse,
};

export default function CaseStudiesPage() {
  const [activeCaseStudy, setActiveCaseStudy] = useState(projectCaseStudies[0].projectId);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [showCode, setShowCode] = useState<string | null>(null);

  const currentStudy = projectCaseStudies.find((cs) => cs.projectId === activeCaseStudy)!;
  const currentProject = projects.find((p) => p.id === activeCaseStudy);
  const CurrentIcon = iconMap[activeCaseStudy] || Brain;

  return (
    <>

      <PageHeader
        eyebrow="Case Studies"
        eyebrowColor="var(--accent-violet)"
        title="Deep Dive"
        titleHighlight="Projects"
        titleGradient="from-violet-500 via-purple-500 to-pink-500"
        description="Comprehensive case studies of our most impactful projects. Architecture decisions, implementation details, code samples, and lessons learned."
      />

      {/* Case Study Selector */}
      <section className="relative z-10 py-8">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="flex flex-wrap gap-3 justify-center">
            {projectCaseStudies.map((cs) => {
              const project = projects.find((p) => p.id === cs.projectId);
              const isActive = activeCaseStudy === cs.projectId;
              return (
                <motion.button
                  key={cs.projectId}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setActiveCaseStudy(cs.projectId);
                    setExpandedPhase(null);
                    setShowCode(null);
                  }}
                  className="px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer"
                  style={
                    isActive
                      ? {
                          background: "var(--accent-cyan-muted)",
                          border: "1px solid var(--border-accent)",
                          color: "var(--text-primary)",
                        }
                      : {
                          background: "var(--bg-glass)",
                          border: "1px solid var(--border-primary)",
                          color: "var(--text-muted)",
                        }
                  }
                >
                  {project?.name || cs.projectId}
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Case Study Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCaseStudy}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {/* Project Header */}
          <section className="relative z-10 py-8">
            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <ScrollReveal>
                <div className="flex items-start gap-4 mb-6">
                  <div
                    className={`p-4 rounded-2xl bg-gradient-to-br ${currentProject?.gradient || "from-cyan-500 to-violet-500"}`}
                  >
                    <CurrentIcon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h2
                      className="text-3xl font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {currentProject?.name}
                    </h2>
                    <p
                      className="text-lg"
                      style={{ color: "var(--accent-cyan)" }}
                    >
                      {currentProject?.tagline}
                    </p>
                  </div>
                </div>

                <p
                  className="text-sm leading-relaxed mb-8 max-w-3xl"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {currentStudy.overview}
                </p>
              </ScrollReveal>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-12">
                {currentStudy.metrics.slice(0, 8).map((metric, i) => (
                  <ScrollReveal key={metric.label} delay={i * 0.05}>
                    <div
                      className="p-4 rounded-xl text-center"
                      style={{
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-primary)",
                      }}
                    >
                      <div
                        className="text-lg font-bold"
                        style={{
                          color:
                            metric.category === "performance"
                              ? "var(--accent-cyan)"
                              : metric.category === "quality"
                              ? "rgb(16, 185, 129)"
                              : metric.category === "scale"
                              ? "var(--accent-violet)"
                              : "var(--text-primary)",
                        }}
                      >
                        {metric.value}
                      </div>
                      <div
                        className="text-[10px] uppercase tracking-wider mt-1"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {metric.label}
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </section>

          {/* Challenge & Approach */}
          <section className="relative z-10 py-8">
            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <div className="grid md:grid-cols-2 gap-6">
                <ScrollReveal>
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5" style={{ color: "var(--accent-pink)" }} />
                      <h3
                        className="text-lg font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Challenge
                      </h3>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {currentStudy.challenge}
                    </p>
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={0.1}>
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <Lightbulb className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                      <h3
                        className="text-lg font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        Approach
                      </h3>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {currentStudy.approach}
                    </p>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </section>

          {/* Architecture */}
          <section className="relative z-10 py-8">
            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <ScrollReveal>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-6">
                    <Layers className="w-5 h-5" style={{ color: "var(--accent-violet)" }} />
                    <h3
                      className="text-lg font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Architecture
                    </h3>
                  </div>
                  <div className="space-y-3">
                    {currentStudy.architecture.map((layer, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-3 p-3 rounded-xl"
                        style={{
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        <div
                          className="text-xs font-mono px-2 py-1 rounded shrink-0"
                          style={{
                            background: "var(--accent-cyan-muted)",
                            color: "var(--accent-cyan-text)",
                          }}
                        >
                          L{i + 1}
                        </div>
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {layer}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>

          {/* Implementation Timeline */}
          <section className="relative z-10 py-8">
            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <ScrollReveal>
                <h3
                  className="text-xl font-bold mb-6 flex items-center gap-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Clock className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                  Implementation Timeline
                </h3>
              </ScrollReveal>

              <div className="space-y-3">
                {currentStudy.implementation.map((phase, i) => {
                  const isExpanded = expandedPhase === phase.phase;
                  return (
                    <ScrollReveal key={phase.phase} delay={i * 0.08}>
                      <div
                        className="rounded-2xl overflow-hidden transition-all duration-300"
                        style={{
                          background: "var(--bg-glass)",
                          border: `1px solid ${isExpanded ? "var(--border-accent)" : "var(--border-primary)"}`,
                        }}
                      >
                        <div
                          className="p-5 flex items-center justify-between cursor-pointer"
                          onClick={() => setExpandedPhase(isExpanded ? null : phase.phase)}
                        >
                          <div className="flex items-center gap-4">
                            <span
                              className="text-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent"
                            >
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <div>
                              <h4
                                className="text-base font-semibold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {phase.phase}
                              </h4>
                              <p
                                className="text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {phase.duration}
                              </p>
                            </div>
                          </div>
                          <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                            <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                          </motion.div>
                        </div>

                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="px-5 pb-5"
                          >
                            <div style={{ borderTop: "1px solid var(--border-primary)", paddingTop: "1rem" }}>
                              <p
                                className="text-sm mb-4"
                                style={{ color: "var(--text-tertiary)" }}
                              >
                                {phase.description}
                              </p>
                              <h5
                                className="text-xs font-semibold uppercase tracking-wider mb-2"
                                style={{ color: "var(--accent-cyan)" }}
                              >
                                Deliverables
                              </h5>
                              <ul className="space-y-1">
                                {phase.deliverables.map((d) => (
                                  <li key={d} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                                    <CheckCircle className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
                                    {d}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </ScrollReveal>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Code Snippets */}
          {currentStudy.codeSnippets.length > 0 && (
            <section className="relative z-10 py-8">
              <div className="max-w-5xl mx-auto px-6 lg:px-8">
                <ScrollReveal>
                  <h3
                    className="text-xl font-bold mb-6 flex items-center gap-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <Code2 className="w-5 h-5" style={{ color: "var(--accent-violet)" }} />
                    Code Samples
                  </h3>
                </ScrollReveal>

                <div className="space-y-4">
                  {currentStudy.codeSnippets.map((snippet, i) => (
                    <ScrollReveal key={snippet.title} delay={i * 0.1}>
                      <div
                        className="rounded-2xl overflow-hidden"
                        style={{
                          background: "var(--bg-glass)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        <div className="p-5">
                          <div className="flex items-center justify-between mb-2">
                            <h4
                              className="text-sm font-bold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {snippet.title}
                            </h4>
                            <Badge variant="default">{snippet.language}</Badge>
                          </div>
                          <p
                            className="text-xs mb-4"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {snippet.description}
                          </p>
                          <pre
                            className="p-4 rounded-xl overflow-x-auto text-xs leading-relaxed"
                            style={{
                              background: "var(--bg-surface)",
                              border: "1px solid var(--border-primary)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <code>{snippet.code}</code>
                          </pre>
                        </div>
                      </div>
                    </ScrollReveal>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Lessons & Roadmap */}
          <section className="relative z-10 py-8">
            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <div className="grid md:grid-cols-2 gap-6">
                <ScrollReveal>
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <h3
                      className="text-lg font-bold mb-4 flex items-center gap-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <Lightbulb className="w-5 h-5 text-amber-500" />
                      Lessons Learned
                    </h3>
                    <ul className="space-y-3">
                      {currentStudy.lessonsLearned.map((lesson, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                          <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                          {lesson}
                        </li>
                      ))}
                    </ul>
                  </div>
                </ScrollReveal>

                <ScrollReveal delay={0.1}>
                  <div
                    className="rounded-2xl p-6"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <h3
                      className="text-lg font-bold mb-4 flex items-center gap-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <Rocket className="w-5 h-5 text-emerald-500" />
                      Future Roadmap
                    </h3>
                    <ul className="space-y-3">
                      {currentStudy.futureRoadmap.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                          <span className="text-emerald-500 shrink-0 mt-0.5">→</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </ScrollReveal>
              </div>
            </div>
          </section>

          {/* Results */}
          <section className="relative z-10 py-8">
            <div className="max-w-5xl mx-auto px-6 lg:px-8">
              <ScrollReveal>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <h3
                    className="text-lg font-bold mb-6 flex items-center gap-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                    Results
                  </h3>
                  <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {currentStudy.results.map((result) => (
                      <div
                        key={result.metric}
                        className="p-4 rounded-xl text-center"
                        style={{
                          background: "var(--bg-surface)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        <div
                          className="text-xl font-bold bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent"
                        >
                          {result.value}
                        </div>
                        <div
                          className="text-xs font-medium mt-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {result.metric}
                        </div>
                        {result.improvement && (
                          <div
                            className="text-[10px] mt-0.5"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {result.improvement}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </section>
        </motion.div>
      </AnimatePresence>

      <CTASection
        title="Want a similar"
        titleHighlight="Solution?"
        description="We bring the same engineering rigor to every client project. Let's discuss your requirements."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View All Projects", href: "/projects" }}
      />
    </>
  );
}
