/**
 * The Agri Starter, and the four ways it used to be dangerous.
 *
 * This device switches a three-phase contactor feeding an irrigation pump that
 * costs more than everything else in the system put together, at the bottom of
 * a field nobody can see. Every assertion here is about a failure that reached
 * the field rather than a unit-test shape.
 */
import fs from "node:fs";
import path from "node:path";
import {
  AGRI_BOUNDS,
  clampRingMinutes,
  describeHold,
  phoneControlReady,
  readHold,
  type AgriState,
} from "@/lib/agri";
import { AGRI_MAX_CALLERS, projectCommand } from "@/lib/smarthome-command-map";

const root = path.join(__dirname, "..");
const sketch = fs.readFileSync(
  path.join(root, "firmware", "agri-starter", "agri-starter.ino"),
  "utf8",
);
const mobileSrc = fs.readFileSync(path.join(root, "mobile", "src", "agri.ts"), "utf8");

/** Source with comments removed, so a changelog describing a bug is not the bug. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

describe("anybody could start the pump", () => {
  const code = stripComments(sketch);

  it("checks the caller's number", () => {
    /*
     * The headline bug. AT+CLIP=1 was switched on specifically to obtain the
     * caller's number, and the number was then never looked at — every
     * incoming call toggled the contactor. A wrong number or a marketing
     * robocall could start a stranger's irrigation, or stop it halfway.
     */
    expect(code).toMatch(/bool isTrustedCaller\(const char \*number\)/);
    expect(code).toMatch(/\+CLIP:/);
    expect(code).toMatch(/isTrustedCaller\(from\)/);
  });

  it("trusts nobody when no numbers are provisioned", () => {
    // An empty list must mean "nobody", not "everybody" — which is precisely
    // the behaviour being replaced.
    const fn = code.slice(code.indexOf("bool isTrustedCaller("), code.indexOf("void applyPump("));
    expect(fn).toMatch(/for \(int i = 0; i < callerCount/);
    expect(fn).toMatch(/return false;\s*\}?\s*$/m);
  });

  it("matches a caller on the subscriber digits, not the exact string", () => {
    // The same number arrives as +9198..., 9198... or 098... depending on the
    // network; a strict comparison would lock the owner out of their own pump.
    const fn = code.slice(code.indexOf("bool isTrustedCaller("), code.indexOf("void applyPump("));
    expect(fn).toMatch(/n = 9/);
  });

  it("never answers the call", () => {
    // A missed call is a signal, not a conversation. Answering would cost the
    // farmer money and tie up the modem.
    expect(code).toMatch(/sim\.println\("ATH"\)/);
  });
});

describe("the contactor chattered at mains frequency", () => {
  const code = stripComments(sketch);

  it("measures mains over a window rather than sampling it", () => {
    /*
     * An opto-isolated mains-present input conducts on each half cycle, so a
     * bare digitalRead returns a square wave at 50 or 100 Hz — not a level.
     * The old loop read it that way and drove the relay from it on every pass,
     * so the contactor was being asked to open and close many times a second
     * whenever the supply was perfectly healthy. Welded contacts are a pump
     * that cannot be switched off.
     */
    expect(code).toMatch(/mainsLastHigh/);
    expect(code).toMatch(/MAINS_PULSE_GAP_MS/);
    expect(code).toMatch(/millis\(\) - mainsLastHigh\) < MAINS_PULSE_GAP_MS/);
  });

  it("does not drive the relay straight from a raw read", () => {
    const apply = code.slice(code.indexOf("void applyPump()"), code.indexOf("void setPump("));
    expect(apply).not.toMatch(/digitalRead\(MAINS_SENSE\)/);
    expect(apply).toMatch(/mainsPresent/);
  });

  it("waits for the supply to steady before restarting the motor", () => {
    // Rural supply returns unstable. Re-engaging a motor into that is how
    // windings are lost, and every starter in a village doing it at the same
    // instant is what makes the supply dip again.
    expect(code).toMatch(/bool mainsSettled\(\)/);
    expect(code).toMatch(/restartDelaySec/);
  });
});

describe("SMS control did not work and was a hazard", () => {
  const code = stripComments(sketch);

  it("puts the modem in text mode and asks for delivery notifications", () => {
    // Without these no message body ever reaches the sketch at all.
    expect(code).toMatch(/AT\+CMGF=1/);
    expect(code).toMatch(/AT\+CNMI=2,1/);
    expect(code).toMatch(/AT\+CMGR=/);
  });

  it("matches a whole verb rather than a substring", () => {
    /*
     * `line.indexOf("ON") >= 0` matches the modem's own "CONNECT". The pump
     * could be started by the modem talking to itself.
     */
    expect(code).not.toMatch(/indexOf\("ON"\)/);
    expect(code).not.toMatch(/indexOf\("OFF"\)/);
    expect(code).toMatch(/strcmp\(verb, "ON"\)/);
  });

  it("only acts on a text from a trusted number", () => {
    expect(code).toMatch(/if \(isTrustedCaller\(pendingFrom\)\)/);
  });

  it("deletes read messages so the SIM cannot fill and go deaf", () => {
    expect(sketch).toMatch(/AT\+CMGDA=\\"DEL READ\\"/);
  });

  it("never blocks the loop", () => {
    /*
     * readStringUntil waits for the serial timeout — a second, every pass,
     * whenever the modem is quiet — and the old ring handler added delay(800).
     * During those the mains window is not sampled and the contactor is not
     * being managed, which on this device is the one thing that must not stop.
     */
    expect(code).not.toMatch(/readStringUntil/);
    expect(code).not.toMatch(/delay\(\d{3,}\)/);
  });
});

