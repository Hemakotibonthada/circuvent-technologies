/**
 * Which panels the console dashboard shows, and in what order.
 *
 * The console's dashboard is not the app's home screen — it has a realtime
 * health strip, control-plane latency and a load-by-room breakdown, none of
 * which belong on a phone. So the two have separate catalogues.
 *
 * They do share the `dashboard` prefs scope, under separate keys. That matters:
 * a writer that PUTs its own layout as the whole document would delete the
 * other platform's arrangement, and the symptom — "my phone's home screen reset
 * itself" — would point at the phone rather than at the browser that did it.
 * Both sides read the whole document, change their own key, and write the rest
 * back untouched.
 */

export const CONSOLE_SECTIONS = [
  "health",
  "kpis",
  "alerts",
  "diagnostics",
  "scenes",
  "control",
  "rooms",
  "latency",
] as const;

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

export interface ConsoleSectionMeta {
  key: ConsoleSection;
  label: string;
  hint: string;
  required?: boolean;
}

export const CONSOLE_SECTION_META: Record<ConsoleSection, ConsoleSectionMeta> = {
  health: { key: "health", label: "System health", hint: "Realtime link, latency and device reachability" },
  kpis: { key: "kpis", label: "Key figures", hint: "Devices, power and today's usage" },
  alerts: { key: "alerts", label: "Alerts & trend", hint: "Open alerts and the consumption curve" },
  diagnostics: { key: "diagnostics", label: "Diagnostics", hint: "Anything currently wrong with the estate" },
  scenes: { key: "scenes", label: "Scenes", hint: "Run a scene from the dashboard" },
  /*
   * Live control is the console's equivalent of the app's device grid: the one
   * panel whose absence turns a control dashboard into a report.
   */
  control: { key: "control", label: "Live control", hint: "Switch devices directly", required: true },
  rooms: { key: "rooms", label: "Load by room", hint: "Where the power is going" },
  latency: { key: "latency", label: "Latency", hint: "Round-trip timings to the control plane" },
};

export interface ConsoleLayout {
  order: ConsoleSection[];
  hidden: ConsoleSection[];
}

export const DEFAULT_CONSOLE_LAYOUT: ConsoleLayout = { order: [...CONSOLE_SECTIONS], hidden: [] };

/** The key each platform owns inside the shared `dashboard` scope. */
export const CONSOLE_LAYOUT_KEY = "console";
export const APP_LAYOUT_KEY = "home";

const isSection = (v: unknown): v is ConsoleSection =>
  typeof v === "string" && (CONSOLE_SECTIONS as readonly string[]).includes(v);

/**
 * Turns whatever was stored into a layout that is safe to render.
 *
 * Same rules as the app's, for the same reasons: unknown keys are dropped so a
 * removed panel cannot crash a client that no longer has a component for it,
 * missing keys are appended so a new panel is not invisible to existing users,
 * duplicates collapse, required panels cannot be hidden, and malformed input
 * falls back rather than throwing — this runs during render.
 */
export function resolveConsoleLayout(stored: unknown): ConsoleLayout {
  if (!stored || typeof stored !== "object") {
    return { order: [...CONSOLE_SECTIONS], hidden: [] };
  }
  const raw = stored as Partial<Record<keyof ConsoleLayout, unknown>>;

  const seen = new Set<ConsoleSection>();
  const order: ConsoleSection[] = [];
  if (Array.isArray(raw.order)) {
    for (const k of raw.order) {
      if (isSection(k) && !seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  for (const k of CONSOLE_SECTIONS) if (!seen.has(k)) order.push(k);

  const hidden: ConsoleSection[] = [];
  if (Array.isArray(raw.hidden)) {
    for (const k of raw.hidden) {
      if (isSection(k) && !CONSOLE_SECTION_META[k].required && !hidden.includes(k)) hidden.push(k);
    }
  }

  return { order, hidden };
}

export function visibleConsoleSections(layout: ConsoleLayout): ConsoleSection[] {
  const hidden = new Set(layout.hidden);
  return layout.order.filter((k) => !hidden.has(k));
}

export function setConsoleHidden(layout: ConsoleLayout, key: ConsoleSection, hidden: boolean): ConsoleLayout {
  if (hidden && CONSOLE_SECTION_META[key].required) return layout;
  const next = layout.hidden.filter((k) => k !== key);
  if (hidden) next.push(key);
  return { ...layout, hidden: next };
}

export function moveConsole(layout: ConsoleLayout, key: ConsoleSection, delta: -1 | 1): ConsoleLayout {
  const i = layout.order.indexOf(key);
  if (i < 0) return layout;
  const j = i + delta;
  if (j < 0 || j >= layout.order.length) return layout;
  const order = [...layout.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...layout, order };
}

export function isDefaultConsoleLayout(layout: ConsoleLayout): boolean {
  return (
    layout.hidden.length === 0 &&
    layout.order.length === CONSOLE_SECTIONS.length &&
    layout.order.every((k, i) => k === CONSOLE_SECTIONS[i])
  );
}

/**
 * Merges a console layout into the shared document without disturbing the app's.
 *
 * This is the whole reason the two keys exist. Callers must use it rather than
 * building the document themselves — the failure it prevents is silent, remote,
 * and blamed on the wrong device.
 */
export function mergeConsoleLayout(existing: unknown, layout: ConsoleLayout): Record<string, unknown> {
  const doc = existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  doc[CONSOLE_LAYOUT_KEY] = layout;
  return doc;
}

/** Reads this platform's half out of the shared document. */
export function readConsoleLayout(doc: unknown): ConsoleLayout {
  if (!doc || typeof doc !== "object") return resolveConsoleLayout(undefined);
  return resolveConsoleLayout((doc as Record<string, unknown>)[CONSOLE_LAYOUT_KEY]);
}
