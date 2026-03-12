"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import AnimatedBackground from "@/components/AnimatedBackground";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import StatsCounter from "@/components/StatsCounter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { projects, stats } from "@/lib/projects-data";
import {
  Github,
  GitBranch,
  GitPullRequest,
  Star,
  ArrowRight,
  ExternalLink,
  Code2,
  Users,
  BookOpen,
  Heart,
} from "lucide-react";

const openSourceProjects = projects.filter(
  (p) => p.status === "production" || p.status === "beta"
).slice(0, 12);

const contributionGuide = [
  {
    step: "1",
    title: "Find a Project",
    description:
      "Browse our 53+ repositories on GitHub. Each has a README with setup instructions and contribution guidelines.",
    icon: BookOpen,
  },
  {
    step: "2",
    title: "Pick an Issue",
    description:
      "Look for issues labeled 'good first issue' or 'help wanted'. These are curated for new contributors.",
    icon: GitBranch,
  },
  {
    step: "3",
    title: "Fork & Code",
    description:
      "Fork the repository, create a feature branch, and implement your change. Follow the project's coding conventions.",
    icon: Code2,
  },
  {
    step: "4",
    title: "Submit a PR",
    description:
      "Open a pull request with a clear description. We review PRs within 48 hours and provide constructive feedback.",
    icon: GitPullRequest,
  },
];

const openSourceValues = [
  {
    title: "Transparency by Default",
    description:
      "Every project is public. Our code quality speaks for itself — no hidden proprietary shortcuts.",
    icon: "🔓",
  },
  {
    title: "Community First",
    description:
      "We build tools for the community. Bug reports, feature requests, and contributions make our projects better.",
    icon: "🤝",
  },
  {
    title: "MIT Licensed",
    description:
      "All projects use the MIT License unless otherwise specified. Use, modify, and distribute freely.",
    icon: "📜",
  },
  {
    title: "Well Documented",
    description:
      "Every repository includes README, ARCHITECTURE.md, CONTRIBUTING.md, and inline code documentation.",
    icon: "📖",
  },
  {
    title: "Tested & CI/CD",
    description:
      "GitHub Actions workflows for linting, testing, and deployment. PRs must pass CI before merge.",
    icon: "✅",
  },
  {
    title: "Semantic Versioning",
    description:
      "Strict semver for all packages. Breaking changes increment major, features increment minor, patches fix bugs.",
    icon: "🏷️",
  },
];

export default function OpenSourcePage() {
  return (
    <>
      <AnimatedBackground />

      <PageHeader
        eyebrow="Open Source"
        eyebrowColor="var(--accent-cyan)"
        title="Building in"
        titleHighlight="Public"
        titleGradient="from-emerald-500 via-teal-500 to-cyan-500"
        description="Every project we build is open source. 53+ repositories, 200K+ lines of code, all freely available on GitHub. Transparency isn't a feature — it's our DNA."
      />

      {/* Stats */}
      <section className="relative z-10 py-12">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <StatsCounter
            stats={[
              { value: 53, suffix: "+", label: "Repositories" },
              { value: 200, suffix: "K+", label: "Lines of Code" },
              { value: 15, suffix: "+", label: "Tech Stacks" },
              { value: 8, label: "In Production" },
            ]}
          />
        </div>
      </section>

      {/* Open Source Values */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--accent-violet)" }}
              >
                Philosophy
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                Our Open Source Values
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {openSourceValues.map((value, i) => (
              <ScrollReveal key={value.title} delay={i * 0.08}>
                <motion.div
                  whileHover={{ y: -4, scale: 1.01 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <span className="text-3xl block mb-4">{value.icon}</span>
                  <h3
                    className="text-base font-bold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {value.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {value.description}
                  </p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Repositories */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex items-end justify-between mb-12">
              <div>
                <span
                  className="text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: "var(--accent-cyan)" }}
                >
                  Repositories
                </span>
                <h2
                  className="text-4xl sm:text-5xl font-bold mt-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  Featured Projects
                </h2>
              </div>
              <a
                href="https://github.com/circuvent-technologies"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="group hidden sm:inline-flex">
                  <Github className="w-4 h-4" />
                  View All on GitHub
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {openSourceProjects.map((project, i) => (
              <ScrollReveal key={project.id} delay={i * 0.06}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 h-full flex flex-col transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div
                    className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${project.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Github className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      <h3
                        className="text-sm font-bold group-hover:text-cyan-500 transition-colors"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {project.name}
                      </h3>
                    </div>
                    <Badge variant={project.status === "production" ? "success" : "primary"}>
                      {project.status}
                    </Badge>
                  </div>

                  <p
                    className="text-xs leading-relaxed mb-4 flex-grow"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {project.tagline}
                  </p>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {project.techStack.slice(0, 4).map((tech) => (
                      <Badge key={tech} variant="default" className="text-[9px]">
                        {tech}
                      </Badge>
                    ))}
                  </div>

                  <div
                    className="flex items-center justify-between pt-3"
                    style={{ borderTop: "1px solid var(--border-primary)" }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Star className="w-3 h-3" />
                        {project.stars}
                      </span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {project.category}
                      </span>
                    </div>
                    <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {project.impactScore}/100
                    </span>
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* How to Contribute */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold text-pink-500 uppercase tracking-[0.2em]"
              >
                Contribute
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3 mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                How to Get Involved
              </h2>
              <p
                className="max-w-lg mx-auto"
                style={{ color: "var(--text-tertiary)" }}
              >
                Contributing is easy. Here&apos;s how to get started in 4 simple steps.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {contributionGuide.map((step, i) => (
              <ScrollReveal key={step.title} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="relative rounded-2xl backdrop-blur-xl p-6 text-center transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  <div
                    className="text-3xl font-bold mb-4 bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent"
                  >
                    {step.step}
                  </div>
                  <div
                    className="inline-flex p-3 rounded-xl mb-4"
                    style={{
                      background: "var(--accent-cyan-muted)",
                      border: "1px solid var(--border-accent)",
                    }}
                  >
                    <step.icon
                      className="w-5 h-5"
                      style={{ color: "var(--accent-cyan)" }}
                    />
                  </div>
                  <h3
                    className="text-sm font-bold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {step.title}
                  </h3>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {step.description}
                  </p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <CTASection
        title="Ready to"
        titleHighlight="Contribute?"
        description="Whether you're fixing a typo or adding a major feature, every contribution matters. Join our community of builders."
        primaryCTA={{ label: "View on GitHub", href: "https://github.com/circuvent-technologies" }}
        secondaryCTA={{ label: "View Projects", href: "/projects" }}
      />
    </>
  );
}
