"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote, Star, Pause, Play } from "lucide-react";

interface Testimonial {
  name: string;
  role: string;
  company: string;
  avatar: string;
  content: string;
  rating: number;
}

interface TestimonialCarouselProps {
  testimonials: Testimonial[];
  autoPlayInterval?: number;
  className?: string;
}

export default function TestimonialCarousel({
  testimonials,
  autoPlayInterval = 5000,
  className,
}: TestimonialCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [direction, setDirection] = useState(1);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { margin: "-100px" });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const next = useCallback(() => {
    setDirection(1);
    setActiveIndex((prev) => (prev + 1) % testimonials.length);
  }, [testimonials.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  }, [testimonials.length]);

  // Auto-play
  useEffect(() => {
    if (!isPlaying || !isInView) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(next, autoPlayInterval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, isInView, next, autoPlayInterval]);

  const currentTestimonial = testimonials[activeIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
    },
    exit: (dir: number) => ({
      x: dir > 0 ? -300 : 300,
      opacity: 0,
      scale: 0.95,
    }),
  };

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <div
        className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-6 sm:p-8 md:p-12"
        style={{
          background: "var(--bg-glass)",
          border: "1px solid var(--border-primary)",
          backdropFilter: "blur(24px)",
          minHeight: "240px",
        }}
      >
        {/* Background decoration */}
        <div className="absolute top-6 left-6 opacity-10">
          <Quote className="w-20 h-20" style={{ color: "var(--accent-cyan)" }} />
        </div>

        {/* Slide content */}
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={activeIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10"
          >
            {/* Stars */}
            <div className="flex gap-1 mb-6 justify-center">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Star
                    className={`w-5 h-5 ${
                      i < currentTestimonial.rating
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-300"
                    }`}
                  />
                </motion.div>
              ))}
            </div>

            {/* Quote */}
            <blockquote className="text-center mb-8">
              <p
                className="text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto"
                style={{ color: "var(--text-secondary)" }}
              >
                &ldquo;{currentTestimonial.content}&rdquo;
              </p>
            </blockquote>

            {/* Author */}
            <div className="flex items-center justify-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{
                  background: "var(--bg-surface)",
                  border: "2px solid var(--border-hover)",
                }}
              >
                {currentTestimonial.avatar}
              </div>
              <div className="text-left">
                <p
                  className="text-base font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {currentTestimonial.name}
                </p>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {currentTestimonial.role} at {currentTestimonial.company}
                </p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={prev}
            className="p-2 rounded-xl cursor-pointer transition-colors"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-muted)",
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>

          {/* Dots */}
          <div className="flex items-center gap-2">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setDirection(i > activeIndex ? 1 : -1);
                  setActiveIndex(i);
                }}
                className="cursor-pointer"
              >
                <motion.div
                  className="rounded-full transition-all"
                  animate={{
                    width: i === activeIndex ? 24 : 8,
                    height: 8,
                    backgroundColor: i === activeIndex ? "var(--accent-cyan)" : "var(--border-hover)",
                  }}
                  transition={{ duration: 0.3 }}
                />
              </button>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={next}
            className="p-2 rounded-xl cursor-pointer transition-colors"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-muted)",
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>

          {/* Play/Pause */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-xl cursor-pointer transition-colors absolute right-6"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-muted)",
            }}
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
