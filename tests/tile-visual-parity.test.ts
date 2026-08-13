import * as web from "@/app/smarthome/_kit/tile-visual";
import * as app from "../mobile/src/tile-visual";

/**
 * The console and the phone draw the same device.
 *
 * mobile/src/tile-visual.ts is a deliberate copy of the web curves — the app is
 * a separate TypeScript project and cannot import from src/ — and a copy is
 * only safe while something checks it. A fan that visibly turns faster in the
 * browser than on the phone makes one of the two look broken, and a screenshot
 * cannot tell you which.
 *
 * Every device bug in this codebase has been one surface knowing something the
 * other did not. This is the same guard, for the numbers behind the pixels.
 */
describe("tile visuals agree across the console and the app", () => {
  const levels = [0, 1, 5, 20, 33, 50, 66, 80, 99, 100];

  it.each(levels)("spin rate matches at level %s", (level) => {
    expect(app.spinSecondsFor(level, true)).toBe(web.spinSecondsFor(level, true));
  });

  it.each(levels)("glow matches at level %s", (level) => {
    expect(app.glowFor(level, true)).toBe(web.glowFor(level, true));
  });

  it("agrees that a device with no level glows fully", () => {
    expect(app.glowFor(null, true)).toBe(web.glowFor(null, true));
  });

  it("agrees that nothing animates when the device is not live", () => {
    expect(app.spinSecondsFor(80, false)).toBe(web.spinSecondsFor(80, false));
    expect(app.glowFor(80, false)).toBe(web.glowFor(80, false));
  });

  it.each([0, 25, 50, 75, 100])("ring geometry matches at level %s", (level) => {
    const r = 20;
    expect(app.ringDash(level, r)).toEqual(web.ringDash(level, r));
  });

  it("agrees on the extremes of the spin range", () => {
    // Pins the constants themselves, not just their relationship: both files
    // could drift together in the same direction and still pass the rest.
    expect(app.spinSecondsFor(100, true)).toBeCloseTo(0.45);
    expect(app.spinSecondsFor(1, true)).toBeCloseTo(2.58, 1);
  });

  it("agrees a fan at level zero does not turn, even with power on", () => {
    /*
     * A fan can report power on at level zero — the relay is closed and the
     * blades are not moving. Turning the icon there states the opposite of
     * what the hardware is doing, and the phone got this wrong first: it
     * spun at the default rate because the level was never consulted.
     */
    expect(app.spinSecondsFor(0, true)).toBeNull();
    expect(web.spinSecondsFor(0, true)).toBeNull();
  });

  it("agrees on the colour to draw a device in", () => {
    // The web helper returns "" to mean "use the accent"; the app resolves the
    // accent itself. Both must reject anything that is not a colour rather
    // than passing it into a style.
    expect(app.deviceTint("#FF0000", "#f59e0b", true)).toBe("#FF0000");
    expect(app.deviceTint("red; background:url(x)", "#f59e0b", true)).toBe("#f59e0b");
    expect(app.deviceTint("#FF0000", "#f59e0b", false)).toBe("#f59e0b");
  });
});
