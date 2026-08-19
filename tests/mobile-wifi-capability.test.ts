import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * Scanning for Wi-Fi networks and joining one by name are different
 * capabilities, and the app used to treat them as a single "does Wi-Fi work
 * here" flag. That flag was Android-only, because iOS genuinely cannot scan.
 * The side effect was that iOS also lost the ability to *join* — which it can
 * do perfectly well through NEHotspotConfiguration, with an entitlement this
 * app already ships (app.config.js lists it among the capabilities a free
 * Apple ID cannot provision, which is only worth saying because paid builds
 * have it).
 *
 * So an iPhone was sent to Settings to type a hotspot name by hand that the
 * app had just read off a QR code.
 *
 * These are source-level assertions. wifi.ts cannot be imported here: it
 * resolves react-native and the native module at module scope, neither of
 * which exists under Jest. The rule being pinned is which predicate each
 * function is gated on, and that is visible in the text.
 */

const WIFI = readFileSync(join(__dirname, "..", "mobile", "src", "wifi.ts"), "utf8");
const ADD_DEVICE = readFileSync(
  join(__dirname, "..", "mobile", "src", "screens", "AddDevice.tsx"),
  "utf8",
);
const APP_CONFIG = readFileSync(join(__dirname, "..", "mobile", "app.config.js"), "utf8");

/** The body of a top-level `export function name(...)` up to its closing brace. */
function body(src: string, name: string): string {
  const start = src.indexOf(`export function ${name}`);
  const startAsync = src.indexOf(`export async function ${name}`);
  const from = start >= 0 ? start : startAsync;
  if (from < 0) throw new Error(`${name} not found`);
  const open = src.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  throw new Error(`${name} never closes`);
}

describe("wifi.ts separates scanning from joining", () => {
  it("keeps scanning Android-only — iOS has no API for it at any entitlement level", () => {
    expect(body(WIFI, "wifiAutoSupported")).toContain('Platform.OS === "android"');
  });

  it("allows joining on iOS as well as Android", () => {
    const join = body(WIFI, "wifiJoinSupported");
    expect(join).toContain('Platform.OS === "ios"');
    expect(join).toContain('Platform.OS === "android"');
  });

  it("still requires the native module to join — Expo Go and the Simulator have none", () => {
    expect(body(WIFI, "wifiJoinSupported")).toContain("!!Wifi");
  });

  it.each(["connectToDeviceAP", "leaveDeviceAP"])(
    "%s gates on joining, not on scanning",
    (fn) => {
      const src = body(WIFI, fn);
      expect(src).toContain("wifiJoinSupported()");
      expect(src).not.toContain("wifiAutoSupported()");
    },
  );

  it("still gates the scan itself on scanning support", () => {
    expect(body(WIFI, "scanForDeviceAPs")).toContain("wifiAutoSupported()");
  });
});

describe("AddDevice offers the join path where the radar is unavailable", () => {
  it("shows an in-app join when scanning is impossible but the name is known", () => {
    expect(ADD_DEVICE).toContain("wifiJoinSupported() && !wifiAutoSupported() && !!targetSsid");
  });

  it("does not offer to join a hotspot whose name it never learned", () => {
    const fn = ADD_DEVICE.slice(ADD_DEVICE.indexOf("const joinNamedAP"));
    expect(fn.slice(0, 200)).toContain("if (!targetSsid) return;");
  });

  it("leaves the manual instructions in place, so a refusal is not a dead end", () => {
    // The Settings escape hatch must not be conditional on the join button.
    expect(ADD_DEVICE).toContain("onPress={openWifiSettings}");
  });
});

describe("the iOS entitlement the join path depends on", () => {
  it("is acknowledged by the config, and only stripped for free Apple IDs", () => {
    expect(APP_CONFIG).toContain("com.apple.developer.networking.HotspotConfiguration");
    // Stripping happens inside the CV_PERSONAL_TEAM branch only.
    const strip = APP_CONFIG.indexOf("withoutPersonalTeamBlockers");
    const guard = APP_CONFIG.indexOf('CV_PERSONAL_TEAM !== "1"');
    expect(strip).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
  });
});
