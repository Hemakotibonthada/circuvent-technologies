"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

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

/* Console default. Glass-on-dark is the house look: the accessory tiles read
   as frosted panes over the accent wash, which is what the product screenshots
   and the mobile app ship with. Changing these two constants changes the
   default everywhere — every consumer reads them rather than hard-coding. */
export const DEFAULT_MODE: ThemeMode = "glass";
export const DEFAULT_SCHEME: Scheme = "dark";

/* The preference written by builds before glass-dark became the default. The
   old provider persisted its defaults on first paint, so a stored value of
   exactly this triple cannot be distinguished from "never chose anything" —
   we treat it as unset and adopt the new default. Anything else was a
   deliberate choice and is preserved. */
const LEGACY_DEFAULT = { mode: "aurora", scheme: "dark", accentKey: "brand" } as const;

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

/**
 * Accessory category tints.
 *
 * Apple's Home app colour-codes accessories by what they *do* rather than by a
 * single app accent, which is what lets a wall of tiles be read at a glance.
 * These are the anchor hues; `categoryTint()` in `_kit/primitives` maps a
 * Circuvent device type onto one of them.
 */
export const CATEGORY_TINTS = {
  lights: "#f0a020",
  climate: "#3aa2f5",
  security: "#34c759",
  water: "#0a84ff",
  entry: "#30b0c7",
  power: "#ff9f0a",
  alert: "#ff453a",
  neutral: "#8e8e93",
} as const;

export type CategoryKey = keyof typeof CATEGORY_TINTS;

