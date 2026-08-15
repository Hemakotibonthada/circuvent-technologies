import { readFileSync } from "fs";
import { join } from "path";
import { DARK_ONLY_MODES, isDarkOnly, type ThemeMode } from "@/app/smarthome/theme";

/**
 * The console and the phone must offer the same looks.
 *
 * The app shipped five surface modes and the console three: someone who chose
 * OLED on their phone opened the console and it simply was not there, with no
 * error and nothing to explain the difference. Two applications agreeing on a
 * look by eye is how they stop agreeing — the same reasoning that already
 * produced glass-parity.test.ts, extended to the whole list.
 *
 * The palettes themselves are compared as text rather than imported, because
 * mobile/src/theme.ts pulls in react-native, which the root Jest runner cannot
 * transform. Same technique as glass-parity.
 */

const ROOT = process.cwd();
const consoleTheme = readFileSync(join(ROOT, "src", "app", "smarthome", "theme.tsx"), "utf8");
const appTheme = readFileSync(join(ROOT, "mobile", "src", "theme.ts"), "utf8");
const appSettings = readFileSync(join(ROOT, "mobile", "src", "screens", "Settings.tsx"), "utf8");
const consolePanel = readFileSync(
  join(ROOT, "src", "app", "smarthome", "settings", "AppearancePanel.tsx"),
  "utf8",
);

