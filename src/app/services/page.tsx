"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import AnimatedBackground from "@/components/AnimatedBackground";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import TestimonialCard from "@/components/TestimonialCard";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { services, testimonials, faqs } from "@/lib/services-data";
import Link from "next/link";
import {
  ArrowRight,
  Brain,
  Cpu,
  Globe,
  Layers,
  Shield,
  Building2,
  CheckCircle,
  Clock,
  Code2,
  Zap,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Cpu, Globe, Layers, Shield, Building2, Code2, Zap,
};

export default function ServicesPage() {
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const faqItems = faqs.map((f, i) => ({
    id: `faq-${i}`,
    question: f.question,
    answer: f.answer,
    category: f.category,
  }));

  return (
    <>
      <AnimatedBackground />

      <PageHeader
        eyebrow="Services"
        eyebrowColor="var(--accent-violet)"
        title="What We"
        titleHighlight="Build"
        titleGradient="from-violet-500 via-purple-500 to-pink-500"
        description="From AI systems to IoT ecosystems to enterprise platforms — we deliver production-grade solutions across 6 technology domains."
      />

      {/* Process Overview */}
      <section className="relative z-10 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--accent-cyan)" }}
              >
                Process
              </span>
              <h2
                className="text-3xl sm:text-4xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                How We Work
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: "01",
                title: "Discovery",
                description:
                  "Understand your goals, constraints, and requirements through deep-dive discussions.",
                icon: "🔍",
              },
              {
                step: "02",
                title: "Architecture",
                description:
                  "Design the technical architecture, select the optimal tech stack, and plan milestones.",
                icon: "📐",
              },
              {
                step: "03",
                title: "Build",
                description:
                  "Iterative development in weekly sprints with continuous demos and feedback loops.",
                icon: "⚡",
              },
              {
                step: "04",
                title: "Deploy",
                description:
                  "Docker-composed deployment, monitoring setup, documentation, and knowledge transfer.",
                icon: "🚀",
              },
            ].map((phase, i) => (
              <ScrollReveal key={phase.step} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="relative rounded-2xl p-6 text-center transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                    backdropFilter: "blur(24px)",
                  }}
                >
                  <div className="text-3xl mb-3">{phase.icon}</div>
                  <div
                    className="text-xs font-mono mb-2"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    Step {phase.step}
                  </div>
                  <h3
                    className="text-base font-bold mb-2"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {phase.title}
                  </h3>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {phase.description}
                  </p>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--accent-violet)" }}
              >
                Offerings
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                Our Services
              </h2>
            </div>
          </ScrollReveal>

          <div className="space-y-6">
            {services.map((service, i) => {
              const ServiceIcon = iconMap[service.icon] || Zap;
              const isExpanded = expandedService === service.id;

              return (
                <ScrollReveal key={service.id} delay={i * 0.08}>
                  <motion.div
                    layout
                    className="group relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-500"
                    style={{
                      background: "var(--bg-glass)",
                      border: `1px solid ${isExpanded ? "var(--border-accent)" : "var(--border-primary)"}`,
                      boxShadow: isExpanded ? "var(--shadow-lg)" : "var(--shadow-sm)",
                    }}
                  >
                    {/* Header (always visible) */}
                    <div
                      className="p-8 cursor-pointer"
                      onClick={() =>
                        setExpandedService(isExpanded ? null : service.id)
                      }
                    >
                      <div className="flex items-start gap-6">
                        <div
                          className={`p-4 rounded-2xl bg-gradient-to-br ${service.gradient} shrink-0 group-hover:scale-110 transition-transform duration-300`}
                        >
                          <ServiceIcon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-2">
                            <h3
                              className="text-xl font-bold"
                              style={{ color: "var(--text-primary)" }}
                            >
                              {service.title}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span
                                className="hidden sm:flex items-center gap-1 text-xs"
                                style={{ color: "var(--text-muted)" }}
                              >
                                <Clock className="w-3 h-3" />
                                {service.timeline}
                              </span>
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.3 }}
                              >
                                <ArrowRight
                                  className="w-5 h-5 rotate-90"
                                  style={{ color: "var(--text-muted)" }}
                                />
                              </motion.div>
                            </div>
                          </div>
                          <p
                            className="text-sm font-medium mb-3"
                            style={{ color: "var(--accent-cyan)" }}
                          >
                            {service.tagline}
                          </p>
                          <p
                            className="text-sm leading-relaxed"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {service.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-8 pb-8"
                      >
                        <div
                          className="pt-6 grid md:grid-cols-3 gap-8"
                          style={{ borderTop: "1px solid var(--border-primary)" }}
                        >
                          {/* Features */}
                          <div>
                            <h4
                              className="text-sm font-semibold uppercase tracking-wider mb-4"
                              style={{ color: "var(--accent-cyan)" }}
                            >
                              What&apos;s Included
                            </h4>
                            <ul className="space-y-2">
                              {service.features.map((feature) => (
                                <li
                                  key={feature}
                                  className="flex items-start gap-2 text-xs"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                                  {feature}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Deliverables */}
                          <div>
                            <h4
                              className="text-sm font-semibold uppercase tracking-wider mb-4"
                              style={{ color: "var(--accent-violet)" }}
                            >
                              Deliverables
                            </h4>
                            <ul className="space-y-2">
                              {service.deliverables.map((deliverable) => (
                                <li
                                  key={deliverable}
                                  className="flex items-start gap-2 text-xs"
                                  style={{ color: "var(--text-tertiary)" }}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-violet-500" />
                                  {deliverable}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Tech + CTA */}
                          <div>
                            <h4
                              className="text-sm font-semibold uppercase tracking-wider mb-4"
                              style={{ color: "var(--accent-pink)" }}
                            >
                              Technologies
                            </h4>
                            <div className="flex flex-wrap gap-1.5 mb-6">
                              {service.technologies.map((tech) => (
                                <Badge key={tech} variant="default" className="text-[10px]">
                                  {tech}
                                </Badge>
                              ))}
                            </div>

                            <div
                              className="p-4 rounded-xl mb-4"
                              style={{
                                background: "var(--bg-surface)",
                                border: "1px solid var(--border-primary)",
                              }}
                            >
                              <p
                                className="text-xs mb-1 font-medium"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Timeline
                              </p>
                              <p
                                className="text-lg font-bold"
                                style={{ color: "var(--accent-cyan)" }}
                              >
                                {service.timeline}
                              </p>
                            </div>

                            <p
                              className="text-xs mb-4"
                              style={{ color: "var(--text-muted)" }}
                            >
                              <strong>Ideal for:</strong> {service.ideal}
                            </p>

                            <Link href="/contact">
                              <Button size="sm" className="w-full group">
                                Get Started
                                <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold text-emerald-500 uppercase tracking-[0.2em]"
              >
                Testimonials
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                What Clients Say
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((testimonial, i) => (
              <TestimonialCard
                key={testimonial.id}
                testimonial={testimonial}
                index={i}
              />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--accent-violet)" }}
              >
                FAQ
              </span>
              <h2
                className="text-4xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                Common Questions
              </h2>
            </div>
          </ScrollReveal>

          <Accordion items={faqItems} />
        </div>
      </section>

      <CTASection
        title="Ready to"
        titleHighlight="Get Started?"
        description="Tell us about your project. We'll respond within 24-48 hours with a free consultation."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Projects", href: "/projects" }}
      />
    </>
  );
}
