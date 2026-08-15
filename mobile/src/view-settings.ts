/**
 * Display settings — text size and density.
 *
 * Pure on purpose: no react-native import, so the root Jest suite can exercise
 * it (Docs/24 §1 — mobile logic is tested from the root, and that runner
 * cannot transform react-native's ESM). The half that touches Text, Platform
 * and AsyncStorage lives in view-settings-native.ts.
 *
 * Everything here is a refusal or a bound. The arithmetic is trivial; what
 * matters is that a stored value can never leave the app unreadable, because
 * the control that would fix it is itself made of text.
 */

export type Density = "comfortable" | "cozy" | "compact";

export interface ViewSettings {
  /** Percentage applied to every font size. 100 = the app as designed. */
  textScale: number;
  /** Vertical rhythm: gaps between rows, card padding, list spacing. */
  density: Density;
}

export const STORAGE_KEY = "cv-view-settings-v1";

export const DENSITIES: readonly Density[] = ["comfortable", "cozy", "compact"];

/*
 * Bounds, and why they are these numbers.
 *
 * The floor is 85 rather than the web's 80: this is a touch UI, and shrinking
 * a label does not shrink its control — but a 10pt caption at 8pt is
 * unreadable on a phone at arm's length, which is the case the setting exists
 * for in the first place.
 *
 * The ceiling is 130 because past that the fixed 44pt controls this app is
 * built on begin clipping their own labels, and a button whose text is cut in
 * half is worse than one that is slightly small.
 */
export const MIN_SCALE = 85;
export const MAX_SCALE = 130;
export const SCALE_STEP = 5;

export const DEFAULT_VIEW_SETTINGS: ViewSettings = {
  textScale: 100,
  density: "cozy",
};

export function isDensity(v: unknown): v is Density {
  return typeof v === "string" && (DENSITIES as readonly string[]).includes(v);
}

export function clampScale(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_VIEW_SETTINGS.textScale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(n)));
}

/**
 * Spacing multiplier for a density.
 *
 * Deliberately gentler than the text scale. Density moves the gaps between
 * things; if it also moved their size the two settings would fight, and
 * somebody who wanted more rows on screen would get smaller text they never
 * asked for.
 */
export const DENSITY_SPACING: Record<Density, number> = {
  comfortable: 1.15,
  cozy: 1,
  compact: 0.82,
};

export const DENSITY_LABELS: Record<Density, { label: string; hint: string }> = {
  comfortable: { label: "Comfortable", hint: "Generous spacing. Easiest to read." },
  cozy: { label: "Cozy", hint: "Balanced. The default." },
  compact: { label: "Compact", hint: "More rows on screen." },
};

export function parseViewSettings(raw: string | null): ViewSettings {
  if (!raw) return DEFAULT_VIEW_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<ViewSettings> | null;
    if (!v || typeof v !== "object") return DEFAULT_VIEW_SETTINGS;
    return {
      textScale:
        v.textScale === undefined
          ? DEFAULT_VIEW_SETTINGS.textScale
          : clampScale(Number(v.textScale)),
      density: isDensity(v.density) ? v.density : DEFAULT_VIEW_SETTINGS.density,
    };
  } catch {
    /* The provider reads this during mount. Throwing would be a white screen
       on launch, caused by a preference. */
    return DEFAULT_VIEW_SETTINGS;
  }
}

/** Rounded spacing for a density, so callers never emit fractional pixels. */
export function space(base: number, density: Density): number {
  return Math.max(1, Math.round(base * DENSITY_SPACING[density]));
}

/**
 * A human sentence for the current setting.
 *
 * Used by the accessibility label so a screen reader announces the value
 * rather than a bare number sitting between two unlabelled steppers.
 */
export function describeViewSettings(s: ViewSettings): string {
  const size = s.textScale === 100 ? "Default text size" : `Text at ${s.textScale}%`;
  return `${size} · ${DENSITY_LABELS[s.density].label.toLowerCase()} spacing`;
}
