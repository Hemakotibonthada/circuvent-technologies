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
  faint: "#7c8aa5",
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

// ---------------------------------------------------------------------------
// Design tokens.
//
// Before these existed, radii were written inline at every call site (18 here,
// 14 there, 12 somewhere else) and vertical rhythm was whatever number the
// screen author typed. Naming the scales is what makes ~150 screens look like
// one app instead of one-hundred-and-fifty, and it means a change to the
// visual language is a single-line edit here rather than a repo-wide sweep.
// ---------------------------------------------------------------------------

/** Corner radii. Nested controls step *down* one rung from their container. */
export const RADIUS = {
  tile: 22,
  card: 18,
  control: 14,
  chip: 11,
  pill: 999,
} as const;

/** 4pt spacing scale. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/**
 * The smallest a control may be before a finger starts missing it.
 *
 * 44pt is Apple's figure and Android's 48dp rounds to the same place in
 * practice. Controls that must stay visually small -- a colour swatch, a
 * filter chip, a clear-search cross -- keep their size and take TAP_SLOP
 * instead, which grows the touch area without moving any pixels.
 */
export const TAP_MIN = 44;
export const TAP_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;

/**
 * Type scale.
 *
 * `label` deliberately replaced the old 11-12px uppercase + 1.5 letter-spacing
 * treatment. Micro-caps read as an admin panel; sentence case at a legible size
 * reads as a home. Same information, far less shouting.
 */
export const TYPE = {
  large: { fontSize: 30, fontWeight: "800" as const, letterSpacing: -0.6 },
  title: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.4 },
  section: { fontSize: 19, fontWeight: "700" as const, letterSpacing: -0.3 },
  body: { fontSize: 15, fontWeight: "500" as const, letterSpacing: 0 },
  label: { fontSize: 13, fontWeight: "600" as const, letterSpacing: 0 },
  caption: { fontSize: 12, fontWeight: "500" as const, letterSpacing: 0 },
} as const;

/**
 * Elevation presets. Wide and low-alpha — a soft lift off the canvas rather
 * than a hard drop shadow, which is what reads as "premium" on a dark surface.
 */
export const ELEV = {
  none: {},
  low: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 2 },
  mid: { shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.24, shadowRadius: 18, elevation: 6 },
  high: { shadowColor: "#000", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.32, shadowRadius: 32, elevation: 12 },
} as const;

/*
 * Elevation, unless the theme is neumorphic.
 *
 * Android's `elevation` is a Material drop shadow: one shadow, downward, in a
 * colour the platform chooses. Neumorphism makes the opposite claim — a surface
 * pushed out of the background by a light above and to the left, which needs
 * two shadows in the palette's own colours. Applying both gives a grey drop
 * shadow underneath a soft extrusion, which reads as neither, and is the "3D
 * effect" that made the app look nothing like the neo theme on the web.
 *
 * iOS is unaffected: elevation does nothing there, which is part of why this
 * only ever looked wrong on Android.
 */
export function elevate(isNeo: boolean, level: number): { elevation?: number } {
  return isNeo ? {} : { elevation: level };
}

/** Motion. Expo.out-equivalent bezier — fast start, long settle. */
export const MOTION = {
  bezier: [0.16, 1, 0.3, 1] as const,
  fast: 160,
  base: 220,
  slow: 320,
  /** Press-down scale used by every tappable surface. */
  pressScale: 0.97,
} as const;

/**
 * Functional grouping used for tile tinting, so a glance at the dashboard
 * separates "lights" from "security" by hue before any label is read.
 */
export type CategoryKey = "lights" | "climate" | "security" | "water" | "entry" | "power" | "sensor" | "neutral";

export const CATEGORY_TINTS: Record<CategoryKey, string> = {
  lights: "#f0a020",
  climate: "#32ade6",
  security: "#ff453a",
  water: "#0a84ff",
  entry: "#bf5af2",
  power: "#ffd60a",
  sensor: "#30d158",
  neutral: "#8e8e93",
};

const TYPE_CATEGORY: Record<string, CategoryKey> = {
  "smart-light": "lights",
  light: "lights",
  "smart-fan": "climate",
  fan: "climate",
  "ceiling-fan": "climate",
  thermostat: "climate",
  ac: "climate",
  guardian: "security",
  "motion-sensor": "security",
  aquaguard: "water",
  watertank: "water",
  "agri-starter": "water",
  "smart-lock": "entry",
  facedoor: "entry",
  "rfid-gate": "entry",
  "rfid-attend": "entry",
  "anpr-cam": "entry",
  // Not "entry": a drone is not a way in or out of anywhere. Its own
  // category would be a tab with one device in it, so it sits with the
  // other things that watch rather than switch.
  "drone-link": "sensor",
  "drone-x1": "sensor",
  rccar: "sensor",
  witness: "sensor",
  curtain: "entry",
  "smart-plug": "power",
  "energy-monitor": "power",
  "smart-switch": "power",
  touchboard: "power",
  "touchboard-8": "power",
  switchboard: "power",
  sentinel: "security",
  "home-hub": "neutral",
};

