/**
 * The console and the app must agree about updates and camera faults.
 *
 * They are separate TypeScript projects and cannot import each other, so the
 * logic exists twice on purpose. Drift is the danger, and it is not
 * hypothetical here: the original "check the ribbon cable seating" sentence
 * lived in both, and fixing one would have left the other sending people up a
 * ladder to working hardware.
 *
 * These assertions are about *agreement*, not implementation. The behavioural
 * tests for each rule live in camera-ota-status.test.ts.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");

const consoleOta = fs.readFileSync(
  path.join(root, "src", "app", "smarthome", "ota-status.ts"),
  "utf8"
);
const consoleFault = fs.readFileSync(
  path.join(root, "src", "app", "smarthome", "camera-fault.ts"),
  "utf8"
);
const mobile = fs.readFileSync(
  path.join(root, "mobile", "src", "camera-status.ts"),
  "utf8"
);
const deviceControls = fs.readFileSync(
  path.join(root, "src", "app", "smarthome", "DeviceControls.tsx"),
  "utf8"
);
const mobileControl = fs.readFileSync(
  path.join(root, "mobile", "src", "screens", "Control.tsx"),
  "utf8"
);

describe("both surfaces read otaStatus", () => {
  it("parses the same four phases", () => {
    for (const src of [consoleOta, mobile]) {
      expect(src).toMatch(/\^downloading/);
      expect(src).toMatch(/\^failed:/);
      expect(src).toMatch(/\^skipped:/);
      expect(src).toMatch(/\^no update offered/i);
    }
  });

  it("both treat an unknown status as idle rather than a stuck update", () => {
    // A panel frozen on "Updating…" forever is worse than one that says
    // nothing, and devices in the field run builds going back years.
    for (const src of [consoleOta, mobile]) {
      expect(src).toMatch(/return IDLE;[\s\S]*\}$/m);
    }
  });

  it("both cover the offline window, which is when people look", () => {
    /*
     * A device writing an image is not answering MQTT, so it goes offline
     * mid-update. If only one surface explains that gap, the other one is still
     * reporting a healthy camera as broken.
     */
    for (const src of [consoleOta, mobile]) {
      expect(src).toMatch(/online\s*\?/);
      expect(src).toMatch(/come back on its own/i);
    }
  });

  it("neither hides a fault after a failed update", () => {
    // A failed update is over: the device is back on its old firmware and any
    // fault showing then is a real one.
    for (const src of [consoleOta, mobile]) {
      expect(src).toMatch(/phase === "updating"/);
    }
  });
});

describe("both surfaces suppress faults while updating", () => {
  it("the console gates every camera fault banner on it", () => {
    expect(deviceControls).toMatch(/const updating = isUpdating\(ota\)/);
    // Each fault banner has to carry the guard; one that does not is the one
    // that shows during the update.
    const guarded = deviceControls.match(/&& !updating &&/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(3);
  });

  it("the app gates its camera fault banners on it", () => {
    expect(mobileControl).toMatch(/const camUpdating = isUpdating\(/);
    const guarded = mobileControl.match(/&& !camUpdating/g) ?? [];
    expect(guarded.length).toBeGreaterThanOrEqual(3);
  });
});

describe("neither surface blames a ribbon without evidence", () => {
  it("has removed the sentence that caused this", () => {
    /*
     * "The camera sensor is not responding. Check the ribbon cable seating."
     * fired whenever the cause was unknown, and was wrong in the case that
     * actually happened — the sensor had answered and named itself, and the
     * real cause was a frame buffer that would not allocate.
     */
    for (const src of [deviceControls, mobileControl, consoleFault, mobile]) {
      expect(src).not.toMatch(/The camera sensor is not responding\. Check the ribbon cable seating/);
    }
  });

  it("both treat a published sensorPid as proof the sensor answered", () => {
    for (const src of [consoleFault, mobile]) {
      expect(src).toMatch(/sensorLabel/);
      expect(src).toMatch(/smaller resolution/i);
    }
  });

  it("both admit what they do not know instead of inventing a cause", () => {
    for (const src of [consoleFault, mobile]) {
      expect(src).toMatch(/has not reported enough/i);
    }
  });

  it("both stay quiet about reseating once the device fixed itself", () => {
    for (const src of [consoleFault, mobile]) {
      expect(src).toMatch(/resolutionFault/);
      expect(src).toMatch(/nothing needs reseating/i);
    }
  });
});

describe("the firmware publishes what the diagnosis needs", () => {
  it("reports the control-bus result when the camera fails to start", () => {
    /*
     * Without this the console has to guess between a ribbon and a module, and
     * the guess it used to make sent somebody to the wrong one.
     */
    const firmware = fs.readFileSync(
      path.join(root, "firmware", "camera", "camera.ino"),
      "utf8"
    );
    expect(firmware).toMatch(/cv\.set\("sccbOk", sccbAlive\(\)\)/);
  });
});
