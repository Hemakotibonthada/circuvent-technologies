"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import { Badge } from "@/components/ui/badge";
import { domains } from "@/lib/domains-data";
import {
  ArrowRight,
  Brain,
  Cpu,
  Globe,
  HeartPulse,
  Shield,
  GraduationCap,
  Building2,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Cpu, Shield, Globe, HeartPulse, GraduationCap, Building2,
};

export default function DomainsPage() {
  return (
    <>

      <PageHeader
        eyebrow="Domains"
        title="Technology"
        titleHighlight="Domains"
        description="We engineer solutions across 6 core technology domains — from silicon to cloud, from AI to IoT, from enterprise tools to consumer apps."
      />

      {/* Domain Grid */}
      <section className="relative z-10 py-12">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {domains.map((domain, i) => {
              const DomainIcon = iconMap[domain.icon] || Globe;

              return (
                <ScrollReveal key={domain.id} delay={i * 0.1}>
                  <Link href={`/domains/${domain.slug}`}>
                    <motion.div
                      whileHover={{ y: -8, scale: 1.01 }}
                      className="group relative overflow-hidden rounded-3xl backdrop-blur-xl p-8 h-full flex flex-col cursor-pointer transition-all duration-300"
                      style={{
                        background: "var(--bg-glass)",
                        border: "1px solid var(--border-primary)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      {/* Gradient accent */}
                      <div
                        className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${domain.coverGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                      />

                      {/* Hover glow */}
                      <div
                        className={`absolute -inset-[1px] rounded-3xl bg-gradient-to-r ${domain.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-500 blur-sm`}
                      />

                      <div className="relative z-10 flex-1 flex flex-col">
                        {/* Icon + Title */}
                        <div className="flex items-start justify-between mb-4">
                          <div
                            className={`p-3 rounded-xl bg-gradient-to-br ${domain.coverGradient} group-hover:scale-110 transition-transform duration-300`}
                          >
                            <DomainIcon className="w-6 h-6 text-white" />
                          </div>
                          <Badge variant="default">
                            {domain.projectCount} projects
                          </Badge>
                        </div>

                        <h3
                          className="text-xl font-bold mb-2 group-hover:bg-gradient-to-r group-hover:from-cyan-500 group-hover:to-violet-500 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {domain.name}
                        </h3>

                        <p
                          className="text-sm font-medium mb-3"
                          style={{ color: "var(--accent-cyan-text)" }}
                        >
                          {domain.tagline}
                        </p>

                        <p
                          className="text-sm leading-relaxed mb-6 flex-grow"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {domain.description}
                        </p>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-2 mb-6">
                          {domain.stats.slice(0, 4).map((stat) => (
                            <div
                              key={stat.label}
                              className="p-2 rounded-lg text-center"
                              style={{
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border-primary)",
                              }}
                            >
                              <div
                                className="text-sm font-bold"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {stat.value}
                              </div>
                              <div
                                className="text-[9px] uppercase tracking-wider"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {stat.label}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Technologies preview */}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {domain.technologies.slice(0, 5).map((tech) => (
                            <Badge key={tech} variant="default" className="text-[9px]">
                              {tech}
                            </Badge>
                          ))}
                          {domain.technologies.length > 5 && (
                            <Badge variant="outline" className="text-[9px]">
                              +{domain.technologies.length - 5}
                            </Badge>
                          )}
                        </div>

                        {/* Footer */}
                        <div
                          className="flex items-center justify-between pt-4"
                          style={{ borderTop: "1px solid var(--border-primary)" }}
                        >
                          <span
                            className="text-sm font-medium group-hover:text-[var(--accent-cyan)] transition-colors"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            Explore Domain
                          </span>
                          <ArrowRight
                            className="w-4 h-4 transition-transform group-hover:translate-x-1"
                            style={{ color: "var(--text-muted)" }}
                          />
                        </div>
                      </div>
                    </motion.div>
                  </Link>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      <CTASection
        title="Ready to build in a"
        titleHighlight="Specific Domain?"
        description="We bring deep expertise in each domain. Let's discuss your project requirements."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Services", href: "/services" }}
      />
    </>
  );
}