function vars(mode: ThemeMode, scheme: Scheme, accent: Accent): React.CSSProperties {
  const dark = scheme === "dark";
  const base = {
    "--cv-accent": accent.color,
    "--cv-accent-2": accent.grad[1],
    "--cv-accent-hi": accent.colorHi,
    "--cv-gradient": `linear-gradient(135deg, ${accent.grad[0]}, ${accent.grad[1]})`,

    /* Corner radii. Apple's tiles use a large, consistent curve with nested
       controls stepping down rather than matching — a flat 8px everywhere is
       the single biggest thing that stops a UI reading as "Home"-like. */
    "--cv-r-tile": "22px",
    "--cv-r-card": "18px",
    "--cv-r-control": "13px",
    "--cv-r-chip": "9px",
    "--cv-r-pill": "999px",

    /* Elevation. Wide, soft and very low-alpha: Apple separates surfaces with
       blur and a hairline, not with a hard drop shadow. */
    "--cv-shadow-1": dark
      ? "0 1px 2px rgba(0,0,0,.36)"
      : "0 1px 2px rgba(16,24,40,.05)",
    "--cv-shadow-2": dark
      ? "0 2px 6px rgba(0,0,0,.34), 0 12px 32px rgba(0,0,0,.30)"
      : "0 1px 3px rgba(16,24,40,.06), 0 10px 28px rgba(16,24,40,.07)",
    "--cv-shadow-3": dark
      ? "0 8px 24px rgba(0,0,0,.46), 0 30px 70px rgba(0,0,0,.42)"
      : "0 8px 22px rgba(16,24,40,.10), 0 28px 64px rgba(16,24,40,.12)",

    /* Fill used by an *active* accessory tile. Apple inverts the tile — bright
       fill, dark label — so "on" is legible from across the room. */
    "--cv-tile-on": dark ? "rgba(255,255,255,.92)" : "#ffffff",
    "--cv-tile-on-text": "#1c1c1e",
    "--cv-tile-on-muted": "rgba(60,60,67,.62)",

    /* Separator hairline, distinct from the card border. */
    "--cv-separator": dark ? "rgba(255,255,255,.09)" : "rgba(60,60,67,.14)",

    ...Object.fromEntries(
      Object.entries(CATEGORY_TINTS).map(([k, v]) => [`--cv-cat-${k}`, v])
    ),
  } as React.CSSProperties;
  if (mode === "neo") {
    /*
     * Matched to the iOS app's neo palette, value for value.
     *
     * The console had its own neo — a neutral grey/black one — while the app
     * used a blue-tinted set, so the same named theme was two different designs
     * depending on which screen you were looking at. These are now the exact
     * values from mobile/src/theme.ts, so a user switching between phone and
     * browser sees one product.
     *
     * Neumorphism reads as extruded only when both shadows are present, so the
     * surface has to sit *level* with the canvas rather than above it: card and
     * bg are deliberately the same colour, and the depth comes entirely from
     * --cv-neo-light and --cv-neo-dark in .cv-neo below.
     */
    return {
      ...base,
      "--cv-bg": dark ? "#20263a" : "#e6e9f2",
      "--cv-card": dark ? "#20263a" : "#e6e9f2",
      "--cv-card-hi": dark ? "#262d45" : "#eef1f8",
      "--cv-input-bg": dark ? "#1b2133" : "#dfe3ee",
      "--cv-border": dark ? "rgba(255,255,255,.05)" : "rgba(255,255,255,.7)",
      "--cv-text": dark ? "#e7ecff" : "#2a3350",
      "--cv-muted": dark ? "#9aa6c8" : "#5b6488",
      "--cv-neo-light": dark ? "#2b3350" : "#ffffff",
      "--cv-neo-dark": dark ? "#141a2b" : "#c3c9da",
    } as React.CSSProperties;
  }
  if (mode === "glass") {
    /*
     * A darkroom, not a poster.
     *
     * Glass used to be frosted white panes over a vivid accent gradient — the
     * backdrop was the loudest thing on the page, and every card came out the
     * same milky grey regardless of what was in it. The canvas is now almost
     * black and almost colourless: the panes are barely lighter than it, and the
     * only colour in the room is a warm bloom high on the left and a cold one
     * low on the right, both too faint to read as shapes.
     *
     * Contrast comes from light rather than from fill, which is what makes a lit
     * accessory tile stand out without being painted in.
     *
     * Kept in step with the app's glass palette in mobile/src/theme.ts; a test
     * checks they have not drifted, because two applications agreeing on a look
     * by eye is how they stop agreeing.
     */
    return {
      ...base,
      "--cv-bg": dark
        ? `radial-gradient(880px 520px at 8% -10%, rgba(255,138,61,.10), transparent 60%), radial-gradient(760px 480px at 96% 104%, rgba(61,123,255,.08), transparent 58%), #0a0a0c`
        : `radial-gradient(880px 520px at 8% -10%, rgba(255,217,168,.5), transparent 60%), radial-gradient(760px 480px at 96% 104%, rgba(168,200,255,.45), transparent 58%), #f0f1f6`,
      "--cv-card": dark ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.66)",
      "--cv-card-hi": dark ? "rgba(255,255,255,.075)" : "rgba(255,255,255,.8)",
      "--cv-input-bg": dark ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.8)",
      "--cv-border": dark ? "rgba(255,255,255,.07)" : "rgba(15,20,35,.07)",
      "--cv-text": dark ? "#f7f8fa" : "#0b1020",
      "--cv-muted": dark ? "rgba(240,242,248,.66)" : "rgba(59,70,97,.75)",
      "--cv-neo-light": dark ? "#1a1a1f" : "#ffffff",
      "--cv-neo-dark": dark ? "#050506" : "#c3c9da",
    } as React.CSSProperties;
  }
  /* Default surface. Apple's Home uses a near-black (dark) or systemGrouped
     grey (light) canvas with *elevated* neutral tiles, so colour comes from the
     accessories themselves. The accent survives only as a faint wash at the top
     of the canvas — enough for the accent picker to still mean something
     without tinting every surface. */
  return {
    ...base,
    "--cv-bg": dark
      ? `radial-gradient(1200px 620px at 12% -12%, ${accent.grad[0]}1f, transparent 62%), radial-gradient(900px 520px at 92% -4%, ${accent.grad[1]}16, transparent 56%), #000000`
      : `radial-gradient(1200px 620px at 12% -12%, ${accent.grad[0]}14, transparent 62%), radial-gradient(900px 520px at 92% -4%, ${accent.grad[1]}0f, transparent 56%), #f2f2f7`,
    "--cv-card": dark ? "#1c1c1e" : "#ffffff",
    "--cv-card-hi": dark ? "#2c2c2e" : "#f2f2f7",
    "--cv-input-bg": dark ? "#2c2c2e" : "#f2f2f7",
    "--cv-border": dark ? "rgba(255,255,255,.08)" : "rgba(60,60,67,.12)",
    "--cv-text": dark ? "#ffffff" : "#000000",
    "--cv-muted": dark ? "rgba(235,235,245,.62)" : "rgba(60,60,67,.62)",
    "--cv-neo-light": "#ffffff",
    "--cv-neo-dark": "#c3c9da",
  } as React.CSSProperties;
}