/** Functional category for a device type — drives tile tinting. */
export function deviceCategory(type: string): CategoryKey {
  return TYPE_CATEGORY[type] ?? "neutral";
}

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
  // Measures true active power rather than assuming a power factor, so it has
  // no toggle: every value it publishes is a measurement, and offering a
  // control for one would be the app lying about physics.
  meter: { glyph: "⚡", icon: "energy-monitor", accent: C.amber, grad: GRAD.amber, label: "Energy Meter" },
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
  "touchboard-8": { glyph: "🎛️", icon: "touchboard", accent: C.cyan, grad: GRAD.cyan, label: "Touch Board 8", toggle: { field: "g1", label: "Gang 1" } },
  /* Made to order: the gang count is commissioned, so the card shows the first
     channel and the device screen reads the real number off the device. */
  switchboard: { glyph: "🎚️", icon: "touchboard", accent: C.cyan, grad: GRAD.cyan, label: "Switchboard", toggle: { field: "g1", label: "Channel 1" } },
  sentinel: { glyph: "🧯", icon: "sentinel", accent: C.red, grad: GRAD.red, label: "Sentinel", toggle: { field: "r1", label: "Relay 1" } },
  camera: { glyph: "📷", icon: "camera", accent: C.violet, grad: GRAD.violet, label: "Camera" },
  cctv: { glyph: "📷", icon: "camera", accent: C.violet, grad: GRAD.violet, label: "CCTV Camera" },
  doorbell: { glyph: "📷", icon: "camera", accent: C.violet, grad: GRAD.violet, label: "Video Doorbell" },
  // No `toggle`: the primary switch is `armed`, which is a mode rather than a
  // load. Offering it as a tile toggle would put "turn the ANPR camera off"
  // one accidental tap away on the dashboard, next to the lamps.
  "anpr-cam": { glyph: "🔢", icon: "anpr-cam", accent: C.cyan, grad: GRAD.cyan, label: "ANPR Camera" },
  /*
   * No `toggle`, for the same reason as the ANPR camera and more so. The only
   * booleans this device has are the buzzer and "let unknown cards in when
   * offline" — and the second is the setting that decides whether a network
   * outage opens the building. A tile toggle would put that one accidental tap
   * from the lamps on somebody's dashboard.
   */
  "rfid-attend": { glyph: "🪪", icon: "rfid-gate", accent: C.violet, grad: GRAD.violet, label: "Attendance Reader" },
  // No `toggle`, for a sharper reason than the ANPR camera's: this device's
  // only boolean is `allowArm`, an aircraft's permission to fly. A tile
  // toggle would put that one tap from a lamp on the dashboard, and an
  // accidental tap would silently ground an aircraft somebody is about to
  // fly — or, read the other way, look like a launch button.
  "drone-link": { glyph: "🚁", icon: "drone-link", accent: C.violet, grad: GRAD.violet, label: "Drone Link" },
  "drone-x1": { glyph: "🚁", icon: "drone-link", accent: C.violet, grad: GRAD.violet, label: "Drone X1" },
  /*
   * The car is a sensor here rather than a switch, for the same reason the
   * drone is: the app shows what it is doing and can take it away from a
   * driver, but the driving itself happens on the radio link, not on a tile.
   */
  rccar: { glyph: "🚗", icon: "vehicle", accent: C.amber, grad: GRAD.amber, label: "RC Car" },
  witness: { glyph: "👁", icon: "shield", accent: C.green, grad: GRAD.green, label: "Witness" },
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

export type ThemeMode = "aurora" | "glass" | "neo" | "oled" | "neon";
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
  /*
   * The two ambient lights behind a glass screen. Held on the palette rather
   * than hardcoded in the component so a light glass room can be lit by
   * daylight instead of by a lamp.
   */
  warmGlow: string;
  coolGlow: string;
  /** Opaque-enough backing for modals; see buildPalette. */
  overlay: string;
  isGlass: boolean;
  isNeo: boolean;
}

const STATUS = { green: "#22c55e", amber: "#f59e0b", red: "#ef4444", cyan: "#06b6d4", violet: "#8b5cf6" };

