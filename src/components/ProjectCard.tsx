"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/projects-data";
import {
  Brain, Home, HeartPulse, Eye, Zap, Building2, Globe,
  TrendingUp, GraduationCap, BarChart3, Shield, Layers,
  Mail, Activity, Clock, FileText, Users, Share2, Rocket,
  Landmark, Map, Cpu, ExternalLink,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Home, HeartPulse, Eye, Zap, Building2, Globe,
  TrendingUp, GraduationCap, BarChart3, Shield, Layers,
  Mail, Activity, Clock, FileText, Users, Share2, Rocket,
  Landmark, Map, Cpu,
};

const statusColors: Record<string, string> = {
  production: "success",
  beta: "primary",
  alpha: "warning",
  concept: "outline",
};

interface ProjectCardProps {
  project: Project;
  index: number;
  variant?: "compact" | "full";
}

export default function ProjectCard({
  project,
  index,
  variant = "full",
}: ProjectCardProps) {
  const Icon = iconMap[project.icon] || Brain;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={{ y: -6, transition: { duration: 0.3 } }}
      className="group relative"
    >
      {/* Glow border on hover */}
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-cyan-500/0 via-violet-500/0 to-pink-500/0 group-hover:from-cyan-500/20 group-hover:via-violet-500/20 group-hover:to-pink-500/20 transition-all duration-500 blur-sm" />

      <div
        className="relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 sm:p-8 h-full flex flex-col transition-all duration-300"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Gradient accent line */}
        <div
          className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${project.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
        />

        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300"
              style={{ background: "var(--accent-cyan-muted)" }}
            >
              <Icon className="w-5 h-5 transition-colors" style={{ color: "var(--text-tertiary)" }} />
            </div>
            <div>
              <h3
                className="text-lg font-bold transition-all duration-300 group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-violet-500 group-hover:bg-clip-text group-hover:text-transparent"
                style={{ color: "var(--text-primary)" }}
              >
                {project.name}
              </h3>
              <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                {project.tagline}
              </p>
            </div>
          </div>

          {/* Impact Score */}
          <div className="flex flex-col items-end gap-1">
            <div className="text-right">
              <span className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Impact
              </span>
              <div className="flex items-baseline gap-0.5">
                <span
                  className={`text-xl font-bold ${
                    project.impactScore >= 90
                      ? "text-cyan-500"
                      : project.impactScore >= 80
                      ? "text-violet-500"
                      : ""
                  }`}
                  style={project.impactScore < 80 ? { color: "var(--text-muted)" } : undefined}
                >
                  {project.impactScore}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Description */}
        {variant === "full" && (
          <p className="text-sm leading-relaxed mb-5 flex-grow line-clamp-3" style={{ color: "var(--text-tertiary)" }}>
            {project.description}
          </p>
        )}

        {/* Tech Stack */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {(variant === "full" ? project.techStack : project.techStack.slice(0, 4)).map(
            (tech) => (
              <Badge key={tech} variant="default" className="text-[10px]">
                {tech}
              </Badge>
            )
          )}
          {variant === "compact" && project.techStack.length > 4 && (
            <Badge variant="outline" className="text-[10px]">
              +{project.techStack.length - 4}
            </Badge>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between pt-3"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <div className="flex items-center gap-2">
            <Badge variant={statusColors[project.status] as "primary" | "success" | "warning" | "outline"}>
              {project.status}
            </Badge>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{project.category}</span>
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg transition-all duration-200 cursor-pointer hover:bg-[var(--accent-cyan-muted)]"
            style={{ color: "var(--text-muted)" }}
            aria-label={`View ${project.name}`}
          >
            <ExternalLink className="w-4 h-4" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
