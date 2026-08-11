import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The weather card showed "Bengaluru, Karnataka, India" to a user in Hyderabad,
 * twice reported and twice apparently fixed. It was not a geocoding bug: the
 * resolution logic was correct and the *fallback* was firing, silently.
 *
 * Two things made that possible, and both are the sort of thing only a test can
 * hold still:
 *
 *   1. The fallback returned a bare city name, in exactly the same shape as a
 *      real answer, so nothing downstream could tell a guess from a fact.
 *   2. weather.ts only ever *queried* the permission — it never requested one.
 *      The single prompt lived in the first-run flow, so anybody who declined
 *      once, or who upgraded into the build, was pinned to Bengaluru forever
 *      with nothing anywhere in the UI to change it.
 *
 * The module imports expo-location, which will not load in this environment, so
 * these read it as source. The properties being checked are structural.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", "mobile", "src", ...p), "utf8");

const weather = read("weather.ts");
const home = read("screens", "Home.tsx");

describe("the weather fallback is honest about being a fallback", () => {
  it("reports why it fell back rather than just where to", () => {
    expect(weather).toMatch(/FallbackReason/);
    for (const reason of ["denied", "no-fix", "unavailable"]) {
      expect(weather).toContain(`"${reason}"`);
    }
  });

  /*
   * Granted-but-no-fix is a different situation from denied: the fix is to
   * wait, not to change a setting, and telling somebody to turn on a permission
   * they already granted is the fastest way to lose their trust in the message.
   */
  it("separates a refused permission from a missing fix", () => {
    const granted = weather.slice(weather.indexOf('status === "granted"'));
    expect(granted).toContain('reason: "no-fix"');
    const denied = weather.slice(weather.indexOf("return { kind: \"fallback\", query: FALLBACK_CITY, reason: \"denied\""));
    expect(denied.length).toBeGreaterThan(0);
  });

  it("names the fallback city in one place", () => {
    expect(weather).toMatch(/export const FALLBACK_CITY\s*=/);
    /* Not scattered as a bare literal through the resolution logic. */
    const resolver = weather.slice(
      weather.indexOf("export async function resolveWeatherLocation"),
      weather.indexOf("export const FALLBACK_CITY")
    );
    expect(resolver).not.toMatch(/query:\s*"Bengaluru"/);
  });

  it("passes the reason up to whoever renders it", () => {
    expect(weather).toMatch(/fallbackReason/);
    const local = weather.slice(weather.indexOf("export async function getLocalWeather"));
    expect(local).toContain("fallbackReason: where.reason");
  });
});

describe("asking for the permission", () => {
  it("can request it, not only read it", () => {
    expect(weather).toContain("requestForegroundPermissionsAsync");
  });

  /*
   * Only on request. A permission dialog that appears because a card happened
   * to render is the kind people decline on reflex, and a reflexive denial is
   * much harder to undo than a considered one.
   */
  it("only asks when the caller asked it to", () => {
    expect(weather).toMatch(/opts\.ask/);
    const ask = weather.slice(weather.indexOf("opts.ask"));
    expect(ask.slice(0, 200)).toContain("canAskAgain");
  });

  it("does not ask on the first render of the strip", () => {
    /* The mount path loads with ask=false; only the button passes true. */
    expect(home).toMatch(/load\(false\)/);
    expect(home).toMatch(/load\(true\)/);
  });
});

describe("what the card says", () => {
  it("tells the user the location is not theirs", () => {
    expect(home).toMatch(/Location is off/);
    expect(home).toMatch(/showing Bengaluru/);
  });

  it("offers a way out when the reason is a refusal", () => {
    expect(home).toContain("Use my location");
  });

  /*
   * The note is inside a card that is itself a button to the forecast, so the
   * inner control has to claim the touch or tapping "Use my location" would
   * open the forecast instead.
   */
  it("stops the inner button falling through to the card", () => {
    const strip = home.slice(home.indexOf("function WeatherStrip"));
    /*
     * The whole button block, found by its handler rather than by a fixed
     * window — the phrase "Use my location" also appears in the accessibility
     * label above it, so counting characters backwards lands in the wrong
     * place.
     */
    const block = strip.slice(strip.indexOf('b.fallbackReason === "denied"'), strip.indexOf("Asking…"));
    expect(block).toContain("onStartShouldSetResponder");
  });

  it("says it to a screen reader as well as on screen", () => {
    const strip = home.slice(home.indexOf("function WeatherStrip"));
    expect(strip).toMatch(/accessibilityLabel=\{`Weather: \$\{summary\}\$\{guessing/);
  });
});
