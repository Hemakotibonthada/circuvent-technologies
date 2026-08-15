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
  /* Paired with `add` for the text-size stepper. Ionicons calls a minus
     "remove", which reads as deletion at a call site — aliased so the stepper
     says what it means. */
  minus: ion("remove"),
  /* The Display setting's own glyph. */
  textSize: mci("format-size"),
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
  "touchboard-8": mci("gesture-tap-button"),
  sentinel: mci("smoke-detector-variant"),

  // --- channel kinds ------------------------------------------------------
  // What a relay on a multi-gang board is actually wired to. Distinct from the
  // device-type icons above: one Touch Switchboard can be a light, a fan and a
  // geyser at once, and the tile should show what the channel does rather than
  // what the board is.
  chLight: mci("lightbulb-on"),
  chFan: mci("fan"),
  chSocket: mci("power-socket"),
  chGeyser: mci("water-boiler"),
  chPump: mci("water-pump"),
  chTv: mci("television"),
  chAc: mci("air-conditioner"),
  chCurtain: mci("curtains"),
  chGate: mci("boom-gate"),
  chGeneric: mci("toggle-switch-outline"),
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
  "anpr-cam": mci("car-info"),
  "drone-link": mci("quadcopter"),
  lock: mci("lock"),
  unlock: mci("lock-open-variant"),
  empty: mci("tray-remove"),

  // --- theme modes ---------------------------------------------------------
  aurora: mci("gradient-vertical"),
  glass: mci("cube-outline"),
  neo: mci("circle-opacity"),
  oled: mci("contrast-circle"),
  neon: mci("led-on"),
  moon: mci("weather-night"),
  sun: mci("white-balance-sunny"),
  vibrate: mci("vibrate"),

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

  // --- gate & access control -----------------------------------------------
  gate: mci("boom-gate"),
  gateOpen: mci("boom-gate-arrow-up"),
  qrcode: mci("qrcode"),
  qrScan: mci("qrcode-scan"),
  pass: mci("ticket-confirmation"),
  vehicle: mci("car"),
  rfid: mci("nfc"),
  keypad: mci("dialpad"),
  visitor: mci("account-arrow-right"),
  fingerprint: mci("fingerprint"),
  faceId: mci("face-recognition"),

  // --- fleet & firmware ----------------------------------------------------
  fleet: mci("server-network"),
  firmware: mci("memory"),
  otaUpdate: mci("update"),
  rollout: mci("rocket-launch"),
  version: mci("tag"),
  broadcast: mci("broadcast"),
  signal: mci("signal"),
  battery: mci("battery"),
  storage: mci("harddisk"),
  uptime: mci("timer-sand"),
  provision: mci("plus-network"),

  // --- energy & sustainability ---------------------------------------------
  tariff: mci("currency-usd"),
  cost: mci("cash"),
  carbon: mci("molecule-co2"),
  solar: mci("solar-power"),
  gridTower: mci("transmission-tower"),
  budget: mci("wallet"),
  peak: mci("chart-timeline-variant"),
  meter: mci("gauge"),

  // --- security & surveillance ---------------------------------------------
  shield: mci("shield"),
  armed: mci("shield-lock-outline"),
  disarmed: mci("shield-off-outline"),
  motion: mci("motion-sensor"),
  doorOpen: mci("door-open"),
  windowClosed: mci("window-closed-variant"),
  siren: mci("bullhorn"),
  intrusion: mci("account-alert"),
  incident: mci("file-alert"),

  // --- diagnostics & observability -----------------------------------------
  topic: mci("rss"),
  latency: mci("speedometer"),
  ping: mci("radar"),
  topology: mci("lan"),
  logs: mci("text-box-search"),
  packet: mci("package-variant"),
  terminal: mci("console"),
  debug: mci("bug"),

  // --- automation studio ---------------------------------------------------
  trigger: mci("flash-alert"),
  condition: mci("source-branch"),
  action: mci("play-circle"),
  schedule: mci("calendar-clock"),
  geofence: mci("map-marker-radius"),
  delay: mci("timer-outline"),
  loop: mci("repeat"),
  simulate: mci("flask"),

  // --- zones & environment -------------------------------------------------
  tank: mci("cup-water"),
  airQuality: mci("air-filter"),
  humidity: mci("water-percent"),
  temperature: mci("thermometer"),
  hvac: mci("air-conditioner"),
  fanBlade: mci("fan"),

  // --- governance ----------------------------------------------------------
  users: mci("account-group"),
  role: mci("badge-account"),
  audit: mci("clipboard-text-clock"),
  report: mci("file-chart"),
  exportFile: mci("file-export"),
  org: mci("domain"),
  compliance: mci("certificate"),
  keyVariant: mci("key-variant"),

  // --- generic controls ----------------------------------------------------
  filter: mci("filter-variant"),
  sort: mci("sort"),
  edit: mci("pencil"),
  trash: mci("delete"),
  copy: mci("content-copy"),
  share: mci("share-variant"),
  calendar: mci("calendar"),
  play: mci("play"),
  pause: mci("pause"),
  stop: mci("stop"),
  expand: mci("chevron-down"),
  collapse: mci("chevron-up"),
  drag: mci("drag-horizontal-variant"),
  warning: mci("alert-circle"),
  pending: mci("progress-clock"),
  sync: mci("sync"),
  link: mci("link-variant"),
  unlink: mci("link-off"),
  eye: mci("eye"),
  eyeOff: mci("eye-off"),
  save: mci("content-save"),
  cancel: mci("close-circle"),
  external: mci("open-in-new"),
  map: mci("map"),
  list: mci("format-list-bulleted"),
  grid: mci("view-grid-outline"),
  table: mci("table"),
  tune: mci("tune"),
  star: mci("star"),
  starOff: mci("star-outline"),
  pin: mci("pin"),
  archive: mci("archive"),
  restore: mci("restore"),
  send: mci("send"),
  print: mci("printer"),
  mail: mci("email"),
  phone: mci("phone"),
  chat: mci("chat"),
  note: mci("note-text"),
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
