// Shared visual language for the Circuvent app — a darker, gradient-rich theme
// inspired by premium smart-home apps, kept on the Circuvent cyan→violet brand.
import { StatusBar } from "react-native";

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
  glyph: string;
  accent: string;
  grad: Grad;
  label: string;
  /** Field toggled by the card's inline switch (on/off devices only). */
  toggle?: { field: string; label: string };
}

export const DEVICE_META: Record<string, DeviceMeta> = {
  aquaguard: { glyph: "💧", accent: C.cyan, grad: GRAD.cyan, label: "AquaGuard", toggle: { field: "pump", label: "Pump" } },
  "home-hub": { glyph: "🏠", accent: C.violet, grad: GRAD.violet, label: "Home Hub" },
  "smart-plug": { glyph: "🔌", accent: C.cyan, grad: GRAD.cyan, label: "Smart Plug", toggle: { field: "power", label: "Power" } },
  "smart-switch": { glyph: "🎚️", accent: C.violet, grad: GRAD.violet, label: "Smart Switch", toggle: { field: "power", label: "Gang 1" } },
  "energy-monitor": { glyph: "⚡", accent: C.amber, grad: GRAD.amber, label: "Energy Monitor" },
  guardian: { glyph: "🛡️", accent: C.red, grad: GRAD.red, label: "Guardian" },
  "motion-sensor": { glyph: "🚶", accent: C.green, grad: GRAD.green, label: "Motion Sensor" },
  "agri-starter": { glyph: "🌱", accent: C.green, grad: GRAD.green, label: "Agri Starter", toggle: { field: "pump", label: "Pump" } },
};

export function deviceMeta(type: string): DeviceMeta {
  return DEVICE_META[type] ?? { glyph: "📟", accent: C.faint, grad: GRAD.slate, label: type || "Device" };
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export const statusBarStyle = () => StatusBar.setBarStyle("light-content");
