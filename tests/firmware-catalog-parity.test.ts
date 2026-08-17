/**
 * The firmware catalogue has to match the firmware.
 *
 * `isBehind` compares a device's reported version against this catalogue, so a
 * "latest" that was never built tells every unit running the newest firmware
 * there is that it is out of date — permanently — and an OTA campaign filtered
 * on version matches nothing at all. That is not hypothetical: the hub's own
 * version history records it happening, and when this test was written twelve
 * of the thirteen catalogued types advertised builds that did not exist.
 *
 * The catalogue is generated from the firmware sources. This checks the copy
 * still equals what the generator would produce, so it cannot drift back.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { FIRMWARE_CATALOG, isBehind } from "@/lib/smarthome-firmware";

const ROOT = process.cwd();
const GENERATED = join(ROOT, "src/lib/firmware-catalog.generated.ts");

/** Every firmware project that declares a version. */
function declaredVersions(): Map<string, string> {
  const fw = join(ROOT, "firmware");
  const out = new Map<string, string>();
  for (const dir of readdirSync(fw)) {
    const full = join(fw, dir);
    if (dir === ".pio" || dir === "CircuventDevice") continue;
    let files: string[];
    try {
      files = readdirSync(full).filter((f) => f.endsWith(".ino"));
    } catch {
      continue; // not a directory
    }
    for (const f of files) {
      const m = readFileSync(join(full, f), "utf8").match(/#define\s+CV_FW_VERSION\s+"([^"]+)"/);
      if (m) out.set(dir, m[1]);
    }
  }
  return out;
}

describe("the firmware catalogue", () => {
  const declared = declaredVersions();

  it("finds the firmware, so this cannot pass by comparing nothing", () => {
    expect(declared.size).toBeGreaterThan(10);
    expect(FIRMWARE_CATALOG.length).toBeGreaterThan(10);
  });

  it("lists every device type that has firmware", () => {
    // Eleven types were missing when this was written, so a device of that type
    // could never be told anything about its own firmware.
    const listed = new Set(FIRMWARE_CATALOG.map((f) => f.deviceType));
    const missing = [...declared.keys()].filter((t) => !listed.has(t));
    expect(missing).toEqual([]);
  });

  it("advertises exactly the version the firmware declares", () => {
    /*
     * Both directions matter. Ahead means nobody can ever be up to date; behind
     * means a real update is never offered.
     */
    const wrong = FIRMWARE_CATALOG.filter(
      (f) => declared.has(f.deviceType) && declared.get(f.deviceType) !== f.latestVersion
    ).map((f) => `${f.deviceType}: catalogue ${f.latestVersion}, firmware ${declared.get(f.deviceType)}`);
    expect(wrong).toEqual([]);
  });

  it("never claims a changelog entry newer than the release itself", () => {
    for (const f of FIRMWARE_CATALOG) {
      for (const entry of f.changelog) {
        expect(isBehind(f.latestVersion, entry.version)).toBe(false);
      }
    }
  });

  it("is still what the generator produces", () => {
    /*
     * The file is generated. If somebody edits it by hand — or changes firmware
     * and forgets to regenerate — this fails rather than letting the console
     * quietly describe firmware that no longer exists.
     */
    expect(existsSync(GENERATED)).toBe(true);
    const before = readFileSync(GENERATED, "utf8");
    execFileSync("node", [join(ROOT, "scripts/generate-firmware-catalog.cjs")], { stdio: "pipe" });
    const after = readFileSync(GENERATED, "utf8");
    expect(after).toBe(before);
  });
});

describe("isBehind", () => {
  it("says a device on the catalogued version is up to date", () => {
    const hub = FIRMWARE_CATALOG.find((f) => f.deviceType === "home-hub")!;
    expect(isBehind(hub.latestVersion, hub.latestVersion)).toBe(false);
  });

  it("compares numerically, not as text", () => {
    // "1.14.4" is newer than "1.9.0"; a string compare says the opposite, which
    // would offer a downgrade to every camera in the field.
    expect(isBehind("1.9.0", "1.14.4")).toBe(true);
    expect(isBehind("1.14.4", "1.9.0")).toBe(false);
  });

  it("treats an unknown version as behind", () => {
    // A device that has never reported one needs the update more than most.
    expect(isBehind(undefined, "1.0.0")).toBe(true);
  });
});
