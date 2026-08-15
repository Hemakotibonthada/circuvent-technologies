/**
 * The native clients must speak the same protocol as everything else.
 *
 * WHY THIS TEST CARRIES MORE WEIGHT THAN USUAL
 *
 * There are now four implementations of one protocol: the web console, the Expo
 * app, a Kotlin client and a Swift one. Every way that protocol breaks is
 * silent. A wrong endpoint is a 404 nobody sees until a screen is empty. A
 * command built with the state key instead of the command key is accepted by
 * the control plane, delivered by the broker, and dropped by the sketch — the
 * switch moves under the finger, snaps back, and it reads as broken hardware.
 *
 * The Swift half cannot be compiled on the machine this repository is developed
 * on. There is no Mac in the pipeline, so without this the first check on that
 * code would be a person, on a phone, months from now. Reading the sources and
 * asserting the constants is not as good as compiling them; it is enormously
 * better than nothing, and it catches the class of mistake that actually
 * happens here — two files that were supposed to say the same thing and do not.
 */
import fs from "node:fs";
import path from "node:path";

import { HUB_CHANNEL_FIELDS } from "@/lib/smarthome-command-map";

const root = path.join(__dirname, "..");
const read = (...p: string[]) => fs.readFileSync(path.join(root, ...p), "utf8");

const kotlinApi = read("native", "android", "app", "src", "main", "java", "com", "circuvent", "app", "core", "Api.kt");
const kotlinCommands = read("native", "android", "app", "src", "main", "java", "com", "circuvent", "app", "core", "Commands.kt");
const kotlinTest = read("native", "android", "app", "src", "test", "java", "com", "circuvent", "app", "CommandsTest.kt");

const swiftApi = read("native", "ios", "Circuvent", "Core", "Api.swift");
const swiftCommands = read("native", "ios", "Circuvent", "Core", "Commands.swift");
const swiftTest = read("native", "ios", "CircuventTests", "CommandsTests.swift");

const expoConfig = read("mobile", "src", "config.ts");

/** Every double-quoted string in a source file. */
const strings = (src: string): string[] =>
  [...src.matchAll(/"([^"\\]*)"/g)].map((m) => m[1]);

describe("all four clients point at the same control plane", () => {
  const expected = {
    base: /API_BASE\s*=\s*"([^"]+)"/.exec(expoConfig)?.[1],
    ws: /WS_URL\s*=\s*"([^"]+)"/.exec(expoConfig)?.[1],
  };

  it("reads the addresses the Expo app already uses", () => {
    expect(expected.base).toBe("https://api.circuvent.com");
    expect(expected.ws).toBe("wss://api.circuvent.com/ws");
  });

  it("the Kotlin client uses them", () => {
    expect(kotlinApi).toContain(`"${expected.base}"`);
    expect(kotlinApi).toContain(`"${expected.ws}"`);
  });

  it("the Swift client uses them", () => {
    expect(swiftApi).toContain(`"${expected.base}"`);
    expect(swiftApi).toContain(`"${expected.ws}"`);
  });

  it("neither can reach a plaintext host", () => {
    /*
     * An http:// base would send a bearer token over the air in the clear, and
     * it is the sort of thing that arrives as a temporary change for a local
     * dev server and stays. Both platforms also refuse cleartext at the OS
     * level — no android:usesCleartextTraffic, no ATS exception — so this is
     * the third lock on the same door.
     */
    for (const src of [kotlinApi, swiftApi]) {
      expect(src).not.toMatch(/"http:\/\//);
      expect(src).not.toMatch(/"ws:\/\//);
    }
  });

  it("spells every endpoint the same way", () => {
    for (const endpoint of ["/auth/login", "/auth/refresh", "/devices"]) {
      expect(kotlinApi).toContain(`"${endpoint}"`);
      expect(swiftApi).toContain(`"${endpoint}"`);
    }
    // The command path is built, so it is matched as a template rather than a
    // literal. Both clients must produce /devices/<id>/command.
    expect(kotlinApi).toMatch(/"\/devices\/\$deviceId\/command"/);
    expect(swiftApi).toMatch(/"\/devices\/\\\(deviceID\)\/command"/);
  });
});

