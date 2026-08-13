/**
 * Tests for the household command guard.
 *
 * Weighted heavily towards false-accept: a test that proves an owner can turn
 * on a lamp protects nobody, whereas a test that proves a guest cannot open
 * the front door is the entire point of the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { capabilityFor, mayCommand, mayWatch } from "./guard";
import { canGrant, can, isAccountHolder, normaliseRole, capabilitiesOf, ALL_CAPABILITIES, ROLES, type HomeRole } from "./roles";

const EVERY_ROLE: HomeRole[] = ROLES;

/* ---------------------------------------------------------------- *
 * Locks — the reason this module exists
 * ---------------------------------------------------------------- */

test("a guest cannot unlock a door", () => {
  assert.equal(mayCommand("guest", { deviceType: "smart-lock", command: { action: "unlock" } }), false);
});

test("a limited member cannot unlock a door", () => {
  // The whole point of "limited": lights yes, deadbolt no.
  assert.equal(mayCommand("limited", { deviceType: "smart-lock", command: { action: "unlock" } }), false);
});

test("an adult can unlock a door", () => {
  assert.equal(mayCommand("adult", { deviceType: "smart-lock", command: { action: "unlock" } }), true);
});

test("every security device type is refused to a limited member", () => {
  for (const type of ["smart-lock", "facedoor", "rfid-gate", "guardian", "sentinel", "anpr-cam"]) {
    assert.equal(
      mayCommand("limited", { deviceType: type, command: { action: "toggle" } }),
      false,
      `${type} must not accept a toggle from a limited member`
    );
  }
});

test("only an adult can fly", () => {
  // An aircraft needs the same trust as a front door, and rather more care.
  for (const type of ["drone-fc", "drone-link"]) {
    for (const action of ["takeoff", "arm", "goto", "rtl", "land"]) {
      assert.equal(
        mayCommand("limited", { deviceType: type, command: { action } }),
        false,
        `${type} must not accept ${action} from a limited member`
      );
      assert.equal(mayCommand("guest", { deviceType: type, command: { action } }), false);
    }
    assert.equal(mayCommand("adult", { deviceType: type, command: { action: "rtl" } }), true);
  }
});

test("a lock is a lock whatever the command says", () => {
  // Firmware that treats an unrecognised message as a toggle exists, so an
  // unreadable command aimed at a lock must still be judged as security.
  for (const command of [{}, { action: "" }, { foo: "bar" }, { action: 42 }]) {
    assert.equal(
      mayCommand("limited", { deviceType: "smart-lock", command: command as Record<string, unknown> }),
      false
    );
  }
});

