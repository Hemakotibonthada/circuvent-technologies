"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import AnimatedBackground from "@/components/AnimatedBackground";
import ScrollReveal from "@/components/ScrollReveal";
import StatsCounter from "@/components/StatsCounter";
import CTASection from "@/components/CTASection";
import ProjectCard from "@/components/ProjectCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDomainBySlug, domains } from "@/lib/domains-data";
import { projects } from "@/lib/projects-data";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Cpu,
  Globe,
  HeartPulse,
  Shield,
  Layers,
  Eye,
  Zap,
  Activity,
  Users,
  GraduationCap,
  TrendingUp,
  BarChart3,
  Clock,
  Mail,
  Map,
  Share2,
  Building2,
  CheckCircle,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Cpu, Globe, HeartPulse, Shield, Layers, Eye, Zap,
  Activity, Users, GraduationCap, TrendingUp, BarChart3, Clock,
  Mail, Map, Share2, Building2,
};

export default function DomainPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const domain = getDomainBySlug(slug);

  if (!domain) {
    notFound();
  }

  const domainProjects = projects.filter(
    (p) => domain.keyProjects.includes(p.id)
  );

  // Get related domains
  const otherDomains = domains.filter((d) => d.slug !== slug).slice(0, 3);

  // Parse numeric stats for StatsCounter
  const statsForCounter = domain.stats.map((s) => {
    const numericValue = parseFloat(s.value.replace(/[^0-9.]/g, "")) || 0;
    const suffix = s.value.replace(/[0-9.]/g, "").trim();
    return {
      value: numericValue,
      suffix,
      label: s.label,
    };
  });

  return (
    <>
      <AnimatedBackground />

      {/* Back link */}
      <section className="relative z-10 pt-28 pb-4">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
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

      {/* Domain Hero */}
      <section className="relative z-10 pb-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="max-w-4xl">
              <Badge variant="primary" className="mb-4">
                {domain.projectCount} Projects
              </Badge>
              <h1
                className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 leading-[0.95]"
                style={{ color: "var(--text-primary)" }}
              >
                {domain.name.split(" ")[0]}{" "}
                <span
                  className={`bg-gradient-to-r ${domain.coverGradient} bg-clip-text text-transparent`}
                >
                  {domain.name.split(" ").slice(1).join(" ") || domain.name}
                </span>
              </h1>
              <p
                className="text-xl leading-relaxed max-w-2xl"
                style={{ color: "var(--text-tertiary)" }}
              >
                {domain.tagline}
              </p>
              <p
                className="text-base leading-relaxed max-w-3xl mt-4"
                style={{ color: "var(--text-muted)" }}
              >
                {domain.longDescription}
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {domain.stats.map((stat, i) => (
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
                  <div
                    className={`text-2xl sm:text-3xl font-bold bg-gradient-to-r ${domain.coverGradient} bg-clip-text text-transparent`}
                  >
                    {stat.value}
                  </div>
                  <div
                    className="text-xs mt-1 uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {stat.label}
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--accent-cyan)" }}
              >
                Capabilities
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                What We Build
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {domain.capabilities.map((capability, i) => {
              const CapIcon = iconMap[capability.icon] || Zap;
              return (
                <ScrollReveal key={capability.title} delay={i * 0.08}>
                  <motion.div
                    whileHover={{ y: -4, scale: 1.01 }}
                    className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 transition-all duration-300"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div
                      className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${domain.coverGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                    />
                    <div
                      className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${domain.coverGradient} mb-4 group-hover:scale-110 transition-transform`}
                    >
                      <CapIcon className="w-5 h-5 text-white" />
                    </div>
                    <h3
                      className="text-base font-bold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {capability.title}
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {capability.description}
                    </p>
                  </motion.div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Technologies */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span
                className="text-xs font-semibold text-emerald-500 uppercase tracking-[0.2em]"
              >
                Tech Stack
              </span>
              <h2
                className="text-3xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                Technologies We Use
              </h2>
            </div>
          </ScrollReveal>

          <div className="flex flex-wrap justify-center gap-2">
            {domain.technologies.map((tech, i) => (
              <ScrollReveal key={tech} delay={i * 0.03}>
                <motion.div
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="px-4 py-2 rounded-xl text-sm font-medium cursor-default transition-all"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    color: "var(--text-secondary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  {tech}
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Case Study */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div
              className="relative overflow-hidden rounded-3xl backdrop-blur-xl p-10 sm:p-16"
              style={{
                background: "var(--bg-glass)",
                border: "1px solid var(--border-primary)",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${domain.coverGradient} opacity-[0.03]`}
              />

              <div className="relative z-10">
                <Badge variant="primary" className="mb-4">
                  Case Study
                </Badge>
                <h2
                  className="text-2xl sm:text-3xl font-bold mb-4"
                  style={{ color: "var(--text-primary)" }}
                >
                  {domain.caseStudy.title}
                </h2>

                <div className="space-y-6 mt-8">
                  <div>
                    <h3
                      className="text-sm font-semibold uppercase tracking-wider mb-2"
                      style={{ color: "var(--accent-cyan)" }}
                    >
                      Challenge
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {domain.caseStudy.challenge}
                    </p>
                  </div>

                  <div>
                    <h3
                      className="text-sm font-semibold uppercase tracking-wider mb-2"
                      style={{ color: "var(--accent-violet)" }}
                    >
                      Solution
                    </h3>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {domain.caseStudy.solution}
                    </p>
                  </div>

                  <div>
                    <h3
                      className="text-sm font-semibold uppercase tracking-wider mb-2 text-emerald-500"
                    >
                      Results
                    </h3>
                    <ul className="space-y-2">
                      {domain.caseStudy.results.map((result) => (
                        <li key={result} className="flex items-start gap-2">
                          <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                          <span
                            className="text-sm"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {result}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-4" style={{ borderTop: "1px solid var(--border-primary)" }}>
                    {domain.caseStudy.techStack.map((tech) => (
                      <Badge key={tech} variant="default">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Domain Projects */}
      {domainProjects.length > 0 && (
        <section className="relative z-10 py-20">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <ScrollReveal>
              <h2
                className="text-3xl font-bold mb-8"
                style={{ color: "var(--text-primary)" }}
              >
                Featured {domain.name} Projects
              </h2>
            </ScrollReveal>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {domainProjects.map((project, i) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={i}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Other Domains */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <h2
              className="text-2xl font-bold mb-8"
              style={{ color: "var(--text-primary)" }}
            >
              Explore Other Domains
            </h2>
          </ScrollReveal>

          <div className="grid sm:grid-cols-3 gap-4">
            {otherDomains.map((d, i) => (
              <ScrollReveal key={d.slug} delay={i * 0.1}>
                <Link href={`/domains/${d.slug}`}>
                  <motion.div
                    whileHover={{ y: -4 }}
                    className="group rounded-2xl p-6 transition-all duration-300 cursor-pointer"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div
                      className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${d.coverGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-t-2xl`}
                    />
                    <h3
                      className="text-base font-bold mb-1 group-hover:text-cyan-500 transition-colors"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {d.name}
                    </h3>
                    <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                      {d.tagline}
                    </p>
                    <div className="flex items-center justify-between">
                      <Badge variant="default">{d.projectCount} projects</Badge>
                      <ArrowRight
                        className="w-4 h-4 transition-transform group-hover:translate-x-1"
                        style={{ color: "var(--text-muted)" }}
                      />
                    </div>
                  </motion.div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title="Ready to explore"
        titleHighlight={`${domain.name}?`}
        description={`We build production-grade ${domain.name.toLowerCase()} solutions. Let's discuss your project.`}
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View All Projects", href: "/projects" }}
      />
    </>
  );
}
