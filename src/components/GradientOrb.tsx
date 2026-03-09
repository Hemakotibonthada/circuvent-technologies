"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";

interface GradientOrbProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  color?: "cyan" | "violet" | "pink" | "emerald";
  animate?: boolean;
  blur?: number;
}

const colorMap = {
  cyan: { light: "rgba(8, 145, 178, 0.08)", dark: "rgba(6, 182, 212, 0.12)" },
  violet: { light: "rgba(124, 58, 237, 0.08)", dark: "rgba(139, 92, 246, 0.12)" },
  pink: { light: "rgba(219, 39, 119, 0.06)", dark: "rgba(236, 72, 153, 0.10)" },
  emerald: { light: "rgba(16, 185, 129, 0.06)", dark: "rgba(52, 211, 153, 0.10)" },
};

const sizeMap = {
  sm: "w-[200px] h-[200px]",
  md: "w-[400px] h-[400px]",
  lg: "w-[600px] h-[600px]",
};

export default function GradientOrb({
  className,
  size = "md",
  color = "cyan",
  animate = true,
  blur = 120,
}: GradientOrbProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const bgColor = isDark ? colorMap[color].dark : colorMap[color].light;

  return (
    <motion.div
      className={`rounded-full pointer-events-none ${sizeMap[size]} ${className || ""}`}
      style={{
        background: bgColor,
        filter: `blur(${blur}px)`,
      }}
      animate={
        animate
          ? {
              scale: [1, 1.1, 1],
              opacity: [0.6, 0.8, 0.6],
            }
          : undefined
      }
      transition={
        animate
          ? {
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : undefined
      }
    />
  );
}
