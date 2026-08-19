/**
 * Three copies of one rule, kept honest.
 *
 * The panic gesture is implemented in three places, on purpose:
 *
 *   firmware/CircuventDevice/CvHoldButton.h   decides, on the device
 *   src/lib/guardian-hold.ts                  explains and validates, in the console
 *   mobile/src/guardian-hold.ts               explains and validates, on the phone
 *
 * The duplication is deliberate — the mobile app is a separate build with its
 * own dependency tree, and the firmware is C++ — but a rule that disagrees with
 * itself across those three is how a wearer ends up configuring a ten-second
 * hold on a phone that thinks the minimum is thirty. The bounds in particular
 * are a safety limit, not a preference: below them, walking raises the alarm.
 *
 * The same arrangement, for the same reason, as tests/tank-link-app-parity.
 */
import fs from "node:fs";
import path from "node:path";
import * as web from "@/lib/guardian-hold";
import * as health from "@/lib/guardian-health";

const root = path.join(__dirname, "..");
const mobileSrc = fs.readFileSync(
  path.join(root, "mobile", "src", "guardian-hold.ts"),
  "utf8",
);
const header = fs.readFileSync(
  path.join(root, "firmware", "CircuventDevice", "CvHoldButton.h"),
  "utf8",
);

/** Pulls a numeric constant out of the mobile copy without importing it. */
function mobileNumber(name: string): number {
  const m = new RegExp(`export const ${name} = ([0-9_]+)`).exec(mobileSrc);
  if (!m) throw new Error(`mobile guardian-hold has no ${name}`);
  return Number(m[1].replace(/_/g, ""));
}

/**
 * Source with comments removed.
 *
 * Needed because the sketch's changelog deliberately quotes the bug it fixed,
 * including the placeholder phone number. Asserting on the raw file would make
 * it impossible to write down what went wrong.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("the three copies agree on the numbers", () => {
  it("uses the same default hold", () => {
    expect(web.DEFAULT_HOLD_MS).toBe(30_000);
    expect(mobileNumber("DEFAULT_HOLD_MS")).toBe(web.DEFAULT_HOLD_MS);
    expect(header).toMatch(/uint32_t _holdMs = 30000;/);
  });

  it("uses the same glitch tolerance", () => {
    expect(mobileNumber("DEFAULT_GLITCH_MS")).toBe(web.DEFAULT_GLITCH_MS);
    expect(header).toMatch(/uint16_t _glitchMs = 120;/);
  });

  it("uses the same bounds", () => {
    const bounds = /HOLD_BOUNDS = \{ minMs: ([0-9_]+), maxMs: ([0-9_]+) \}/.exec(mobileSrc);
    expect(bounds).toBeTruthy();
    expect(Number(bounds![1].replace(/_/g, ""))).toBe(web.HOLD_BOUNDS.minMs);
    expect(Number(bounds![2].replace(/_/g, ""))).toBe(web.HOLD_BOUNDS.maxMs);
  });

  it("the firmware clamps to the same bounds", () => {
    /*
     * The device is the last line: a command carrying a five-second hold must
     * be refused there even if both apps somehow let it through.
     */
    const sketch = fs.readFileSync(
      path.join(root, "firmware", "guardian", "guardian.ino"),
      "utf8",
    );
    expect(sketch).toMatch(/constrain\(ms, 10000UL, 120000UL\)/);
    expect(web.HOLD_BOUNDS.minMs).toBe(10_000);
    expect(web.HOLD_BOUNDS.maxMs).toBe(120_000);
  });
});

