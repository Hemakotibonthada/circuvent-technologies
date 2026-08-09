/**
 * The command a switch produces has to be one the firmware reads.
 *
 * WHY THIS TEST EXISTS
 *
 * Switch timers could be created, displayed a correct next-run time, counted
 * down, and never moved a relay. Nothing reported an error anywhere: the rule
 * saved, the scheduler fired, MQTT delivered — and the device dropped the
 * payload on its first line, because it had no `action` field:
 *
 *     String action = doc["action"] | "";
 *     if (!action.length()) return;          // CircuventDevice::_dispatch
 *
 * The UI had also been building commands out of *state* keys. Those are what
 * the sketch publishes, not what it accepts, and for the Home Hub they are
 * completely different: it reads { ch, on } and has no idea what power2 means.
 *
 * A unit test of buildFieldCommand alone would not have caught either fault —
 * it would have asserted whatever the author believed. So the property tested
 * here is the round trip: for every field the UI is willing to offer, the
 * command built for it must project back to that same field. projectCommand is
 * independently derived from the sketches, so agreement between the two is
 * evidence about the firmware and not about one author's assumption.
 */
import { buildFieldCommand, projectCommand, readFieldCommand, repairLegacyCommand } from "./smarthome-command-map";
import { getCommandFields } from "@/app/smarthome/automation/describe";

/** Device types the rule and schedule builders can target. */
const TYPES = [
  "smart-plug",
  "smart-switch",
  "home-hub",
  "touchboard",
  "sentinel",
  "aquaguard",
  "watertank",
  "agri-starter",
  "guardian",
  "motion-sensor",
  "smart-lock",
  "facedoor",
  "rfid-gate",
];

/** A plausible value for a field of each kind. */
function sampleValue(kind: string, choices?: { value: string }[]): boolean | number | string {
  if (kind === "bool") return true;
  if (kind === "number") return 42;
  return choices?.[0]?.value ?? "on";
}

