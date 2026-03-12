"use client";

import { motion } from "framer-motion";
import { useScrollProgress } from "@/hooks/useScrollProgress";

interface ScrollProgressBarProps {
  className?: string;
  position?: "top" | "bottom";
  height?: number;
}

export default function ScrollProgressBar({
  className,
  position = "top",
  height = 3,
}: ScrollProgressBarProps) {
  const progress = useScrollProgress();

  return (
    <div
      className={`fixed left-0 right-0 z-[60] ${
        position === "top" ? "top-0" : "bottom-0"
      } ${className || ""}`}
      style={{ height: `${height}px` }}
    >
      <motion.div
        className="h-full bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500"
        style={{
          width: `${progress * 100}%`,
          transformOrigin: "left",
        }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}
