"use client";

import { useParams } from "next/navigation";
import { notFound } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCareerById, careerRoles } from "@/lib/services-data";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  MapPin,
  Clock,
  CheckCircle,
  Star,
  Send,
} from "lucide-react";

export default function CareerDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const role = getCareerById(id);

  if (!role) {
    notFound();
  }

  const otherRoles = careerRoles.filter((r) => r.id !== id).slice(0, 3);

  return (
    <>

      {/* Back link */}
      <section className="relative z-10 pt-28 pb-4">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <Link
            href="/careers"
            className="inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--accent-cyan)]"
            style={{ color: "var(--text-muted)" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Careers
          </Link>
        </div>
      </section>

      {/* Role Header */}
      <section className="relative z-10 pb-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <div className="flex flex-wrap gap-2 mb-4">
              <Badge variant="primary">{role.department}</Badge>
              <Badge variant="success">{role.type}</Badge>
            </div>

            <h1
              className="text-4xl sm:text-5xl font-bold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              {role.title}
            </h1>

            <p
              className="text-lg leading-relaxed mb-8"
              style={{ color: "var(--text-tertiary)" }}
            >
              {role.description}
            </p>

            <div
              className="flex flex-wrap items-center gap-6 pb-8"
              style={{ borderBottom: "1px solid var(--border-primary)" }}
            >
              <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <Briefcase className="w-4 h-4" />
                {role.type}
              </span>
              <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <MapPin className="w-4 h-4" />
                {role.location}
              </span>
              <span className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <Clock className="w-4 h-4" />
                {role.experience} experience
              </span>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Role Details */}
      <section className="relative z-10 py-12">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2 space-y-12">
              {/* Responsibilities */}
              <ScrollReveal>
                <h2
                  className="text-2xl font-bold mb-6"
                  style={{ color: "var(--text-primary)" }}
                >
                  What You&apos;ll Do
                </h2>
                <ul className="space-y-3">
                  {role.responsibilities.map((item, i) => (
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
                        {item}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </ScrollReveal>

              {/* Requirements */}
              <ScrollReveal>
                <h2
                  className="text-2xl font-bold mb-6"
                  style={{ color: "var(--text-primary)" }}
                >
                  What We&apos;re Looking For
                </h2>
                <ul className="space-y-3">
                  {role.requirements.map((item, i) => (
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
                        style={{ color: "var(--accent-violet)" }}
                      />
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {item}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </ScrollReveal>

              {/* Nice to Have */}
              <ScrollReveal>
                <h2
                  className="text-2xl font-bold mb-6"
                  style={{ color: "var(--text-primary)" }}
                >
                  Nice to Have
                </h2>
                <ul className="space-y-3">
                  {role.niceToHave.map((item, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-start gap-3"
                    >
                      <Star
                        className="w-5 h-5 shrink-0 mt-0.5"
                        style={{ color: "var(--text-muted)" }}
                      />
                      <span
                        className="text-sm leading-relaxed"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </ScrollReveal>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Apply CTA */}
              <ScrollReveal delay={0.1}>
                <div
                  className="rounded-2xl p-6 sticky top-28"
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
                    Interested?
                  </h3>
                  <p
                    className="text-sm mb-6"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    Send your resume, portfolio, and a note about what excites you
                    about this role.
                  </p>
                  <Link href="/contact">
                    <Button className="w-full group">
                      <Send className="w-4 h-4" />
                      Apply Now
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>

                  {/* Benefits */}
                  <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--border-primary)" }}>
                    <h4
                      className="text-sm font-semibold mb-3"
                      style={{ color: "var(--text-primary)" }}
                    >
                      What You Get
                    </h4>
                    <ul className="space-y-2">
                      {role.benefits.map((benefit) => (
                        <li
                          key={benefit}
                          className="flex items-start gap-2 text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <CheckCircle className="w-3 h-3 shrink-0 mt-0.5 text-emerald-500" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      {/* Other Roles */}
      <section className="relative z-10 py-20">
        <div className="max-w-5xl mx-auto px-6 lg:px-8">
          <ScrollReveal>
            <h2
              className="text-2xl font-bold mb-8"
              style={{ color: "var(--text-primary)" }}
            >
              Other Open Roles
            </h2>
          </ScrollReveal>

          <div className="space-y-4">
            {otherRoles.map((otherRole, i) => (
              <ScrollReveal key={otherRole.id} delay={i * 0.08}>
                <Link href={`/careers/${otherRole.id}`}>
                  <motion.div
                    whileHover={{ x: 4 }}
                    className="group flex items-center justify-between p-5 rounded-2xl transition-all duration-300"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                    }}
                  >
                    <div>
                      <h3
                        className="text-base font-semibold group-hover:text-cyan-500 transition-colors"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {otherRole.title}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {otherRole.department}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {otherRole.location}
                        </span>
                      </div>
                    </div>
                    <ArrowRight
                      className="w-4 h-4 transition-transform group-hover:translate-x-1"
                      style={{ color: "var(--text-muted)" }}
                    />
                  </motion.div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