describe("every offered switch produces a command the device will act on", () => {
  it.each(TYPES)("%s: no command is ever built without an action", (type) => {
    for (const f of getCommandFields(type)) {
      const cmd = buildFieldCommand(type, f.key, sampleValue(f.kind, f.choices));
      if (!cmd) continue; // refusing is allowed; lying is not
      expect(typeof cmd.action).toBe("string");
      // The device drops the message entirely when this is empty. It is the
      // single most consequential assertion in this file.
      expect(cmd.action.length).toBeGreaterThan(0);
    }
  });

  it.each(TYPES)("%s: boolean switches round-trip back to their own field", (type) => {
    // Fields that are modes or bulk operations rather than one switch; their
    // projection legitimately touches other keys or needs device state.
    const notOneSwitch = new Set(["all", "away", "muted", "auto", "scene", "action", "mode"]);
    for (const f of getCommandFields(type)) {
      if (f.kind !== "bool" || notOneSwitch.has(f.key)) continue;
      for (const value of [true, false]) {
        const cmd = buildFieldCommand(type, f.key, value);
        expect(cmd).not.toBeNull();
        const patch = projectCommand(type, cmd!);
        // This is the assertion that fails for `{ power2: true }` on a Home
        // Hub, and would have caught the shipped bug on the day it landed.
        expect(patch).toHaveProperty(f.key, value);
      }
    }
  });

  it("addresses Home Hub channels positionally, not by their state key", () => {
    expect(buildFieldCommand("home-hub", "power", true)).toEqual({ action: "set", ch: 0, on: true });
    expect(buildFieldCommand("home-hub", "power2", true)).toEqual({ action: "set", ch: 1, on: true });
    expect(buildFieldCommand("home-hub", "power3", false)).toEqual({ action: "set", ch: 2, on: false });
    expect(buildFieldCommand("home-hub", "power4", true)).toEqual({ action: "set", ch: 3, on: true });
  });

  it("keeps the field name where the sketch really does read it", () => {
    // Not everything needed remapping — only the action was missing. Asserting
    // this stops an over-eager future fix from rewriting keys that were fine.
    expect(buildFieldCommand("touchboard", "g2", true)).toEqual({ action: "set", g2: true });
    expect(buildFieldCommand("smart-switch", "power2", true)).toEqual({ action: "set", power2: true });
    expect(buildFieldCommand("smart-plug", "power", false)).toEqual({ action: "set", power: false });
    expect(buildFieldCommand("sentinel", "r7", true)).toEqual({ action: "set", r7: true });
  });

  it("uses the verb form where the sketch switches on the action", () => {
    expect(buildFieldCommand("rfid-gate", "action", "open")).toEqual({ action: "open" });
    expect(buildFieldCommand("smart-lock", "locked", true)).toEqual({ action: "lock" });
    expect(buildFieldCommand("smart-lock", "locked", false)).toEqual({ action: "unlock" });
    expect(buildFieldCommand("facedoor", "locked", true)).toEqual({ action: "lock" });
  });

  it("refuses a pairing it cannot express instead of inventing one", () => {
    // A refusal surfaces as "this cannot be scheduled". A guess surfaces as a
    // schedule that silently never runs, which is what this whole file is about.
    expect(buildFieldCommand("home-hub", "power2", "yes")).toBeNull();
    expect(buildFieldCommand("home-hub", "nonsense", true)).toBeNull();
    expect(buildFieldCommand("rfid-gate", "action", "explode")).toBeNull();
    expect(buildFieldCommand("smart-plug", "", true)).toBeNull();
  });

  it("would have failed on the shipped bug", () => {
    /*
     * Proof that the round-trip check above has teeth.
     *
     * `{ power2: true }` is exactly what SwitchSchedulesPanel used to save.
     * Fed through projectCommand it produces an empty patch — the Home Hub
     * sketch reads nothing from it — so the assertion "the patch contains
     * power2" fails. A test that passes for both the broken and the fixed
     * shape would prove nothing, so this pins the difference.
     */
    expect(projectCommand("home-hub", { power2: true })).toEqual({});
    expect(projectCommand("home-hub", { action: "set", power3: true })).toEqual({});

    // And the actionless shape, which the device discards before any sketch
    // handler runs, regardless of whether the key was right.
    const legacy: Record<string, unknown> = { g1: true };
    expect(typeof legacy.action).toBe("undefined");
  });
});

describe("a stored command can be read back into the switch it addresses", () => {
  /*
   * The half that was missing, and the reason every switch timer vanished from
   * its own tab while continuing to fire correctly on the hardware.
   *
   * Fixing the encoder without the decoder is not a partial fix, it is a
   * different bug: commands became addressed the way the firmware reads them,
   * and the UI — which still did `Object.keys(cmd)[0]` — stopped recognising
   * its own rules. The list went empty, the Rules tab still showed six of them,
   * and someone would reasonably have created them all a second time.
   *
   * So the property is symmetric: build then read must return what went in.
   */
  it.each(TYPES)("%s: build then read returns the same switch", (type) => {
    const notOneSwitch = new Set(["all", "away", "muted", "auto"]);
    for (const f of getCommandFields(type)) {
      if (notOneSwitch.has(f.key)) continue;
      const value = sampleValue(f.kind, f.choices);
      const cmd = buildFieldCommand(type, f.key, value);
      if (!cmd) continue;
      const back = readFieldCommand(type, cmd);
      expect(back).not.toBeNull();
      expect(back!.field).toBe(f.key);
      expect(back!.value).toBe(value);
    }
  });

  it("reads a Home Hub channel out of its positional command", () => {
    // The exact decode that was missing. `{action:"set", ch:1, on:true}` has
    // no "power2" anywhere in it, so no amount of key-guessing finds one.
    expect(readFieldCommand("home-hub", { action: "set", ch: 0, on: true })).toEqual({ field: "power", value: true });
    expect(readFieldCommand("home-hub", { action: "set", ch: 1, on: true })).toEqual({ field: "power2", value: true });
    expect(readFieldCommand("home-hub", { action: "set", ch: 2, on: false })).toEqual({ field: "power3", value: false });
    expect(readFieldCommand("home-hub", { action: "set", ch: 3, on: true })).toEqual({ field: "power4", value: true });
  });

  it("still reads rows written before the fix", () => {
    // Legacy rows keep displaying until they are rewritten. A schedule that
    // disappears looks deleted, and someone makes a second one.
    expect(readFieldCommand("home-hub", { power2: true })).toEqual({ field: "power2", value: true });
    expect(readFieldCommand("touchboard", { g1: false })).toEqual({ field: "g1", value: false });
  });

  it("reads the verb forms back to their field", () => {
    expect(readFieldCommand("smart-lock", { action: "lock" })).toEqual({ field: "locked", value: true });
    expect(readFieldCommand("facedoor", { action: "unlock" })).toEqual({ field: "locked", value: false });
    expect(readFieldCommand("rfid-gate", { action: "open" })).toEqual({ field: "action", value: "open" });
  });

  it("returns null for a command that names no single switch", () => {
    expect(readFieldCommand("home-hub", { action: "set", relays: [true, true, true, true] })).toBeNull();
    expect(readFieldCommand("sentinel", { action: "clearAlarm" })).toBeNull();
    expect(readFieldCommand("home-hub", null)).toBeNull();
    expect(readFieldCommand("home-hub", {})).toBeNull();
  });

  it("would have failed on the decoder the panel used to have", () => {
    /*
     * Proof this test has teeth. The old decoder dropped `action` and required
     * exactly one key left; the current command leaves two (ch and on), so it
     * returned null and the timer was filtered out of its own list.
     */
    const cmd: Record<string, unknown> = { action: "set", ch: 1, on: true };
    const oldDecoder = Object.entries(cmd).filter(([k]) => k !== "action");
    expect(oldDecoder).toHaveLength(2);          // the old code required 1
    expect(readFieldCommand("home-hub", cmd)).toEqual({ field: "power2", value: true });
  });
});