test("locking is allowed where unlocking is not", () => {
  // Otherwise the bedtime scene run by a teenager skips the one action that
  // mattered and leaves the front door open.
  assert.equal(mayCommand("limited", { deviceType: "smart-lock", command: { action: "lock" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "smart-lock", command: { action: "unlock" } }), false);
  assert.equal(mayCommand("limited", { deviceType: "guardian", command: { action: "arm" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "guardian", command: { action: "disarm" } }), false);
});

test("toggle on a lock is treated as an unlock", () => {
  // It is one half the time, and the wrong half is a door standing open.
  assert.equal(capabilityFor({ deviceType: "smart-lock", command: { action: "toggle" } }), "security");
});

test("everyday words stay everyday on everyday devices", () => {
  // `open` is how a curtain opens and `toggle` is how a lamp switches. Judging
  // those by the word alone would refuse a household member their own curtains
  // — the guard has to be driven by what the device is.
  assert.equal(mayCommand("limited", { deviceType: "curtain", command: { action: "open" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "curtain", command: { action: "close" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "smart-light", command: { action: "toggle" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "smart-switch", command: { action: "toggle" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "smart-plug", command: { action: "on" } }), true);
});

test("a guest is refused even the safe direction", () => {
  // Guests do not operate the home at all; "it only locks" is still operating.
  assert.equal(mayCommand("guest", { deviceType: "smart-lock", command: { action: "lock" } }), false);
});

test("a security action is security on a general-purpose relay", () => {
  // A gate motor wired to a switch board is still a gate — but only for words
  // that have no innocent reading.
  assert.equal(
    mayCommand("limited", { deviceType: "smart-switch", command: { action: "grantOpen" } }),
    false
  );
  assert.equal(mayCommand("limited", { deviceType: "smart-switch", command: { action: "unlock" } }), false);
});

test("action matching ignores case and punctuation", () => {
  for (const action of ["UNLOCK", "grantOpen", "grant_open", "Grant-Open", "unLock"]) {
    assert.equal(
      capabilityFor({ deviceType: "smart-switch", command: { action } }),
      "security",
      `${action} must read as security`
    );
  }
});

test("the action is read from cmd and type as well as action", () => {
  // Three clients spell it three ways; a guard that knows one of them is a
  // guard that can be walked past by using another.
  assert.equal(capabilityFor({ deviceType: "smart-switch", command: { cmd: "unlock" } }), "security");
  assert.equal(capabilityFor({ deviceType: "smart-switch", command: { type: "unlock" } }), "security");
});

/* ---------------------------------------------------------------- *
 * Everyday control
 * ---------------------------------------------------------------- */

test("a limited member can work the lights", () => {
  assert.equal(mayCommand("limited", { deviceType: "smart-light", command: { action: "on" } }), true);
  assert.equal(mayCommand("limited", { deviceType: "smart-fan", command: { action: "speed", value: 2 } }), true);
});

test("a guest cannot work the lights", () => {
  // Guests see the home; they do not run it.
  assert.equal(mayCommand("guest", { deviceType: "smart-light", command: { action: "on" } }), false);
});

/* ---------------------------------------------------------------- *
 * Management
 * ---------------------------------------------------------------- */

test("only adults and above may reconfigure a device", () => {
  for (const action of ["ota", "reset", "factoryReset", "calibrate", "enrol", "wifi"]) {
    assert.equal(capabilityFor({ deviceType: "smart-light", command: { action } }), "manage-devices");
    assert.equal(mayCommand("limited", { deviceType: "smart-light", command: { action } }), false);
    assert.equal(mayCommand("adult", { deviceType: "smart-light", command: { action } }), true);
  }
});

test("management outranks control even on a harmless device", () => {
  // A factory reset of a lamp still loses the household its configuration.
  assert.equal(mayCommand("limited", { deviceType: "smart-plug", command: { action: "factoryReset" } }), false);
});

test("face enrolment is device management, not control", () => {
  // Opening an enrolment window means the next face at the door becomes a key.
  assert.equal(capabilityFor({ deviceType: "facedoor", command: { action: "enrol" } }), "manage-devices");
  assert.equal(mayCommand("limited", { deviceType: "facedoor", command: { action: "enrol" } }), false);
});

/* ---------------------------------------------------------------- *
 * Cameras
 * ---------------------------------------------------------------- */

test("a guest cannot watch a camera", () => {
  // The most invasive device in a house should not come free with a view role.
  assert.equal(mayWatch("guest", "camera"), false);
});

test("a limited member can watch a camera", () => {
  assert.equal(mayWatch("limited", "camera"), true);
});

test("a guest can still see non-camera devices", () => {
  assert.equal(mayWatch("guest", "smart-light"), true);
});

/* ---------------------------------------------------------------- *
 * Roles
 * ---------------------------------------------------------------- */

test("nobody can grant a role at or above their own", () => {
  for (const inviter of EVERY_ROLE) {
    for (const granted of EVERY_ROLE) {
      if (!canGrant(inviter, granted)) continue;
      assert.ok(
        ROLES.indexOf(granted) > ROLES.indexOf(inviter),
        `${inviter} must not be able to grant ${granted}`
      );
    }
  }
});

test("no role can create an owner", () => {
  // Otherwise an adult could hand the house away.
  for (const inviter of EVERY_ROLE) {
    assert.equal(canGrant(inviter, "owner"), false, `${inviter} must not create an owner`);
  }
});

test("only the owner can invite at all", () => {
  for (const role of ["adult", "limited", "guest"] as HomeRole[]) {
    assert.equal(can(role, "manage-members"), false);
    for (const granted of EVERY_ROLE) assert.equal(canGrant(role, granted), false);
  }
});

test("account actions are refused to every member, however the role reads", () => {
  // Identity, not the role word: a corrupt row saying "owner" must not be able
  // to delete the account.
  assert.equal(isAccountHolder({ homeId: 1, actorId: 1, role: "owner" }), true);
  assert.equal(isAccountHolder({ homeId: 1, actorId: 2, role: "owner" }), false);
  assert.equal(isAccountHolder({ homeId: 1, actorId: 2, role: "adult" }), false);
});

test("unknown roles are rejected rather than guessed", () => {
  for (const v of ["OWNER", "admin", "", null, undefined, 3, {}, "adult "]) {
    assert.equal(normaliseRole(v), null, `${String(v)} must not resolve to a role`);
  }
  for (const r of EVERY_ROLE) assert.equal(normaliseRole(r), r);
});

test("every role can view", () => {
  for (const role of EVERY_ROLE) assert.equal(can(role, "view"), true);
});

test("the capability list a client is sent matches what the server enforces", () => {
  // The console decides what to *show* from this list and the server decides
  // what to *allow* from the map. If they part company, the console offers a
  // button that refuses — or hides one somebody is entitled to, and they
  // conclude the product is broken.
  for (const role of EVERY_ROLE) {
    const sent = capabilitiesOf(role);
    for (const c of ALL_CAPABILITIES) {
      assert.equal(
        sent.includes(c),
        can(role, c),
        `${role}: capabilitiesOf and can disagree about ${c}`
      );
    }
  }
});

test("no capability is missing from the exported list", () => {
  // An added capability that nobody adds here would be invisible to every
  // client, so a control guarded by it would simply never appear.
  const fromMap = new Set(EVERY_ROLE.flatMap((r) => capabilitiesOf(r)));
  for (const c of fromMap) {
    assert.ok(ALL_CAPABILITIES.includes(c), `${c} is enforced but never sent to a client`);
  }
  assert.equal(new Set(ALL_CAPABILITIES).size, ALL_CAPABILITIES.length, "duplicated entry");
});
