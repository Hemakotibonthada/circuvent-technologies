"use client";

import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import ScrollReveal from "@/components/ScrollReveal";
import CTASection from "@/components/CTASection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { careerRoles, careerBenefitsGlobal, faqs } from "@/lib/services-data";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  MapPin,
  Clock,
  Users,
  Brain,
  Cpu,
  Globe,
  Layers,
  GraduationCap,
  Rocket,
  Zap,
  Shield,
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  Brain, Cpu, Globe, Layers, GraduationCap, Rocket, Zap, Shield, Users,
};

export default function CareersPage() {
  const careerFaqs = faqs
    .filter((f) => f.category === "Process" || f.category === "General")
    .map((f, i) => ({
      id: `career-faq-${i}`,
      question: f.question,
      answer: f.answer,
      category: f.category,
    }));

  return (
    <>

      <PageHeader
        eyebrow="Careers"
        eyebrowColor="var(--accent-violet)"
        title="Join the"
        titleHighlight="Mission"
        titleGradient="from-violet-500 via-purple-500 to-pink-500"
        description="We're building intelligent systems that bypass limitations. If you're passionate about AI, IoT, or full-stack engineering — we want you on the team."
      />

      {/* Why Join Section */}
      <section className="relative z-10 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold uppercase tracking-[0.2em]"
                style={{ color: "var(--accent-cyan)" }}
              >
                Culture
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3"
                style={{ color: "var(--text-primary)" }}
              >
                Why Circuvent
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {careerBenefitsGlobal.map((benefit, i) => {
              const Icon = iconMap[benefit.icon] || Zap;
              return (
                <ScrollReveal key={benefit.title} delay={i * 0.08}>
                  <motion.div
                    whileHover={{ y: -4, scale: 1.01 }}
                    className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 text-center transition-all duration-300"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div
                      className="inline-flex p-3 rounded-xl mb-4"
                      style={{
                        background: "var(--accent-cyan-muted)",
                        border: "1px solid var(--border-accent)",
                      }}
                    >
                      <Icon className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
                    </div>
                    <h3
                      className="text-sm font-bold mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {benefit.title}
                    </h3>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {benefit.description}
                    </p>
                  </motion.div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Open Roles */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <span
                className="text-xs font-semibold text-emerald-500 uppercase tracking-[0.2em]"
              >
                Open Positions
              </span>
              <h2
                className="text-4xl sm:text-5xl font-bold mt-3 mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                {careerRoles.length} Roles Available
              </h2>
              <p
                className="max-w-lg mx-auto"
                style={{ color: "var(--text-tertiary)" }}
              >
                Each role offers the chance to work across multiple cutting-edge projects
                with full stack ownership.
              </p>
            </div>
          </ScrollReveal>

          <div className="space-y-4">
            {careerRoles.map((role, i) => (
              <ScrollReveal key={role.id} delay={i * 0.08}>
                <motion.div
                  whileHover={{ x: 4 }}
                  className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 sm:p-8 transition-all duration-300"
                  style={{
                    background: "var(--bg-glass)",
                    border: "1px solid var(--border-primary)",
                  }}
                >
                  {/* Left accent */}
                  <div
                    className={`absolute top-0 left-0 bottom-0 w-[3px] bg-gradient-to-b ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                  />

                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <h3
                          className="text-lg font-bold group-hover:text-cyan-500 transition-colors"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {role.title}
                        </h3>
                        <Badge variant="primary">{role.department}</Badge>
                      </div>

                      <p
                        className="text-sm leading-relaxed mb-4"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {role.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-4">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Briefcase className="w-3 h-3" />
                          {role.type}
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <MapPin className="w-3 h-3" />
                          {role.location}
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <Clock className="w-3 h-3" />
                          {role.experience}
                        </span>
                      </div>

                      {/* Key Requirements Preview */}
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {role.requirements.slice(0, 3).map((req) => (
                          <Badge key={req} variant="default" className="text-[10px]">
                            {req.split(" ").slice(0, 4).join(" ")}...
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Link href={`/careers/${role.id}`}>
                      <Button variant="outline" className="shrink-0 group/btn">
                        View Details
                        <ArrowRight className="w-4 h-4 transition-transform group-hover/btn:translate-x-1" />
                      </Button>
                    </Link>
                  </div>
                </motion.div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 py-20">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <h2
                className="text-3xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                Frequently Asked Questions
              </h2>
            </div>
          </ScrollReveal>

          <Accordion items={careerFaqs} />
        </div>
      </section>

      <CTASection
        title="Don't see a perfect fit?"
        titleHighlight="Apply Anyway"
        description="We're always looking for exceptional engineers. Send us your portfolio and tell us what excites you about Circuvent."
        primaryCTA={{ label: "Contact Us", href: "/contact" }}
        secondaryCTA={{ label: "View Projects", href: "/projects" }}
      />
    </>
  );
}
