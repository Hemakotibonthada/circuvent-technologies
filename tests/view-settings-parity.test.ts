import * as web from "@/lib/view-settings";
import * as app from "../mobile/src/view-settings";

/**
 * The console and the phone must offer the same display settings.
 *
 * `src/lib/view-settings.ts` and `mobile/src/view-settings.ts` are deliberate
 * duplicates — the app is a separate TypeScript project and Metro cannot
 * resolve imports above its own root, the same constraint behind the two
 * copies of tank-link and session expiry.
 *
 * WHAT MUST MATCH, AND WHY
 *
 * These are the same account on two screens. Someone who sets "Compact" on
 * their phone and opens the console expects the same three choices in the same
 * order under the same names. A density that exists in one project and not the
 * other, or one called "Cozy" here and "Balanced" there, is the same
 * preference wearing two faces — and neither project would fail a build,
 * because each is perfectly consistent with itself.
 *
 * WHAT LEGITIMATELY DIFFERS
 *
 * - `width` (content width) is web-only. There is no second column to widen on
 *   a phone, and offering the control there would be a setting that does
 *   nothing.
 * - The scale bounds differ by platform, on purpose. Each file argues its own
 *   numbers; this test pins that both stay inside a range that keeps a 44px
 *   target usable rather than forcing them to agree on a number that is right
 *   for neither.
 */

describe("both projects offer the same densities", () => {
  it("uses the same vocabulary, in the same order", () => {
    // Order is user-visible: it is the order of the segmented control.
    expect([...app.DENSITIES]).toEqual([...web.DENSITIES]);
  });

  it("calls each one the same thing", () => {
    for (const d of web.DENSITIES) {
      expect(app.DENSITY_LABELS[d].label).toBe(web.DENSITY_LABELS[d].label);
      // Hints are allowed to differ — "more rows on screen" and "maximum data
      // per screen" describe the same setting on very different surfaces — but
      // neither may be blank.
      expect(app.DENSITY_LABELS[d].hint.length).toBeGreaterThan(0);
      expect(web.DENSITY_LABELS[d].hint.length).toBeGreaterThan(0);
    }
  });

  it("agrees on which density is the default", () => {
    expect(app.DEFAULT_VIEW_SETTINGS.density).toBe(web.DEFAULT_VIEW_SETTINGS.density);
  });

  it("recognises the same values and rejects the same nonsense", () => {
    for (const d of web.DENSITIES) {
      expect(app.isDensity(d)).toBe(true);
      expect(web.isDensity(d)).toBe(true);
    }
    for (const bad of ["roomy", "", undefined, null, 3]) {
      expect(app.isDensity(bad)).toBe(false);
      expect(web.isDensity(bad)).toBe(false);
    }
  });
});

describe("both projects treat text scale the same way", () => {
  it("starts at the design size", () => {
    expect(app.DEFAULT_VIEW_SETTINGS.textScale).toBe(100);
    expect(web.DEFAULT_VIEW_SETTINGS.scale).toBe(100);
  });

  it("moves by the same step", () => {
    // A control that jumps 5% in a browser and 10% on a phone is two different
    // controls wearing one name.
    expect(app.SCALE_STEP).toBe(web.SCALE_STEP);
  });

  it("lets the step divide the range evenly in both", () => {
    // Otherwise the last press before a bound moves by a different amount than
    // every other press, which reads as a stuck button.
    for (const [min, max, step] of [
      [app.MIN_SCALE, app.MAX_SCALE, app.SCALE_STEP],
      [web.MIN_SCALE, web.MAX_SCALE, web.SCALE_STEP],
    ]) {
      expect((max - min) % step).toBe(0);
      expect((100 - min) % step).toBe(0);
    }
  });

  it("never shrinks far enough to strand a 44px target, on either surface", () => {
    /*
     * Both files argue their own floor — the phone's is higher because a
     * caption at arm's length is the case the setting exists for. What must
     * hold everywhere is that nothing goes small enough to make the control
     * that undoes it hard to hit.
     */
    expect(web.MIN_SCALE).toBeGreaterThanOrEqual(80);
    expect(app.MIN_SCALE).toBeGreaterThanOrEqual(80);
  });

  it("never grows far enough to clip a fixed-height control", () => {
    expect(web.MAX_SCALE).toBeLessThanOrEqual(130);
    expect(app.MAX_SCALE).toBeLessThanOrEqual(130);
  });

  it("clamps identically inside the range they share", () => {
    const sharedMin = Math.max(web.MIN_SCALE, app.MIN_SCALE);
    const sharedMax = Math.min(web.MAX_SCALE, app.MAX_SCALE);
    for (let v = sharedMin; v <= sharedMax; v += app.SCALE_STEP) {
      expect(app.clampScale(v)).toBe(v);
      expect(web.clampScale(v)).toBe(v);
    }
  });

  it("refuses a non-number rather than adopting it, in both", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(app.clampScale(bad)).toBe(app.DEFAULT_VIEW_SETTINGS.textScale);
      expect(web.clampScale(bad)).toBe(web.DEFAULT_VIEW_SETTINGS.scale);
    }
  });

  it("rounds, so neither lands on a fractional percent", () => {
    expect(app.clampScale(102.4)).toBe(102);
    expect(web.clampScale(102.4)).toBe(102);
  });
});

describe("the web-only setting stays web-only", () => {
  it("has a content width the phone does not pretend to offer", () => {
    /*
     * Stated as a test so that adding `width` to the app is a deliberate act
     * with a reason, rather than something copied across for symmetry and then
     * shipped as a control with nothing behind it.
     */
    expect(web.WIDTHS.length).toBeGreaterThan(0);
    expect((app as Record<string, unknown>).WIDTHS).toBeUndefined();
  });
});
