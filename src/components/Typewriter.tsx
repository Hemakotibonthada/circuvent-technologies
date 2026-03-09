"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  cursor?: boolean;
  className?: string;
  onComplete?: () => void;
}

export default function Typewriter({
  text,
  speed = 50,
  delay = 0,
  cursor = true,
  className,
  onComplete,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;

    let index = 0;
    const timer = setTimeout(() => {
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

    return () => clearTimeout(timer);
  }, [text, speed, delay, isInView, onComplete]);

  return (
    <span ref={ref} className={className}>
      {displayText}
      {cursor && !isComplete && (
        <motion.span
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.8, repeat: Infinity }}
          className="inline-block ml-0.5"
          style={{ color: "var(--accent-cyan)" }}
        >
          |
        </motion.span>
      )}
    </span>
  );
}
