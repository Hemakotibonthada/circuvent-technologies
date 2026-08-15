/**
 * View settings — density, UI scale and content width.
 *
 * The console already wrote a `cv-prefs-density` value from the Appearance
 * tab, but nothing ever read it: the switch persisted a preference that had no
 * effect anywhere in the application. This module is the missing half. It owns
 * the storage keys, resolves them to attributes on `<html>`, and is the single
 * place any surface reads or writes them.
 *
 * Why attributes on the document element rather than React context: the
 * preference has to be applied *before first paint* (see `viewSettingsBootScript`
 * in the root layout) or the page renders at the wrong size and reflows once
 * hydration catches up — which is worse than not having the setting. An
 * attribute can be set by a two-line inline script; a provider cannot.
 *
 * Framework-free and SSR-safe on purpose, so the boot script, the settings
 * page and the admin toolbar all agree by construction instead of by comment.
 */

export type Density = "comfortable" | "cozy" | "compact";
export type ContentWidth = "standard" | "wide" | "full";

export interface ViewSettings {
  /** Vertical rhythm: section padding, control heights, heading sizes. */
  density: Density;
  /** Root font-size multiplier as a percentage. Everything sized in rem follows. */
  scale: number;
  /** The max width of centred page containers. */
  width: ContentWidth;
}

/* Kept as the key the console's Appearance tab already wrote, so an existing
   "compact" preference is honoured rather than silently reset. */
export const DENSITY_KEY = "cv-prefs-density";
export const SCALE_KEY = "cv-prefs-ui-scale";
export const WIDTH_KEY = "cv-prefs-content-width";

/** Fired on the window whenever settings change, including from another tab. */
export const VIEW_SETTINGS_EVENT = "cv:view-settings";

export const DENSITIES: readonly Density[] = ["comfortable", "cozy", "compact"];
export const WIDTHS: readonly ContentWidth[] = ["standard", "wide", "full"];

/** Scale bounds. Below 80 the 44px tap targets stop being tap targets; above
 *  125 the site is simply browser zoom and the browser does that better. */
export const MIN_SCALE = 80;
export const MAX_SCALE = 125;
export const SCALE_STEP = 5;

/**
 * `cozy` and `wide` rather than the old `comfortable`/`standard`.
 *
 * The admin dashboard spent four stacked rows on chrome and capped its content
 * at 1280px, so on a 1080p screen at 100% zoom roughly a fifth of the viewport
 * showed data — which is why the pages were being read at 75% and 50% instead.
 * Cozy is the same layout with the whitespace that was doing no work removed.
 */
export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  density: "cozy",
  scale: 100,
  width: "wide",
};

export function isDensity(v: unknown): v is Density {
  return typeof v === "string" && (DENSITIES as readonly string[]).includes(v);
}

export function isContentWidth(v: unknown): v is ContentWidth {
  return typeof v === "string" && (WIDTHS as readonly string[]).includes(v);
}

export function clampScale(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VIEW_SETTINGS.scale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n)));
}

/**
 * Read one stored value.
 *
 * Values are read tolerantly because two writers exist historically: the
 * console's `usePersistentState` JSON-encodes (`"compact"` with quotes) while
 * a plain `setItem` does not. Accepting both means an existing preference
 * survives this change instead of being discarded as corrupt.
 */
function readRaw(key: string): string | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
      if (typeof parsed === "number") return String(parsed);
    } catch {
      /* not JSON — it is already the bare value */
    }
    return raw;
  } catch {
    /* storage disabled (private mode, blocked cookies) — use the default */
    return null;
  }
}

export function readViewSettings(): ViewSettings {
  if (typeof window === "undefined") return DEFAULT_VIEW_SETTINGS;
  const density = readRaw(DENSITY_KEY);
  const width = readRaw(WIDTH_KEY);
  const scale = readRaw(SCALE_KEY);
  return {
    density: isDensity(density) ? density : DEFAULT_VIEW_SETTINGS.density,
    width: isContentWidth(width) ? width : DEFAULT_VIEW_SETTINGS.width,
    scale: scale === null ? DEFAULT_VIEW_SETTINGS.scale : clampScale(Number(scale)),
  };
}

/** Paint the settings onto `<html>`. CSS in globals.css does the rest. */
export function applyViewSettings(s: ViewSettings): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.dataset.density = s.density;
  el.dataset.width = s.width;
  el.style.setProperty("--cv-ui-scale", String(s.scale / 100));
}

