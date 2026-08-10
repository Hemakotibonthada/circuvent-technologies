import { neoLayers, colorAt, NEO_DEPTH, type NeoLayer } from "../mobile/src/neo";

const LIGHT = "#ffffff";
const DARK = "#0b1120";

describe("the neumorphic shadow Android has to paint by hand", () => {
  const { dark, light } = neoLayers(LIGHT, DARK);

  /*
   * The defect this exists to prevent. Each layer is the card's rectangle,
   * shifted, with the opaque face drawn over it -- so the only visible part is
   * the sliver past one edge. Both gradients used to put their transparent end
   * exactly there, so both shadows rendered perfectly and invisibly.
   */
  it("is opaque where it can actually be seen", () => {
    expect(colorAt(dark, dark.visibleAt)).toBe(DARK);
    expect(colorAt(light, light.visibleAt)).toBe(LIGHT);
  });

  it("fades out under the face, not at the edge", () => {
    expect(colorAt(dark, { x: 0.25, y: 0.25 })).toBe("transparent");
    expect(colorAt(light, { x: 0.75, y: 0.75 })).toBe("transparent");
  });

  it("puts the dark half down-right and the light half up-left", () => {
    expect(dark.inset).toEqual({ left: NEO_DEPTH, top: NEO_DEPTH, right: -NEO_DEPTH, bottom: -NEO_DEPTH });
    expect(light.inset).toEqual({ left: -NEO_DEPTH, top: -NEO_DEPTH, right: NEO_DEPTH, bottom: NEO_DEPTH });
  });

  it("shows each layer at the corner its offset exposes", () => {
    // A layer shifted down-right can only be seen past the bottom-right edge.
    expect(dark.visibleAt).toEqual({ x: 1, y: 1 });
    expect(light.visibleAt).toEqual({ x: 0, y: 0 });
  });

  it("extrudes by the same distance in both directions, or it reads as lopsided", () => {
    expect(Math.abs(dark.inset.left)).toBe(Math.abs(light.inset.left));
    expect(Math.abs(dark.inset.top)).toBe(Math.abs(light.inset.top));
  });
});

describe("projecting a point onto a gradient", () => {
  const layer: NeoLayer = {
    inset: { left: 0, top: 0, right: 0, bottom: 0 },
    colors: ["#aaaaaa", "#aaaaaa", "transparent"],
    locations: [0, 0.5, 1],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    visibleAt: { x: 0, y: 0 },
  };

  it("clamps past either end rather than extrapolating", () => {
    expect(colorAt(layer, { x: -5, y: 0 })).toBe("#aaaaaa");
    expect(colorAt(layer, { x: 5, y: 0 })).toBe("transparent");
  });

  it("holds the colour across a band with the same colour at both ends", () => {
    expect(colorAt(layer, { x: 0.25, y: 0 })).toBe("#aaaaaa");
  });
});