describe("rules stored before the fix start working again", () => {
  it("repairs the exact payload every switch timer was written with", () => {
    // This is byte-for-byte what SwitchSchedulesPanel used to save.
    expect(repairLegacyCommand("home-hub", { power2: true })).toEqual({ action: "set", ch: 1, on: true });
    expect(repairLegacyCommand("touchboard", { g1: false })).toEqual({ action: "set", g1: false });
    expect(repairLegacyCommand("smart-plug", { power: true })).toEqual({ action: "set", power: true });
  });

  it("repairs a Home Hub command that had an action but the wrong key", () => {
    // The admin panel sent { action:"set", power2:true } — actioned, and still
    // ignored by the sketch, which is the harder half of the bug to spot.
    expect(repairLegacyCommand("home-hub", { action: "set", power3: true })).toEqual({
      action: "set",
      ch: 2,
      on: true,
    });
  });

  it("leaves hand-written rules alone", () => {
    // The rule editor can author actions this module knows nothing about.
    // Rewriting those would break working automations to fix broken ones.
    const custom = { action: "clearAlarm" };
    expect(repairLegacyCommand("sentinel", custom)).toBe(custom);
    const scene = { action: "set", scene: "away" };
    expect(repairLegacyCommand("home-hub", scene)).toBe(scene);
  });

  it("reads a multi-field actionless payload as a set", () => {
    expect(repairLegacyCommand("sentinel", { r1: true, r2: false })).toEqual({
      action: "set",
      r1: true,
      r2: false,
    });
  });

  it("returns null for nothing to repair", () => {
    expect(repairLegacyCommand("home-hub", null)).toBeNull();
    expect(repairLegacyCommand("home-hub", undefined)).toBeNull();
    expect(repairLegacyCommand("home-hub", {})).toBeNull();
  });

  it("is idempotent", () => {
    // Repair runs on read and on save, so a rule can pass through it many
    // times. A second pass must not turn { ch, on } into something else.
    const once = repairLegacyCommand("home-hub", { power2: true })!;
    expect(repairLegacyCommand("home-hub", once)).toEqual(once);
    const gang = repairLegacyCommand("touchboard", { g1: true })!;
    expect(repairLegacyCommand("touchboard", gang)).toEqual(gang);
  });
});
