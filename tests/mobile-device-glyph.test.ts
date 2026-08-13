import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every screen that shows a device shows the same thing about it.
 *
 * The device list learned to draw brightness and fan speed; the room list and
 * the device hub did not, so the same lamp was a dimmable thing on one screen
 * and a plain switch on the next two. Nothing failed — it just quietly
 * disagreed with itself, which is how every device bug in this codebase has
 * looked.
 *
 * These read the sources rather than rendering them: the screens pull in the
 * API client, the live socket and React Native, none of which load under jest.
 * A structural check is blunt, but the alternative here is no check at all.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), "mobile", "src", rel), "utf8");

/** Screens that render a per-device control, and must therefore show its level. */
const DEVICE_SCREENS = ["screens/Devices.tsx", "screens/Rooms.tsx", "screens/more/DeviceHub.tsx"];

describe("device screens share one visual language", () => {
  it.each(DEVICE_SCREENS)("%s draws the shared glyph", (rel) => {
    const src = read(rel);
    expect(src).toMatch(/DeviceGlyph|useDeviceVisual/);
  });

  it.each(DEVICE_SCREENS)("%s does not derive the level itself", (rel) => {
    /*
     * The derivation belongs in useDeviceVisual. A screen recomputing it is
     * how the three drifted apart in the first place — and a second copy of
     * "which field holds the level" is a second thing to forget when a device
     * type is added.
     */
    const src = read(rel);
    expect(src).not.toMatch(/spinSecondsFor\s*\(/);
    expect(src).not.toMatch(/deviceTint\s*\(/);
  });

  it("keeps the derivation in one place", () => {
    const glyph = read("DeviceGlyph.tsx");
    expect(glyph).toContain("spinSecondsFor");
    expect(glyph).toContain("deviceTint");
    expect(glyph).toContain("fanLevel");
  });

  it("calls the animation hooks unconditionally", () => {
    /*
     * Both hooks take an `active` flag rather than being called behind an if.
     * Calling a hook conditionally changes hook order between renders, which
     * is what silently disabled the tilt on the shop page — it did not throw,
     * it just stopped working.
     */
    const glyph = read("DeviceGlyph.tsx");
    expect(glyph).toMatch(/const spin = useSpin\(/);
    expect(glyph).toMatch(/const glow = useGlowPulse\(/);
    expect(glyph).not.toMatch(/if\s*\([^)]*\)\s*\{?\s*(const\s+\w+\s*=\s*)?use(Spin|GlowPulse)\(/);
  });
});
