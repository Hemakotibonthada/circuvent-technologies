"use client";

import { useRef, useEffect } from "react";
import { motion, useAnimationFrame } from "framer-motion";

interface MarqueeProps {
  children: React.ReactNode;
  speed?: number;
  direction?: "left" | "right";
  pauseOnHover?: boolean;
  className?: string;
  gap?: number;
}

export default function Marquee({
  children,
  speed = 30,
  direction = "left",
  pauseOnHover = true,
  className,
  gap = 40,
}: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const xRef = useRef(0);
  const isPausedRef = useRef(false);

  useEffect(() => {
    if (!scrollerRef.current || !containerRef.current) return;

    // Clone children for infinite scroll
    const scroller = scrollerRef.current;
    const items = Array.from(scroller.children);
    items.forEach((item) => {
      const clone = item.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      scroller.appendChild(clone);
    });
  }, []);

  useAnimationFrame((_, delta) => {
    if (!scrollerRef.current || isPausedRef.current) return;

    const scrollWidth = scrollerRef.current.scrollWidth / 2;
    const dx = (speed * delta) / 1000;

    if (direction === "left") {
      xRef.current -= dx;
      if (xRef.current <= -scrollWidth) xRef.current = 0;
    } else {
      xRef.current += dx;
      if (xRef.current >= 0) xRef.current = -scrollWidth;
    }

    scrollerRef.current.style.transform = `translateX(${xRef.current}px)`;
  });

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${className || ""}`}
      onMouseEnter={() => pauseOnHover && (isPausedRef.current = true)}
      onMouseLeave={() => pauseOnHover && (isPausedRef.current = false)}
    >
      <div
        ref={scrollerRef}
        className="flex items-center"
        style={{ gap: `${gap}px`, willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Tech logo/badge item for the marquee
 */
export function MarqueeTechItem({
  name,
  icon,
  gradient,
}: {
  name: string;
  icon?: string;
  gradient?: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.1, y: -4 }}
      className="flex items-center gap-2.5 px-5 py-3 rounded-xl whitespace-nowrap cursor-default transition-all duration-300 shrink-0"
      style={{
        background: "var(--bg-glass)",
        border: "1px solid var(--border-primary)",
        backdropFilter: "blur(12px)",
      }}
    >
      {icon && <span className="text-lg">{icon}</span>}
      <span
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {name}
      </span>
    </motion.div>
  );
}
