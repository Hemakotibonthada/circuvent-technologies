import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The app is one React Native codebase, so a fix written once is supposed to
 * ship on both platforms. That is an assumption, not a guarantee: a single
 * `Platform.OS === "android"` around the wrong thing quietly makes a fix
 * Android-only, and nothing fails — iOS just carries on with the old bug.
 *
 * That has already happened once here. The neumorphism rebuild sets
 * `lightStrength: 0` because Android's hand-built shadow stack cannot spread
 * white thinly enough to avoid a halo. iOS draws real shadows and does not read
 * that field at all — but if the iOS branch in NeoRaised were ever removed as
 * "duplication", iOS would fall through to the Android path and silently lose
 * its light shadow, which is the half the user singled out as looking right.
 *
 * These tests pin the places where the platforms are deliberately allowed to
 * differ, so that anything else diverging has to be a deliberate act.
 */
const root = join(__dirname, "..", "mobile", "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("fixes written once reach both platforms", () => {
  /*
   * Each of these was a bug the user reported and I fixed. If any of them ever
   * grows an Android-only branch, the fix has stopped being a fix on iOS.
   */
  it.each([
    ["keyboard measurement", "keyboard.ts"],
    ["the Rooms crash guard", "device-shape.ts"],
    ["timer day-of-week filtering", "schedule.ts"],
    ["channel name sync", "channel-prefs.ts"],
    ["the 24-hour session cap", "session.ts"],
  ])("%s is shared, not Android-only", (_what, file) => {
    const src = read(file);
    expect(src).not.toMatch(/Platform\.OS\s*===\s*["']android["']/);
  });

  /*
   * keyboard.ts is allowed to branch on iOS — and must. iOS emits
   * keyboardWillShow ahead of the animation; Android only ever emits
   * keyboardDidShow, after it. Subscribing to the wrong one is the difference
   * between the field rising with the keyboard and jumping afterwards.
   */
  it("still listens for the iOS-only will-show event", () => {
    const src = read("keyboard.ts");
    expect(src).toContain("keyboardWillShow");
    expect(src).toContain("keyboardDidShow");
  });
});

describe("iOS keeps its own shadow implementation", () => {
  const ui = read("ui.tsx");

  it("NeoRaised branches to real shadows on iOS", () => {
    expect(ui).toMatch(/Platform\.OS\s*===\s*["']ios["']/);
    expect(ui).toContain("neoLight");
  });

  /*
   * The specific regression this guards: lightStrength is 0 for Android's
   * stacked-rect approximation. iOS must not be reading it, or the light
   * shadow disappears on the platform where it was working.
   */
  it("does not feed the Android-only lightStrength into an iOS shadow", () => {
    const iosBranch = ui.slice(ui.indexOf('Platform.OS === "ios"'));
    const firstReturn = iosBranch.slice(0, iosBranch.indexOf("</View>"));
    expect(firstReturn).toContain("shadowColor");
    expect(firstReturn).not.toContain("lightStrength");
  });
});

describe("the add-device flow", () => {
  const add = read("screens/AddDevice.tsx");

  /*
   * usePrompt returns both the opener and the node it renders into. Awaiting
   * prompt() without mounting promptNode is not a compile error and not a
   * runtime error — the promise simply never settles, so picking a device type
   * hangs forever with no dialog and no message. It shipped that way once.
   */
  it("mounts the dialog it awaits", () => {
    expect(add).toContain("promptNode");
    expect(add).toMatch(/\{promptNode\}/);
  });

  /*
   * The Wi-Fi password dialog sits above the keyboard on both platforms.
   * KeyboardAvoidingView with behavior={undefined} is an ordinary View, so
   * Android needs the measured height or the field ends up behind the keys —
   * which is exactly the bug the user reported twice, in two other screens.
   */
  it("keeps the password dialog clear of the keyboard on Android", () => {
    expect(add).toContain("useKeyboardHeight");
    expect(add).toMatch(/paddingBottom:\s*22\s*\+\s*kb/);
  });
});