describe("the three copies agree on the wording", () => {
  it("both apps say the same thing about tapping", () => {
    /*
     * Not cosmetic. "I pressed it and nothing happened" is the single most
     * common thing anybody asks about this device, and the answer is that
     * they tapped it. Two apps giving different explanations of the same
     * gesture is how support ends up guessing which one the wearer read.
     */
    const webText = web.describeGesture(30_000);
    const m = /return `Press and hold the button for \$\{secs\} seconds([^`]*)`/.exec(mobileSrc);
    expect(m).toBeTruthy();
    expect(webText).toContain("Press and hold the button for 30 seconds");
    expect(webText).toContain(m![1].replace(/\$\{[^}]+\}/g, ""));
  });

  it("both refuse a short hold with the same reason", () => {
    const webReason = web.checkHoldMs(3000).reason ?? "";
    expect(webReason).toMatch(/walking/i);
    expect(mobileSrc).toMatch(/the wearer's own walking will trigger it/);
  });
});

describe("the command map agrees with the device's storage", () => {
  it("offers no more contacts than the device stores", () => {
    /*
     * The firmware keeps four in NVS. A console that let somebody add a fifth
     * would show it in the app and drop it in the shoe — and the shoe is the
     * only copy that is read when the button is held.
     */
    const sketch = fs.readFileSync(
      path.join(root, "firmware", "guardian", "guardian.ino"),
      "utf8",
    );
    const fw = /#define MAX_CONTACTS (\d+)/.exec(sketch);
    expect(fw).toBeTruthy();

    const map = fs.readFileSync(path.join(root, "src", "lib", "smarthome-command-map.ts"), "utf8");
    const app = /GUARDIAN_MAX_CONTACTS = (\d+)/.exec(map);
    expect(app).toBeTruthy();
    expect(Number(app![1])).toBe(Number(fw![1]));
  });

  it("offers the same hold range the firmware clamps to", () => {
    const map = fs.readFileSync(path.join(root, "src", "lib", "smarthome-command-map.ts"), "utf8");
    const m = /GUARDIAN_HOLD_SEC = \{ min: (\d+), max: (\d+) \}/.exec(map);
    expect(m).toBeTruthy();
    expect(Number(m![1]) * 1000).toBe(web.HOLD_BOUNDS.minMs);
    expect(Number(m![2]) * 1000).toBe(web.HOLD_BOUNDS.maxMs);
  });
});

describe("the panic button is not on the reset pin", () => {
  /*
   * The most serious thing found in this device. SOS_BTN was GPIO0, which is
   * also what setResetButton(0) watches: a 3-second hold clears the Wi-Fi and
   * an 8-second hold factory resets. The thirty-second gesture the product is
   * built around passes through both — so holding the button for help would
   * have wiped the device's identity and every emergency contact on it, twenty
   * two seconds before it was due to call anybody.
   */
  const sketch = fs.readFileSync(
    path.join(root, "firmware", "guardian", "guardian.ino"),
    "utf8",
  );

  it("uses a different pin", () => {
    const sos = /#define SOS_BTN (\d+)/.exec(sketch);
    const reset = /#define RESET_BTN (\d+)/.exec(sketch);
    expect(sos).toBeTruthy();
    expect(reset).toBeTruthy();
    expect(sos![1]).not.toBe(reset![1]);
  });

  it("fails the build if they are ever made the same", () => {
    expect(sketch).toMatch(/#if SOS_BTN == RESET_BTN[\s\S]{0,200}#error/);
  });

  it("passes the reset pin, not the panic pin, to setResetButton", () => {
    expect(sketch).toMatch(/setResetButton\(RESET_BTN\)/);
  });
});

describe("the device cannot claim to be ready when it is not", () => {
  const sketch = fs.readFileSync(
    path.join(root, "firmware", "guardian", "guardian.ino"),
    "utf8",
  );

  it("publishes whether it could actually raise an alarm", () => {
    /*
     * An unprovisioned Guardian is indistinguishable from a working one from
     * the outside — online, charged, a GPS fix — and the difference only shows
     * up on the day the button is held.
     */
    expect(sketch).toMatch(/bool canRaiseAlarm\(\)/);
    expect(sketch).toMatch(/cv\.set\("ready", canRaiseAlarm\(\)\)/);
  });

  it("publishes what the modem says about itself", () => {
    /*
     * `ready` alone only ever meant "somebody typed in a phone number". A
     * beacon with no signal, no SIM, or a prepaid account that quietly expired
     * satisfies it completely and can still reach nobody.
     */
    expect(sketch).toMatch(/cv\.set\("csq", csq\)/);
    expect(sketch).toMatch(/cv\.set\("reg", creg\)/);
    expect(sketch).toMatch(/cv\.set\("sim", simOk\)/);
    expect(sketch).toMatch(/AT\+CSQ/);
    expect(sketch).toMatch(/AT\+CREG\?/);
    expect(sketch).toMatch(/AT\+CPIN\?/);
  });

  it("has no hard-coded emergency number left in it", () => {
    /*
     * It shipped with the literal string "+9199XXXXXXXX" as the trusted
     * contact, so every device ever flashed would have texted a number that
     * does not exist — and reported success, because a modem rejecting a bad
     * number looks the same as one that has not registered yet.
     *
     * Comments are stripped first: the changelog quotes the old number on
     * purpose, and a test that cannot tell code from an explanation of the bug
     * would forbid documenting it.
     */
    const code = stripComments(sketch);
    expect(code).not.toMatch(/\+9199XXXXXXXX/);
    expect(code).not.toMatch(/TRUSTED_NUMBER/);
    // The numbers must come from storage, not from a literal.
    expect(code).toMatch(/store\.getString\("police"/);
    expect(code).toMatch(/store\.getString\("national"/);
  });

  it("keeps a test away from the police", () => {
    // Dialling a station to check the wiring is how a product gets its
    // emergency numbers blocked.
    const testBlock = sketch.slice(sketch.indexOf("if (selfTest) {"));
    const upToElse = testBlock.slice(0, testBlock.indexOf("} else {"));
    expect(upToElse).not.toMatch(/policeNumber/);
    expect(upToElse).not.toMatch(/nationalNumber/);
  });
});

describe("inbound SMS is the last resort that must not become a hole", () => {
  const sketch = fs.readFileSync(
    path.join(root, "firmware", "guardian", "guardian.ino"),
    "utf8",
  );

  it("only obeys numbers on the contact list", () => {
    expect(sketch).toMatch(/bool isTrusted\(const char \*number\)/);
    expect(sketch).toMatch(/if \(!isTrusted\(from\)\) return;/);
  });

  it("cannot be used to change who the contacts are", () => {
    /*
     * The one command that must not exist. An SMS sender is trivially spoofed,
     * and a beacon that could be re-pointed at a stranger's phone by a text
     * would be worse than no beacon at all.
     */
    const handler = sketch.slice(
      sketch.indexOf("void handleInboundSms("),
      sketch.indexOf("char smsFrom["),
    );
    expect(handler).not.toMatch(/applyContacts/);
    expect(handler).not.toMatch(/saveContacts/);
    expect(handler).not.toMatch(/contacts\[\w+\]\.number\s*=/);
  });

  it("clears the SIM store so it cannot silently stop receiving", () => {
    // SIM storage is often ten slots. Full, the modem rejects new messages and
    // the device goes on looking healthy while hearing nobody.
    expect(sketch).toMatch(/AT\+CMGDA=\\"DEL READ\\"/);
  });

  it("matches a sender on the subscriber digits, not the exact string", () => {
    // The same person arrives as +9198..., 9198... or 09... depending on the
    // network. A strcmp would refuse a genuine parent.
    const fn = sketch.slice(sketch.indexOf("bool isTrusted("), sketch.indexOf("bool sendTo("));
    expect(fn).toMatch(/const size_t n = 9;/);
    expect(fn).toMatch(/strcmp\(a \+ la - n, number \+ lb - n\)/);
  });
});

describe("the health thresholds agree across web and phone", () => {
  const mobileHealth = fs.readFileSync(
    path.join(root, "mobile", "src", "guardian-health.ts"),
    "utf8",
  );

  it("uses the same critical battery level", () => {
    const m = /GUARDIAN_BATTERY_CRITICAL_PCT = (\d+)/.exec(mobileHealth);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(health.GUARDIAN_BATTERY_CRITICAL_PCT);
  });

  it("uses the same poor-signal threshold and unknown sentinel", () => {
    expect(/CSQ_POOR = (\d+)/.exec(mobileHealth)![1]).toBe(String(health.CSQ_POOR));
    expect(/CSQ_UNKNOWN = (\d+)/.exec(mobileHealth)![1]).toBe(String(health.CSQ_UNKNOWN));
  });

  it("agrees that 99 is not a signal reading", () => {
    /*
     * The trap. 99 means "the modem does not know", and rendering it as a
     * value would show a beacon with no coverage at all as having the best
     * signal on the scale.
     */
    expect(health.signalBars(99)).toBeNull();
    expect(health.signalBars(0)).toBe(0);
    expect(health.signalBars(31)).toBe(5);
  });

  it("agrees which registration codes mean the device can send", () => {
    expect(health.isRegistered(1)).toBe(true);
    expect(health.isRegistered(5)).toBe(true);
    expect(health.isRegistered(2)).toBe(false);
    expect(mobileHealth).toMatch(/r === 1 \|\| r === 5/);
  });
});
