"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "aurora" | "glass" | "neo";
export type Scheme = "dark" | "light";

export interface Accent {
  key: string;
  label: string;
  color: string;
  colorHi: string;
  grad: readonly [string, string];
}

export const ACCENTS: Accent[] = [
  { key: "brand", label: "Circuvent", color: "#06b6d4", colorHi: "#22d3ee", grad: ["#06b6d4", "#8b5cf6"] },
  { key: "violet", label: "Violet", color: "#8b5cf6", colorHi: "#a855f7", grad: ["#7c3aed", "#a855f7"] },
  { key: "blue", label: "Blue", color: "#3b82f6", colorHi: "#60a5fa", grad: ["#2563eb", "#3b82f6"] },
  { key: "green", label: "Green", color: "#22c55e", colorHi: "#4ade80", grad: ["#16a34a", "#22c55e"] },
  { key: "orange", label: "Orange", color: "#f97316", colorHi: "#fb923c", grad: ["#ea580c", "#f97316"] },
  { key: "red", label: "Red", color: "#ef4444", colorHi: "#f87171", grad: ["#dc2626", "#ef4444"] },
  { key: "teal", label: "Teal", color: "#14b8a6", colorHi: "#2dd4bf", grad: ["#0d9488", "#14b8a6"] },
];

const KEY = "cv-console-theme";

interface ThemeValue {
  mode: ThemeMode;
  scheme: Scheme;
  accent: Accent;
  setMode: (m: ThemeMode) => void;
  setScheme: (s: Scheme) => void;
  setAccentKey: (k: string) => void;
  cardClass: string;
}

const Ctx = createContext<ThemeValue | null>(null);

function accentByKey(key: string) {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];
}

function vars(mode: ThemeMode, scheme: Scheme, accent: Accent): React.CSSProperties {
  const dark = scheme === "dark";
  const base = {
    "--cv-accent": accent.color,
    "--cv-accent-2": accent.grad[1],
    "--cv-accent-hi": accent.colorHi,
    "--cv-gradient": `linear-gradient(135deg, ${accent.grad[0]}, ${accent.grad[1]})`,
  } as React.CSSProperties;
  if (mode === "neo") {
    return {
      ...base,
      "--cv-bg": dark ? "#20263a" : "#e6e9f2",
      "--cv-card": dark ? "#20263a" : "#e6e9f2",
      "--cv-card-hi": dark ? "#262d45" : "#eef1f8",
      "--cv-input-bg": dark ? "#171c2c" : "#dde1ee",
      "--cv-border": dark ? "rgba(255,255,255,.08)" : "rgba(255,255,255,.75)",
      "--cv-text": dark ? "#e7ecff" : "#24304f",
      "--cv-muted": dark ? "#9aa6c8" : "#5b6488",
      "--cv-neo-light": dark ? "#2b3350" : "#ffffff",
      "--cv-neo-dark": dark ? "#141a2b" : "#c3c9da",
    } as React.CSSProperties;
  }
  if (mode === "glass") {
    return {
      ...base,
      "--cv-bg": `radial-gradient(circle at top left, ${accent.grad[0]}55, transparent 35%), radial-gradient(circle at 80% 20%, ${accent.grad[1]}44, transparent 30%), ${dark ? "#071021" : "#eef2ff"}`,
      "--cv-card": dark ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.50)",
      "--cv-card-hi": dark ? "rgba(255,255,255,.15)" : "rgba(255,255,255,.66)",
      "--cv-input-bg": dark ? "rgba(3,7,18,.45)" : "rgba(255,255,255,.72)",
      "--cv-border": dark ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.65)",
      "--cv-text": dark ? "#f4f7ff" : "#0b1020",
      "--cv-muted": dark ? "rgba(233,238,255,.72)" : "#33405e",
      "--cv-neo-light": "#ffffff",
      "--cv-neo-dark": "#111827",
    } as React.CSSProperties;
  }
  return {
    ...base,
    "--cv-bg": dark ? "#0b1020" : "#f3f6ff",
    "--cv-card": dark ? "#111a2e" : "#ffffff",
    "--cv-card-hi": dark ? "#17213a" : "#f7f9ff",
    "--cv-input-bg": dark ? "#0a1120" : "#f1f4fb",
    "--cv-border": dark ? "rgba(255,255,255,.10)" : "rgba(15,23,42,.10)",
    "--cv-text": dark ? "#eef1f8" : "#0b1020",
    "--cv-muted": dark ? "#9aa6c0" : "#475569",
    "--cv-neo-light": "#ffffff",
    "--cv-neo-dark": "#c3c9da",
  } as React.CSSProperties;
}

