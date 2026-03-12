"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "gradient" | "striped";
  className?: string;
  animate?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  size = "md",
  variant = "default",
  className,
  animate = true,
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const sizeClasses = {
    sm: "h-1",
    md: "h-2",
    lg: "h-3",
  };

  const barStyles: Record<string, string> = {
    default: "bg-cyan-500",
    gradient: "bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500",
    striped: "bg-cyan-500",
  };

  return (
    <div className={cn("w-full", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && (
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              {label}
            </span>
          )}
          {showValue && (
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}
      <div
        className={cn("w-full rounded-full overflow-hidden", sizeClasses[size])}
        style={{ background: "var(--border-primary)" }}
      >
        <motion.div
          className={cn(
            "h-full rounded-full",
            barStyles[variant],
            variant === "striped" &&
              "bg-[length:1rem_1rem] bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)] animate-[shimmer_1s_linear_infinite]"
          )}
          initial={animate ? { width: 0 } : { width: `${percentage}%` }}
          animate={{ width: `${percentage}%` }}
          transition={
            animate
              ? { duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }
              : undefined
          }
        />
      </div>
    </div>
  );
}