describe("the promised dry-run guard now exists", () => {
  const code = stripComments(sketch);

  it("has one", () => {
    // The old header advertised "dry-run guard" and there was no such code.
    expect(code).toMatch(/bool isDry\(\)/);
    expect(code).toMatch(/dryLatched = true/);
  });

  it("is off unless a sensor is actually fitted", () => {
    // Claiming protection that is not wired is worse than claiming none.
    expect(code).toMatch(/bool dryGuard = false/);
    expect(code).toMatch(/return dryGuard && digitalRead\(DRY_SENSE\)/);
  });

  it("latches, and needs a person to clear it", () => {
    // The well does not refill because a sensor flickered.
    expect(code).toMatch(/"RESET"/);
    expect(code).toMatch(/action == "resetDry"/);
  });

  it("stops a forgotten pump", () => {
    expect(code).toMatch(/maxRunMin/);
    expect(code).toMatch(/pumpStartedAt\) > \(uint32_t\)maxRunMin/);
  });
});

describe("the farmer is told what actually happened", () => {
  const code = stripComments(sketch);

  it("replies to every command", () => {
    /*
     * The most valuable sentence this product can send is "the pump did not
     * start, there is no power" — that is a motorbike ride saved, and the old
     * firmware could never say it.
     */
    expect(code).toMatch(/void statusText\(char \*dst/);
    expect(code).toMatch(/replyTo\(from, msg\)/);
    expect(code).toMatch(/no mains power/);
  });

  it("says when a timed run or the runtime limit stopped it", () => {
    expect(code).toMatch(/finished its timed run/);
    expect(code).toMatch(/maximum run time/);
  });
});

describe("readHold", () => {
  it("reads the reason the firmware published", () => {
    expect(readHold({ hold: "dry-run" })).toBe("dry-run");
    expect(readHold({ hold: "restart-delay" })).toBe("restart-delay");
  });

  it("still works against a starter on the old firmware", () => {
    /*
     * 1.1.0 publishes only `pump` and `power_available`. Showing "unknown" for
     * every one of those would be a regression for the devices actually in
     * fields today.
     */
    expect(readHold({ pump: true })).toBe("running");
    expect(readHold({ pump: false, power_available: false })).toBe("no-mains");
    expect(readHold({ pump: false, power_available: true })).toBe("idle");
  });

  it("ignores a reason it does not recognise", () => {
    expect(readHold({ hold: "banana", pump: false, power_available: true })).toBe("idle");
  });
});

describe("describeHold", () => {
  it("does not dress a normal power cut up as a fault", () => {
    /*
     * Rural supply is off for hours a day. Calling that critical trains
     * somebody to ignore the banner, and the dry-run one goes with it.
     */
    expect(describeHold("no-mains").severity).toBe("warning");
    expect(describeHold("restart-delay").severity).toBe("info");
  });

  it("reserves critical for the one that needs somebody to go and look", () => {
    const d = describeHold("dry-run");
    expect(d.severity).toBe("critical");
    expect(d.text).toMatch(/water source/i);
  });

  it("says how long is left on a timed run", () => {
    expect(describeHold("running", { minsLeft: 12 }).text).toContain("12 min");
    expect(describeHold("running", { minsLeft: 0 }).text).toBe("Running.");
  });
});

describe("phone control readiness", () => {
  it("is off with no numbers, and says so", () => {
    // Correct behaviour, but it means the missed-call control the product is
    // sold on does nothing — worth saying rather than leaving somebody ringing
    // a number that ignores them.
    expect(phoneControlReady({ callers: 0 })).toBe(false);
    expect(phoneControlReady({ callers: 2 })).toBe(true);
  });

  it("clamps a nonsense run length", () => {
    expect(clampRingMinutes(-5)).toBe(AGRI_BOUNDS.ringMin.min);
    expect(clampRingMinutes(99999)).toBe(AGRI_BOUNDS.ringMin.max);
    expect(clampRingMinutes(Number.NaN)).toBe(30);
  });
});

describe("the command map matches the firmware", () => {
  it("offers no more callers than the device stores", () => {
    const fw = /#define MAX_CALLERS (\d+)/.exec(sketch);
    expect(fw).toBeTruthy();
    expect(AGRI_MAX_CALLERS).toBe(Number(fw![1]));
  });

  it("projects a timed run as the pump coming on", () => {
    const patch = projectCommand("agri-starter", { action: "runFor", minutes: 30 });
    expect(patch?.pump).toBe(true);
  });

  it("does not claim clearing the cutout starts the pump", () => {
    // A person decides that, having been to look at the well.
    const patch = projectCommand("agri-starter", { action: "resetDry" });
    expect(patch?.dry).toBe(false);
    expect(patch?.pump).toBeUndefined();
  });
});

describe("web and mobile say the same thing", () => {
  it("share the hold reasons", () => {
    for (const reason of ["running", "idle", "no-mains", "restart-delay", "dry-run"]) {
      expect(mobileSrc).toContain(`"${reason}"`);
    }
  });

  it("share the bounds", () => {
    const m = /ringMin: \{ min: (\d+), max: (\d+) \}/.exec(mobileSrc);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(AGRI_BOUNDS.ringMin.min);
    expect(Number(m![2])).toBe(AGRI_BOUNDS.ringMin.max);
  });

  it("share the dry-run wording, which is the one that sends somebody out", () => {
    expect(mobileSrc).toContain("The water source has failed");
    expect(describeHold("dry-run").text).toContain("The water source has failed");
  });
});
