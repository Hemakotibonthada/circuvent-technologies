// Vector icon system.
//
// The app previously drew every icon as an emoji glyph in a <Text>. That looks
// approximately right on the phone it was written on and wrong everywhere else:
// emoji are rendered by the OS font, so they change shape between Android
// versions and iOS, they can't be tinted (a device card icon could never pick
// up the user's accent colour), they ignore the light/dark palette entirely,
// and screen readers announce them by their Unicode name ("house building")
// rather than what the control does.
//
// These are real vector glyphs from @expo/vector-icons — already a transitive
// dependency of expo, so this costs no new package — addressed through a
// semantic registry. Screens ask for what a thing *is* ("scenes", "smart-lock")
// rather than which glyph to draw, so the icon for a concept can be changed in
// one place.

import React from "react";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { StyleProp, TextStyle } from "react-native";

type IonName = React.ComponentProps<typeof Ionicons>["name"];
type MciName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

type Entry = { fam: "ion"; n: IonName } | { fam: "mci"; n: MciName };

const ion = (n: IonName): Entry => ({ fam: "ion", n });
const mci = (n: MciName): Entry => ({ fam: "mci", n });

/**
 * Semantic name → glyph. Every name here is verified against the installed
 * glyphmaps; an unknown name renders as a blank box at runtime with no build
 * error, so `npm run icons:check` guards this table.
 */
export const ICONS = {
  // --- navigation / chrome -------------------------------------------------
  home: mci("home-variant"),
  devices: mci("view-grid"),
  automate: mci("auto-fix"),
  energy: mci("lightning-bolt"),
  settings: mci("cog"),
  more: mci("dots-grid"),
  search: ion("search"),
  bell: ion("notifications"),
  back: ion("chevron-back"),
  chevron: ion("chevron-forward"),
  close: ion("close"),
  add: ion("add"),
  refresh: ion("refresh"),
  check: ion("checkmark"),

  // --- dashboard concepts --------------------------------------------------
  rooms: mci("floor-plan"),
  scenes: mci("star-four-points"),
  rules: mci("cog-sync"),
  alerts: mci("bell-ring"),
  power: mci("flash"),
  online: mci("access-point-network"),
  weather: mci("weather-partly-cloudy"),
  trendUp: mci("trending-up"),
  trendDown: mci("trending-down"),
  clock: mci("clock-outline"),

  // --- device types (keys mirror DEVICE_META) -----------------------------
  aquaguard: mci("water-pump"),
  "home-hub": mci("home-automation"),
  "smart-plug": mci("power-plug"),
  "smart-switch": mci("toggle-switch-outline"),
  "energy-monitor": mci("gauge"),
  guardian: mci("shield-home"),
  "motion-sensor": mci("motion-sensor"),
  "agri-starter": mci("sprout"),
  "smart-light": mci("lightbulb-on"),
  "smart-fan": mci("fan"),
  curtain: mci("curtains"),
  "smart-lock": mci("lock"),
  watertank: mci("water"),
  "rfid-gate": mci("boom-gate"),
  facedoor: mci("door"),
  touchboard: mci("gesture-tap-button"),
  device: mci("chip"),

  // --- activity / status ---------------------------------------------------
  alert: mci("alert"),
  security: mci("shield-check"),
  success: mci("check-circle"),
  activity: mci("pulse"),
  info: mci("information"),
  offline: mci("wifi-off"),
  wifi: mci("wifi"),
  camera: mci("cctv"),
  lock: mci("lock"),
  unlock: mci("lock-open-variant"),
  empty: mci("tray-remove"),

  // --- theme modes ---------------------------------------------------------
  aurora: mci("gradient-vertical"),
  glass: mci("cube-outline"),
  neo: mci("circle-opacity"),

  // --- "More" hub / secondary navigation -----------------------------------
  sensors: mci("chart-line"),
  analytics: mci("chart-box"),
  hub: mci("sitemap"),
  history: mci("history"),
  maintenance: mci("stethoscope"),
  schedules: mci("timer-outline"),
  bill: mci("receipt"),
  dashboard: mci("view-dashboard"),
  charts: mci("chart-bar"),
  uikit: mci("palette-swatch"),
  voice: mci("microphone"),
  ai: mci("robot"),
  sparkles: mci("creation"),
  brain: mci("brain"),
  leaf: mci("leaf"),
  idea: mci("lightbulb-on"),
  sos: mci("alarm-light"),
  system: mci("monitor-dashboard"),
  download: mci("download"),
  mqtt: mci("access-point"),
  profile: mci("account-circle"),
  shieldLock: mci("shield-lock"),
  globe: mci("web"),
  backup: mci("cloud-upload"),
  help: mci("help-circle"),
  about: mci("information-outline"),
  admin: mci("account-cog"),

  // --- weather (keyed to the WMO groups returned by weather.ts#wmo) ---------
  wClear: mci("weather-sunny"),
  wCloud: mci("weather-cloudy"),
  wFog: mci("weather-fog"),
  wRain: mci("weather-pouring"),
  wSnow: mci("weather-snowy"),
  wStorm: mci("weather-lightning-rainy"),
} as const satisfies Record<string, Entry>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/**
 * Renders a semantic icon. Decorative by default — icons here always sit
 * beside a text label or inside a button that carries its own
 * accessibilityLabel, so announcing the glyph too would just be noise.
 */
export function Icon({ name, size = 20, color, style }: IconProps) {
  const e = ICONS[name] as Entry;
  const common = { size, color, style, accessible: false as const };
  return e.fam === "ion" ? <Ionicons name={e.n} {...common} /> : <MaterialCommunityIcons name={e.n} {...common} />;
}

/** Icon for a device type, falling back to a generic chip for unknown types. */
export function deviceIcon(type: string): IconName {
  return (type in ICONS ? type : "device") as IconName;
}

/** Icon for an activity-feed event kind. */
export function eventIcon(kind: string): IconName {
  switch (kind) {
    case "alert":
      return "alert";
    case "security":
      return "security";
    case "success":
      return "success";
    case "activity":
      return "activity";
    default:
      return "info";
  }
}

/** Icon for a weather condition group (see `wmo()` in weather.ts). */
export function weatherIcon(group: string): IconName {
  switch (group) {
    case "clear":
      return "wClear";
    case "fog":
      return "wFog";
    case "rain":
      return "wRain";
    case "snow":
      return "wSnow";
    case "storm":
      return "wStorm";
    default:
      return "wCloud";
  }
}
