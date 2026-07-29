// Shared visual language for the Circuvent app — a darker, gradient-rich theme
// inspired by premium smart-home apps, kept on the Circuvent cyan→violet brand.
import { StatusBar } from "react-native";
import type { IconName } from "./icons";

export const C = {
  bg: "#090d1f",
  bg2: "#0b1020",
  surface: "#131a30",
  card: "#161d38",
  cardHi: "#1c2547",
  border: "rgba(255,255,255,0.06)",
  borderHi: "rgba(255,255,255,0.12)",
  text: "#eef1f8",
  textDim: "#9aa6c0",
  faint: "#64748b",
  cyan: "#06b6d4",
  cyanHi: "#22d3ee",
  violet: "#8b5cf6",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
};

export type Grad = readonly [string, string];
export const GRAD = {
  brand: ["#06b6d4", "#8b5cf6"] as Grad, // Circuvent cyan → violet
  cyan: ["#0891b2", "#22d3ee"] as Grad,
  violet: ["#7c3aed", "#a855f7"] as Grad,
  amber: ["#f59e0b", "#f97316"] as Grad,
  red: ["#ef4444", "#f43f5e"] as Grad,
  green: ["#16a34a", "#22c55e"] as Grad,
  slate: ["#334155", "#475569"] as Grad,
  screen: ["#0b1024", "#090d1f"] as Grad,
};

export interface DeviceMeta {
  /**
   * Emoji fallback, kept only for the few legacy screens that still render a
   * glyph into a <Text>. New UI should use `icon`, which is tintable and
   * renders identically on every OS.
   */
  glyph: string;
  icon: IconName;
  accent: string;
  grad: Grad;
  label: string;
  /** Field toggled by the card's inline switch (on/off devices only). */
  toggle?: { field: string; label: string };
}

export const DEVICE_META: Record<string, DeviceMeta> = {
  aquaguard: { glyph: "💧", icon: "aquaguard", accent: C.cyan, grad: GRAD.cyan, label: "AquaGuard", toggle: { field: "pump", label: "Pump" } },
  "home-hub": { glyph: "🏠", icon: "home-hub", accent: C.violet, grad: GRAD.violet, label: "Home Hub" },
  "smart-plug": { glyph: "🔌", icon: "smart-plug", accent: C.cyan, grad: GRAD.cyan, label: "Smart Plug", toggle: { field: "power", label: "Power" } },
  "smart-switch": { glyph: "🎚️", icon: "smart-switch", accent: C.violet, grad: GRAD.violet, label: "Smart Switch", toggle: { field: "power", label: "Gang 1" } },
  "energy-monitor": { glyph: "⚡", icon: "energy-monitor", accent: C.amber, grad: GRAD.amber, label: "Energy Monitor" },
  guardian: { glyph: "🛡️", icon: "guardian", accent: C.red, grad: GRAD.red, label: "Guardian" },
  "motion-sensor": { glyph: "🚶", icon: "motion-sensor", accent: C.green, grad: GRAD.green, label: "Motion Sensor" },
  "agri-starter": { glyph: "🌱", icon: "agri-starter", accent: C.green, grad: GRAD.green, label: "Agri Starter", toggle: { field: "pump", label: "Pump" } },
  "smart-light": { glyph: "💡", icon: "smart-light", accent: C.amber, grad: GRAD.amber, label: "Smart Light", toggle: { field: "power", label: "Light" } },
  "smart-fan": { glyph: "🌀", icon: "smart-fan", accent: C.cyan, grad: GRAD.cyan, label: "Smart Fan", toggle: { field: "power", label: "Fan" } },
  curtain: { glyph: "🪟", icon: "curtain", accent: C.violet, grad: GRAD.violet, label: "Curtain" },
  "smart-lock": { glyph: "🔒", icon: "smart-lock", accent: C.amber, grad: GRAD.amber, label: "Smart Lock", toggle: { field: "locked", label: "Lock" } },
  watertank: { glyph: "🌊", icon: "watertank", accent: C.cyan, grad: GRAD.cyan, label: "Water Tank", toggle: { field: "pump", label: "Pump" } },
  "rfid-gate": { glyph: "🚗", icon: "rfid-gate", accent: C.amber, grad: GRAD.amber, label: "RFID Gate" },
  facedoor: { glyph: "🚪", icon: "facedoor", accent: C.violet, grad: GRAD.violet, label: "Smart Door", toggle: { field: "locked", label: "Lock" } },
  touchboard: { glyph: "🎛️", icon: "touchboard", accent: C.cyan, grad: GRAD.cyan, label: "Touch Board", toggle: { field: "g1", label: "Gang 1" } },
};