describe("the command map is the same map in every language", () => {
  it("addresses hub channels positionally, with the console's channel list", () => {
    /*
     * The Home Hub is the sharpest case: it *reports* power/power2/power3/
     * power4 and *reads* {ch, on}. A client that sends the state key gets no
     * error from anything, and the relay never moves.
     */
    const kotlinChannels = /hubChannels|HUB_CHANNELS/.test(kotlinCommands)
      ? strings(kotlinCommands.split("HUB_CHANNELS")[1] ?? "")
      : [];
    const swiftChannels = strings(swiftCommands.split("hubChannels")[1] ?? "");

    for (const field of HUB_CHANNEL_FIELDS) {
      expect(kotlinChannels).toContain(field);
      expect(swiftChannels).toContain(field);
    }
    for (const src of [kotlinCommands, swiftCommands]) {
      expect(src).toMatch(/"ch"/);
      expect(src).toMatch(/"on"/);
    }
  });

  it("agrees on which devices have a primary switch and which field it is", () => {
    /*
     * Derived by reading each client's own primaryToggle rather than comparing
     * against a list written here, so this test cannot drift into agreeing with
     * itself. The expectations come from the firmware, via
     * tests/mobile-toggle-fields.test.ts, which transcribes the sketches.
     */
    const expected: Record<string, string | null> = {
      "smart-plug": "power",
      "smart-switch": "power",
      "smart-light": "power",
      "smart-fan": "power",
      touchboard: "g1",
      "touchboard-8": "g1",
      sentinel: "r1",
      watertank: "pump",
      aquaguard: "pump",
      "agri-starter": "pump",
      "smart-lock": "locked",
      facedoor: "locked",
      "home-hub": null,
      "rfid-gate": null,
      curtain: null,
      camera: null,
      meter: null,
      "drone-link": null,
    };

    const kotlinToggle = kotlinCommands.split("fun primaryToggle")[1] ?? "";
    const swiftToggle = swiftCommands.split("func primaryToggle")[1] ?? "";
    expect(kotlinToggle.length).toBeGreaterThan(100);
    expect(swiftToggle.length).toBeGreaterThan(100);

    for (const [type, field] of Object.entries(expected)) {
      for (const [name, src] of [["Kotlin", kotlinToggle], ["Swift", swiftToggle]] as const) {
        expect(src).toContain(`"${type}"`);
        if (field) {
          // The type and its field must appear in the same branch. Splitting on
          // the arrow/return keeps a type from matching a neighbour's field.
          const branch = src.split(`"${type}"`)[1]?.slice(0, 200) ?? "";
          expect(`${name}:${type}:${branch}`).toContain(`"${field}"`);
        }
      }
    }
  });

  it("refuses a whole-device switch for a hub in both clients", () => {
    // A hub's `power` is relay one only, so a switch labelled for the whole
    // device would turn on a quarter of it and report success.
    for (const src of [kotlinCommands, swiftCommands]) {
      const branch = src.split("primaryToggle")[1] ?? "";
      const hub = branch.split('"home-hub"')[1]?.slice(0, 120) ?? "";
      expect(hub).toMatch(/null|nil/);
    }
  });

  it("treats setup mode as an action on every platform", () => {
    /*
     * `setup` is handled by the shared device library on every product, so it
     * must not fall into the generic tail and become {action:"set",
     * setup:true} — a shape no sketch reads, sent to a device that would drop
     * it in silence while the caller saw success.
     */
    for (const src of [kotlinCommands, swiftCommands]) {
      expect(src).toMatch(/"setup"/);
      expect(src).toMatch(/"minutes"/);
    }
    // Clamped the way the firmware clamps it, asserted in each language's own
    // spelling rather than through a pattern loose enough to match either.
    expect(kotlinCommands).toMatch(/coerceIn\(1,\s*60\)/);
    expect(swiftCommands).toMatch(/min\(max\(minutes,\s*1\),\s*60\)/);
  });

  it("uses `all` for a whole touch board, which is what the sketch reads", () => {
    for (const src of [kotlinCommands, swiftCommands]) {
      expect(src).toMatch(/"all"/);
    }
  });
});

describe("both native clients are checked for the same things", () => {
  /*
   * The Swift tests cannot run here, so the next best guarantee is that they
   * exist and cover the same ground as the Kotlin ones. Two clients with
   * different tests are two clients that were checked for different things, and
   * the gap between them is exactly where a platform-specific bug lives.
   */
  const caseNames = (src: string, pattern: RegExp) =>
    [...src.matchAll(pattern)].map((m) => m[1]);

  it("has a test file on each side", () => {
    expect(kotlinTest.length).toBeGreaterThan(500);
    expect(swiftTest.length).toBeGreaterThan(500);
  });

  it("covers the same number of cases", () => {
    const kotlin = caseNames(kotlinTest, /fun `([^`]+)`/g);
    const swift = caseNames(swiftTest, /func (test\w+)/g);
    expect(kotlin.length).toBeGreaterThanOrEqual(10);
    expect(swift.length).toBe(kotlin.length);
  });

  it("covers each named hazard on both sides", () => {
    // Matched on subject rather than on the test's wording, so the two are
    // allowed to read naturally in their own language.
    const subjects = ["home-hub", "smart-lock", "rfid-gate", "touchboard-8", "setup", "power"];
    for (const subject of subjects) {
      expect(kotlinTest).toContain(subject);
      expect(swiftTest).toContain(subject);
    }
  });
});

describe("the Expo app is untouched and still the shipping client", () => {
  it("still exists with its own build", () => {
    /*
     * The native clients are a replacement in progress, not a replacement. The
     * Expo app is what is on the Play Store, and deleting or half-migrating it
     * would leave the product with no shipping phone client at all.
     */
    expect(fs.existsSync(path.join(root, "mobile", "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(root, "mobile", "App.tsx"))).toBe(true);
  });

  it("keeps the published application id for itself", () => {
    /*
     * The native builds use a different id so both can sit on one phone while
     * they are compared. Sharing it would make the new debug build replace
     * somebody's real, provisioned installation.
     */
    const expo = read("mobile", "app.json");
    expect(expo).toContain('"com.circuvent.app"');

    const gradle = read("native", "android", "app", "build.gradle.kts");
    expect(gradle).toContain('applicationId = "com.circuvent.app.nativeclient"');

    const project = read("native", "ios", "project.yml");
    expect(project).toContain("com.circuvent.app.nativeclient");
  });
});
