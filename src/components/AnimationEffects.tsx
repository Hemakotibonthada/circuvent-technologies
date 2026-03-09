"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { useMousePosition } from "@/hooks/useMousePosition";

interface CursorFollowerProps {
  enabled?: boolean;
}

export default function CursorFollower({ enabled = true }: CursorFollowerProps) {
  const mouse = useMousePosition();
  const [isHoveringInteractive, setIsHoveringInteractive] = useState(false);
  const [isClicking, setIsClicking] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const handleMouseEnter = () => setIsVisible(true);
    const handleMouseLeave = () => setIsVisible(false);
    const handleMouseDown = () => setIsClicking(true);
    const handleMouseUp = () => setIsClicking(false);

    // Check if hovering interactive elements
    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isInteractive = !!(
        target.closest("a") ||
        target.closest("button") ||
        target.closest("[role='button']") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("[data-cursor='pointer']")
      );
      setIsHoveringInteractive(isInteractive);
    };

    document.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousemove", handleMouseMove);

    return () => {
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {/* Outer ring */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9998] hidden md:block"
        animate={{
          x: mouse.x - (isHoveringInteractive ? 24 : 16),
          y: mouse.y - (isHoveringInteractive ? 24 : 16),
          width: isHoveringInteractive ? 48 : 32,
          height: isHoveringInteractive ? 48 : 32,
          opacity: isVisible ? 1 : 0,
          scale: isClicking ? 0.8 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 150,
          damping: 15,
          mass: 0.5,
        }}
        style={{
          border: "1.5px solid var(--accent-cyan)",
          borderRadius: "50%",
          opacity: 0.6,
          mixBlendMode: "difference",
        }}
      />

      {/* Inner dot */}
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999] hidden md:block"
        animate={{
          x: mouse.x - 3,
          y: mouse.y - 3,
          opacity: isVisible ? 1 : 0,
          scale: isClicking ? 2 : isHoveringInteractive ? 0 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 28,
        }}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "var(--accent-cyan)",
          mixBlendMode: "difference",
        }}
      />
    </>
  );
}

/**
 * Animated gradient border component
 */
export function GradientBorder({
  children,
  className,
  gradient = "from-cyan-500 via-violet-500 to-pink-500",
  borderWidth = 1,
  animate: shouldAnimate = true,
  rounded = "2xl",
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: string;
  borderWidth?: number;
  animate?: boolean;
  rounded?: string;
}) {
  return (
    <div className={`relative p-[${borderWidth}px] rounded-${rounded} ${className || ""}`}>
      <motion.div
        className={`absolute inset-0 rounded-${rounded} bg-gradient-to-r ${gradient}`}
        animate={
          shouldAnimate
            ? { backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }
            : undefined
        }
        transition={
          shouldAnimate
            ? { duration: 4, repeat: Infinity, ease: "linear" }
            : undefined
        }
        style={{
          backgroundSize: "200% 200%",
          mask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
          maskComposite: "subtract",
          WebkitMaskComposite: "xor",
          padding: `${borderWidth}px`,
        }}
      />
      <div className={`relative rounded-${rounded} bg-[var(--bg-surface)]`}>{children}</div>
    </div>
  );
}

/**
 * Animated text reveal effect
 */
export function TextReveal({
  text,
  className,
  delay = 0,
  staggerDelay = 0.02,
}: {
  text: string;
  className?: string;
  delay?: number;
  staggerDelay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const words = text.split(" ");

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <span key={i} className="inline-block overflow-hidden mr-[0.25em]">
          <motion.span
            className="inline-block"
            initial={{ y: "100%", opacity: 0 }}
            animate={isInView ? { y: "0%", opacity: 1 } : {}}
            transition={{
              duration: 0.5,
              delay: delay + i * staggerDelay,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/**
 * Animated gradient text that shifts colors
 */
export function ShimmerText({
  children,
  className,
  gradient = "from-cyan-400 via-violet-400 to-pink-400",
}: {
  children: React.ReactNode;
  className?: string;
  gradient?: string;
}) {
  return (
    <motion.span
      className={`bg-gradient-to-r ${gradient} bg-clip-text text-transparent bg-[length:200%_100%] ${className || ""}`}
      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
      transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
    >
      {children}
    </motion.span>
  );
}

/**
 * Floating particles around a container
 */
export function FloatingParticles({
  count = 6,
  className,
  colors = ["var(--accent-cyan)", "var(--accent-violet)", "var(--accent-pink)"],
}: {
  count?: number;
  className?: string;
  colors?: string[];
}) {
  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className || ""}`}>
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            background: colors[i % colors.length],
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [0, -20, 0],
            x: [0, Math.random() * 10 - 5, 0],
            opacity: [0.2, 0.6, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            delay: i * 0.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
