import { readFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_VIEW_SETTINGS,
  DENSITIES,
  DENSITY_LABELS,
  DENSITY_SPACING,
  MAX_SCALE,
  MIN_SCALE,
  SCALE_STEP,
  clampScale,
  describeViewSettings,
  isDensity,
  parseViewSettings,
  space,
} from "../mobile/src/view-settings";

/**
 * Display settings on the phone.
 *
 * The behaviour worth pinning is not the arithmetic — it is the refusals. A
 * text-size control that can be driven to an unreadable or clipping value, or
 * that loses the user's choice when storage returns something unexpected, is
 * the kind of setting people turn on once and never touch again.
 */

describe("clampScale", () => {
  it("keeps the value inside the legible range", () => {
    expect(clampScale(MIN_SCALE - 20)).toBe(MIN_SCALE);
    expect(clampScale(MAX_SCALE + 40)).toBe(MAX_SCALE);
    expect(clampScale(100)).toBe(100);
  });

  it("falls back to the default rather than propagating a non-number", () => {
    /*
     * A NaN reaching the multiplier would set every fontSize in the app to
     * NaN, which React Native renders as invisible text — an unrecoverable
     * state for someone who cannot read the settings screen to fix it.
     *
     * Infinity falls back too rather than clamping to the ceiling. It is not a
     * user who dragged too far, it is a corrupt value, and reading it as "the
     * largest size" would silently adopt garbage as a preference.
     */
    expect(clampScale(Number.NaN)).toBe(DEFAULT_VIEW_SETTINGS.textScale);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(DEFAULT_VIEW_SETTINGS.textScale);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(DEFAULT_VIEW_SETTINGS.textScale);
  });

  it("rounds, so the stepper never lands on a fractional percent", () => {
    expect(clampScale(102.4)).toBe(102);
  });

  it("lets the step divide the range evenly", () => {
    // Otherwise the last press before a bound moves by a different amount than
    // every other press, which feels like a stuck button.
    expect((MAX_SCALE - MIN_SCALE) % SCALE_STEP).toBe(0);
    expect((100 - MIN_SCALE) % SCALE_STEP).toBe(0);
  });
});

describe("bounds are defensible", () => {
  it("never shrinks text far enough to strand the controls that fix it", () => {
    expect(MIN_SCALE).toBeGreaterThanOrEqual(85);
  });

  it("never grows text past what a 44pt control can contain", () => {
    expect(MAX_SCALE).toBeLessThanOrEqual(130);
  });

  it("defaults to the app as designed", () => {
    expect(DEFAULT_VIEW_SETTINGS.textScale).toBe(100);
  });
});

