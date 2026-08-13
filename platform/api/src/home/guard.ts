/**
 * What a member of a household is allowed to send to a device.
 *
 * This is the file that decides whether a houseguest can open the front door,
 * so it is deliberately pure, exhaustively tested, and errs towards refusing.
 *
 * WHY A COMMAND-LEVEL CHECK AND NOT JUST A ROLE CHECK
 *
 * When a member acts inside a home, `req.user.uid` is rewritten to the home's
 * owner id so that every existing ownership query keeps working. That rewrite
 * means the ownership check — the only thing guarding the command route until
 * now — passes for every member of the home, including a guest. Without what
 * follows, sharing a home with somebody would hand them the deadbolt.
 */
import type { Capability, HomeRole } from "./roles";
import { can } from "./roles";

/**
 * Device types whose whole purpose is security.
 *
 * Anything on this list needs the `security` capability regardless of what the
 * command says, because the actions are open-ended: a lock that accepts
 * `{action:"toggle"}` is still a lock.
 */
const SECURITY_TYPES = new Set([
  "smart-lock",
  "facedoor",
  "rfid-gate",
  "guardian",
  "sentinel",
  "anpr-cam",
  /*
   * Aircraft are here rather than in a category of their own because they need
   * exactly the same level of trust: an adult of the household and nobody
   * else. `drone-link`'s boolean is an aircraft's permission to take off, and
   * `drone-fc` accepts flight commands outright — neither is something a
   * houseguest or a child should reach, and both are at least as consequential
   * as a front door.
   */
  "drone-fc",
  "drone-link",
]);

/**
 * Actions that mean security on *any* device, whatever its type says.
 *
 * Kept to words with no innocent reading. A relay board wired to a gate motor
 * is a `smart-switch` as far as the database is concerned, so the type alone
 * would miss it — but the list has to stay narrow, because `open` and `toggle`
 * are the ordinary vocabulary of curtains and lamps. Judging those by the word
 * would refuse a household member their own curtains.
 */
const SECURITY_ACTIONS = new Set(["unlock", "grantopen", "disarm", "unbolt", "deadbolt", "release"]);

/**
 * Security actions that only ever make a home safer.
 *
 * Locking a door and arming an alarm are not the same act as their opposites,
 * and refusing them has a cost: a teenager with `limited` access running the
 * bedtime scene would leave the front door unlocked, because the one action
 * that mattered was the one silently skipped.
 *
 * The asymmetry is the point. On a security device everything else — including
 * `toggle`, which is an unlock half the time — needs the full capability.
 */
const SAFE_SECURITY_ACTIONS = new Set(["lock", "arm", "secure", "bolt"]);

/**
 * Actions that change what the home *is* rather than what it is doing.
 *
 * Calibration, factory resets and firmware pushes outlive the person who sent
 * them, so they sit with device management rather than with everyday control.
 */
const MANAGEMENT_ACTIONS = new Set([
  "ota",
  "reset",
  "factoryreset",
  "calibrate",
  "provision",
  "pair",
  "unpair",
  "enrol",
  "enroll",
  "config",
  "setconfig",
  "wifi",
]);

/**
 * Aircraft, which the safe-direction shortcut below must not apply to.
 *
 * `arm` on an alarm panel makes a house safer; `arm` on a flight controller
 * spins the propellers. The word is shared and the meaning is not, so aircraft
 * are decided before any action is consulted.
 */
const AIRCRAFT_TYPES = new Set(["drone-fc", "drone-link"]);

/** Cameras: watching is viewing, but recording and pan/tilt are control. */
const CAMERA_TYPES = new Set(["camera", "anpr-cam", "drone-fc", "drone-link"]);

export interface CommandContext {
  deviceType: string;
  command: Record<string, unknown>;
}

function actionOf(command: Record<string, unknown>): string {
  const a = command?.action ?? command?.cmd ?? command?.type;
  return typeof a === "string" ? a.toLowerCase().replace(/[^a-z]/g, "") : "";
}

/**
 * The capability a command requires.
 *
 * Exported for its own sake: the console asks this to decide whether to *show*
 * a control, so a guest sees a home without a row of buttons that would only
 * refuse them. One function answering both questions is what keeps the screen
 * and the server from disagreeing.
 */
export function capabilityFor(ctx: CommandContext): Capability {
  const type = (ctx.deviceType || "").toLowerCase();
  const action = actionOf(ctx.command);

  if (MANAGEMENT_ACTIONS.has(action)) return "manage-devices";
  /* Aircraft first: there is no safe direction on something that flies. */
  if (AIRCRAFT_TYPES.has(type)) return "security";
  /* Checked before the type, so that locking a lock is allowed while
     unlocking it is not. */
  if (SAFE_SECURITY_ACTIONS.has(action)) return "control";
  if (SECURITY_ACTIONS.has(action)) return "security";
  if (SECURITY_TYPES.has(type)) return "security";

  /*
   * An empty command is not a safe default of "control". Firmware that treats
   * a bare message as a toggle exists — the smart-lock sketch does — so an
   * unreadable command aimed at a lock must be judged by the device, which the
   * checks above have already done.
   */
  return "control";
}

/** Whether a role may send this command. */
export function mayCommand(role: HomeRole, ctx: CommandContext): boolean {
  return can(role, capabilityFor(ctx));
}

/**
 * Whether a role may watch a camera's live stream.
 *
 * Separate from commands because viewing is a different act: a limited member
 * should be able to see who is at the door without being able to steer the
 * lens. Guests cannot — a camera in a home is the most invasive thing in it.
 */
export function mayWatch(role: HomeRole, deviceType: string): boolean {
  if (!CAMERA_TYPES.has((deviceType || "").toLowerCase())) return can(role, "view");
  return can(role, "control");
}