/** Build the active palette from mode + scheme + accent. */
export function buildPalette(mode: ThemeMode, scheme: Scheme, accentKey: string): Palette {
  const p = buildModePalette(mode, scheme, accentKey);
  return {
    ...p,
    /*
     * The surface a modal sits on.
     *
     * Translucency over content is decoration; translucency under a dialog is a
     * legibility bug. The glass sheet relied entirely on BlurView for its
     * opacity, and Android's blur is weak where it works and absent where it
     * does not — so once the glass fill came down to 4.5% the editor sheet was
     * genuinely see-through, with the home screen legible through the text.
     *
     * A near-opaque base under the blur fixes it everywhere: where blur works
     * it still reads as frosted, and where it does not the sheet is simply a
     * dark panel. Non-glass themes already have an opaque card.
     */
    overlay: p.isGlass ? (scheme === "dark" ? "rgba(17,17,21,0.94)" : "rgba(249,250,253,0.94)") : p.card,
  };
}

function buildModePalette(mode: ThemeMode, scheme: Scheme, accentKey: string): Omit<Palette, "overlay"> {
  const a = accentByKey(accentKey);
  const base = {
    accent: a.color,
    accentHi: a.colorHi,
    accentGrad: a.grad,
    ...STATUS,
    /*
     * Amber and a cold blue: the colours of a lit room after dark. Overridden
     * per mode where a different room is called for.
     */
    warmGlow: "#ff8a3d",
    coolGlow: "#3d7bff",
    isGlass: mode === "glass",
    isNeo: mode === "neo",
  };

  /*
   * OLED — the black-card dashboards in the references.
   *
   * True black rather than a dark navy: on an OLED panel those pixels are off,
   * which is both the look and a real power saving on a phone that sits on a
   * wall dock all day. Dark-only by design — a "light OLED" is a contradiction,
   * and the scheme toggle is hidden for it rather than quietly ignored.
   *
   * Text at #f8fafc on #000 is far past WCAG AAA, which matters here because
   * this is the theme people will use in a dark room at 3am.
   */
  if (mode === "oled") {
    return {
      ...base, mode, scheme: "dark",
      screenGrad: ["#000000", "#050505"],
      bg: "#000000", surface: "#0c0c0f", surfaceHi: "#141419", card: "#0c0c0f", cardHi: "#16161c",
      border: "rgba(255,255,255,0.08)", borderHi: "rgba(255,255,255,0.16)",
      text: "#f8fafc", textDim: "#a1a1aa", faint: "#7e7e8a",
      onAccent: "#ffffff", neoLight: "#1a1a20", neoDark: "#000000",
      glassTint: "dark", glassFill: "rgba(255,255,255,0.04)", glassBorder: "rgba(255,255,255,0.1)",
    };
  }

  /*
   * Neon — the glowing-tile dashboards in the references.
   *
   * A deep violet-black ground so the accent halos on tiles have something to
   * bloom against; on pure black a glow has no midtone to fall off through and
   * reads as a hard ring instead. Text stays near-white rather than tinted,
   * because coloured text on a coloured ground is where neon designs usually
   * lose their contrast.
   */
  if (mode === "neon") {
    return {
      ...base, mode, scheme: "dark",
      screenGrad: ["#0b0718", "#170c31"],
      bg: "#0b0718", surface: "#16102b", surfaceHi: "#1e1640", card: "#16102b", cardHi: "#1e1640",
      border: "rgba(168,132,255,0.22)", borderHi: "rgba(168,132,255,0.4)",
      text: "#f4f1ff", textDim: "#b3a9d9", faint: "#8d84b8",
      onAccent: "#ffffff", neoLight: "#241a4a", neoDark: "#08040f",
      glassTint: "dark", glassFill: "rgba(168,132,255,0.08)", glassBorder: "rgba(168,132,255,0.3)",
    };
  }

  if (mode === "neo") {    if (scheme === "light") {
      return {
        ...base, mode, scheme,
        screenGrad: ["#e8ebf3", "#dfe3ee"],
        bg: "#e6e9f2", surface: "#e6e9f2", surfaceHi: "#eef1f8", card: "#e6e9f2", cardHi: "#eef1f8",
        border: "rgba(255,255,255,0.7)", borderHi: "rgba(255,255,255,0.9)",
        text: "#2a3350", textDim: "#5b6488", faint: "#5f6784",
        onAccent: "#ffffff", neoLight: "#ffffff", neoDark: "#c3c9da",
        glassTint: "light", glassFill: "rgba(255,255,255,0.5)", glassBorder: "rgba(255,255,255,0.7)",
      };
    }
    return {
      ...base, mode, scheme,
      screenGrad: ["#232a3d", "#1c2233"],
      bg: "#20263a", surface: "#20263a", surfaceHi: "#262d45", card: "#20263a", cardHi: "#262d45",
      border: "rgba(255,255,255,0.05)", borderHi: "rgba(255,255,255,0.1)",
      text: "#e7ecff", textDim: "#9aa6c8", faint: "#868fbb",
      onAccent: "#ffffff", neoLight: "#2b3350", neoDark: "#141a2b",
      glassTint: "dark", glassFill: "rgba(255,255,255,0.06)", glassBorder: "rgba(255,255,255,0.12)",
    };
  }

  if (mode === "glass") {
    if (scheme === "light") {
      return {
        ...base, mode, scheme,
        /*
         * A near-white room rather than a coloured one. The dark scheme is the
         * one the look was designed for; light glass works when the canvas is
         * almost paper and the panes are what carry the tint.
         */
        screenGrad: ["#f2f3f7", "#e8eaf1"],
        bg: "#f0f1f6", surface: "rgba(255,255,255,0.66)", surfaceHi: "rgba(255,255,255,0.8)",
        card: "rgba(255,255,255,0.66)", cardHi: "rgba(255,255,255,0.8)",
        border: "rgba(15,20,35,0.07)", borderHi: "rgba(15,20,35,0.12)",
        text: "#0b1020", textDim: "#3b4661", faint: "#7c8aa5",
        onAccent: "#ffffff", neoLight: "#ffffff", neoDark: "#c3c9da",
        glassTint: "light", glassFill: "rgba(255,255,255,0.5)", glassBorder: "rgba(15,20,35,0.08)",
        /* Daylight, not lamplight: cooler and far weaker, or a white room goes muddy. */
        warmGlow: "#ffd9a8", coolGlow: "#a8c8ff",
      };
    }
    /*
     * Deep neutral black, not navy.
     *
     * The old glass put frosted white panes over a vivid accent gradient, which
     * is the 2020 glassmorphism poster and reads as washed-out on a phone: the
     * backdrop competed with the content, and every card was the same milky
     * grey regardless of what was in it.
     *
     * This is the darkroom version: the canvas is almost black and almost
     * colourless, the panes are barely lighter than it, and the only colour in
     * the room comes from the things that are on — a lit tile blooms, and
     * everything else recedes. Contrast comes from light, not from fill.
     */
    return {
      ...base, mode, scheme,
      screenGrad: ["#0d0d10", "#08080a"],
      bg: "#0a0a0c", surface: "rgba(255,255,255,0.045)", surfaceHi: "rgba(255,255,255,0.075)",
      card: "rgba(255,255,255,0.045)", cardHi: "rgba(255,255,255,0.075)",
      border: "rgba(255,255,255,0.07)", borderHi: "rgba(255,255,255,0.13)",
      text: "#f7f8fa", textDim: "rgba(240,242,248,0.66)", faint: "rgba(240,242,248,0.42)",
      onAccent: "#ffffff", neoLight: "#1a1a1f", neoDark: "#050506",
      glassTint: "dark", glassFill: "rgba(255,255,255,0.05)", glassBorder: "rgba(255,255,255,0.08)",
    };
  }

  // aurora (default)
  if (scheme === "light") {
    return {
      ...base, mode, scheme,
      screenGrad: ["#f6f8ff", "#eef2fb"],
      bg: "#f3f6ff", surface: "#ffffff", surfaceHi: "#ffffff", card: "#ffffff", cardHi: "#f7f9ff",
      border: "rgba(15,23,42,0.08)", borderHi: "rgba(15,23,42,0.14)",
      text: "#0b1020", textDim: "#475569", faint: "#6b7280",
      onAccent: "#ffffff", neoLight: "#ffffff", neoDark: "#c3c9da",
      glassTint: "light", glassFill: "rgba(255,255,255,0.6)", glassBorder: "rgba(255,255,255,0.8)",
    };
  }
  return {
    ...base, mode, scheme,
    screenGrad: ["#0b1024", "#090d1f"],
    bg: "#090d1f", surface: "#131a30", surfaceHi: "#1c2547", card: "#161d38", cardHi: "#1c2547",
    border: "rgba(255,255,255,0.06)", borderHi: "rgba(255,255,255,0.12)",
    text: "#eef1f8", textDim: "#9aa6c0", faint: "#7c8aa5",
    onAccent: "#ffffff", neoLight: "#2b3350", neoDark: "#141a2b",
    glassTint: "dark", glassFill: "rgba(255,255,255,0.06)", glassBorder: "rgba(255,255,255,0.12)",
  };
}
