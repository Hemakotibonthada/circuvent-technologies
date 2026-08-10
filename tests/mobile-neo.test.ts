import {
  NEO,
  NEO_SMALL,
  shadowExtent,
  shadowLayers,
  withAlpha,
} from "../mobile/src/neo";

/*
 * Android has no blur primitive available to this app — elevation is a single
 * grey drop shadow, and the installed react-native-svg ships no filter
 * elements. So the falloff is built by stacking the same rounded rectangle at
 * increasing sizes and decreasing alpha.
 *
 * Two earlier attempts failed silently, which is why the properties that make
 * this read as a shadow rather than a bevel are asserted rather than eyeballed.
 */

describe("the shape of one shadow", () => {
  const dark = shadowLayers(1, 16);
  const light = shadowLayers(-1, 16);

  it("falls down-right for the dark half and up-left for the light half", () => {
    // A single light source above and to the left is the whole convention.
    const darkCore = dark[dark.length - 1];
    const lightCore = light[light.length - 1];
    expect(darkCore.left).toBeGreaterThan(0);
    expect(darkCore.top).toBeGreaterThan(0);
    expect(lightCore.left).toBeLessThan(0);
    expect(lightCore.top).toBeLessThan(0);
  });

  it("reaches past the surface, or there would be nothing to see", () => {
    // Every layer must extend beyond at least one edge; a shadow entirely
    // under an opaque face is the exact bug that shipped twice.
    for (const l of dark) {
      expect(Math.min(l.right, l.bottom)).toBeLessThan(0);
    }
  });

  /*
   * With a linear ramp the outermost layer still carries a visible fraction of
   * the alpha, so the shadow ends on a step you can see — a hard edge, which is
   * a bevel rather than a shadow.
   */
  it("fades to almost nothing at its outer edge", () => {
    expect(dark[0].opacity).toBeLessThan(0.02);
    expect(dark[dark.length - 1].opacity).toBeCloseTo(NEO.strength, 5);
  });

  /*
   * The step between two adjacent bands is what shows up as a contour line
   * around a tile. Stacked layers cannot be a true blur, but if no single step
   * is large enough to see, the eye reads the stack as continuous.
   *
   * This is the difference the side-by-side against iOS showed: the first
   * version stepped by as much as 0.18 between bands and every card had a ring
   * around it.
   */
  it("never steps by enough between bands to draw a contour line", () => {
    for (let i = 1; i < dark.length; i++) {
      expect(dark[i].opacity - dark[i - 1].opacity).toBeLessThan(0.09);
    }
  });

  /*
   * A white shadow at the dark half's alpha reads as a bright ring hugging the
   * card on a pale canvas, rather than as light falling across it.
   */
  it("keeps the light half gentler than a real blur's peak would be", () => {
    expect(NEO.lightStrength).toBeLessThan(0.5);
    expect(NEO.strength).toBeLessThan(0.3);
  });

  it("gets stronger and tighter towards the surface", () => {
    for (let i = 1; i < dark.length; i++) {
      expect(dark[i].opacity).toBeGreaterThan(dark[i - 1].opacity);
      // Each layer is drawn inside the previous one.
      expect(dark[i].left).toBeGreaterThan(dark[i - 1].left);
      expect(dark[i].borderRadius).toBeLessThan(dark[i - 1].borderRadius);
    }
  });

  /*
   * A rounded rectangle grown outwards keeps a constant border width, so its
   * corner radius has to grow with it. Holding the radius fixed makes the outer
   * layers visibly squarer than the surface, which shows up as corner fringing.
   */
  it("grows the corner radius along with the size", () => {
    expect(dark[0].borderRadius).toBeCloseTo(16 + NEO.blur, 5);
    expect(dark[dark.length - 1].borderRadius).toBeCloseTo(16, 5);
  });

  it("puts the same number of layers in each half", () => {
    expect(dark).toHaveLength(NEO.steps);
    expect(light).toHaveLength(NEO.steps);
  });

  it("is symmetric: the two halves are mirror images", () => {
    for (let i = 0; i < dark.length; i++) {
      expect(light[i].left).toBeCloseTo(-dark[i].left - 2 * (NEO.blur * (1 - (NEO.steps === 1 ? 1 : i / (NEO.steps - 1)))), 5);
      expect(light[i].opacity / NEO.lightStrength).toBeCloseTo(dark[i].opacity / NEO.strength, 5);
      expect(light[i].borderRadius).toBeCloseTo(dark[i].borderRadius, 5);
    }
  });

  it("survives being asked for a single layer", () => {
    const one = shadowLayers(1, 12, { ...NEO, steps: 1 });
    expect(one).toHaveLength(1);
    expect(one[0].opacity).toBeCloseTo(NEO.strength, 5);
  });
});

describe("the small variant", () => {
  it("is shallower and cheaper, for controls that repeat", () => {
    expect(NEO_SMALL.depth).toBeLessThan(NEO.depth);
    expect(NEO_SMALL.blur).toBeLessThan(NEO.blur);
    expect(NEO_SMALL.steps).toBeLessThan(NEO.steps);
  });
});

describe("how far a parent must not clip", () => {
  it("covers the offset and the spread together", () => {
    expect(shadowExtent()).toBe(NEO.depth + NEO.blur);
    const layers = shadowLayers(1, 10);
    // Nothing may reach further out than the extent we ask parents to allow.
    for (const l of layers) {
      expect(-Math.min(l.right, l.bottom)).toBeLessThanOrEqual(shadowExtent());
      expect(-Math.min(l.left, l.top)).toBeLessThanOrEqual(shadowExtent());
    }
  });
});

describe("per-layer alpha", () => {
  it("turns a hex colour into rgba", () => {
    expect(withAlpha("#ffffff", 0.5)).toBe("rgba(255,255,255,0.5)");
    expect(withAlpha("0b1120", 1)).toBe("rgba(11,17,32,1)");
  });

  it("expands the three-digit form", () => {
    expect(withAlpha("#fff", 1)).toBe("rgba(255,255,255,1)");
  });

  it("clamps rather than emitting an alpha a platform will reject", () => {
    expect(withAlpha("#000000", 5)).toBe("rgba(0,0,0,1)");
    expect(withAlpha("#000000", -1)).toBe("rgba(0,0,0,0)");
    expect(withAlpha("#000000", Number.NaN)).toBe("rgba(0,0,0,0)");
  });

  it("falls back to a usable colour rather than throwing on rubbish", () => {
    expect(withAlpha("not-a-colour", 0.3)).toMatch(/^rgba\(/);
  });
});
