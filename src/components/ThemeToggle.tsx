"use client";

import { motion } from "framer-motion";
import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const currentIdx = order.indexOf(theme);
    const next = order[(currentIdx + 1) % order.length];
    setTheme(next);
  };

  const Icon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  const label =
    theme === "system"
      ? "System"
      : resolvedTheme === "dark"
      ? "Dark"
      : "Light";

  return (
    <motion.button
      onClick={cycleTheme}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.92 }}
      className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl cursor-pointer transition-all duration-300"
      style={{
        background: "var(--accent-cyan-muted)",
        border: "1px solid var(--border-primary)",
        color: "var(--accent-cyan)",
      }}
      aria-label={`Switch theme — current: ${label}`}
      title={`Theme: ${label}`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Icon className="w-4 h-4" />
      </motion.div>
    </motion.button>
  );
}
