/**
 * Who rotates a camera frame.
 *
 * Exactly one layer may, and it is the device. firmware/camera.ino applies
 * rotation in the sensor — set_vflip and set_hmirror — so every frame that
 * leaves the board is already the right way up.
 *
 * The console rotated it again with a CSS transform, which produced a symptom
 * that reads like a failed command rather than a double transform: tapping
 * 180° flipped the picture for about a second and then it came back. The first
 * frames after the tap were still un-rotated from the sensor, so the CSS flip
 * was visible on its own; once the sensor caught up, the two rotations
 * composed to 360 and the image sat upright while the control said 180.
 *
 * It cannot be fixed by choosing the other layer, either. Rotating only in the
 * browser would leave every recorded clip, every snapshot and every mobile view
 * un-rotated, because those do not pass through this component. The device is
 * the only place that fixes all of them at once, and it already does.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const panel = readFileSync(join(ROOT, "src", "app", "smarthome", "DeviceControls.tsx"), "utf8");
const firmware = readFileSync(join(ROOT, "firmware", "camera", "camera.ino"), "utf8");

describe("camera rotation happens once, in the sensor", () => {
  it("the firmware rotates the sensor rather than tagging the frame", () => {
    expect(firmware).toMatch(/set_vflip\(s,\s*rotation == 180/);
    expect(firmware).toMatch(/set_hmirror\(s,\s*rotation == 180/);
  });

  it("the firmware persists and republishes the setting", () => {
    // Otherwise the control would spring back on the next state refresh, which
    // is a different bug with the same symptom.
    expect(firmware).toMatch(/store\.putInt\("rot", rotation\)/);
    expect(firmware).toMatch(/cv\.set\("rotation", rotation\)/);
  });

  it("the console does NOT rotate the frame a second time", () => {
    // The exact expression that caused it. A CSS transform driven by
    // state.rotation composes with the sensor's own flip.
    expect(panel).not.toMatch(/transform:\s*n\(d\.state\.rotation\)\s*===\s*180/);
    expect(panel).not.toMatch(/rotate\(180deg\)/);
  });

  it("still lets the user set the rotation", () => {
    // The control stays; only the double-rendering goes.
    expect(panel).toMatch(/send\(\{\s*rotation:/);
  });
});
