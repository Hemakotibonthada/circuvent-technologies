"use client";

import { motion } from "framer-motion";
import ScrollReveal from "@/components/ScrollReveal";
import { Star, Quote } from "lucide-react";
import type { Testimonial } from "@/lib/services-data";

interface TestimonialCardProps {
  testimonial: Testimonial;
  index: number;
}

export default function TestimonialCard({
  testimonial,
  index,
}: TestimonialCardProps) {
  return (
    <ScrollReveal delay={index * 0.1}>
      <motion.div
        whileHover={{ y: -4, scale: 1.01 }}
        className="group relative overflow-hidden rounded-2xl backdrop-blur-xl p-6 sm:p-8 h-full flex flex-col transition-all duration-300"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {/* Quote icon */}
        <Quote
          className="w-8 h-8 mb-4 opacity-30"
          style={{ color: "var(--accent-cyan)" }}
        />

        {/* Stars */}
        <div className="flex gap-0.5 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-4 h-4 ${
                i < testimonial.rating
                  ? "fill-amber-400 text-amber-400"
                  : "text-gray-300"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <p
          className="text-sm leading-relaxed mb-6 flex-grow"
          style={{ color: "var(--text-tertiary)" }}
        >
          &ldquo;{testimonial.content}&rdquo;
        </p>

        {/* Author */}
        <div
          className="flex items-center gap-3 pt-5"
          style={{ borderTop: "1px solid var(--border-primary)" }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-xl"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-hover)",
            }}
          >
            {testimonial.avatar}
          </div>
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {testimonial.name}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {testimonial.role} at {testimonial.company}
            </p>
          </div>
        </div>

        {/* Service badge */}
        <div className="mt-3">
          <span
            className="text-[10px] font-medium px-2 py-1 rounded-full"
            style={{
              background: "var(--accent-cyan-muted)",
              color: "var(--text-tertiary)",
              border: "1px solid var(--border-primary)",
            }}
          >
            {testimonial.service}
          </span>
        </div>
      </motion.div>
    </ScrollReveal>
  );
}
