"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";

// ============================================================================
// ANIMATED CURSOR TRAIL
// ============================================================================

interface CursorTrailProps {
  color?: string;
  trailLength?: number;
  size?: number;
  enabled?: boolean;
}

export function CursorTrail({
  color = "#06b6d4",
  trailLength = 20,
  size = 8,
  enabled = true,
}: CursorTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<Array<{ x: number; y: number; age: number }>>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      pointsRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (pointsRef.current.length > trailLength) {
        pointsRef.current.shift();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < pointsRef.current.length; i++) {
        const point = pointsRef.current[i];
        point.age += 0.02;

        const progress = i / pointsRef.current.length;
        const currentSize = size * progress;
        const alpha = progress * 0.5;

        ctx.beginPath();
        ctx.arc(point.x, point.y, currentSize, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Main cursor glow
      if (pointsRef.current.length > 0) {
        const last = pointsRef.current[pointsRef.current.length - 1];
        const gradient = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, size * 3);
        gradient.addColorStop(0, color + "30");
        gradient.addColorStop(1, "transparent");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(last.x, last.y, size * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", resize);
    };
  }, [color, trailLength, size, enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-50 pointer-events-none"
      style={{ mixBlendMode: "screen" }}
    />
  );
}

// ============================================================================
// ANIMATED GRADIENT TEXT
// ============================================================================

interface AnimatedGradientTextProps {
  text: string;
  from?: string;
  via?: string;
  to?: string;
  speed?: number;
  className?: string;
  as?: "h1" | "h2" | "h3" | "h4" | "p" | "span";
}

export function AnimatedGradientText({
  text,
  from = "#06b6d4",
  via = "#8b5cf6",
  to = "#ec4899",
  speed = 3,
  className = "",
  as: Tag = "span",
}: AnimatedGradientTextProps) {
  return (
    <Tag
      className={`inline-block bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage: `linear-gradient(90deg, ${from}, ${via}, ${to}, ${from})`,
        backgroundSize: "200% 100%",
        animation: `gradient-shift ${speed}s ease infinite`,
      }}
    >
      {text}
      <style jsx>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </Tag>
  );
}

// ============================================================================
// ANIMATED TEXT SCRAMBLE
// ============================================================================

interface TextScrambleProps {
  text: string;
  speed?: number;
  className?: string;
  revealDelay?: number;
  chars?: string;
}

export function TextScramble({
  text,
  speed = 30,
  className = "",
  revealDelay = 500,
  chars = "!<>-_\\/[]{}—=+*^?#________",
}: TextScrambleProps) {
  const [displayText, setDisplayText] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const timeout = setTimeout(() => {
      let iteration = 0;
      const totalIterations = text.length * 3;

      const interval = setInterval(() => {
        setDisplayText(
          text
            .split("")
            .map((char, i) => {
              if (i < iteration / 3) return char;
              return chars[Math.floor(Math.random() * chars.length)];
            })
            .join("")
        );

        iteration++;
        if (iteration >= totalIterations) {
          setDisplayText(text);
          clearInterval(interval);
        }
      }, speed);

      return () => clearInterval(interval);
    }, revealDelay);

    return () => clearTimeout(timeout);
  }, [isVisible, text, speed, revealDelay, chars]);

  return (
    <span ref={ref} className={`font-mono ${className}`}>
      {displayText || text.replace(/./g, " ")}
    </span>
  );
}

// ============================================================================
// MORPHING TEXT - Text that morphs between words
// ============================================================================

interface MorphingTextProps {
  words: string[];
  interval?: number;
  className?: string;
  morphDuration?: number;
}

export function MorphingText({
  words,
  interval = 3000,
  className = "",
  morphDuration = 1000,
}: MorphingTextProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [morphProgress, setMorphProgress] = useState(0);
  const [isMorphing, setIsMorphing] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsMorphing(true);
      const startTime = Date.now();

      const morphTimer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / morphDuration, 1);
        setMorphProgress(progress);

        if (progress >= 1) {
          clearInterval(morphTimer);
          setCurrentIndex((prev) => (prev + 1) % words.length);
          setIsMorphing(false);
          setMorphProgress(0);
        }
      }, 16);

      return () => clearInterval(morphTimer);
    }, interval);

    return () => clearInterval(timer);
  }, [words, interval, morphDuration]);

  const currentWord = words[currentIndex];
  const nextWord = words[(currentIndex + 1) % words.length];

  return (
    <span className={`relative inline-block ${className}`}>
      <span
        className="inline-block transition-all"
        style={{
          opacity: isMorphing ? 1 - morphProgress : 1,
          filter: isMorphing ? `blur(${morphProgress * 8}px)` : "none",
          transform: isMorphing ? `translateY(${morphProgress * -10}px)` : "none",
        }}
      >
        {currentWord}
      </span>
      {isMorphing && (
        <span
          className="absolute left-0 top-0 inline-block"
          style={{
            opacity: morphProgress,
            filter: `blur(${(1 - morphProgress) * 8}px)`,
            transform: `translateY(${(1 - morphProgress) * 10}px)`,
          }}
        >
          {nextWord}
        </span>
      )}
    </span>
  );
}

// ============================================================================
// ANIMATED COUNT UP WITH FORMATTER
// ============================================================================

interface AnimatedCountUpProps {
  end: number;
  start?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  separator?: string;
  className?: string;
  triggerOnView?: boolean;
}

export function AnimatedCountUp({
  end,
  start = 0,
  duration = 2000,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = ",",
  className = "",
  triggerOnView = true,
}: AnimatedCountUpProps) {
  const [value, setValue] = useState(start);
  const [isVisible, setIsVisible] = useState(!triggerOnView);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!triggerOnView) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [triggerOnView]);

  useEffect(() => {
    if (!isVisible) return;

    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = start + (end - start) * eased;
      setValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [isVisible, start, end, duration]);

  const formatted = useMemo(() => {
    const fixed = value.toFixed(decimals);
    const [intPart, decPart] = fixed.split(".");
    const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return `${prefix}${withSeparator}${decPart ? "." + decPart : ""}${suffix}`;
  }, [value, decimals, prefix, suffix, separator]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {formatted}
    </span>
  );
}

// ============================================================================
// ANIMATED REVEAL TEXT - Letters reveal one by one
// ============================================================================

interface AnimatedRevealTextProps {
  text: string;
  delay?: number;
  stagger?: number;
  className?: string;
  direction?: "left" | "right" | "up" | "down" | "random";
}

export function AnimatedRevealText({
  text,
  delay = 0,
  stagger = 0.03,
  className = "",
  direction = "up",
}: AnimatedRevealTextProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const getInitialPosition = (i: number) => {
    switch (direction) {
      case "left": return { x: -20, y: 0, opacity: 0 };
      case "right": return { x: 20, y: 0, opacity: 0 };
      case "up": return { x: 0, y: 20, opacity: 0 };
      case "down": return { x: 0, y: -20, opacity: 0 };
      case "random": return {
        x: (Math.random() - 0.5) * 40,
        y: (Math.random() - 0.5) * 40,
        opacity: 0,
        rotate: (Math.random() - 0.5) * 45,
      };
    }
  };

  return (
    <span ref={ref} className={`inline-flex flex-wrap ${className}`}>
      {text.split("").map((char, i) => (
        <motion.span
          key={`${char}-${i}`}
          initial={getInitialPosition(i)}
          animate={isVisible ? { x: 0, y: 0, opacity: 1, rotate: 0 } : {}}
          transition={{
            delay: delay + i * stagger,
            type: "spring",
            stiffness: 200,
            damping: 15,
          }}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

// ============================================================================
// GLITCH TEXT EFFECT
// ============================================================================

interface GlitchTextProps {
  text: string;
  className?: string;
  intensity?: number;
  colors?: [string, string];
}

export function GlitchText({
  text,
  className = "",
  intensity = 1,
  colors = ["#06b6d4", "#ec4899"],
}: GlitchTextProps) {
  return (
    <span className={`relative inline-block ${className}`}>
      <span className="relative z-10">{text}</span>
      <span
        className="absolute top-0 left-0 w-full h-full"
        style={{
          color: colors[0],
          animation: `glitch-1 ${2 / intensity}s infinite linear alternate-reverse`,
          clipPath: "polygon(0 0, 100% 0, 100% 45%, 0 45%)",
        }}
        aria-hidden
      >
        {text}
      </span>
      <span
        className="absolute top-0 left-0 w-full h-full"
        style={{
          color: colors[1],
          animation: `glitch-2 ${3 / intensity}s infinite linear alternate-reverse`,
          clipPath: "polygon(0 55%, 100% 55%, 100% 100%, 0 100%)",
        }}
        aria-hidden
      >
        {text}
      </span>
      <style jsx>{`
        @keyframes glitch-1 {
          0% { transform: translate(0); }
          20% { transform: translate(-2px, 2px); }
          40% { transform: translate(-2px, -2px); }
          60% { transform: translate(2px, 2px); }
          80% { transform: translate(2px, -2px); }
          100% { transform: translate(0); }
        }
        @keyframes glitch-2 {
          0% { transform: translate(0); }
          20% { transform: translate(2px, -2px); }
          40% { transform: translate(2px, 2px); }
          60% { transform: translate(-2px, -2px); }
          80% { transform: translate(-2px, 2px); }
          100% { transform: translate(0); }
        }
      `}</style>
    </span>
  );
}

// ============================================================================
// MAGNETIC HOVER CARD
// ============================================================================

interface MagneticCardProps {
  children: React.ReactNode;
  className?: string;
  strength?: number;
  borderGlow?: boolean;
  glowColor?: string;
}

export function MagneticCard({
  children,
  className = "",
  strength = 30,
  borderGlow = true,
  glowColor = "#06b6d4",
}: MagneticCardProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!cardRef.current) return;
      const rect = cardRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = ((e.clientX - centerX) / rect.width) * strength;
      const y = ((e.clientY - centerY) / rect.height) * strength;
      setPosition({ x, y });
    },
    [strength]
  );

  return (
    <motion.div
      ref={cardRef}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setPosition({ x: 0, y: 0 });
      }}
      animate={{
        rotateX: -position.y * 0.5,
        rotateY: position.x * 0.5,
        x: position.x * 0.3,
        y: position.y * 0.3,
      }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      style={{ perspective: 1000, transformStyle: "preserve-3d" }}
    >
      {borderGlow && isHovered && (
        <motion.div
          className="absolute inset-0 pointer-events-none rounded-2xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            background: `radial-gradient(circle at ${50 + position.x}% ${50 + position.y}%, ${glowColor}15, transparent 50%)`,
            border: `1px solid ${glowColor}30`,
            borderRadius: "inherit",
          }}
        />
      )}
      {children}
    </motion.div>
  );
}

// ============================================================================
// ANIMATED SPOTLIGHT
// ============================================================================

interface SpotlightProps {
  children: React.ReactNode;
  className?: string;
  color?: string;
  size?: number;
}

export function Spotlight({
  children,
  className = "",
  color = "rgba(6, 182, 212, 0.06)",
  size = 400,
}: SpotlightProps) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }, []);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && (
        <div
          className="absolute pointer-events-none transition-opacity duration-300"
          style={{
            left: mousePos.x - size / 2,
            top: mousePos.y - size / 2,
            width: size,
            height: size,
            background: `radial-gradient(circle, ${color}, transparent 70%)`,
            opacity: isHovered ? 1 : 0,
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ============================================================================
// ANIMATED BORDER GRADIENT
// ============================================================================

interface GradientBorderProps {
  children: React.ReactNode;
  className?: string;
  borderWidth?: number;
  gradient?: string;
  speed?: number;
  rounded?: string;
}

export function GradientBorder({
  children,
  className = "",
  borderWidth = 1,
  gradient = "from-cyan-500 via-violet-500 to-pink-500",
  speed = 3,
  rounded = "rounded-2xl",
}: GradientBorderProps) {
  return (
    <div className={`relative p-[${borderWidth}px] ${rounded} ${className}`}>
      <div
        className={`absolute inset-0 ${rounded} bg-gradient-to-r ${gradient}`}
        style={{
          animation: `border-rotate ${speed}s linear infinite`,
          backgroundSize: "200% 200%",
        }}
      />
      <div className={`relative ${rounded} bg-[var(--bg-surface)]`} style={{ margin: borderWidth }}>
        {children}
      </div>
      <style jsx>{`
        @keyframes border-rotate {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// TYPING CURSOR
// ============================================================================

interface TypingCursorProps {
  text: string;
  speed?: number;
  delay?: number;
  className?: string;
  cursorColor?: string;
  showCursor?: boolean;
  onComplete?: () => void;
}

export function TypingCursor({
  text,
  speed = 50,
  delay = 0,
  className = "",
  cursorColor = "var(--accent-cyan)",
  showCursor = true,
  onComplete,
}: TypingCursorProps) {
  const [displayText, setDisplayText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const timeout = setTimeout(() => {
      let index = 0;
      const interval = setInterval(() => {
        if (index < text.length) {
          setDisplayText(text.slice(0, index + 1));
          index++;
        } else {
          clearInterval(interval);
          setIsComplete(true);
          onComplete?.();
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [isVisible, text, speed, delay, onComplete]);

  return (
    <span ref={ref} className={className}>
      {displayText}
      {showCursor && !isComplete && (
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.7, repeat: Infinity }}
          style={{ color: cursorColor }}
        >
          |
        </motion.span>
      )}
    </span>
  );
}

// ============================================================================
// SCROLL-LINKED PROGRESS INDICATOR
// ============================================================================

interface ScrollProgressProps {
  sections: Array<{ id: string; label: string; icon?: string }>;
  className?: string;
  position?: "left" | "right";
}

export function ScrollProgressIndicator({
  sections,
  className = "",
  position = "right",
}: ScrollProgressProps) {
  const [activeSection, setActiveSection] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      setScrollProgress(scrollTop / docHeight);

      // Find active section
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= window.innerHeight / 3) {
            setActiveSection(i);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [sections]);

  const posClass = position === "left" ? "left-4" : "right-4";

  return (
    <div className={`fixed ${posClass} top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center gap-2 ${className}`}>
      {/* Overall progress line */}
      <div className="w-0.5 h-32 rounded-full relative" style={{ background: "var(--border-primary)" }}>
        <motion.div
          className="absolute top-0 left-0 w-full rounded-full"
          style={{ background: "var(--accent-cyan)" }}
          animate={{ height: `${scrollProgress * 100}%` }}
        />
      </div>

      {/* Section dots */}
      {sections.map((section, i) => (
        <motion.button
          key={section.id}
          onClick={() => {
            const el = document.getElementById(section.id);
            el?.scrollIntoView({ behavior: "smooth" });
          }}
          className="group relative flex items-center"
          whileHover={{ scale: 1.2 }}
        >
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              activeSection === i ? "scale-125" : ""
            }`}
            style={{
              background: activeSection === i ? "var(--accent-cyan)" : "var(--border-primary)",
              boxShadow: activeSection === i ? "0 0 8px var(--accent-cyan)" : "none",
            }}
          />

          {/* Tooltip */}
          <div
            className={`absolute ${position === "right" ? "right-6" : "left-6"} whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded-md text-[10px] font-medium`}
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-primary)",
              color: "var(--text-primary)",
            }}
          >
            {section.icon && <span className="mr-1">{section.icon}</span>}
            {section.label}
          </div>
        </motion.button>
      ))}
    </div>
  );
}

// ============================================================================
// ANIMATED BACKGROUND GRID
// ============================================================================

interface BackgroundGridProps {
  size?: number;
  color?: string;
  dotSize?: number;
  animated?: boolean;
  className?: string;
}

export function BackgroundGrid({
  size = 40,
  color = "var(--border-primary)",
  dotSize = 1,
  animated = true,
  className = "",
}: BackgroundGridProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(${color} ${dotSize}px, transparent ${dotSize}px)`,
          backgroundSize: `${size}px ${size}px`,
          animation: animated ? "grid-move 20s linear infinite" : "none",
        }}
      />
      <style jsx>{`
        @keyframes grid-move {
          0% { transform: translate(0, 0); }
          100% { transform: translate(${size}px, ${size}px); }
        }
      `}</style>
    </div>
  );
}

// ============================================================================
// FLOATING ELEMENTS
// ============================================================================

interface FloatingElement {
  icon: string;
  x: number;
  y: number;
  size?: number;
  delay?: number;
  duration?: number;
  amplitude?: number;
}

interface FloatingElementsProps {
  elements: FloatingElement[];
  className?: string;
}

export function FloatingElements({
  elements,
  className = "",
}: FloatingElementsProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {elements.map((el, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            left: `${el.x}%`,
            top: `${el.y}%`,
            fontSize: el.size || 24,
          }}
          animate={{
            y: [0, -(el.amplitude || 20), 0],
            x: [0, (el.amplitude || 20) * 0.3, 0],
            rotate: [0, 10, -10, 0],
          }}
          transition={{
            duration: el.duration || 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: el.delay || i * 0.5,
          }}
        >
          {el.icon}
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// ANIMATED STACK LIST
// ============================================================================

interface StackItem {
  icon: string;
  name: string;
  description: string;
  color: string;
  badge?: string;
}

interface AnimatedStackListProps {
  items: StackItem[];
  className?: string;
}

export function AnimatedStackList({
  items,
  className = "",
}: AnimatedStackListProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`space-y-2 ${className}`}>
      {items.map((item, i) => (
        <motion.div
          key={item.name}
          initial={{ opacity: 0, x: -20 }}
          animate={isVisible ? { opacity: 1, x: 0 } : {}}
          transition={{ delay: i * 0.06 }}
          className="group flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all"
          style={{
            background: hoveredIndex === i ? `${item.color}08` : "transparent",
            border: `1px solid ${hoveredIndex === i ? item.color + "20" : "transparent"}`,
          }}
          onMouseEnter={() => setHoveredIndex(i)}
          onMouseLeave={() => setHoveredIndex(null)}
          whileHover={{ x: 4 }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
            style={{
              background: `${item.color}10`,
              border: `1px solid ${item.color}20`,
            }}
          >
            {item.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold" style={{ color: hoveredIndex === i ? item.color : "var(--text-primary)" }}>
                {item.name}
              </h4>
              {item.badge && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{
                  background: `${item.color}15`,
                  color: item.color,
                }}>
                  {item.badge}
                </span>
              )}
            </div>
            <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
              {item.description}
            </p>
          </div>
          <motion.div
            className="opacity-0 group-hover:opacity-100"
            animate={hoveredIndex === i ? { x: 0, opacity: 1 } : { x: -5, opacity: 0 }}
          >
            <span className="text-xs" style={{ color: item.color }}>→</span>
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
}

// ============================================================================
// ANIMATED BEFORE/AFTER COMPARISON SLIDER
// ============================================================================

interface BeforeAfterSliderProps {
  beforeLabel?: string;
  afterLabel?: string;
  beforeContent: React.ReactNode;
  afterContent: React.ReactNode;
  className?: string;
  initialPosition?: number;
}

export function BeforeAfterSlider({
  beforeLabel = "Before",
  afterLabel = "After",
  beforeContent,
  afterContent,
  className = "",
  initialPosition = 50,
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      setPosition(Math.max(5, Math.min(95, x)));
    },
    []
  );

  const handleMouseDown = () => setIsDragging(true);
  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const handleTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchend", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, handleMove]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl select-none ${className}`}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      {/* After (full width background) */}
      <div className="absolute inset-0">{afterContent}</div>

      {/* Before (clipped) */}
      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {beforeContent}
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 z-20"
        style={{ left: `${position}%`, background: "white" }}
      >
        {/* Handle */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing"
          style={{
            background: "var(--bg-elevated)",
            border: "2px solid white",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          <span className="text-xs">↔</span>
        </div>
      </div>

      {/* Labels */}
      <div
        className="absolute top-4 left-4 z-10 px-2 py-1 rounded-md text-xs font-medium"
        style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
      >
        {beforeLabel}
      </div>
      <div
        className="absolute top-4 right-4 z-10 px-2 py-1 rounded-md text-xs font-medium"
        style={{ background: "rgba(0,0,0,0.5)", color: "white" }}
      >
        {afterLabel}
      </div>
    </div>
  );
}

export default CursorTrail;