export function deviceMeta(type: string): DeviceMeta {
  return DEVICE_META[type] ?? { glyph: "📟", icon: "device", accent: C.faint, grad: GRAD.slate, label: type || "Device" };
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const statusBarStyle = () => StatusBar.setBarStyle("light-content");

// ---------------------------------------------------------------------------
// Multi-theme system: three visual modes the user can switch between —
//   aurora  → the signature dark, gradient-rich look (default)
//   glass   → glassmorphism: frosted translucent cards over a vivid backdrop
//   neo     → neumorphism: soft extruded mono surfaces with dual shadows
// plus a light/dark scheme (where meaningful) and an accent-color preset.
// ---------------------------------------------------------------------------

export type ThemeMode = "aurora" | "glass" | "neo";
export type Scheme = "dark" | "light";

export interface Accent {
  key: string;
  label: string;
  color: string;
  colorHi: string;
  grad: Grad;
}

export const ACCENTS: Accent[] = [
  { key: "coral", label: "Coral", color: "#F0532B", colorHi: "#FF7A54", grad: ["#F0532B", "#FF7A54"] },
  { key: "brand", label: "Circuvent", color: "#06b6d4", colorHi: "#22d3ee", grad: ["#06b6d4", "#8b5cf6"] },
  { key: "violet", label: "Violet", color: "#8b5cf6", colorHi: "#a855f7", grad: ["#7c3aed", "#a855f7"] },
  { key: "blue", label: "Blue", color: "#3b82f6", colorHi: "#60a5fa", grad: ["#2563eb", "#3b82f6"] },
  { key: "green", label: "Green", color: "#22c55e", colorHi: "#4ade80", grad: ["#16a34a", "#22c55e"] },
  { key: "orange", label: "Orange", color: "#f97316", colorHi: "#fb923c", grad: ["#ea580c", "#f97316"] },
  { key: "red", label: "Red", color: "#ef4444", colorHi: "#f87171", grad: ["#dc2626", "#ef4444"] },
  { key: "teal", label: "Teal", color: "#14b8a6", colorHi: "#2dd4bf", grad: ["#0d9488", "#14b8a6"] },
];

export function accentByKey(key: string): Accent {
  return ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];
}

export interface Palette {
  mode: ThemeMode;
  scheme: Scheme;
  screenGrad: Grad;
  bg: string;
  surface: string;
  surfaceHi: string;
  card: string;
  cardHi: string;
  border: string;
  borderHi: string;
  text: string;
  textDim: string;
  faint: string;
  accent: string;
  accentHi: string;
  accentGrad: Grad;
  onAccent: string;
  green: string;
  amber: string;
  red: string;
  cyan: string;
  violet: string;
  // neumorphism shadow pair
  neoLight: string;
  neoDark: string;
  // glassmorphism
  glassTint: "light" | "dark" | "default";
  glassFill: string;
  glassBorder: string;
  isGlass: boolean;
  isNeo: boolean;
}

const STATUS = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444", cyan: "#06b6d4", violet: "#8b5cf6" };

