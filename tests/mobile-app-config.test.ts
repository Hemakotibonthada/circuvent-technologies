import { readFileSync } from "fs";
import { join } from "path";

const expo = JSON.parse(readFileSync(join(process.cwd(), "mobile/app.json"), "utf8")).expo as {
  version: string;
  android: { versionCode: number; package: string };
  ios: { buildNumber: string; bundleIdentifier: string; infoPlist: Record<string, string> };
};

/*
 * The two platforms ship the same app from the same source, and nothing was
 * keeping their build numbers together. Android had reached 14 while iOS was
 * still on 8 — six releases of drift, invisible because each store only ever
 * sees its own number, and nothing in the build bumps the iOS one.
 *
 * The consequence is not cosmetic: "build 12" has to mean one thing when
 * somebody reports a bug, and an iOS build carrying a number six behind the
 * code in it is a debugging trap.
 */
describe("the two platforms ship the same build", () => {
  it("keeps the iOS build number in step with the Android version code", () => {
    expect(expo.ios.buildNumber).toBe(String(expo.android.versionCode));
  });

  it("ships from one version number", () => {
    expect(expo.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("is the same app on both stores", () => {
    expect(expo.android.package).toBe("com.circuvent.app");
    expect(expo.ios.bundleIdentifier).toBe("com.circuvent.app");
  });
});

/*
 * A missing usage description does not fail on iOS, it terminates the process.
 * For the app lock that means closing on launch, on every Face ID iPhone, while
 * Android and Touch ID Macs behave perfectly — so it is worth asserting here as
 * well as in the build guard, because this suite runs on every change and the
 * build guard only runs before a build.
 */
describe("iOS usage descriptions for everything the app can trigger", () => {
  it.each([
    ["NSFaceIDUsageDescription", "the app lock"],
    ["NSCameraUsageDescription", "scanning a device QR code"],
    ["NSLocationWhenInUseUsageDescription", "presence automations"],
    ["NSLocalNetworkUsageDescription", "finding devices on the network"],
  ])("has %s, for %s", (key) => {
    const value = expo.ios.infoPlist[key];
    expect(typeof value).toBe("string");
    // Apple rejects boilerplate, and a vague string is also useless to the
    // person being asked; a real sentence is the minimum bar.
    expect((value ?? "").length).toBeGreaterThan(25);
  });
});
