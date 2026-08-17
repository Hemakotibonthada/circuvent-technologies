/**
 * What the console opens as.
 *
 * Neo White — soft extruded tiles on a light field. Two separate things have to
 * hold for that to be what somebody actually sees, and each fails quietly:
 *
 *   - the default constants, which every consumer reads rather than hard-coding
 *   - `neo` not being a dark-only mode, because those are forced dark
 *     regardless of the stored scheme. Adding `neo` to that list would leave
 *     the default reading "light" while the console rendered dark, and nothing
 *     anywhere would complain.
 */
import {
  DEFAULT_MODE,
  DEFAULT_SCHEME,
  DARK_ONLY_MODES,
  isDarkOnly,
} from "@/app/smarthome/theme";

describe("the console's default look", () => {
  it("is Neo, on light", () => {
    expect(DEFAULT_MODE).toBe("neo");
    expect(DEFAULT_SCHEME).toBe("light");
  });

  it("uses a mode that can actually be light", () => {
    /*
     * The one that would make the setting a lie. `isDarkOnly` wins over the
     * scheme at render time, so a default of neo/light is only honoured while
     * neo stays out of that list.
     */
    expect(isDarkOnly(DEFAULT_MODE)).toBe(false);
    expect(DARK_ONLY_MODES).not.toContain(DEFAULT_MODE);
  });

  it("still keeps the dark-only modes dark-only", () => {
    // A light OLED is a contradiction; this is not an invitation to remove it.
    expect(isDarkOnly("oled")).toBe(true);
    expect(isDarkOnly("neon")).toBe(true);
  });
});

describe("the appearance picker", () => {
  const panel = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "src/app/smarthome/settings/AppearancePanel.tsx"),
    "utf8"
  ) as string;

  it("marks the real default as the default", () => {
    /*
     * The description text is written by hand next to the mode list, so it can
     * disagree with the constant above — and a picker that labels the wrong
     * entry "default" is worse than one that labels none, because it is
     * confidently wrong.
     */
    const marked = [...panel.matchAll(/key:\s*"(\w+)"[^\n]*—\s*default/g)].map((m) => m[1]);
    expect(marked).toEqual([DEFAULT_MODE]);
  });
});
