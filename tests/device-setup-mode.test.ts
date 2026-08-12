import { buildFieldCommand } from "@/lib/smarthome-command-map";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Setup mode: the command the app sends, and the one the firmware reads.
 *
 * The device no longer raises its setup hotspot by itself when Wi-Fi is
 * unreachable — it waits for the network instead — so this command is the only
 * remaining way to offer a setup link without walking to the device and holding
 * its button. If the shape is wrong it fails the way everything else in this
 * map has failed before: accepted, acknowledged, ignored.
 */
describe("setup-mode command", () => {
  it("is an action, not a field inside a set", () => {
    // The generic tail would have produced { action: "set", setup: true },
    // which no sketch reads.
    expect(buildFieldCommand("smart-plug", "setup", true)).toMatchObject({ action: "setup" });
    expect(buildFieldCommand("smart-plug", "provision", true)).toMatchObject({ action: "setup" });
  });

  it("works for every product, because the base library handles it", () => {
    for (const type of ["smart-plug", "smart-light", "smart-fan", "touchboard", "watertank", "sentinel", "camera"]) {
      expect(buildFieldCommand(type, "setup", true)).toMatchObject({ action: "setup" });
    }
  });

  it("defaults to a ten-minute window", () => {
    expect(buildFieldCommand("smart-plug", "setup", true)).toMatchObject({ minutes: 10 });
  });

  it("passes a requested window through", () => {
    expect(buildFieldCommand("smart-plug", "setup", 5)).toMatchObject({ minutes: 5 });
  });

  it("clamps the window to something a device should stay open for", () => {
    // An unbounded window is a device broadcasting an open network to the
    // street until someone notices.
    expect(buildFieldCommand("smart-plug", "setup", 0)).toMatchObject({ minutes: 1 });
    expect(buildFieldCommand("smart-plug", "setup", 9999)).toMatchObject({ minutes: 60 });
  });
});

/*
 * The firmware side of the same contract. The header is the authority for what
 * a device accepts; these read it so the two cannot drift apart silently.
 */
describe("CircuventDevice.h", () => {
  const header = readFileSync(
    join(process.cwd(), "firmware", "CircuventDevice", "CircuventDevice.h"),
    "utf8"
  );

  it("handles the setup action the app sends", () => {
    expect(header).toContain('action == "setup"');
    expect(header).toContain('action == "provision"');
  });

  it("opens the setup AP only when there is nothing to connect to", () => {
    /*
     * The regression this guards is precise: begin() used to open the portal
     * when WiFi.status() != WL_CONNECTED, so a router that took longer to boot
     * than the device did left the whole fleet in AP mode until someone
     * power-cycled it again.
     */
    expect(header).toContain("bool needsPortal = !haveWifi");
    expect(header).not.toMatch(/if\s*\(\(WiFi\.status\(\)\s*!=\s*WL_CONNECTED\s*\|\|\s*!haveIdentity\)/);
  });

  /**
   * Comments stripped before matching.
   *
   * The first version of this asserted the loop body does not contain
   * "WiFi.reconnect()" and failed on the comment explaining why it is not
   * used. A structural test that reads prose is testing the wrong thing.
   */
  function codeOf(section: string): string {
    return section.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  }

  const loopBody = codeOf(header.slice(header.indexOf("void loop()"), header.indexOf("void loop()") + 3000));

  it("retries with begin(), which works when no association was ever made", () => {
    // WiFi.reconnect() re-uses an association that does not exist after a boot
    // with the AP down — precisely when retrying matters.
    expect(loopBody).toContain("WiFi.begin(_ssid.c_str(), _pass.c_str())");
    expect(loopBody).not.toContain("WiFi.reconnect(");
  });

  it("keeps trying rather than giving up after a fixed number of attempts", () => {
    // No escape hatch into the portal from the reconnect path.
    expect(loopBody).not.toContain("startPortal()");
  });

  it("bounds a remotely-opened window only when the device has somewhere to return to", () => {
    expect(header).toContain("_portalDeadline = _ssid.length()");
  });
});