describe("parseViewSettings", () => {
  it("returns defaults for missing storage", () => {
    expect(parseViewSettings(null)).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it("survives a corrupt blob instead of throwing into the provider", () => {
    // The provider reads this during mount. Throwing here would be a white
    // screen on launch, caused by a preference.
    expect(parseViewSettings("{not json")).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(parseViewSettings("null")).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it("clamps a stored value that is out of range", () => {
    // A build with wider bounds, or a hand-edited value, must not escape them.
    expect(parseViewSettings(JSON.stringify({ textScale: 400 })).textScale).toBe(MAX_SCALE);
  });

  it("ignores an unknown density rather than adopting it", () => {
    expect(parseViewSettings(JSON.stringify({ density: "roomy" })).density).toBe(
      DEFAULT_VIEW_SETTINGS.density,
    );
  });

  it("keeps a valid stored choice", () => {
    expect(parseViewSettings(JSON.stringify({ textScale: 115, density: "compact" }))).toEqual({
      textScale: 115,
      density: "compact",
    });
  });

  it("keeps one setting when only the other was stored", () => {
    // Partial blobs exist across app upgrades; losing the user's text size
    // because a density key was added later would be a silent regression.
    expect(parseViewSettings(JSON.stringify({ textScale: 120 }))).toEqual({
      textScale: 120,
      density: DEFAULT_VIEW_SETTINGS.density,
    });
  });
});

describe("density", () => {
  it("recognises exactly the supported values", () => {
    for (const d of DENSITIES) expect(isDensity(d)).toBe(true);
    expect(isDensity("roomy")).toBe(false);
    expect(isDensity(undefined)).toBe(false);
  });

  it("orders spacing from most to least generous", () => {
    expect(DENSITY_SPACING.comfortable).toBeGreaterThan(DENSITY_SPACING.cozy);
    expect(DENSITY_SPACING.cozy).toBeGreaterThan(DENSITY_SPACING.compact);
  });

  it("leaves the default density at the designed spacing", () => {
    expect(DENSITY_SPACING[DEFAULT_VIEW_SETTINGS.density]).toBe(1);
    expect(space(16, "cozy")).toBe(16);
  });

  it("returns whole pixels", () => {
    for (const d of DENSITIES) {
      for (const base of [4, 6, 10, 12, 14, 16, 22]) {
        expect(Number.isInteger(space(base, d))).toBe(true);
      }
    }
  });

  it("never collapses a gap to nothing", () => {
    // A zero gap turns adjacent rows into one block of text.
    for (const d of DENSITIES) expect(space(4, d)).toBeGreaterThan(0);
  });

  it("labels every density", () => {
    for (const d of DENSITIES) {
      expect(DENSITY_LABELS[d].label.length).toBeGreaterThan(0);
      expect(DENSITY_LABELS[d].hint.length).toBeGreaterThan(0);
    }
  });
});

describe("describeViewSettings", () => {
  it("announces the value, not a bare number", () => {
    expect(describeViewSettings({ textScale: 100, density: "cozy" })).toBe(
      "Default text size · cozy spacing",
    );
    expect(describeViewSettings({ textScale: 120, density: "compact" })).toBe(
      "Text at 120% · compact spacing",
    );
  });
});

describe("both settings actually reach the app", () => {
  /*
   * The failure being guarded is the one this feature exists to fix. The web's
   * own view-settings module opens by describing it: the console persisted a
   * `cv-prefs-density` value that nothing ever read, so the switch moved, the
   * preference saved, and the application looked exactly the same.
   *
   * A stored-but-unread setting is invisible to types, to lint and to every
   * other test — the only thing that catches it is asking whether anything
   * consumes the value.
   */
  const ui = readFileSync(join(process.cwd(), "mobile", "src", "ui.tsx"), "utf8");
  const nativeHalf = readFileSync(
    join(process.cwd(), "mobile", "src", "view-settings-native.ts"),
    "utf8",
  );

  it("applies the text scale to Text itself, not to a token", () => {
    // fontSize is written literally hundreds of times across the app with no
    // shared Text wrapper, so a token-based scale would move almost nothing.
    expect(nativeHalf).toMatch(/Text,\s*TextInput/);
    expect(nativeHalf).toMatch(/StyleSheet\.flatten/);
    expect(nativeHalf).toMatch(/fontSize:\s*size \* currentScale/);
  });

  it("installs the patch exactly once", () => {
    // Patching twice wraps the first patch and squares the multiplier.
    expect(nativeHalf).toMatch(/if \(installed\) return;/);
  });

  it("spends the density on the containers every screen is built from", () => {
    // Card and SectionLabel are the two shapes used app-wide; if neither calls
    // sp(), the density control is decorative.
    expect(ui).toMatch(/const \{ c, scheme, sp \} = useTheme\(\)/);
    expect(ui).toMatch(/padded \? sp\(SPACE\.lg\) : 0/);
    expect(ui).toMatch(/marginBottom: sp\(SPACE\.md\)/);
  });

  it("exposes both controls on the theme so screens cannot invent their own", () => {
    expect(ui).toMatch(/setTextScale:/);
    expect(ui).toMatch(/setDensity:/);
    expect(ui).toMatch(/sp:/);
  });
});
