/**
 * The three copies of the pin rules, held together.
 *
 * A configurable switchboard is handed its wiring as data by a person on a
 * ladder, so the rules that a fixed sketch gets from the compiler have to be
 * enforced at runtime — in three places, because each one can be absent:
 *
 *   src/lib/switchboard.ts        so the app refuses it while the engineer is
 *                                 still standing there
 *   firmware/switchboard          because it is the only copy certainly present
 *   (the control plane validates on save, using the same shapes)
 *
 * If they disagree, the app blesses a layout the board will reject — or worse,
 * the board accepts one the app would have caught. The second is unrecoverable:
 * a channel commissioned onto GPIO12 works on the bench, goes into plaster, and
 * never boots again after the first power cut.
 */
import fs from "node:fs";
import path from "node:path";
import {
  FLASH_PINS,
  FLASH_VOLTAGE_STRAP,
  INPUT_ONLY_PINS,
  MAX_CHANNELS,
  RESET_PIN,
  TOUCH_PINS,
  checkPin,
} from "@/lib/switchboard";

const root = path.join(__dirname, "..");
const sketch = fs.readFileSync(
  path.join(root, "firmware", "switchboard", "switchboard.ino"),
  "utf8",
);
const types = fs.readFileSync(
  path.join(root, "firmware", "switchboard", "switchboard_types.h"),
  "utf8",
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const code = stripComments(sketch);

describe("the firmware refuses the same pins the app does", () => {
  it("refuses the SPI flash range", () => {
    expect(code).toMatch(/p >= 6 && p <= 11/);
    for (const p of FLASH_PINS) expect(checkPin(p, "relay").ok).toBe(false);
  });

  it("refuses GPIO12", () => {
    // High at reset selects 1.8V flash and a 3.3V board never boots again.
    expect(code).toMatch(/if \(p == 12\) return false;/);
    expect(FLASH_VOLTAGE_STRAP).toBe(12);
  });

  it("refuses the reset pin", () => {
    expect(code).toMatch(/if \(p == 0\) return false;/);
    expect(RESET_PIN).toBe(0);
  });

  it("refuses an input-only pin for a relay, and only for a relay", () => {
    /*
     * pinMode(OUTPUT) on one is accepted and does nothing, so the app would
     * switch, the device would agree, and the light would not move.
     */
    expect(code).toMatch(/use == USE_RELAY && isInputOnly\(p\)/);
    expect(code).toMatch(/p >= 34 && p <= 39/);
    for (const p of INPUT_ONLY_PINS) {
      expect(checkPin(p, "relay").ok).toBe(false);
      expect(checkPin(p, "input").ok).toBe(true);
    }
  });

  it("agrees on which pins have touch hardware", () => {
    const fw = /static bool isTouchPin\(int p\) \{[\s\S]*?\}/.exec(code)?.[0] ?? "";
    for (const p of TOUCH_PINS) {
      expect(fw).toMatch(new RegExp(`p == ${p}\\b`));
      expect(checkPin(p, "touch").ok).toBe(true);
    }
    // And nothing extra: GPIO12 has touch hardware and must still be refused.
    expect(TOUCH_PINS).not.toContain(12);
    expect(TOUCH_PINS).not.toContain(0);
  });

  it("agrees on the channel ceiling", () => {
    const fw = /#define CV_SWB_MAX_CH (\d+)/.exec(types);
    expect(fw).toBeTruthy();
    expect(Number(fw![1])).toBe(MAX_CHANNELS);
  });
});

describe("a refused layout leaves the board driving nothing", () => {
  it("validates into scratch before committing", () => {
    /*
     * Half a switchboard is worse than none, because the gangs that do work
     * make it look commissioned. The parse fills a scratch array and only
     * copies it over once the whole layout is safe.
     */
    expect(code).toMatch(/Channel scratch\[CV_SWB_MAX_CH\]/);
    expect(code).toMatch(/memcpy\(ch, scratch, sizeof\(Channel\) \* n\)/);
  });

  it("claims no pins at all until the layout is accepted", () => {
    // An uncommissioned board drives nothing, which is the safe state and the
    // one that makes a bad layout obvious rather than partly working.
    expect(code).toMatch(/if \(layoutValid\) \{[\s\S]{0,200}cvRelayInit/);
  });

  it("says why it refused, so an engineer sees it on the spot", () => {
    expect(code).toMatch(/cv\.set\("layoutError"/);
    expect(code).toMatch(/cv\.set\("layoutOk"/);
  });

  it("rejects two jobs on one pin", () => {
    // The haunted-house fault: a pad that switches two things, or a relay
    // reading its own output as a press.
    expect(code).toMatch(/is on two relays/);
    expect(code).toMatch(/is both an input and a relay/);
    expect(code).toMatch(/is on two inputs/);
  });

  it("restarts into a new layout rather than re-purposing pins live", () => {
    expect(code).toMatch(/action == "commission"[\s\S]{0,900}ESP\.restart\(\)/);
  });
});

describe("the engineer's tools", () => {
  it("can blink one channel's load", () => {
    /*
     * The most useful button on the commissioning screen. An engineer at the
     * board cannot tell which relay is the porch light without switching it
     * and walking outside.
     */
    expect(code).toMatch(/action == "identify"/);
    expect(code).toMatch(/void stepIdentify\(\)/);
  });

  it("puts the channel back the way it found it", () => {
    expect(code).toMatch(/identifyRestore = relayOn\[identifyCh\]/);
    expect(code).toMatch(/cvRelayWrite\(ch\[identifyCh\]\.relayPin, identifyRestore\)/);
  });

  it("blinks without blocking the loop", () => {
    // A board that stops answering while it demonstrates itself is a board an
    // engineer cannot then command.
    const fn = code.slice(code.indexOf("void stepIdentify()"));
    expect(fn.slice(0, 400)).not.toMatch(/delay\(/);
  });
});

describe("it behaves like the fixed boards it replaces", () => {
  it("uses the same gang field names", () => {
    // So every scene, automation and voice trait that already understands a
    // gang keeps working unchanged.
    expect(code).toMatch(/out\[0\] = 'g';/);
  });

  it("drives relays through the polarity-aware helpers", () => {
    expect(code).toMatch(/cvRelayInit\(ch\[i\]\.relayPin\)/);
    expect(code).toMatch(/cvRelayWrite\(ch\[i\]\.relayPin, on\)/);
    expect(code).not.toMatch(/digitalWrite\(ch\[\w+\]\.relayPin/);
  });

  it("staggers a bulk change and a power-on restore", () => {
    /*
     * Eight coils on one edge is about half an amp arriving at once, which
     * sags the rail the ESP32 runs on — and the reboot lands on the "all on"
     * press, making that button look like the broken thing.
     */
    expect(code).toMatch(/RELAY_STAGGER_MS/);
    const setupFn = code.slice(code.indexOf("void setup()"));
    expect(setupFn).toMatch(/delay\(RELAY_STAGGER_MS\)/);
  });

  it("edge-detects buttons", () => {
    // A level test with a rate limit is not "on press", it is "repeatedly
    // while held".
    expect(code).toMatch(/btnWas\[i\]/);
  });

  it("never defaults a channel to on after a power cut", () => {
    /*
     * "Every light in the house came on by itself at 3am". The restore policy
     * offers off or last and there is deliberately no always-on.
     */
    expect(code).toMatch(/ch\[i\]\.restoreLast \? store\.getBool\(k, false\) : false/);
    expect(types).toMatch(/bool restoreLast/);
    expect(types).not.toMatch(/restoreOn|RESTORE_ON/);
  });

  it("has no local bus without a provisioned key", () => {
    // A missing key must not mean an unauthenticated bus anybody in the
    // stairwell can drive.
    expect(code).toMatch(/unprovisioned/);
  });
});