export function saveViewSettings(patch: Partial<ViewSettings>): ViewSettings {
  const next: ViewSettings = { ...readViewSettings(), ...patch };
  next.scale = clampScale(next.scale);
  try {
    localStorage.setItem(DENSITY_KEY, JSON.stringify(next.density));
    localStorage.setItem(WIDTH_KEY, JSON.stringify(next.width));
    localStorage.setItem(SCALE_KEY, JSON.stringify(next.scale));
  } catch {
    /* Storage can be unavailable; the setting still applies for this session. */
  }
  applyViewSettings(next);
  try {
    window.dispatchEvent(new CustomEvent<ViewSettings>(VIEW_SETTINGS_EVENT, { detail: next }));
  } catch {
    /* CustomEvent is universally available in supported browsers; guarded so a
       storage failure in a hostile environment cannot break the page. */
  }
  return next;
}

export function resetViewSettings(): ViewSettings {
  return saveViewSettings(DEFAULT_VIEW_SETTINGS);
}

/** Subscribe to changes from this tab and from other tabs. Returns a cleanup. */
export function subscribeViewSettings(fn: (s: ViewSettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onLocal = () => fn(readViewSettings());
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === DENSITY_KEY || e.key === SCALE_KEY || e.key === WIDTH_KEY) {
      const s = readViewSettings();
      applyViewSettings(s);
      fn(s);
    }
  };
  window.addEventListener(VIEW_SETTINGS_EVENT, onLocal);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(VIEW_SETTINGS_EVENT, onLocal);
    window.removeEventListener("storage", onStorage);
  };
}

/*
 * Snapshots for `useSyncExternalStore`.
 *
 * `readViewSettings` builds a fresh object every call, and React compares
 * snapshots with Object.is — returning a new object each time is an infinite
 * render loop. The cache returns the *same* object until a value actually
 * changes, which also means it needs no explicit invalidation: it re-reads and
 * only swaps the reference when something is different.
 */
let snapshot: ViewSettings | null = null;

export function getViewSettingsSnapshot(): ViewSettings {
  const next = readViewSettings();
  if (
    snapshot !== null &&
    snapshot.density === next.density &&
    snapshot.scale === next.scale &&
    snapshot.width === next.width
  ) {
    return snapshot;
  }
  snapshot = next;
  return snapshot;
}

/** The server rendered the defaults, so hydration must agree with that. */
export function getServerViewSettingsSnapshot(): ViewSettings {
  return DEFAULT_VIEW_SETTINGS;
}

export const DENSITY_LABELS: Record<Density, { label: string; hint: string }> = {
  comfortable: { label: "Comfortable", hint: "Generous spacing. Easiest to read." },
  cozy: { label: "Cozy", hint: "Balanced. The default." },
  compact: { label: "Compact", hint: "Maximum data per screen." },
};

export const WIDTH_LABELS: Record<ContentWidth, { label: string; hint: string }> = {
  standard: { label: "Standard", hint: "1280px — narrow, centred columns." },
  wide: { label: "Wide", hint: "1600px — the default on large displays." },
  full: { label: "Full", hint: "Uses the whole window." },
};

/**
 * The inline script the root layout runs before first paint.
 *
 * Generated from the constants above so a renamed key cannot leave the boot
 * script reading something nothing writes — the failure mode there is a page
 * that loads at the wrong size and then jumps, which is hard to attribute to a
 * typo in a string literal buried in JSX.
 */
export function viewSettingsBootScript(): string {
  const d = DEFAULT_VIEW_SETTINGS;
  return `(function(){try{
var r=function(k){var v=localStorage.getItem(k);if(v===null)return null;try{var p=JSON.parse(v);if(typeof p==='string'||typeof p==='number')return String(p);}catch(e){}return v;};
var D=${JSON.stringify(DENSITIES)},W=${JSON.stringify(WIDTHS)};
var d=r(${JSON.stringify(DENSITY_KEY)}),w=r(${JSON.stringify(WIDTH_KEY)}),s=Number(r(${JSON.stringify(SCALE_KEY)}));
var e=document.documentElement;
e.dataset.density=D.indexOf(d)>-1?d:${JSON.stringify(d.density)};
e.dataset.width=W.indexOf(w)>-1?w:${JSON.stringify(d.width)};
s=isFinite(s)&&s>0?Math.min(${MAX_SCALE},Math.max(${MIN_SCALE},Math.round(s))):${d.scale};
e.style.setProperty('--cv-ui-scale',String(s/100));
}catch(err){var el=document.documentElement;el.dataset.density=${JSON.stringify(d.density)};el.dataset.width=${JSON.stringify(d.width)};}})();`;
}
