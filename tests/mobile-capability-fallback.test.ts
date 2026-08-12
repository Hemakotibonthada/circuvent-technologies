jest.mock("react-native", () => ({ StatusBar: { setBarStyle: () => {} } }), { virtual: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEVICE_META } from "../mobile/src/theme";

/*
 * store.tsx cannot be imported here — it pulls in the API client, the live
 * socket and React context. The rule under test is the one line that changed:
 * a type with no explicit case takes its switch from DEVICE_META rather than
 * assuming `power`. Transcribed rather than imported, and pinned to the same
 * metadata the app reads, so it fails if that metadata moves.
 */
function fallbackPower(type: string): { field: string; label: string } | undefined {
  const meta = DEVICE_META[type];
  if (meta) return meta.toggle ? { ...meta.toggle } : undefined;
  return { field: "power", label: "Power" };
}

describe("capabilities fallback for types with no explicit case", () => {
  it.each([
    ["touchboard", "g1"],
    ["watertank", "pump"],
    ["facedoor", "locked"],
  ])("%s switches %s, the field its firmware reads", (type, field) => {
    expect(fallbackPower(type)?.field).toBe(field);
  });

  it("offers no switch for a gate", () => {
    // firmware/rfid-gate takes open/close actions. A switch here could only
    // ever have appeared to work — and it put the gate in the scene picker.
    expect(fallbackPower("rfid-gate")).toBeUndefined();
  });

  it("offers no switch for a curtain, which has a position", () => {
    expect(fallbackPower("curtain")).toBeUndefined();
  });

  it("still guesses power for hardware this build has never heard of", () => {
    // An unknown type is not the same as a known one with no switch: almost
    // everything uses `power`, and refusing to offer anything would make a new
    // device uncontrollable until the app catches up.
    expect(fallbackPower("some-future-device")).toEqual({ field: "power", label: "Power" });
  });

  it("never returns a switch on a field the metadata does not name", () => {
    for (const type of Object.keys(DEVICE_META)) {
      const power = fallbackPower(type);
      if (power) expect(power.field).toBe(DEVICE_META[type].toggle?.field);
    }
  });

  /*
   * The rule above is transcribed, so on its own it would still pass if
   * store.tsx went back to assuming `power`. This reads the source to confirm
   * the app really does consult the metadata. Structural checks are blunt, but
   * the alternative is a test that cannot fail for the bug it describes.
   */
  it("store.tsx derives the fallback from DEVICE_META rather than assuming power", () => {
    const src = readFileSync(join(process.cwd(), "mobile", "src", "store.tsx"), "utf8");
    const fallback = src.slice(src.indexOf("export function capabilities"));
    const defaultBranch = fallback.slice(fallback.indexOf("default:"));

    expect(defaultBranch).toContain("DEVICE_META[type]");
    expect(defaultBranch).toContain("meta.toggle");
  });
});
