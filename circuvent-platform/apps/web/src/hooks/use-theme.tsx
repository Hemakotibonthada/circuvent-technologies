"use client";

// ══════════════════════════════════════════════════════════════
// Theme Provider — Auto-syncs with system preference
// Supports: "light", "dark", "system"
// Persists user choice in localStorage
// ══════════════════════════════════════════════════════════════

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeCtx {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: "system",
  resolvedTheme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: true,
});

const STORAGE_KEY = "circuvent_theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.colorScheme = "light";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage or system
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial = stored && ["light", "dark", "system"].includes(stored) ? stored : "system";
    setThemeState(initial);
    const resolved = resolveTheme(initial);
    setResolvedTheme(resolved);
    applyTheme(resolved);
    setMounted(true);
  }, []);

  // Listen for system theme changes (when set to "system")
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        const resolved = getSystemTheme();
        setResolvedTheme(resolved);
        applyTheme(resolved);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(STORAGE_KEY, newTheme);
    const resolved = resolveTheme(newTheme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, []);

  const toggleTheme = useCallback(() => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }, [resolvedTheme, setTheme]);

  // Prevent flash of wrong theme
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme, isDark: resolvedTheme === "dark" }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Theme toggle button component with sun/moon animation
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
        aria-label="Toggle theme"
      >
        {/* Sun icon */}
        <svg
          className={`absolute h-4 w-4 text-amber-500 transition-all duration-500 ${
            resolvedTheme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
        {/* Moon icon */}
        <svg
          className={`absolute h-4 w-4 text-blue-400 transition-all duration-500 ${
            resolvedTheme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </button>

      {/* System sync button */}
      <button
        onClick={() => setTheme("system")}
        className={`flex h-6 items-center rounded px-1.5 text-[10px] font-medium transition-all ${
          theme === "system"
            ? "bg-brand-500/20 text-brand-500"
            : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-600 dark:text-slate-300"
        }`}
        title="Sync with system theme"
      >
        Auto
      </button>
    </div>
  );
}
