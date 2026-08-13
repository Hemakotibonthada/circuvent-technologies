/**
 * The admin rule editor must not accept a command the device will discard.
 *
 * The editor validated one thing about an action command: that it was valid
 * JSON. Its default for every device was `{"action":"set","power":true}`,
 * which `projectCommand` maps to nothing at all on 18 of the 23 device types —
 * a curtain takes a position, a meter is read-only, a tank takes `pump`, a
 * door takes `locked`, a touchboard takes `g1`.
 *
 * So an operator building a rule for a water tank picked the device, accepted
 * the default, saved, and got a rule that appears correct in the list, reports
 * no error, fires on schedule, and does nothing. It reads as failing hardware.
 *
 * This is the same class as the scene-editor bug fixed earlier — a command
 * surface that does not consult the command map — and it is worse here,
 * because the scene editor at least dropped the row visibly.
 */

import { projectedFields } from "@/lib/smarthome-command-map";
import { getCommandFields } from "@/app/smarthome/automation/describe";
import { defaultCommandFor, validateActionCommand } from "./command-defaults";

const ALL_TYPES = [
  "smart-plug", "smart-light", "smart-fan", "curtain", "smart-lock",
  "energy-monitor", "watertank", "facedoor", "touchboard", "rfid-gate",
  "camera", "anpr-cam", "motion-sensor", "sentinel", "guardian", "aquaguard",
  "agri-starter", "home-hub", "smart-switch", "cctv", "doorbell",
  "drone-link", "drone-x1",
];

/*
 * Read-only types are a real category, not an oversight: an energy monitor
 * measures and has nothing to switch. They must NOT be handed a plausible
 * default, because a plausible default on a device that cannot act is exactly
 * the bug being fixed. Split out so each group is asserted on its own terms.
 */
const READ_ONLY = ALL_TYPES.filter((t) => getCommandFields(t).length === 0);
const COMMANDABLE = ALL_TYPES.filter((t) => getCommandFields(t).length > 0);

describe("the fleet splits into commandable and read-only", () => {
  it("has both groups, so both paths are exercised", () => {
    expect(COMMANDABLE.length).toBeGreaterThan(15);
    expect(READ_ONLY.length).toBeGreaterThan(0);
  });
});

describe("the old fixed default", () => {
  it("was a no-op on most of the fleet", () => {
    // Pins the reason this module exists. If projectCommand ever grows a
    // universal power field this fails, and the default can be simplified.
    const dead = ALL_TYPES.filter(
      (t) => projectedFields(t, { action: "set", power: true }).length === 0,
    );
    expect(dead.length).toBeGreaterThan(10);
    expect(dead).toContain("curtain");
    expect(dead).toContain("watertank");
    expect(dead).toContain("facedoor");
  });
});

describe("defaultCommandFor", () => {
  it.each(COMMANDABLE)("gives %s a command its firmware actually reads", (type) => {
    const text = defaultCommandFor(type);
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const fields = projectedFields(type, parsed);
    expect({ type, fields: fields.length > 0 }).toEqual({ type, fields: true });
  });

  it.each(READ_ONLY)("does not fake a working command for read-only %s", (type) => {
    // An incomplete `{"action":"set"}` is the honest seed here. Anything that
    // looks complete would be saved unread, which is the whole defect.
    const parsed = JSON.parse(defaultCommandFor(type)) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["action"]);
  });

  it.each(ALL_TYPES)("gives %s valid, readable JSON", (type) => {
    const text = defaultCommandFor(type);
    expect(() => JSON.parse(text)).not.toThrow();
    expect(text).toContain("\n"); // pretty-printed, since a human edits it
  });

  it("falls back to a plain set for a type nothing knows about", () => {
    // A device type can reach the admin UI before the console learns about it;
    // an unknown type must still produce something editable rather than crash.
    const parsed = JSON.parse(defaultCommandFor("not-a-real-type")) as Record<string, unknown>;
    expect(parsed.action).toBe("set");
  });

  it("uses the field the command map defines, not a guess", () => {
    for (const type of ALL_TYPES) {
      const fields = getCommandFields(type);
      if (fields.length === 0) continue;
      const parsed = JSON.parse(defaultCommandFor(type)) as Record<string, unknown>;
      const keys = Object.keys(parsed).filter((k) => k !== "action");
      const known = fields.map((f) => f.key);
      for (const k of keys) {
        expect({ type, key: k, known: known.includes(k) })
          .toEqual({ type, key: k, known: true });
      }
    }
  });
});

describe("validateActionCommand", () => {
  it("accepts a command the device reads", () => {
    expect(validateActionCommand("smart-plug", { action: "set", power: true })).toBeNull();
    expect(validateActionCommand("curtain", { action: "set", position: 50 })).toBeNull();
  });

  it("refuses power on a curtain, and says what the curtain does take", () => {
    const err = validateActionCommand("curtain", { action: "set", power: true });
    expect(err).toBeTruthy();
    expect(err).toMatch(/curtain/i);
    // The operator has to be told what to write instead, or the error just
    // moves the dead end from save time to guess time.
    expect(err).toMatch(/position/i);
  });

  it("refuses a command on a read-only device and says so plainly", () => {
    const err = validateActionCommand("energy-monitor", { action: "set", power: true });
    expect(err).toBeTruthy();
    expect(err).toMatch(/does not accept|read-only|cannot be commanded/i);
  });

  it.each(COMMANDABLE)("never refuses its own default for %s", (type) => {
    const parsed = JSON.parse(defaultCommandFor(type)) as Record<string, unknown>;
    expect({ type, error: validateActionCommand(type, parsed) })
      .toEqual({ type, error: null });
  });

  it.each(READ_ONLY)("refuses any command on read-only %s and offers a way out", (type) => {
    const err = validateActionCommand(type, { action: "set", power: true });
    expect(err).toBeTruthy();
    expect(err).toMatch(/notification/i);
  });

  it("uses the right article, since operators read this", () => {
    // "A energy-monitor" is the kind of detail that makes a product feel
    // unfinished, and it is one line to get right.
    expect(validateActionCommand("energy-monitor", { action: "set", power: true }))
      .toMatch(/^An energy-monitor/);
    expect(validateActionCommand("curtain", { action: "set", power: true }))
      .toMatch(/a curtain/);
  });

  it("stays out of the way when the device type is unknown", () => {
    // Refusing here would block an operator from commanding a device the
    // console has not learned about yet — the command may well be correct.
    expect(validateActionCommand("", { action: "set", power: true })).toBeNull();
    expect(validateActionCommand("brand-new-type", { action: "set", x: 1 })).toBeNull();
  });
});
