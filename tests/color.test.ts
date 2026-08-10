import { hexToHsv, hsvToHex, wrapHue, clamp01, HUE_STOPS, COLOR_PRESETS } from "../mobile/src/color";

/*
 * The picker converts every time it draws and every time it sends, so a small
 * asymmetry between the two directions compounds. These check the properties
 * that matter rather than a table of values, because the failure mode is drift,
 * not a wrong constant.
 */
describe("hex ↔ HSV round-trips", () => {
  it.each([
    ["#ff0000"],
    ["#00ff00"],
    ["#0000ff"],
    ["#ffffff"],
    ["#000000"],
    ["#ffd7a0"],
    ["#4d94ff"],
    ["#7f3f1f"],
  ])("%s survives a round trip", (hex) => {
    const hsv = hexToHsv(hex);
    expect(hsv).not.toBeNull();
    expect(hsvToHex(hsv!)).toBe(hex);
  });

  /*
   * Repeated conversion is the real test: the app parses what the device
   * reports, draws it, and sends it back. If each pass shifts the hue, a saved
   * colour walks around the wheel over a few days of use.
   */
  it("does not drift over many conversions", () => {
    let hex = "#ffd7a0";
    for (let i = 0; i < 50; i++) hex = hsvToHex(hexToHsv(hex)!);
    expect(hex).toBe("#ffd7a0");
  });

  it("accepts shorthand and a missing hash", () => {
    expect(hexToHsv("#fff")).toEqual(hexToHsv("#ffffff"));
    expect(hexToHsv("ff0000")).toEqual(hexToHsv("#ff0000"));
  });

  /*
   * Null, not a default. A device reporting something unparseable should leave
   * the pointer where the user left it; defaulting to black would drag it into
   * the corner every time an unexpected value arrived.
   */
  it.each([["nope"], ["#12345"], ["#gggggg"], [""], ["#"]])(
    "returns null for %p rather than guessing",
    (bad) => {
      expect(hexToHsv(bad)).toBeNull();
    }
  );
});

describe("hue wrapping", () => {
  /* Dragging past the end of the spectrum comes back round. */
  it.each([
    [370, 10],
    [-10, 350],
    [360, 0],
    [720, 0],
  ])("%p° is %p°", (input, expected) => {
    expect(wrapHue(input)).toBeCloseTo(expected, 6);
  });

  it("red is the same colour at both ends of the grid", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe(hsvToHex({ h: 360, s: 1, v: 1 }));
  });
});

describe("saturation and value", () => {
  it("is white with no saturation, whatever the hue", () => {
    for (const h of [0, 90, 180, 270]) {
      expect(hsvToHex({ h, s: 0, v: 1 })).toBe("#ffffff");
    }
  });

  it("is black with no value, whatever the hue or saturation", () => {
    expect(hsvToHex({ h: 200, s: 1, v: 0 })).toBe("#000000");
    expect(hsvToHex({ h: 200, s: 0, v: 0 })).toBe("#000000");
  });

  it("clamps out-of-range input instead of producing nonsense hex", () => {
    expect(hsvToHex({ h: 0, s: 5, v: 5 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(hsvToHex({ h: 0, s: -5, v: -5 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(-2)).toBe(0);
  });
});

describe("the grid's paint", () => {
  /*
   * The pointer's x position is read back as hue by inverting the same linear
   * mapping the gradient is painted with, so the stops have to be evenly
   * spaced and span the full wheel or the colour under the pointer is not the
   * colour that gets sent.
   */
  it("spans the wheel in even steps, ending where it started", () => {
    expect(HUE_STOPS).toHaveLength(7);
    expect(HUE_STOPS[0]).toBe("#ff0000");
    expect(HUE_STOPS[6]).toBe("#ff0000");
  });

  it("every preset is a colour the picker can parse", () => {
    for (const p of COLOR_PRESETS) {
      expect(hexToHsv(p.hex)).not.toBeNull();
    }
  });

  /* The whites are the point of the presets — they sit on the grid's edge. */
  it("includes a white that is actually unsaturated", () => {
    const white = COLOR_PRESETS.find((p) => p.label === "White")!;
    expect(hexToHsv(white.hex)!.s).toBe(0);
  });
});