/** The string-literal members of an exported union type. */
function unionMembers(source: string, name: string): string[] {
  const line = new RegExp(`export type ${name}\\s*=\\s*([^;]+);`).exec(source);
  expect(line).not.toBeNull();
  return [...(line as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
}

describe("both projects offer the same surface modes", () => {
  it("declares the same union", () => {
    expect(unionMembers(consoleTheme, "ThemeMode")).toEqual(unionMembers(appTheme, "ThemeMode"));
  });

  it("offers every declared mode in its own settings screen", () => {
    /*
     * A mode that exists in the type but is missing from the picker is
     * unreachable — which is exactly how OLED and Neon were absent from the
     * console while its palette code would have handled them.
     */
    for (const mode of unionMembers(consoleTheme, "ThemeMode")) {
      expect(consolePanel).toMatch(new RegExp(`key:\\s*"${mode}"`));
      expect(appSettings).toMatch(new RegExp(`key:\\s*"${mode}"`));
    }
  });
});

describe("dark-only modes are dark-only on both", () => {
  it("names the same modes", () => {
    const appDarkOnly = /const DARK_ONLY: ThemeMode\[\] = \[([^\]]+)\]/.exec(appSettings);
    expect(appDarkOnly).not.toBeNull();
    const fromApp = [...(appDarkOnly as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)]
      .map((m) => m[1])
      .sort();
    expect(fromApp).toEqual([...DARK_ONLY_MODES].sort());
  });

  it("answers for every mode", () => {
    for (const mode of unionMembers(consoleTheme, "ThemeMode") as ThemeMode[]) {
      expect(typeof isDarkOnly(mode)).toBe("boolean");
    }
    expect(isDarkOnly("oled")).toBe(true);
    expect(isDarkOnly("neon")).toBe(true);
    expect(isDarkOnly("glass")).toBe(false);
    expect(isDarkOnly("aurora")).toBe(false);
    expect(isDarkOnly("neo")).toBe(false);
  });

  it("forces the painted scheme rather than trusting what was stored", () => {
    /*
     * The light shim remaps ~1,100 dark-authored neutrals whenever .cv-light is
     * present. On a force-dark theme that would repaint text near-black over a
     * near-black canvas — the 1.07:1 invisibility the admin chrome already had
     * once. Deriving the scheme is what stops a stored "light" reaching it.
     */
    expect(consoleTheme).toMatch(/const effectiveScheme: Scheme = isDarkOnly\(mode\)/);
    expect(consoleTheme).toMatch(/cv-\$\{effectiveScheme\}/);
    expect(consoleTheme).not.toMatch(/vars\(mode, scheme, accent\)/);
  });

  it("hides the scheme switch instead of leaving a dead control", () => {
    expect(consolePanel).toMatch(/isDarkOnly\(theme\.mode\)/);
    expect(appSettings).toMatch(/DARK_ONLY\.includes\(mode\)/);
  });
});

describe("the new palettes match the app value for value", () => {  /*
   * Read out of the app's own palette so a change there fails here rather than
   * quietly making the same named theme two different designs — which is the
   * bug the neo palette had before it was matched up.
   */
  const appValue = (mode: string, key: string): string => {
    const block = new RegExp(`if \\(mode === "${mode}"\\)[\\s\\S]*?\\n  \\}`).exec(appTheme);
    expect(block).not.toBeNull();
    const m = new RegExp(`\\b${key}:\\s*"([^"]+)"`).exec((block as RegExpExecArray)[0]);
    expect(m).not.toBeNull();
    return (m as RegExpExecArray)[1];
  };

  it("uses the app's OLED colours", () => {
    expect(appValue("oled", "bg")).toBe("#000000");
    expect(consoleTheme).toContain(`"--cv-bg": "${appValue("oled", "bg")}"`);
    expect(consoleTheme).toContain(`"--cv-card": "${appValue("oled", "card")}"`);
    expect(consoleTheme).toContain(`"--cv-card-hi": "${appValue("oled", "cardHi")}"`);
    expect(consoleTheme).toContain(`"--cv-text": "${appValue("oled", "text")}"`);
    expect(consoleTheme).toContain(`"--cv-muted": "${appValue("oled", "textDim")}"`);
  });

  it("uses the app's Neon colours", () => {
    expect(consoleTheme).toContain(`"--cv-card": "${appValue("neon", "card")}"`);
    expect(consoleTheme).toContain(`"--cv-card-hi": "${appValue("neon", "cardHi")}"`);
    expect(consoleTheme).toContain(`"--cv-text": "${appValue("neon", "text")}"`);
    expect(consoleTheme).toContain(`"--cv-muted": "${appValue("neon", "textDim")}"`);
    // The ground is a gradient over the app's flat bg, so assert the base only.
    expect(consoleTheme).toContain(appValue("neon", "bg"));
  });
});

describe("a lit accessory glows to suit the room it is in", () => {
  const deviceKit = readFileSync(
    join(ROOT, "src", "app", "smarthome", "_kit", "device.tsx"),
    "utf8",
  );

  /** The value of --cv-glow-spread inside a mode's branch, or the base one. */
  function spread(mode: string | null): number {
    const source = mode
      ? (new RegExp(`if \\(mode === "${mode}"\\)[\\s\\S]*?\\n  \\}`).exec(consoleTheme) ?? [""])[0]
      : consoleTheme;
    const m = /"--cv-glow-spread":\s*"([\d.]+)"/.exec(source);
    expect(m).not.toBeNull();
    return Number((m as RegExpExecArray)[1]);
  }

  it("leaves the default room unchanged", () => {
    // A multiplier of 1 means every existing theme renders exactly as before;
    // this variable may only ever add, never quietly restyle what shipped.
    expect(spread(null)).toBe(1);
  });

  it("carries further on the darker grounds", () => {
    expect(spread("oled")).toBeGreaterThan(1);
    expect(spread("neon")).toBeGreaterThan(spread("oled"));
  });

  it("is actually spent by the tile", () => {
    /*
     * The variable is the whole feature. Declared in the theme and read by
     * nothing is a preference with no effect — the exact failure the display
     * settings were written to fix, and it is invisible to types and to lint.
     */
    const uses = deviceKit.match(/var\(--cv-glow-spread, 1\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    expect(deviceKit).toMatch(/calc\(\$\{6 \+ 12 \* visual\.glow\}px \* var\(--cv-glow-spread, 1\)\)/);
    expect(deviceKit).toMatch(/calc\(\$\{8 \+ 14 \* visual\.glow\}px \* var\(--cv-glow-spread, 1\)\)/);
  });

  it("falls back to 1 where the variable is absent", () => {
    // The tile is also rendered outside the console provider (the shop's
    // device list). Without the fallback the shadow would be invalid CSS and
    // drop entirely, taking the "on" indication with it.
    expect(deviceKit).not.toMatch(/var\(--cv-glow-spread\)(?!,)/);
  });

  it("leaves the strength itself to the shared maths", () => {
    /*
     * Strength is device state and is pinned across both projects by
     * tile-visual-parity. If a theme started scaling glowFor, the phone and
     * the console would disagree about how bright a 60% lamp is.
     */
    const tileVisual = readFileSync(
      join(ROOT, "src", "app", "smarthome", "_kit", "tile-visual.ts"),
      "utf8",
    );
    expect(tileVisual).not.toMatch(/glow-spread|ThemeMode|mode/);
  });
});