export function ConsoleThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("aurora");
  const [scheme, setScheme] = useState<Scheme>("dark");
  const [accentKey, setAccentKey] = useState("brand");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{ mode: ThemeMode; scheme: Scheme; accentKey: string }>;
      if (saved.mode) setMode(saved.mode);
      if (saved.scheme) setScheme(saved.scheme);
      if (saved.accentKey) setAccentKey(saved.accentKey);
    } catch {
      /* ignore corrupt preference */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify({ mode, scheme, accentKey }));
  }, [mode, scheme, accentKey]);

  const accent = accentByKey(accentKey);
  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      scheme,
      accent,
      setMode,
      setScheme,
      setAccentKey,
      cardClass:
        mode === "glass"
          ? "cv-card cv-glass"
          : mode === "neo"
            ? "cv-card cv-neo"
            : "cv-card",
    }),
    [mode, scheme, accent]
  );

  return (
    <Ctx.Provider value={value}>
      <div className={`cv-theme cv-${mode} cv-${scheme}`} style={vars(mode, scheme, accent)}>
        {children}
      </div>
      <style jsx global>{`
        .cv-theme {
          min-height: 100vh;
          background: var(--cv-bg);
          color: var(--cv-text);
        }
        .cv-card {
          border: 1px solid var(--cv-border);
          background: var(--cv-card);
        }
        .cv-glass {
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 70px rgba(0, 0, 0, 0.22);
        }
        .cv-neo {
          box-shadow: -8px -8px 18px var(--cv-neo-light), 10px 10px 22px var(--cv-neo-dark);
        }
        .cv-gradient {
          background: var(--cv-gradient);
        }
        .cv-input {
          width: 100%;
          border: 1px solid var(--cv-border);
          background: var(--cv-input-bg);
          border-radius: 0.75rem;
          padding: 0.7rem 0.85rem;
          color: var(--cv-text);
          outline: none;
        }
        .cv-input:focus {
          border-color: var(--cv-accent);
        }
        .cv-input::placeholder {
          color: var(--cv-muted);
        }
        .cv-input option {
          background: #0f1629;
          color: white;
        }

        /* The marketing shell applies a site-wide rule setting every input,
           textarea and select background to var(--input-bg). That rule (0,1,1)
           outranks Tailwind's .bg-transparent (0,1,0), so every bare control
           inside the console was painted with the light marketing surface —
           the white boxes visible even in dark mode. Re-bind them to the
           console's own theme; the leading :root lifts these rules above the
           global one. */
        :root .cv-theme input,
        :root .cv-theme textarea,
        :root .cv-theme select {
          background: var(--cv-input-bg);
          color: var(--cv-text);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        :root .cv-theme input.bg-transparent,
        :root .cv-theme textarea.bg-transparent,
        :root .cv-theme select.bg-transparent {
          background: transparent;
        }
        :root .cv-theme input[type="checkbox"],
        :root .cv-theme input[type="radio"],
        :root .cv-theme input[type="range"],
        :root .cv-theme input[type="color"] {
          background: initial;
        }

        /* ---- Light-scheme remap ------------------------------------------
           The console was authored dark-first: ~1,100 Tailwind neutrals under
           /smarthome hardcode white text and black scrims. Remapping them once
           here — scoped to .cv-light so dark mode is untouched — is what makes
           the light scheme legible without editing every file. The doubled
           backslashes escape the "/" in Tailwind's fractional-opacity class
           names through the template literal. */
        .cv-theme.cv-light .text-white,
        .cv-theme.cv-light .text-slate-100,
        .cv-theme.cv-light .text-slate-200,
        .cv-theme.cv-light .text-slate-300 {
          color: var(--cv-text);
        }
        .cv-theme.cv-light .text-slate-400,
        .cv-theme.cv-light .text-slate-500,
        .cv-theme.cv-light .text-slate-600 {
          color: var(--cv-muted);
        }
        /* Status colours are authored at 300/400 for dark surfaces. On a white
           card those are pale-on-pale, so they drop to the 600/700 ramp where
           they keep the same meaning and pass contrast. */
        .cv-theme.cv-light .text-red-300,
        .cv-theme.cv-light .text-red-400 {
          color: #b91c1c;
        }
        .cv-theme.cv-light .text-amber-300,
        .cv-theme.cv-light .text-amber-400 {
          color: #b45309;
        }
        .cv-theme.cv-light .text-emerald-300,
        .cv-theme.cv-light .text-emerald-400 {
          color: #047857;
        }
        .cv-theme.cv-light .text-cyan-300,
        .cv-theme.cv-light .text-cyan-400 {
          color: #0e7490;
        }
        /* Tailwind's fractional-opacity class names contain "/", which cannot
           be backslash-escaped through styled-jsx's parser. [class~="..."]
           matches one whole class token instead, so it needs no escaping and
           still won't leak onto variants like hover:bg-white/10. */
        .cv-theme.cv-light [class~="bg-black/20"],
        .cv-theme.cv-light [class~="bg-black/25"],
        .cv-theme.cv-light [class~="bg-black/30"],
        .cv-theme.cv-light [class~="bg-black/40"],
        .cv-theme.cv-light [class~="bg-white/5"],
        .cv-theme.cv-light [class~="bg-white/10"],
        .cv-theme.cv-light [class~="bg-white/[0.02]"],
        .cv-theme.cv-light [class~="bg-white/[0.03]"] {
          background-color: rgba(15, 23, 42, 0.05);
        }
        .cv-theme.cv-light [class~="hover:bg-white/5"]:hover,
        .cv-theme.cv-light [class~="hover:bg-white/10"]:hover,
        .cv-theme.cv-light [class~="hover:bg-white/[0.05]"]:hover {
          background-color: rgba(15, 23, 42, 0.09);
        }
        .cv-theme.cv-light [class~="border-white/5"],
        .cv-theme.cv-light [class~="border-white/10"],
        .cv-theme.cv-light [class~="border-white/15"],
        .cv-theme.cv-light [class~="border-white/20"],
        .cv-theme.cv-light [class~="hover:border-white/20"]:hover {
          border-color: var(--cv-border);
        }
        /* Anything sitting on an accent fill keeps white text. The descendant
           combinator means the theme root — which merely *defines*
           --cv-gradient — can never match itself. */
        .cv-theme.cv-light .cv-gradient,
        .cv-theme.cv-light .cv-gradient *,
        .cv-theme.cv-light [style*="--cv-gradient"],
        .cv-theme.cv-light [style*="--cv-gradient"] * {
          color: #ffffff;
        }
        /* Command-in-flight shimmer used by the Toggle control. */
        @keyframes cvSweep {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
        .cv-sweep {
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.45), transparent);
          animation: cvSweep 1s linear infinite;
        }
        @keyframes cvPop {
          0% {
            transform: scale(1);
          }
          40% {
            transform: scale(1.06);
          }
          100% {
            transform: scale(1);
          }
        }
        .cv-pop {
          animation: cvPop 0.28s ease-out;
        }
        /* Container-level "command in flight": shimmers over a card without
           moving or repainting the card itself. */
        .cv-pending {
          position: relative;
          overflow: hidden;
        }
        .cv-pending::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.18), transparent);
          animation: cvSweep 1.1s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cv-sweep,
          .cv-pop {
            animation: none;
          }
          .cv-pending::after {
            animation: none;
            background: rgba(56, 189, 248, 0.1);
          }
        }
      `}</style>
    </Ctx.Provider>
  );
}

export function useConsoleTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConsoleTheme must be used within ConsoleThemeProvider");
  return ctx;
}
