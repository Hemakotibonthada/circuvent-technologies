"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ProjectCard from "@/components/ProjectCard";
import ScrollReveal from "@/components/ScrollReveal";
import AnimatedBackground from "@/components/AnimatedBackground";
import {
  projects,
  PROJECT_CATEGORIES,
  getProjectsByCategory,
  type ProjectCategory,
  stats,
} from "@/lib/projects-data";
import { Search, SlidersHorizontal } from "lucide-react";

export default function ProjectsPage() {
  const [activeCategory, setActiveCategory] = useState<ProjectCategory>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProjects = getProjectsByCategory(activeCategory).filter(
    (p) =>
      searchQuery === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.techStack.some((t) =>
        t.toLowerCase().includes(searchQuery.toLowerCase())
      ) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <AnimatedBackground />

      {/* Page Header */}
      <section className="relative z-10 pt-32 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="max-w-3xl">
              <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent-cyan)" }}>
                Portfolio
              </span>
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mt-3 mb-6" style={{ color: "var(--text-primary)" }}>
                Our{" "}
                <span className="bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 bg-clip-text text-transparent">
                  Projects
                </span>
              </h1>
              <p className="text-lg leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                {stats.totalProjects}+ projects spanning AI agents, IoT ecosystems,
                FinTech platforms, and enterprise tooling.
                Each representing a step in our mission to circuvent technological boundaries.
              </p>
            </div>
          </ScrollReveal>

          {/* Stats row */}
          <ScrollReveal delay={0.1}>
            <div
              className="flex flex-wrap gap-6 mt-10 pt-10"
              style={{ borderTop: "1px solid var(--border-primary)" }}
            >
              {[
                { value: `${stats.totalProjects}+`, label: "Total Projects" },
                { value: `${stats.productionApps}`, label: "In Production" },
                { value: `${stats.techStacks}+`, label: "Tech Stacks" },
                { value: stats.linesOfCode, label: "Lines of Code" },
              ].map((stat) => (
                <div key={stat.label}>
                  <div className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
                    {stat.value}
                  </div>
                  <div className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Filters */}
      <section
        className="relative z-30 pb-8 sticky top-0 backdrop-blur-2xl"
        style={{
          background: "var(--bg-overlay)",
          borderBottom: "1px solid var(--border-primary)",
        }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-3">
            {/* Category Pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {PROJECT_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className="px-3 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 cursor-pointer whitespace-nowrap"
                  style={
                    activeCategory === cat
                      ? {
                          background: "var(--accent-cyan-muted)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-accent)",
                        }
                      : {
                          color: "var(--text-muted)",
                          border: "1px solid transparent",
                        }
                  }
                >
                  {cat}
                  {cat !== "All" && (
                    <span className="ml-1 text-[11px] opacity-50">
                      {getProjectsByCategory(cat).length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
              <input
                type="text"
                placeholder="Search projects or tech..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-56 pl-9 pr-3 py-2 rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--accent-cyan)] transition-all"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Project Grid */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeCategory + searchQuery}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              {filteredProjects.length > 0 ? (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProjects.map((project, i) => (
                    <ProjectCard key={project.id} project={project} index={i} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-20">
                  <p className="text-lg" style={{ color: "var(--text-muted)" }}>
                    No projects match your criteria.
                  </p>
                  <button
                    onClick={() => {
                      setActiveCategory("All");
                      setSearchQuery("");
                    }}
                    className="mt-4 text-sm cursor-pointer"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            Showing {filteredProjects.length} of {projects.length} projects
          </div>
        </div>
      </section>

      {/* GitHub Sync Info */}
      <section className="relative z-10 py-16">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-2xl backdrop-blur-xl p-8"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
              }}
            >
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl" style={{ background: "var(--accent-cyan-muted)", border: "1px solid var(--border-accent)" }}>
                  <SlidersHorizontal className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                    Live GitHub Sync
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                    This portfolio supports automatic synchronization with our GitHub
                    repositories via ISR (Incremental Static Regeneration). Projects
                    are revalidated hourly, impact scores are calculated from stars,
                    forks, recency, and topic diversity. Enable it by adding your GitHub
                    token to the environment configuration.
                  </p>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </>
  );
}
