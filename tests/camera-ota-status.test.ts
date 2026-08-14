/**
 * An update in progress must never be reported as a fault.
 *
 * This is written from a real incident. A camera taking an OTA showed
 * "Camera sensor failed to initialise" above a banner reading "The camera
 * sensor is not responding. Check the ribbon cable seating, then reboot." The
 * hardware was fine, the update completed on its own a minute later, and the
 * only thing wrong was that no surface read `otaStatus` — a field the firmware
 * has published since 1.2.0.
 *
 * The cost of that is not a confusing sentence. It is somebody on a ladder at a
 * ceiling-mounted camera, during the ninety seconds it was always going to be
 * unavailable, unlatching a connector on working hardware because the console
 * told them to.
 */
import { readOtaStatus, otaNotice, isUpdating } from "@/app/smarthome/ota-status";
import { describeCameraFault } from "@/app/smarthome/camera-fault";

describe("reading otaStatus", () => {
  it("recognises a download in progress and keeps the target version", () => {
    const s = readOtaStatus("downloading 1.14.0");
    expect(s.phase).toBe("updating");
    expect(s.version).toBe("1.14.0");
  });

  it("recognises a download with no version named", () => {
    expect(readOtaStatus("downloading ").phase).toBe("updating");
  });

  it("keeps the device's own words for a failure", () => {
    /*
     * A TLS rejection, a 404 and a bad image are three different problems with
     * three different remedies. Paraphrasing them into "update failed" throws
     * away the only part that says which one it was.
     */
    const s = readOtaStatus("failed: -1 HTTP error");
    expect(s.phase).toBe("failed");
    expect(s.detail).toBe("-1 HTTP error");
  });

  it("treats a skipped update as its own thing, not a failure", () => {
    // Re-broadcasting the running version is a no-op, not a fault. Reporting it
    // as one would make every fleet-wide push look like it half failed.
    expect(readOtaStatus("skipped: already on 1.14.0").phase).toBe("skipped");
  });

  it("files an empty manifest as a failure rather than as idle", () => {
    // The device words this as a statement, but a rollout that silently did
    // nothing must not look like a rollout that worked.
    expect(readOtaStatus("no update offered at url").phase).toBe("failed");
  });

  it("degrades to idle for anything it does not recognise", () => {
    /*
     * Devices in the field run builds going back years. An unknown status must
     * become "idle" and not a phantom update that never clears — a panel stuck
     * on "Updating…" forever is worse than one that says nothing.
     */
    for (const v of ["", "-", "something new", undefined, null, 42, {}]) {
      expect(readOtaStatus(v).phase).toBe("idle");
    }
  });
});

describe("what the viewer is told", () => {
  it("explains the pause while the device is still answering", () => {
    const msg = otaNotice(readOtaStatus("downloading 1.14.0"), true);
    expect(msg).toMatch(/1\.14\.0/);
    expect(msg).toMatch(/restart/i);
  });

  it("covers the offline gap, which is when people look", () => {
    /*
     * A device flashing an image is not answering MQTT, so it goes offline in
     * the middle of a healthy update. That gap is the single most misleading
     * moment in the process.
     */
    const msg = otaNotice(readOtaStatus("downloading 1.14.0"), false);
    expect(msg).toMatch(/nothing is wrong/i);
  });

  it("says nothing at all when no update is happening", () => {
    expect(otaNotice(readOtaStatus(""), true)).toBeNull();
    expect(otaNotice(readOtaStatus("skipped: already on 1.14.0"), true)).toBeNull();
  });

  it("does not suppress faults once an update has failed", () => {
    /*
     * A failed update is over — the device is back on its old firmware, so any
     * fault showing afterwards is a real one and must not be hidden behind
     * "updating".
     */
    expect(isUpdating(readOtaStatus("failed: -1 HTTP error"))).toBe(false);
    expect(isUpdating(readOtaStatus("downloading 1.14.0"))).toBe(true);
  });
});

describe("naming a camera fault", () => {
  it("never blames the ribbon when the sensor has introduced itself", () => {
    /*
     * THE BUG THIS FILE EXISTS FOR.
     *
     * The camera reported sensorPid 38 — it had answered on SCCB and named
     * itself an OV2640 — and the console still said "the camera sensor is not
     * responding, check the ribbon cable seating". The real cause was a frame
     * buffer that could not be allocated at the configured resolution. The
     * remedy was a number, not a cable.
     */
    const msg = describeCameraFault({ sensorPid: 38 });
    expect(msg).toMatch(/OV2640/);
    expect(msg).toMatch(/smaller resolution/i);
    expect(msg).not.toMatch(/is not responding/i);
  });

  it("says the device already fixed it when it lowered the picture itself", () => {
    const msg = describeCameraFault({
      resolutionFault: "lowered automatically: the chosen size could not be captured",
      sensorPid: 38,
    });
    expect(msg).toMatch(/lowered it automatically/i);
    // A recovered camera must not also carry instructions to go and inspect it.
    expect(msg).toMatch(/nothing needs reseating/i);
  });

  it("localises to the ribbon only when the control bus is provably alive", () => {
    const msg = describeCameraFault({ sccbOk: true, sensorPid: 38 });
    expect(msg).toMatch(/parallel data lines/);
    expect(msg).toMatch(/ribbon/);
  });

  it("blames the module when the sensor answers nothing", () => {
    expect(describeCameraFault({ sccbOk: false })).toMatch(/unpowered, unseated or dead/);
  });

  it("admits what it does not know rather than inventing a cause", () => {
    /*
     * An uncertain diagnosis stated confidently is worse than an honest one,
     * because only the honest one leaves the reader still looking for the real
     * cause.
     */
    const msg = describeCameraFault({});
    expect(msg).toMatch(/has not reported enough/i);
  });
});
