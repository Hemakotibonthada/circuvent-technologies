// Command Center — a customizable, reorderable widget dashboard. This is the
// "new UI" console home: a bento-style grid distinct from the standard
// /smarthome Home page, where the user can show/hide and reorder widgets. The
// layout itself is local (localStorage); every widget renders live data from
// the existing control-plane + the other new console feature modules — none
// of it is invented data.

const KEY = "cv-console-command-center-layout";

export type WidgetKind =
  | "energy"
  | "budget"
  | "favorites"
  | "scenes"
  | "security"
  | "diagnostics"
  | "groups"
  | "recipes"
  | "activity"
  | "weather";

export interface WidgetConfig {
  id: string;
  kind: WidgetKind;
  visible: boolean;
}

export interface WidgetMeta {
  label: string;
  description: string;
  span: "1" | "2"; // grid column span at the lg breakpoint
}

export const WIDGET_META: Record<WidgetKind, WidgetMeta> = {
  energy: { label: "Live energy", description: "Current load and today's usage", span: "1" },
  budget: { label: "Monthly budget", description: "Projected spend vs your tariff budget", span: "1" },
  favorites: { label: "Favorite devices", description: "Your pinned quick-access devices", span: "1" },
  scenes: { label: "Scene shortcuts", description: "One-tap scene activation", span: "1" },
  security: { label: "Security snapshot", description: "Locks, motion and alerts at a glance", span: "1" },
  diagnostics: { label: "Fleet health", description: "Devices that need attention", span: "1" },
  groups: { label: "Device groups", description: "Bulk on/off for your groups", span: "1" },
  recipes: { label: "Try a recipe", description: "One-click automation ideas", span: "1" },
  activity: { label: "Recent activity", description: "The latest events across your home", span: "2" },
  weather: { label: "Weather", description: "Local conditions", span: "1" },
};

function defaultLayout(): WidgetConfig[] {
  return (Object.keys(WIDGET_META) as WidgetKind[]).map((kind) => ({ id: kind, kind, visible: true }));
}

export function getLayout(): WidgetConfig[] {
  if (typeof window === "undefined") return defaultLayout();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return defaultLayout();
    const saved = JSON.parse(raw) as WidgetConfig[];
    // Merge in any newly-added widget kinds that predate this saved layout.
    const known = new Set(saved.map((w) => w.kind));
    const merged = [...saved, ...defaultLayout().filter((w) => !known.has(w.kind))];
    return merged;
  } catch {
    return defaultLayout();
  }
}

function saveLayout(layout: WidgetConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    /* ignore */
  }
}

export function toggleWidget(layout: WidgetConfig[], id: string): WidgetConfig[] {
  const next = layout.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w));
  saveLayout(next);
  return next;
}

export function moveWidget(layout: WidgetConfig[], id: string, direction: "up" | "down"): WidgetConfig[] {
  const index = layout.findIndex((w) => w.id === id);
  if (index < 0) return layout;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= layout.length) return layout;
  const next = [...layout];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  saveLayout(next);
  return next;
}

export function resetLayout(): WidgetConfig[] {
  const next = defaultLayout();
  saveLayout(next);
  return next;
}
