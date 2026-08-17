"use client";

// Appearance tab — drives the REAL theme via useConsoleTheme() setters.
// usePersistentState persists density and reduced-motion prefs locally;
// they are labelled as browser-local with a Callout.

import { Moon, Sun } from "lucide-react";
import { ACCENTS, isDarkOnly, useConsoleTheme, type Scheme, type ThemeMode } from "../theme";
import {
  Callout,
  SectionTitle,
  Surface,
  SwitchRow,
  usePersistentState,
} from "../_kit/primitives";
import ThemePreview from "./ThemePreview";
import { REDUCED_MOTION_KEY } from "./prefs";
import { ViewSettingsPanel } from "@/components/ViewSettings";

/* Kept in step with MODES in the app's Settings screen — the same account on
   two screens should be offered the same looks. tests/theme-mode-parity pins
   the list and the dark-only rule. */
const MODES: { key: ThemeMode; label: string; desc: string }[] = [
  { key: "glass", label: "Glass", desc: "Frosted cards over an accent glow" },
  { key: "aurora", label: "Aurora", desc: "Classic dark smart-home panels" },
  { key: "neo", label: "Neo", desc: "Soft extruded surfaces and shadows — default" },
  { key: "oled", label: "OLED", desc: "True black — saves power on a wall tablet" },
  { key: "neon", label: "Neon", desc: "Glowing cards on deep violet" },
];

export default function AppearancePanel() {
  const theme = useConsoleTheme();
  const [reducedMotion, setReducedMotion] = usePersistentState<boolean>(
    REDUCED_MOTION_KEY,
    false,
  );

  return (
    <div className="space-y-6 pt-1">
      {/* ── Surface mode ──────────────────────────────── */}
      <SectionTitle>Surface mode</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((m) => {
          const active = theme.mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => theme.setMode(m.key)}
              aria-pressed={active}
              className="cv-card rounded-2xl p-4 text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-2"
              style={
                {
                  borderWidth: active ? 2 : 1,
                  borderColor: active ? "var(--cv-accent)" : "var(--cv-border)",
                  background: active ? "var(--cv-card-hi)" : "var(--cv-card)",
                  "--tw-ring-color": "var(--cv-accent)",
                } as React.CSSProperties
              }
            >
              <div
                className="text-sm font-extrabold"
                style={{ color: active ? "var(--cv-accent-hi)" : "var(--cv-text)" }}
              >
                {m.label}
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--cv-muted)" }}>
                {m.desc}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Colour scheme ─────────────────────────────── */}
      <SectionTitle>Colour scheme</SectionTitle>
      {isDarkOnly(theme.mode) ? (
        /* Hidden rather than disabled, matching the app's Settings screen.
           OLED and Neon are defined only in the dark, and leaving a light/dark
           switch on screen that silently does nothing is worse than not
           offering it. */
        <Callout tone="info" title={`${MODES.find((m) => m.key === theme.mode)?.label} is a dark-only theme`}>
          Pick Glass, Aurora or Neo for a light scheme.
        </Callout>
      ) : (
      <div className="flex gap-3">
        {(["dark", "light"] as Scheme[]).map((s) => {
          const active = theme.scheme === s;
          return (
            <button
              key={s}
              onClick={() => theme.setScheme(s)}
              aria-pressed={active}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2"
              style={
                {
                  background: active ? "var(--cv-gradient)" : "var(--cv-card-hi)",
                  color: active ? "#fff" : "var(--cv-text)",
                  border: `1px solid ${active ? "transparent" : "var(--cv-border)"}`,
                  "--tw-ring-color": "var(--cv-accent)",
                } as React.CSSProperties
              }
            >
              {s === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              {s === "dark" ? "Dark" : "Light"}
            </button>
          );
        })}
      </div>
      )}

      {/* ── Accent colour ─────────────────────────────── */}
      <SectionTitle>Accent colour</SectionTitle>
      <div className="flex flex-wrap gap-3">
        {ACCENTS.map((a) => {
          const active = theme.accent.key === a.key;
          return (
            <button
              key={a.key}
              onClick={() => theme.setAccentKey(a.key)}
              aria-label={a.label}
              aria-pressed={active}
              title={a.label}
              className="h-[44px] w-[44px] rounded-full transition focus:outline-none focus-visible:ring-2"
              style={
                {
                  background: `linear-gradient(135deg, ${a.grad[0]}, ${a.grad[1]})`,
                  outline: active ? `3px solid var(--cv-text)` : "3px solid transparent",
                  outlineOffset: 2,
                  "--tw-ring-color": a.color,
                } as React.CSSProperties
              }
            />
          );
        })}
      </div>
      {/* Show the chosen accent name so keyboard users get feedback. */}
      <div
        className="text-sm font-semibold"
        aria-live="polite"
        style={{ color: "var(--cv-accent-hi)" }}
      >
        {theme.accent.label}
      </div>

      {/* ── Live preview ──────────────────────────────── */}
      <SectionTitle>Live preview</SectionTitle>
      <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
        Reflects the current theme across all 42 combinations (3 modes × 2 schemes × 7 accents).
        KPI values and device rows show live data from your fleet.
      </p>
      <ThemePreview />

      {/* ── View ──────────────────────────────────────── */}
      <SectionTitle>View</SectionTitle>
      <Callout tone="info">
        Density, scale and width apply to every Circuvent screen in this browser — the
        console, the shop and the admin dashboard. They are stored locally and are not
        synced to the control plane.
      </Callout>
      <Surface>
        {/*
          These controls used to be a single "Compact density" switch that wrote
          `cv-prefs-density` to localStorage — and nothing anywhere read it, so
          the preference had no effect at all. It is now applied to the document
          element before first paint; see src/lib/view-settings.ts.
        */}
        <ViewSettingsPanel />
      </Surface>

      {/* ── Motion ────────────────────────────────────── */}
      <SectionTitle>Motion</SectionTitle>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <SwitchRow
            label="Reduce motion"
            hint="Disables shimmer animations and transitions throughout the console."
            checked={reducedMotion}
            onChange={setReducedMotion}
          />
        </div>
      </Surface>
    </div>
  );
}