export function ConsoleThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_MODE);
  const [scheme, setScheme] = useState<Scheme>(DEFAULT_SCHEME);
  const [accentKey, setAccentKey] = useState("brand");
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<{ mode: ThemeMode; scheme: Scheme; accentKey: string }>;
      const untouched =
        saved.mode === LEGACY_DEFAULT.mode &&
        saved.scheme === LEGACY_DEFAULT.scheme &&
        saved.accentKey === LEGACY_DEFAULT.accentKey;
      if (untouched) return;
      if (saved.mode) setMode(saved.mode);
      if (saved.scheme) setScheme(saved.scheme);
      if (saved.accentKey) setAccentKey(saved.accentKey);
    } catch {
      /* ignore corrupt preference */
    } finally {
      hydrated.current = true;
    }
  }, []);

  useEffect(() => {
    /* Don't write on the very first pass — that would stamp the default over a
       stored preference before the restore effect above has had a chance to
       apply it. */
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    localStorage.setItem(KEY, JSON.stringify({ mode, scheme, accentKey }));
  }, [mode, scheme, accentKey]);

  const accent = accentByKey(accentKey);

  /*
   * Publish the theme to the document element as well as to the wrapper.
   *
   * The --cv-* variables were only ever inline styles on the div below, so
   * they existed for its descendants and nowhere else. Overlays render through
   * a portal into document.body — deliberately, so a parent with overflow
   * hidden cannot clip them — which puts them outside that subtree. Inside a
   * portal every var(--cv-input-bg) resolved to nothing, the marketing shell's
   * site-wide `input, textarea, select` rule was the only one left standing,
   * and every field in every modal was painted with the light marketing
   * surface. That is the white boxes on the dark automation dialog: not a
   * colour chosen badly, a colour that was never reachable.
   *
   * Mirroring onto :root fixes it for every portal at once, including ones not
   * written yet. The names are all --cv-* prefixed and only consumed by
   * console CSS, so nothing on a marketing page reads them; they are removed
   * on unmount regardless.
   */
  useEffect(() => {
    const root = document.documentElement;
    const applied = vars(mode, scheme, accent) as Record<string, string>;
    for (const [k, v] of Object.entries(applied)) {
      if (k.startsWith("--")) root.style.setProperty(k, v);
    }
    root.setAttribute("data-cv-mode", mode);
    root.setAttribute("data-cv-scheme", scheme);
    return () => {
      for (const k of Object.keys(applied)) {
        if (k.startsWith("--")) root.style.removeProperty(k);
      }
      root.removeAttribute("data-cv-mode");
      root.removeAttribute("data-cv-scheme");
    };
  }, [mode, scheme, accent]);

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
          background-attachment: fixed;
          color: var(--cv-text);
          /* SF Pro where it exists (Apple hardware), then Windows' Segoe UI
             Variable, which shares the same optical-size behaviour and is the
             closest match on the machines this console actually runs on. */
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text",
            "Segoe UI Variable Display", "Segoe UI Variable", "Segoe UI", Inter, system-ui,
            Roboto, "Helvetica Neue", Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
          font-feature-settings: "cv01", "ss01";
        }
        /* A portal's themed wrapper carries .cv-theme so every descendant rule
           below still applies inside overlays — but it must not also become a
           full-height painted surface, or an open modal would lay an opaque
           page background over everything behind it. */
        [data-cv-portal].cv-theme,
        [data-cv-portal] .cv-theme {
          min-height: 0;
          background: none;
        }
        /* Apple sets tight tracking on display text and lets it loosen as the
           size drops. Doing it once here keeps every heading in the console
           consistent without each screen restating a tracking utility. */
        .cv-theme h1 {
          letter-spacing: -0.024em;
        }
        .cv-theme h2,
        .cv-theme h3 {
          letter-spacing: -0.016em;
        }
        .cv-theme .cv-num {
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }
        .cv-card {
          border: 1px solid var(--cv-border);
          background: var(--cv-card);
          border-radius: var(--cv-r-card);
          box-shadow: var(--cv-shadow-1);
        }
        .cv-glass {
          backdrop-filter: blur(28px) saturate(180%);
          -webkit-backdrop-filter: blur(28px) saturate(180%);
          box-shadow: var(--cv-shadow-2);
        }
        /* ---- Range inputs -------------------------------------------------
           Dimmers and speed dials are the one control where neumorphism has
           something to say: the track is carved *into* the surface and the
           handle sits proud of it, which is what makes "how far along am I"
           legible without reading a number.

           Only styled inside .cv-neo. The other themes use the platform
           control on purpose — a native range picks up focus rings, keyboard
           steps and forced-colours handling for free, and re-implementing
           those to look consistent is how those behaviours quietly get lost. */
        .cv-neo input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          height: 26px;
          background: transparent;
          cursor: pointer;
        }
        .cv-neo input[type="range"]::-webkit-slider-runnable-track {
          height: 10px;
          border-radius: 999px;
          background: var(--cv-bg);
          box-shadow:
            inset 2px 2px 5px var(--cv-neo-dark),
            inset -2px -2px 5px var(--cv-neo-light);
        }
        .cv-neo input[type="range"]::-moz-range-track {
          height: 10px;
          border-radius: 999px;
          background: var(--cv-bg);
          box-shadow:
            inset 2px 2px 5px var(--cv-neo-dark),
            inset -2px -2px 5px var(--cv-neo-light);
        }
        .cv-neo input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          margin-top: -6px;              /* centres a 22px thumb on a 10px track */
          border-radius: 999px;
          background: var(--cv-card);
          border: none;
          box-shadow:
            2px 2px 5px var(--cv-neo-dark),
            -2px -2px 5px var(--cv-neo-light);
        }
        .cv-neo input[type="range"]::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: var(--cv-card);
          border: none;
          box-shadow:
            2px 2px 5px var(--cv-neo-dark),
            -2px -2px 5px var(--cv-neo-light);
        }
        /* The handle presses in while dragging — the same inversion the cards
           use, so the idiom is consistent across the theme. */
        .cv-neo input[type="range"]:active::-webkit-slider-thumb {
          box-shadow:
            inset 2px 2px 4px var(--cv-neo-dark),
            inset -2px -2px 4px var(--cv-neo-light);
        }
        /* Removing the browser default outline would take keyboard focus with
           it, so it is replaced rather than dropped. */
        .cv-neo input[type="range"]:focus-visible::-webkit-slider-thumb {
          outline: 2px solid var(--cv-accent);
          outline-offset: 2px;
        }
        .cv-neo input[type="range"]:focus-visible::-moz-range-thumb {
          outline: 2px solid var(--cv-accent);
          outline-offset: 2px;
        }
        @media (prefers-reduced-transparency: reduce) {
          .cv-neo input[type="range"]::-webkit-slider-runnable-track,
          .cv-neo input[type="range"]::-webkit-slider-thumb { box-shadow: none; }
        }
        .cv-neo {
          /*
           * The same extrusion iOS draws, expressed in CSS.
           *
           * iOS uses shadowOffset {5,5} with shadowRadius 8 for the dark half
           * and {-5,-5} for the light one. A CSS blur radius is roughly twice
           * an iOS shadowRadius for the same visual softness, so 8 becomes 16.
           * The previous values here were -8/-8/18 and 10/10/22: asymmetric
           * between the two halves, and heavier than the app, which made the
           * same theme sit at a different height on each platform.
           *
           * Dark half first so the light one wins where they overlap — that is
           * what a single top-left light source produces, and it is the order
           * NeoShadow uses on Android for the same reason.
           */
          box-shadow:
            5px 5px 16px var(--cv-neo-dark),
            -5px -5px 16px var(--cv-neo-light);
        }
        /*
         * Neumorphism only reads as a material if things move when touched.
         *
         * A raised control that stays raised while pressed is just a picture
         * of a button. Swapping the extrusion for the matching inset is what
         * the style is for, and it is also the clearest affordance the theme
         * has — there are no borders left to communicate state.
         */
        .cv-neo-press:active:not(:disabled) {
          box-shadow:
            inset 3px 3px 7px var(--cv-neo-dark),
            inset -3px -3px 7px var(--cv-neo-light) !important;
        }
        /* Fields are recessed rather than outlined, which is the other half of
           the style. Scoped to neo so the flat themes keep their borders. */
        .cv-neo input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
        .cv-neo textarea,
        .cv-neo select {
          border: none;
          box-shadow:
            inset 3px 3px 7px var(--cv-neo-dark),
            inset -3px -3px 7px var(--cv-neo-light);
        }
        .cv-neo input:focus-visible,
        .cv-neo textarea:focus-visible,
        .cv-neo select:focus-visible {
          outline: 2px solid var(--cv-accent);
          outline-offset: 2px;
        }
        /* A card sitting on a card would double the extrusion and read as a
           tower. Nested surfaces recess instead — the same trick the iOS app
           uses for grouped rows. */
        .cv-neo .cv-neo {
          box-shadow:
            inset 3px 3px 7px var(--cv-neo-dark),
            inset -3px -3px 7px var(--cv-neo-light);
        }
        /*
         * A segmented control is the clearest case in the whole style: the
         * track is a groove cut into the surface and the selected segment is
         * the one piece still standing proud of it. Rendered flat, the two are
         * distinguished only by a faint fill, which is the version that made
         * the theme unreadable in the first place.
         */
        .cv-neo .cv-seg {
          box-shadow:
            inset 2px 2px 5px var(--cv-neo-dark),
            inset -2px -2px 5px var(--cv-neo-light);
        }
        .cv-neo .cv-seg-thumb {
          box-shadow:
            2px 2px 5px var(--cv-neo-dark),
            -2px -2px 5px var(--cv-neo-light);
        }
        /* Chips and KPI tiles are small, so they take the smallest offsets --
           a tile the size of a number badge carrying a card's shadow looks
           like it is hovering rather than sitting on the surface. */
        .cv-neo .cv-chip {
          border: none;
          box-shadow:
            2px 2px 5px var(--cv-neo-dark),
            -2px -2px 5px var(--cv-neo-light);
        }
        .cv-neo .cv-chip[aria-pressed="true"],
        .cv-neo .cv-chip[data-active="true"] {
          box-shadow:
            inset 2px 2px 5px var(--cv-neo-dark),
            inset -2px -2px 5px var(--cv-neo-light);
        }
        .cv-neo .cv-tile {
          border: none;
          box-shadow:
            3px 3px 8px var(--cv-neo-dark),
            -3px -3px 8px var(--cv-neo-light);
        }
        .cv-neo .cv-tile:active {
          box-shadow:
            inset 3px 3px 7px var(--cv-neo-dark),
            inset -3px -3px 7px var(--cv-neo-light);
        }
        /* A progress track is a groove with the fill lying in it. */
        .cv-neo .cv-track {
          box-shadow:
            inset 2px 2px 4px var(--cv-neo-dark),
            inset -2px -2px 4px var(--cv-neo-light);
        }
        @media (prefers-reduced-motion: reduce) {
          .cv-neo-press:active:not(:disabled) {
            transform: none;
          }
        }
        /* Pressed/active surfaces invert to a carved-in look, which is the other
           half of the idiom: the same two shadows, inside. */
        .cv-neo-inset {
          box-shadow:
            inset 4px 4px 10px var(--cv-neo-dark),
            inset -4px -4px 10px var(--cv-neo-light);
        }
        /* Neumorphism depends on the surface being level with its canvas, so a
           hairline border would read as a cut edge and flatten it. */
        .cv-neo,
        .cv-neo-inset {
          border-color: transparent;
        }
        @media (prefers-reduced-transparency: reduce) {
          /* Depth here is entirely shadow, so there is nothing to degrade — but
             honour a forced-colours pass by dropping to a plain outline. */
          .cv-neo, .cv-neo-inset { box-shadow: none; border-color: var(--cv-border); }
        }
        /* ---- Accessory tile ----------------------------------------------
           The Home app's core idea: an "on" accessory inverts to a bright fill
           with dark text so its state reads without being parsed, while "off"
           recedes into the canvas. .cv-tile-on deliberately overrides the
           inherited --cv-text/--cv-muted for its whole subtree so labels,
           badges and readouts flip together. */
        .cv-tile {
          border-radius: var(--cv-r-tile);
          border: 1px solid var(--cv-border);
          background: var(--cv-card);
          box-shadow: var(--cv-shadow-1);
          transition:
            background-color 0.22s ease,
            box-shadow 0.22s ease,
            transform 0.16s ease,
            border-color 0.22s ease;
        }
        .cv-tile:hover {
          box-shadow: var(--cv-shadow-2);
        }
        .cv-tile:active {
          transform: scale(0.985);
        }
        .cv-tile-on {
          background: var(--cv-tile-on);
          border-color: transparent;
          box-shadow: var(--cv-shadow-2);
          --cv-text: var(--cv-tile-on-text);
          --cv-muted: var(--cv-tile-on-muted);
          --cv-border: rgba(60, 60, 67, 0.14);
          --cv-card-hi: rgba(60, 60, 67, 0.08);
          color: var(--cv-tile-on-text);
        }
        /* Sections still carry Tailwind neutrals authored for dark surfaces.
           On the bright "on" fill those would be white-on-white, so remap them
           within the tile — in *both* schemes, unlike the .cv-light shim
           below, because an active tile is bright in dark mode too. */
        .cv-tile-on .text-white,
        .cv-tile-on .text-slate-100,
        .cv-tile-on .text-slate-200,
        .cv-tile-on .text-slate-300 {
          color: var(--cv-tile-on-text);
        }
        .cv-tile-on .text-slate-400,
        .cv-tile-on .text-slate-500,
        .cv-tile-on .text-slate-600 {
          color: var(--cv-tile-on-muted);
        }
        .cv-tile-on [class~="bg-white/5"],
        .cv-tile-on [class~="bg-white/10"],
        .cv-tile-on [class~="bg-black/20"],
        .cv-tile-on [class~="bg-black/30"] {
          background-color: rgba(60, 60, 67, 0.08);
        }
        /* Frosted sheet used by the sidebar, topbar and overlays. */
        .cv-material {
          background: color-mix(in srgb, var(--cv-card) 78%, transparent);
          backdrop-filter: blur(24px) saturate(180%);
          -webkit-backdrop-filter: blur(24px) saturate(180%);
        }
        /* iOS segmented control: a recessed track with an elevated thumb. */
        .cv-seg {
          background: var(--cv-input-bg);
          border-radius: var(--cv-r-pill);
          padding: 3px;
        }
        .cv-seg-thumb {
          background: var(--cv-card);
          border-radius: var(--cv-r-pill);
          box-shadow: var(--cv-shadow-1);
        }
        .cv-gradient {
          background: var(--cv-gradient);
        }
        .cv-input {
          width: 100%;
          border: 1px solid var(--cv-border);
          background: var(--cv-input-bg);
          border-radius: var(--cv-r-control);
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
           global one.

           [data-cv-portal] is here for the same reason and is the case that
           was missed: overlays render into document.body, so they are not
           inside .cv-theme and this rule never reached them. Every field in
           every modal and drawer stayed marketing-white on a dark dialog. */
        :root .cv-theme input,
        :root .cv-theme textarea,
        :root .cv-theme select,
        :root [data-cv-portal] input,
        :root [data-cv-portal] textarea,
        :root [data-cv-portal] select {
          background: var(--cv-input-bg);
          color: var(--cv-text);
          backdrop-filter: none;
          -webkit-backdrop-filter: none;
        }
        :root .cv-theme input.bg-transparent,
        :root .cv-theme textarea.bg-transparent,
        :root .cv-theme select.bg-transparent,
        :root [data-cv-portal] input.bg-transparent,
        :root [data-cv-portal] textarea.bg-transparent,
        :root [data-cv-portal] select.bg-transparent {
          background: transparent;
        }
        /* Overlays inherit the console's surfaces and text colour. Without
           this the portal root has no colour of its own and falls back to the
           marketing shell's. */
        [data-cv-portal] {
          color: var(--cv-text);
        }
        :root [data-cv-portal] option {
          background: var(--cv-card-solid, #0f1629);
          color: var(--cv-text);
        }
        :root .cv-theme input[type="checkbox"],
        :root .cv-theme input[type="radio"],
        :root .cv-theme input[type="range"],
        :root .cv-theme input[type="color"] {
          background: initial;
        }

        /* ---- Radius remap -------------------------------------------------
           ~220 call sites across the sections hardcode Tailwind's rounded-xl /
           rounded-2xl from before the radius tokens existed. Remapping them
           here — the same scoping technique the light-scheme shim below uses —
           moves the whole console onto one curve without editing 59 files. Two
           class selectors (0,2,0) outrank Tailwind's single one (0,1,0), so
           this wins regardless of stylesheet order, and directional variants
           like rounded-t-3xl are separate class tokens and stay untouched. */
        .cv-theme .rounded-xl {
          border-radius: var(--cv-r-control);
        }
        .cv-theme .rounded-2xl {
          border-radius: var(--cv-r-card);
        }
        .cv-theme .rounded-3xl {
          border-radius: var(--cv-r-tile);
        }

        /* The focus indicator's outer ring has to contrast with the surface it
           lands on, so it flips with the scheme. Without this the console's
           inputs kept a white halo on a white card and measured 2.87:1 with
           what looked like a focus ring. */
        .cv-theme.cv-light {
          --focus-ring-halo: rgba(15, 23, 42, 0.85);
          --focus-ring: #155e75;
        }
        .cv-theme.cv-dark {
          --focus-ring-halo: rgba(255, 255, 255, 0.9);
          --focus-ring: #67e8f9;
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
          /* #0e7490 clears white at 5.36:1 but only reaches 4.41:1 on the neo
             scheme's card (#e6e9f2), which is the lightest surface this text
             actually lands on. One shade darker passes on both. */
          color: #155e75;
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
        /* Loading placeholder for panels awaiting their first payload. */
        @keyframes cvShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        .cv-skeleton {
          background: linear-gradient(
            90deg,
            var(--cv-card-hi) 25%,
            color-mix(in srgb, var(--cv-card-hi) 55%, var(--cv-border)) 50%,
            var(--cv-card-hi) 75%
          );
          background-size: 200% 100%;
          animation: cvShimmer 1.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .cv-sweep,
          .cv-pop {
            animation: none;
          }
          .cv-tile {
            transition: none;
          }
          .cv-tile:active {
            transform: none;
          }
          .cv-skeleton {
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

/**
 * The theme, or null outside the console.
 *
 * Overlays are shared: the same Modal renders inside the console and on
 * marketing pages that have no provider. They need the theme when it exists
 * and must not throw when it does not, and they need it during render rather
 * than from an effect — React runs child effects before parent ones, so an
 * overlay reading the theme off the DOM in an effect sees the state from
 * before ConsoleThemeProvider had written it, and a modal that was already
 * open on first paint came out unthemed.
 */
export function useOptionalConsoleTheme(): ThemeValue | null {
  return useContext(Ctx);
}