/** Build the active palette from mode + scheme + accent. */
export function buildPalette(mode: ThemeMode, scheme: Scheme, accentKey: string): Palette {
  const a = accentByKey(accentKey);
  const base = {
    accent: a.color,
    accentHi: a.colorHi,
    accentGrad: a.grad,
    ...STATUS,
    isGlass: mode === "glass",
    isNeo: mode === "neo",
  };

  if (mode === "neo") {
    if (scheme === "light") {
      return {
        ...base, mode, scheme,
        screenGrad: ["#e8ebf3", "#dfe3ee"],
        bg: "#e6e9f2", surface: "#e6e9f2", surfaceHi: "#eef1f8", card: "#e6e9f2", cardHi: "#eef1f8",
        border: "rgba(255,255,255,0.7)", borderHi: "rgba(255,255,255,0.9)",
        text: "#2a3350", textDim: "#5b6488", faint: "#8b93ad",
        onAccent: "#ffffff", neoLight: "#ffffff", neoDark: "#c3c9da",
        glassTint: "light", glassFill: "rgba(255,255,255,0.5)", glassBorder: "rgba(255,255,255,0.7)",
      };
    }
    return {
      ...base, mode, scheme,
      screenGrad: ["#232a3d", "#1c2233"],
      bg: "#20263a", surface: "#20263a", surfaceHi: "#262d45", card: "#20263a", cardHi: "#262d45",
      border: "rgba(255,255,255,0.05)", borderHi: "rgba(255,255,255,0.1)",
      text: "#e7ecff", textDim: "#9aa6c8", faint: "#6b76a0",
      onAccent: "#ffffff", neoLight: "#2b3350", neoDark: "#141a2b",
      glassTint: "dark", glassFill: "rgba(255,255,255,0.06)", glassBorder: "rgba(255,255,255,0.12)",
    };
  }

  if (mode === "glass") {
    if (scheme === "light") {
      return {
        ...base, mode, scheme,
        screenGrad: [a.grad[0], a.grad[1]],
        bg: "#eef2ff", surface: "rgba(255,255,255,0.5)", surfaceHi: "rgba(255,255,255,0.62)",
        card: "rgba(255,255,255,0.5)", cardHi: "rgba(255,255,255,0.62)",
        border: "rgba(255,255,255,0.6)", borderHi: "rgba(255,255,255,0.85)",
        text: "#0b1020", textDim: "#33405e", faint: "#64748b",
        onAccent: "#ffffff", neoLight: "#ffffff", neoDark: "#c3c9da",
        glassTint: "light", glassFill: "rgba(255,255,255,0.35)", glassBorder: "rgba(255,255,255,0.6)",
      };
    }
    return {
      ...base, mode, scheme,
      screenGrad: [a.grad[0], a.grad[1]],
      bg: "#0b1024", surface: "rgba(255,255,255,0.08)", surfaceHi: "rgba(255,255,255,0.14)",
      card: "rgba(255,255,255,0.08)", cardHi: "rgba(255,255,255,0.14)",
      border: "rgba(255,255,255,0.16)", borderHi: "rgba(255,255,255,0.28)",
      text: "#f4f7ff", textDim: "rgba(233,238,255,0.72)", faint: "rgba(233,238,255,0.5)",
      onAccent: "#ffffff", neoLight: "#2b3350", neoDark: "#141a2b",
      glassTint: "dark", glassFill: "rgba(255,255,255,0.1)", glassBorder: "rgba(255,255,255,0.22)",
    };
  }

  // aurora (default)
  if (scheme === "light") {
    return {
      ...base, mode, scheme,
      screenGrad: ["#f6f8ff", "#eef2fb"],
      bg: "#f3f6ff", surface: "#ffffff", surfaceHi: "#ffffff", card: "#ffffff", cardHi: "#f7f9ff",
      border: "rgba(15,23,42,0.08)", borderHi: "rgba(15,23,42,0.14)",
      text: "#0b1020", textDim: "#475569", faint: "#94a3b8",
      onAccent: "#ffffff", neoLight: "#ffffff", neoDark: "#c3c9da",
      glassTint: "light", glassFill: "rgba(255,255,255,0.6)", glassBorder: "rgba(255,255,255,0.8)",
    };
  }
  return {
    ...base, mode, scheme,
    screenGrad: ["#0b1024", "#090d1f"],
    bg: "#090d1f", surface: "#131a30", surfaceHi: "#1c2547", card: "#161d38", cardHi: "#1c2547",
    border: "rgba(255,255,255,0.06)", borderHi: "rgba(255,255,255,0.12)",
    text: "#eef1f8", textDim: "#9aa6c0", faint: "#64748b",
    onAccent: "#ffffff", neoLight: "#2b3350", neoDark: "#141a2b",
    glassTint: "dark", glassFill: "rgba(255,255,255,0.06)", glassBorder: "rgba(255,255,255,0.12)",
  };
}
