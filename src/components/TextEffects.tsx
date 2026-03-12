"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useInView } from "framer-motion";

/**
 * Text Scramble Effect — characters randomly shuffle before resolving to final text.
 * Inspired by sci-fi interfaces and terminal boot sequences.
 */

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,./<>?";

interface TextScrambleProps {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  scrambleDuration?: number;
  trigger?: "inView" | "hover" | "mount";
  onComplete?: () => void;
}

export default function TextScramble({
  text,
  className,
  speed = 30,
  delay = 0,
  scrambleDuration = 1500,
  trigger = "inView",
  onComplete,
}: TextScrambleProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isScrambling, setIsScrambling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const hasTriggered = useRef(false);

  const scramble = useCallback(() => {
    if (isScrambling) return;
    setIsScrambling(true);

    const finalText = text;
    const length = finalText.length;
    let iteration = 0;
    const maxIterations = Math.ceil(scrambleDuration / speed);

    const interval = setInterval(() => {
      setDisplayText(
        finalText
          .split("")
          .map((char, i) => {
            if (char === " ") return " ";
            if (i < Math.floor((iteration / maxIterations) * length)) {
              return finalText[i];
            }
            return CHARS[Math.floor(Math.random() * CHARS.length)];
          })
          .join("")
      );

      iteration++;

      if (iteration >= maxIterations) {
        clearInterval(interval);
        setDisplayText(finalText);
        setIsScrambling(false);
        onComplete?.();
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, scrambleDuration, isScrambling, onComplete]);

  useEffect(() => {
    if (trigger === "mount" && !hasTriggered.current) {
      hasTriggered.current = true;
      const timer = setTimeout(scramble, delay);
      return () => clearTimeout(timer);
    }
  }, [trigger, delay, scramble]);

  useEffect(() => {
    if (trigger === "inView" && isInView && !hasTriggered.current) {
      hasTriggered.current = true;
      const timer = setTimeout(scramble, delay);
      return () => clearTimeout(timer);
    }
  }, [trigger, isInView, delay, scramble]);

  useEffect(() => {
    if (trigger === "hover" && isHovered) {
      scramble();
    }
  }, [trigger, isHovered, scramble]);

  return (
    <span
      ref={ref}
      className={`font-mono ${className || ""}`}
      onMouseEnter={() => trigger === "hover" && setIsHovered(true)}
      onMouseLeave={() => trigger === "hover" && setIsHovered(false)}
    >
      {displayText}
    </span>
  );
}

/**
 * Rotating Words — cycles through an array of words with animation
 */
interface RotatingWordsProps {
  words: string[];
  interval?: number;
  className?: string;
  gradient?: string;
}

export function RotatingWords({
  words,
  interval = 3000,
  className,
  gradient = "from-cyan-500 via-violet-500 to-pink-500",
}: RotatingWordsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % words.length);
    }, interval);
    return () => clearInterval(timer);
  }, [words.length, interval]);

  return (
    <span className={`relative inline-block overflow-hidden ${className || ""}`}>
      {words.map((word, i) => (
        <motion.span
          key={word}
          className={`${i === currentIndex ? "relative" : "absolute"} inline-block bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}
          initial={{ y: 40, opacity: 0, rotateX: -90 }}
          animate={
            i === currentIndex
              ? { y: 0, opacity: 1, rotateX: 0 }
              : { y: -40, opacity: 0, rotateX: 90 }
          }
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ left: 0, top: 0 }}
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Typing effect with multiple lines and cursor
 */
interface MultiLineTyperProps {
  lines: { text: string; color?: string; delay?: number }[];
  typingSpeed?: number;
  className?: string;
  showCursor?: boolean;
  loop?: boolean;
}

export function MultiLineTyper({
  lines,
  typingSpeed = 40,
  className,
  showCursor = true,
  loop = false,
}: MultiLineTyperProps) {
  const [currentLine, setCurrentLine] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completedLines, setCompletedLines] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: !loop });

  useEffect(() => {
    if (!isInView) return;
    if (currentLine >= lines.length) {
      if (loop) {
        setTimeout(() => {
          setCurrentLine(0);
          setCurrentChar(0);
          setCompletedLines([]);
        }, 2000);
      }
      return;
    }

    const line = lines[currentLine];
    const lineDelay = line.delay || 0;

    if (currentChar === 0 && lineDelay > 0) {
      const timer = setTimeout(() => setCurrentChar(1), lineDelay);
      return () => clearTimeout(timer);
    }

    if (currentChar <= line.text.length) {
      const timer = setTimeout(() => {
        setCurrentChar((prev) => prev + 1);
      }, typingSpeed);
      return () => clearTimeout(timer);
    } else {
      // Line complete
      setCompletedLines((prev) => [...prev, line.text]);
      setCurrentLine((prev) => prev + 1);
      setCurrentChar(0);
    }
  }, [currentChar, currentLine, isInView, lines, typingSpeed, loop]);

  return (
    <div ref={ref} className={`font-mono text-sm ${className || ""}`}>
      {completedLines.map((line, i) => (
        <div key={i} style={{ color: lines[i]?.color || "var(--text-secondary)" }}>
          <span style={{ color: "var(--accent-cyan)" }}>$ </span>
          {line}
        </div>
      ))}
      {currentLine < lines.length && (
        <div style={{ color: lines[currentLine]?.color || "var(--text-secondary)" }}>
          <span style={{ color: "var(--accent-cyan)" }}>$ </span>
          {lines[currentLine].text.slice(0, currentChar)}
          {showCursor && (
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 0.6, repeat: Infinity }}
              style={{ color: "var(--accent-cyan)" }}
            >
              █
            </motion.span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Morphing text that transitions between shapes
 */
interface MorphTextProps {
  texts: string[];
  interval?: number;
  className?: string;
}

export function MorphText({ texts, interval = 3000, className }: MorphTextProps) {
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % texts.length);
        setIsAnimating(false);
      }, 500);
    }, interval);
    return () => clearInterval(timer);
  }, [texts.length, interval]);

  return (
    <motion.span
      className={className}
      animate={{
        filter: isAnimating ? "blur(8px)" : "blur(0px)",
        opacity: isAnimating ? 0.3 : 1,
        scale: isAnimating ? 0.95 : 1,
      }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {texts[index]}
    </motion.span>
  );
}

/**
 * Letter-by-letter stagger reveal
 */
export function StaggerLetters({
  text,
  className,
  delay = 0,
  stagger = 0.03,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  return (
    <span ref={ref} className={className}>
      {text.split("").map((char, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ opacity: 0, y: 20, rotateX: -90 }}
          animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
          transition={{
            duration: 0.4,
            delay: delay + i * stagger,
            ease: [0.22, 1, 0.36, 1],
          }}
          style={{ display: char === " " ? "inline" : "inline-block" }}
        >
          {char === " " ? "\u00A0" : char}
        </motion.span>
      ))}
    </span>
  );
}
