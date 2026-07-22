"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  duration?: number;
}

export default function ScrollReveal({
  children,
  className,
  delay = 0,
  direction = "up",
  duration = 0.6,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const prefersReduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Reveal immediately if the element is already on screen at mount. This
    // fixes a blank gap on client-side navigation, where useInView's observer
    // can miss elements that are already in view (a full refresh masks it).
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const vh = typeof window !== "undefined" ? window.innerHeight : 0;
      if (r.top < vh && r.bottom > 0) setReveal(true);
    }
  }, []);

  useEffect(() => {
    if (isInView) setReveal(true);
  }, [isInView]);

  const directionMap = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { y: 0, x: 40 },
    right: { y: 0, x: -40 },
    none: { y: 0, x: 0 },
  };

  const offset = prefersReduced ? { y: 0, x: 0 } : directionMap[direction];

  // Render a plain, visible wrapper on the server and the first client paint.
  // framer-motion injects inline transform/opacity styles that differ between
  // SSR and hydration (opacity "0" vs 0, translateY(40px) vs none), which throws
  // a React hydration mismatch. Enabling motion only after mount avoids that and
  // keeps content visible without JS.
  if (!mounted) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: offset.y, x: offset.x }}
      animate={
        reveal
          ? { opacity: 1, y: 0, x: 0 }
          : { opacity: 0, y: offset.y, x: offset.x }
      }
      transition={{
        duration: prefersReduced ? 0 : duration,
        delay: prefersReduced ? 0 : delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

