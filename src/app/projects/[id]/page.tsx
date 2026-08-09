"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { projects } from "@/lib/projects-data";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Github,
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
  FileText,
  Users,
  Share2,
  Rocket,
  Landmark,
  Map,
  Cpu,
  Star,
  CheckCircle,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Home, HeartPulse, Eye, Zap, Building2, Globe,
  TrendingUp, GraduationCap, BarChart3, Shield, Layers,
  Mail, Activity, Clock, FileText, Users, Share2, Rocket,
  Landmark, Map, Cpu,
};

const statusLabels: Record<string, string> = {
  production: "In Production",
  beta: "Beta",
  alpha: "Alpha",
  concept: "Concept",
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const project = projects.find((p) => p.id === id);

  if (!project) {
    notFound();
  }

  const Icon = iconMap[project.icon] || Brain;

  // Get related projects (same category)
  const relatedProjects = projects
    .filter((p) => p.id !== id && p.category === project.category)
    .slice(0, 3);

  // Impact breakdown
  const impactBreakdown = [
    { label: "Innovation", value: Math.min(project.impactScore + 2, 100) },
    { label: "Complexity", value: Math.min(project.impactScore - 3, 100) },
    { label: "Production Readiness", value: project.status === "production" ? 95 : project.status === "beta" ? 75 : 55 },
    { label: "Tech Diversity", value: Math.min(project.techStack.length * 12, 100) },
  ];

  return (
    <>

      {/* Back link */}
      <section className="relative z-10 pt-28 pb-4">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <Link
            href="/projects"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--accent-cyan)]"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </Link>
        </div>
      </section>

      {/* Project Header */}
      <section className="relative z-10 pb-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex items-start gap-4 mb-6">
              <div
                className={`p-4 rounded-2xl bg-gradient-to-br ${project.gradient}`}
              >
                <Icon className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <Badge
                    variant={
                      project.status === "production"
                        ? "success"
                        : project.status === "beta"
                        ? "primary"
                        : project.status === "alpha"
                        ? "warning"
                        : "outline"
                    }
                  >
                    {statusLabels[project.status]}
                  </Badge>
                  <Badge variant="default">{project.category}</Badge>
                </div>
                <h1
                  className="text-4xl sm:text-5xl font-bold mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {project.name}
                </h1>
                <p
                  className="text-lg"
                  style={{ color: "var(--accent-cyan)" }}
                >
                  {project.tagline}
                </p>
              </div>
            </div>

            <p
              className="text-base leading-relaxed max-w-3xl mb-8"
              style={{ color: "var(--text-tertiary)" }}
            >
              {project.description}
            </p>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-3">
              {project.githubUrl && (
                <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline" className="group">
                    <Github className="w-4 h-4" />
                    View Source
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </a>
              )}
              {project.liveUrl && (
                <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                  <Button className="group">
                    Live Demo
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                </a>
              )}
              <Link href="/contact">
                <Button variant="glass">
                  Discuss This Project
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Project Details Grid */}
      <section className="relative z-10 py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Tech Stack */}
              <ScrollReveal>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h2
                    className="text-lg font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Technology Stack
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {project.techStack.map((tech) => (
                      <motion.div
                        key={tech}
                        whileHover={{ scale: 1.05, y: -2 }}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                        style={{
                          background: "var(--accent-cyan-muted)",
                          border: "1px solid var(--border-accent)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {tech}
                      </motion.div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Key Features */}
              <ScrollReveal>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h2
                    className="text-lg font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Key Highlights
                  </h2>
                  <ul className="space-y-3">
                    {project.description
                      .split(".")
                      .filter((s) => s.trim().length > 10)
                      .slice(0, 5)
                      .map((sentence, i) => (
                        <motion.li
                          key={i}
                          initial={{ opacity: 0, x: -20 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          viewport={{ once: true }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-start gap-3"
                        >
                          <CheckCircle
                            className="w-5 h-5 shrink-0 mt-0.5"
                            style={{ color: "var(--accent-cyan)" }}
                          />
                          <span
                            className="text-sm leading-relaxed"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {sentence.trim()}.
                          </span>
                        </motion.li>
                      ))}
                  </ul>
                </div>
              </ScrollReveal>

              {/* Architecture Overview */}
              <ScrollReveal>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h2
                    className="text-lg font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Architecture Overview
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {project.techStack.map((tech, i) => {
                      const layer =
                        i < 2
                          ? "Frontend"
                          : i < 4
                          ? "Backend"
                          : i < 6
                          ? "Data"
                          : "Infrastructure";
                      return (
                        <div
                          key={tech}
                          className="p-3 rounded-xl text-center"
                          style={{
                            background: "var(--bg-surface)",
                            border: "1px solid var(--border-primary)",
                          }}
                        >
                          <p
                            className="text-[10px] uppercase tracking-wider mb-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {layer}
                          </p>
                          <p
                            className="text-sm font-medium"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {tech}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </ScrollReveal>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Impact Score */}
              <ScrollReveal delay={0.1}>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h3
                    className="text-lg font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Impact Score
                  </h3>
                  <div className="text-center mb-6">
                    <div
                      className={`text-5xl font-bold ${
                        project.impactScore >= 90
                          ? "text-cyan-700"
                          : project.impactScore >= 80
                          ? "text-violet-500"
                          : ""
                      }`}
                      style={
                        project.impactScore < 80
                          ? { color: "var(--text-primary)" }
                          : undefined
                      }
                    >
                      {project.impactScore}
                    </div>
                    <p
                      className="text-xs uppercase tracking-wider mt-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      out of 100
                    </p>
                  </div>

                  <div className="space-y-4">
                    {impactBreakdown.map((metric) => (
                      <ProgressBar
                        key={metric.label}
                        value={metric.value}
                        label={metric.label}
                        showValue
                        size="sm"
                        variant="gradient"
                      />
                    ))}
                  </div>
                </div>
              </ScrollReveal>

              {/* Quick Info */}
              <ScrollReveal delay={0.2}>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <h3
                    className="text-lg font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Quick Info
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Status
                      </span>
                      <Badge
                        variant={
                          project.status === "production"
                            ? "success"
                            : "primary"
                        }
                      >
                        {statusLabels[project.status]}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Category
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {project.category}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Stars
                      </span>
                      <span className="flex items-center gap-1 text-sm font-medium text-amber-500">
                        <Star className="w-3 h-3 fill-current" />
                        {project.stars}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span
                        className="text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Tech Stack
                      </span>
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {project.techStack.length} technologies
                      </span>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* Related Projects */}
      {relatedProjects.length > 0 && (
        <section className="relative z-10 py-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <ScrollReveal>
              <div className="flex items-end justify-between mb-8">
                <h2
                  className="text-2xl font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Related Projects
                </h2>
                <Link href="/projects">
                  <Button variant="outline" size="sm" className="group">
                    View All
                    <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              </div>
            </ScrollReveal>

            <div className="grid md:grid-cols-3 gap-6">
              {relatedProjects.map((rp, i) => {
                const RPIcon = iconMap[rp.icon] || Brain;
                return (
                  <ScrollReveal key={rp.id} delay={i * 0.1}>
                    <Link href={`/projects/${rp.id}`}>
                      <motion.div
                        whileHover={{ y: -4 }}
                        className="group rounded-2xl p-6 transition-all duration-300"
                        style={{
                          background: "var(--bg-glass)",
                          border: "1px solid var(--border-primary)",
                        }}
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className={`p-2 rounded-lg bg-gradient-to-br ${rp.gradient}`}
                          >
                            <RPIcon className="w-4 h-4 text-white" />
                          </div>
                          <h3
                            className="text-sm font-bold group-hover:text-cyan-500 transition-colors"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {rp.name}
                          </h3>
                        </div>
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {rp.tagline}
                        </p>
                      </motion.div>
                    </Link>
                  </ScrollReveal>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
