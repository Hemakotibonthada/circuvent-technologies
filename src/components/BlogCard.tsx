"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import type { BlogPost } from "@/lib/blog-data";
import {
  Brain, Cpu, HeartPulse, Eye, Zap, Building2, Globe,
  TrendingUp, GraduationCap, Shield, Layers, Rocket,
  Clock, ArrowRight,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Cpu, HeartPulse, Eye, Zap, Building2, Globe,
  TrendingUp, GraduationCap, Shield, Layers, Rocket,
};

interface BlogCardProps {
  post: BlogPost;
  index: number;
  variant?: "default" | "featured";
}

export default function BlogCard({
  post,
  index,
  variant = "default",
}: BlogCardProps) {
  const Icon = iconMap[post.icon] || Brain;

  if (variant === "featured") {
    return (
      <ScrollReveal delay={index * 0.1}>
        <Link href={`/blog/${post.slug}`}>
          <motion.article
            whileHover={{ y: -6, transition: { duration: 0.3 } }}
            className="group relative overflow-hidden rounded-3xl transition-all duration-300"
            style={{
              background: "var(--bg-glass)",
              border: "1px solid var(--border-primary)",
              boxShadow: "var(--shadow-sm)",
              backdropFilter: "blur(24px)",
            }}
          >
            {/* Top gradient accent */}
            <div
              className={`h-2 w-full bg-gradient-to-r ${post.coverGradient}`}
            />

            <div className="p-8 sm:p-10">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl bg-gradient-to-br ${post.coverGradient} group-hover:scale-110 transition-transform duration-300`}
                  >
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <Badge variant="primary">{post.category}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs">{post.readTime}</span>
                </div>
              </div>

              {/* Title */}
              <h2
                className="text-xl sm:text-2xl font-bold mb-3 transition-all duration-300 group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-violet-500 group-hover:bg-clip-text group-hover:text-transparent"
                style={{ color: "var(--text-primary)" }}
              >
                {post.title}
              </h2>

              {/* Excerpt */}
              <p
                className="text-sm leading-relaxed mb-6 line-clamp-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                {post.excerpt}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-6">
                {post.tags.slice(0, 5).map((tag) => (
                  <Badge key={tag} variant="default" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between pt-5"
                style={{ borderTop: "1px solid var(--border-primary)" }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{post.authorAvatar}</span>
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {post.author}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(post.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <motion.div
                  className="flex items-center gap-1 text-sm font-medium"
                  style={{ color: "var(--accent-cyan)" }}
                >
                  Read More
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </motion.div>
              </div>
            </div>
          </motion.article>
        </Link>
      </ScrollReveal>
    );
  }

  return (
    <ScrollReveal delay={index * 0.08}>
      <Link href={`/blog/${post.slug}`}>
        <motion.article
          whileHover={{ y: -4, transition: { duration: 0.3 } }}
          className="group relative overflow-hidden rounded-2xl h-full flex flex-col transition-all duration-300"
          style={{
            background: "var(--bg-glass)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-sm)",
            backdropFilter: "blur(24px)",
          }}
        >
          {/* Gradient accent line */}
          <div
            className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${post.coverGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
          />

          <div className="p-6 flex-1 flex flex-col">
            {/* Category + Time */}
            <div className="flex items-center justify-between mb-4">
              <Badge variant="primary">{post.category}</Badge>
              <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                <Clock className="w-3 h-3" />
                <span className="text-xs">{post.readTime}</span>
              </div>
            </div>

            {/* Title */}
            <h3
              className="text-lg font-bold mb-2 transition-all duration-300 group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-violet-500 group-hover:bg-clip-text group-hover:text-transparent"
              style={{ color: "var(--text-primary)" }}
            >
              {post.title}
            </h3>

            {/* Excerpt */}
            <p
              className="text-sm leading-relaxed mb-4 flex-grow line-clamp-3"
              style={{ color: "var(--text-tertiary)" }}
            >
              {post.excerpt}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1 mb-4">
              {post.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="default" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
              {post.tags.length > 3 && (
                <Badge variant="outline" className="text-[10px]">
                  +{post.tags.length - 3}
                </Badge>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between pt-4"
              style={{ borderTop: "1px solid var(--border-primary)" }}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{post.authorAvatar}</span>
                <div>
                  <p
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {post.author}
                  </p>
                  <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <ArrowRight
                className="w-4 h-4 transition-transform group-hover:translate-x-1"
                style={{ color: "var(--text-muted)" }}
              />
            </div>
          </div>
        </motion.article>
      </Link>
    </ScrollReveal>
  );
}
